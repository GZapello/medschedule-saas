import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { ErrorMonitor } from '../services/error-monitor.service';
import { GeminiCatalogDiagnostic, GeminiService } from '../services/gemini.service';
import {
  applyStudioCatalog,
  attachSuggestedProfessionals,
  buildMatchCandidates,
  buildProposalDiagnostics,
  readStudioImportCatalog
} from '../services/studio-catalog-confirmation';
import { catalogError, hash, prepareCatalogFile, readCatalogUploads } from '../services/studio-catalog-files';
import { CATALOG_PROMPT, normalizeProposal } from '../services/studio-catalog-proposal';
import {
  computeTempExpiryIso,
  PreparedCatalogInput,
  StudioCatalogTempStorageService
} from '../services/studio-catalog-temp-storage.service';
import type { CatalogImportBatchStatus, StudioProposal } from '../shared/studio-catalog-contract';

interface Draft {
  id: string;
  tenant_id: string;
  actor_id: string;
  fingerprint: string;
  sources_json: string;
  proposal_json: string;
  result_json: string | null;
  revision: number;
  status: CatalogImportBatchStatus;
  error_code: string | null;
  error_message: string | null;
  request_id: string | null;
  attempts: number;
  retryable: number;
  temp_expires_at: string | null;
  temp_purged_at: string | null;
  updated_at: string;
}

const activeJobs = new Map<string, { tenantId: string; abortController: AbortController; requestId: string }>();
const activeSyncCountByTenant = new Map<string, number>();

function resolveRequestId(req: Request): string {
  const incoming = String(req.headers['x-request-id'] || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  return incoming || `req-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function getDraft(req: Request): Draft {
  const row = db.prepare('SELECT * FROM studio_catalog_imports WHERE id = ? AND tenant_id = ? AND actor_id = ?')
    .get(req.params.id, req.tenantId, req.user?.userId) as Draft | undefined;
  if (!row) throw catalogError('Rascunho ou lote de importação não encontrado.', 404);
  return row;
}

function activeJobCountForTenant(tenantId: string): number {
  let count = activeSyncCountByTenant.get(tenantId) || 0;
  for (const job of activeJobs.values()) {
    if (job.tenantId === tenantId && !job.abortController.signal.aborted) count++;
  }
  return count;
}

function friendlyAiFailureMessage(diag?: GeminiCatalogDiagnostic | null): {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds: number | null;
} {
  if (diag?.reason === 'not_configured' || (!diag && !GeminiService.isConfigured())) {
    return {
      status: 503,
      code: 'AI_NOT_CONFIGURED',
      message: 'A análise por IA está indisponível neste momento.',
      retryable: false,
      retryAfterSeconds: null
    };
  }
  if (!diag) {
    return {
      status: 503,
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'O provedor de IA não retornou resposta desta vez. Tente novamente sem reenviar os arquivos dentro do prazo temporário.',
      retryable: true,
      retryAfterSeconds: 15
    };
  }
  if (diag.reason === 'aborted') {
    return {
      status: 499,
      code: 'CANCELLED_BY_USER',
      message: 'Análise cancelada pelo usuário.',
      retryable: true,
      retryAfterSeconds: null
    };
  }
  if (diag.reason === 'rate_limit') {
    return {
      status: 503,
      code: 'AI_RATE_LIMITED',
      message: 'O provedor de IA está com alto volume de solicitações no momento. Os arquivos temporários foram preservados por tempo limitado para nova tentativa.',
      retryable: true,
      retryAfterSeconds: diag.retryAfterSeconds || 20
    };
  }
  if (diag.reason === 'timeout' || diag.reason === 'unavailable') {
    return {
      status: 503,
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'O serviço de IA demorou para responder ou ficou temporariamente instável. Você pode tentar novamente sem reenviar os arquivos dentro do prazo temporário.',
      retryable: true,
      retryAfterSeconds: diag.retryAfterSeconds || 15
    };
  }
  if (diag.reason === 'safety_blocked' || diag.reason === 'invalid_request') {
    return {
      status: 422,
      code: 'AI_INVALID_OR_BLOCKED',
      message: 'Os arquivos não puderam ser processados pelo analisador visual. Envie imagens ou documentos mais nítidos do catálogo.',
      retryable: false,
      retryAfterSeconds: null
    };
  }
  return {
    status: 422,
    code: 'AI_UNREADABLE_CONTENT',
    message: 'A IA não conseguiu extrair itens válidos destes arquivos. Tente novamente ou envie um lote menor e mais nítido.',
    retryable: true,
    retryAfterSeconds: 10
  };
}

function statusResponseFor(draft: Draft) {
  return {
    id: draft.id,
    status: draft.status || (draft.result_json ? 'completed' : 'ready'),
    requestId: draft.request_id || null,
    errorCode: draft.error_code || null,
    errorMessage: draft.error_message || null,
    retryable: Boolean(draft.retryable),
    retryAfterSeconds: draft.status === 'failed' && draft.retryable ? 15 : null,
    attempts: Number(draft.attempts || 0),
    tempExpiresAt: draft.temp_expires_at || null,
    tempPurgedAt: draft.temp_purged_at || null,
    revision: draft.revision,
    sources: JSON.parse(draft.sources_json),
    result: draft.result_json ? JSON.parse(draft.result_json) : null
  };
}

function responseFor(tenantId: string, draft: Draft) {
  const effectiveStatus: CatalogImportBatchStatus =
    draft.result_json ? 'completed' : (draft.status || 'ready');

  if (!['ready', 'completed'].includes(effectiveStatus)) {
    return statusResponseFor(draft);
  }

  const rawProposal = JSON.parse(draft.proposal_json) as StudioProposal;
  const catalog = readStudioImportCatalog(tenantId);
  const proposal = attachSuggestedProfessionals(rawProposal, catalog);
  const matches = buildMatchCandidates(proposal, catalog);
  const diagnostics = buildProposalDiagnostics(tenantId, proposal, catalog, matches);

  const services = catalog.services.map(s => ({
    id: s.id, name: s.name, active: Boolean(s.active), type: s.studio_service_type, capacity: s.default_capacity,
    professionalId: s.professional_id
  }));
  const packages = catalog.packages.map(p => ({ ...p, active: Boolean(p.active) }));
  return {
    ...statusResponseFor({ ...draft, status: effectiveStatus }),
    proposal,
    catalog: { services, packages, professionals: catalog.professionals },
    matches,
    diagnostics
  };
}

function respondError(res: Response, error: unknown, requestId?: string) {
  const errObj = error as { status?: number; code?: string; retryable?: boolean; retryAfterSeconds?: number | null; batchId?: string };
  const rawStatus = Number(errObj?.status) || 500;
  // Nunca retornar 502 Bad Gateway da aplicação (evita interceptação por proxy/Cloudflare com página HTML).
  const safeStatus = rawStatus === 502 ? 503 : rawStatus;
  if (requestId) res.setHeader('X-Request-ID', requestId);
  if (safeStatus >= 500) {
    console.error(`[StudioCatalogImport]${requestId ? ` [${requestId}]` : ''} status=${safeStatus}`, (error as Error)?.message || '');
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(safeStatus).json({
    error: safeStatus === 500 ? 'Falha ao processar a importação. Nenhum cadastro foi concluído.' : (error as Error).message,
    code: errObj?.code || (safeStatus >= 500 ? 'CATALOG_IMPORT_ERROR' : 'CATALOG_IMPORT_VALIDATION'),
    requestId: requestId || null,
    retryable: Boolean(errObj?.retryable || safeStatus === 503),
    retryAfterSeconds: errObj?.retryAfterSeconds ?? null,
    ...(errObj?.batchId ? { batchId: errObj.batchId } : {})
  });
}

async function runGeminiExtraction(
  inputs: PreparedCatalogInput[],
  options: { requestId: string; signal?: AbortSignal }
): Promise<{ proposal: StudioProposal | null; diag: GeminiCatalogDiagnostic | null; emptyExtraction?: boolean }> {
  const raw = await GeminiService.extractStudioCatalog(CATALOG_PROMPT, inputs, {
    requestId: options.requestId,
    signal: options.signal
  });
  const diag = GeminiService.getLastCatalogDiagnostic(options.requestId);
  if (!raw) {
    return { proposal: null, diag };
  }
  let proposal: StudioProposal;
  try {
    proposal = normalizeProposal(raw, inputs.length, true);
  } catch {
    return { proposal: null, diag: diag || { ok: false, reason: 'invalid_json', retryable: true, retryAfterSeconds: 10, attempts: [] } };
  }
  if (!proposal.services.length && !proposal.packages.length) {
    return {
      proposal: null,
      diag: { ok: false, reason: 'empty_response', retryable: false, retryAfterSeconds: null, attempts: diag?.attempts || [] },
      emptyExtraction: true
    };
  }
  return { proposal, diag: diag || { ok: true, retryable: false, retryAfterSeconds: null, attempts: [] } };
}

function startAsyncCatalogJob(params: {
  batchId: string;
  tenantId: string;
  actorId: string;
  requestId: string;
}): void {
  const { batchId, tenantId, actorId, requestId } = params;
  if (activeJobs.has(batchId)) return;

  const abortController = new AbortController();
  activeJobs.set(batchId, { tenantId, abortController, requestId });

  setImmediate(async () => {
    try {
      const current = db.prepare(`
        SELECT * FROM studio_catalog_imports
        WHERE id = ? AND tenant_id = ? AND actor_id = ?
      `).get(batchId, tenantId, actorId) as Draft | undefined;
      if (!current || current.result_json || current.status === 'cancelled' || abortController.signal.aborted) {
        await StudioCatalogTempStorageService.purgeBatchTempFiles(tenantId, batchId, 'job_skipped_cancelled');
        return;
      }

      db.prepare(`
        UPDATE studio_catalog_imports
        SET status = 'processing', request_id = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND actor_id = ? AND status = 'queued'
      `).run(requestId, batchId, tenantId, actorId);

      const inputs = await StudioCatalogTempStorageService.loadBatchTempInputs(tenantId, batchId);
      if (!inputs.length) {
        db.prepare(`
          UPDATE studio_catalog_imports
          SET status = 'failed', error_code = 'TEMP_FILES_EXPIRED',
              error_message = 'Os arquivos temporários deste lote expiraram ou não foram localizados. Envie os arquivos novamente.',
              retryable = 0, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(batchId, tenantId);
        await StudioCatalogTempStorageService.purgeBatchTempFiles(tenantId, batchId, 'missing_or_expired');
        return;
      }

      const { proposal, diag, emptyExtraction } = await runGeminiExtraction(inputs, {
        requestId,
        signal: abortController.signal
      });

      const afterExtract = db.prepare(`
        SELECT status, result_json FROM studio_catalog_imports WHERE id = ? AND tenant_id = ?
      `).get(batchId, tenantId) as { status: string; result_json: string | null } | undefined;
      if (!afterExtract || afterExtract.result_json || afterExtract.status === 'cancelled' || abortController.signal.aborted) {
        await StudioCatalogTempStorageService.purgeBatchTempFiles(tenantId, batchId, 'cancelled_mid_flight');
        return;
      }

      if (proposal) {
        db.transaction(() => {
          db.prepare(`
            UPDATE studio_catalog_imports
            SET proposal_json = ?,
                status = 'ready',
                error_code = NULL,
                error_message = NULL,
                retryable = 0,
                revision = revision + 1,
                updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ? AND actor_id = ? AND status IN ('queued', 'processing')
          `).run(JSON.stringify(proposal), batchId, tenantId, actorId);

          db.prepare(`
            INSERT INTO audit_logs (
              id, tenant_id, user_id, action, entity, entity_id, ip_address, user_agent, details_json
            ) VALUES (?, ?, ?, 'ANALYZE_STUDIO_CATALOG_IMPORT', 'studio_catalog_imports', ?, 'async-worker', 'studio-catalog-import-worker', ?)
          `).run(
            randomUUID(),
            tenantId,
            actorId,
            batchId,
            JSON.stringify({
              requestId,
              files: inputs.length,
              services: proposal.services.length,
              packages: proposal.packages.length,
              modelUsed: diag?.modelUsed || null
            })
          );
        })();

        // Extração concluída com sucesso: exclui imediatamente os arquivos temporários originais.
        await StudioCatalogTempStorageService.purgeBatchTempFiles(tenantId, batchId, 'extraction_completed');
        return;
      }

      const fail = emptyExtraction
        ? {
            code: 'AI_UNREADABLE_CONTENT',
            message: 'Nenhum serviço ou pacote foi identificado nestes arquivos. Envie imagens ou planilhas mais legíveis.',
            retryable: false
          }
        : friendlyAiFailureMessage(diag);

      const canKeepTempForRetry =
        fail.retryable && StudioCatalogTempStorageService.hasUnexpiredTempFiles(tenantId, batchId);

      if (canKeepTempForRetry) {
        StudioCatalogTempStorageService.markBatchTempRetryAvailable(tenantId, batchId);
      } else {
        await StudioCatalogTempStorageService.purgeBatchTempFiles(tenantId, batchId, 'non_retryable_failure');
      }

      db.prepare(`
        UPDATE studio_catalog_imports
        SET status = 'failed',
            error_code = ?,
            error_message = ?,
            retryable = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND actor_id = ? AND status IN ('queued', 'processing')
      `).run(fail.code, fail.message, canKeepTempForRetry ? 1 : 0, batchId, tenantId, actorId);
    } catch (err: any) {
      const msg = err?.message || 'Erro inesperado durante análise assíncrona.';
      ErrorMonitor.captureException(err, { source: 'studio-catalog-import-job', tenantId, userId: actorId });
      console.error(`[StudioCatalogImport] [${requestId}] Erro no worker assíncrono:`, msg);

      const keepForRetry = StudioCatalogTempStorageService.hasUnexpiredTempFiles(tenantId, batchId);
      if (keepForRetry) {
        StudioCatalogTempStorageService.markBatchTempRetryAvailable(tenantId, batchId);
      } else {
        await StudioCatalogTempStorageService.purgeBatchTempFiles(tenantId, batchId, 'worker_exception').catch(() => {});
      }

      db.prepare(`
        UPDATE studio_catalog_imports
        SET status = 'failed',
            error_code = 'ASYNC_JOB_ERROR',
            error_message = 'Falha interna temporária durante o processamento da análise. Tente novamente.',
            retryable = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND status IN ('queued', 'processing')
      `).run(keepForRetry ? 1 : 0, batchId, tenantId);
    } finally {
      activeJobs.delete(batchId);
    }
  });
}

export class StudioCatalogImportController {
  static async list(req: Request, res: Response) {
    try {
      await StudioCatalogTempStorageService.cleanupExpiredOrAbandonedBatches();
      const includeCompleted = req.query.includeCompleted === '1' || req.query.includeCompleted === 'true';
      const rows = db.prepare(`
        SELECT id, tenant_id, actor_id, fingerprint, sources_json, proposal_json, result_json,
               revision, status, error_code, error_message, request_id, attempts, retryable,
               temp_expires_at, temp_purged_at, updated_at
        FROM studio_catalog_imports
        WHERE tenant_id = ? AND actor_id = ? ${includeCompleted ? '' : 'AND result_json IS NULL'}
        ORDER BY updated_at DESC LIMIT 30
      `).all(req.tenantId, req.user!.userId) as Draft[];
      res.json(rows.map((row) => ({
        ...statusResponseFor(row),
        updatedAt: row.updated_at
      })));
    } catch (error) {
      respondError(res, error);
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const current = getDraft(req);
      if (current.status === 'failed' && current.retryable && !StudioCatalogTempStorageService.hasUnexpiredTempFiles(req.tenantId!, current.id)) {
        await StudioCatalogTempStorageService.purgeBatchTempFiles(req.tenantId!, current.id, 'expired_on_poll');
        db.prepare(`
          UPDATE studio_catalog_imports
          SET retryable = 0, error_code = COALESCE(error_code, 'TEMP_FILES_EXPIRED'),
              temp_purged_at = COALESCE(temp_purged_at, datetime('now'))
          WHERE id = ? AND tenant_id = ?
        `).run(current.id, req.tenantId);
        return res.json(responseFor(req.tenantId!, getDraft(req)));
      }
      res.json(responseFor(req.tenantId!, current));
    } catch (error) {
      respondError(res, error);
    }
  }

  static async cancel(req: Request, res: Response) {
    const requestId = resolveRequestId(req);
    try {
      const current = getDraft(req);
      if (current.result_json) {
        throw catalogError('Esta importação já foi confirmada.', 409);
      }
      const running = activeJobs.get(current.id);
      if (running) {
        running.abortController.abort();
      }
      await StudioCatalogTempStorageService.purgeBatchTempFiles(req.tenantId!, current.id, 'cancelled_by_user');
      db.prepare(`
        UPDATE studio_catalog_imports
        SET status = 'cancelled',
            error_code = 'CANCELLED_BY_USER',
            error_message = 'Análise cancelada pelo usuário e arquivos temporários removidos.',
            retryable = 0,
            temp_purged_at = COALESCE(temp_purged_at, datetime('now')),
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND actor_id = ? AND result_json IS NULL
      `).run(current.id, req.tenantId, req.user!.userId);
      const updated = getDraft(req);
      res.setHeader('X-Request-ID', requestId);
      res.json({ cancelled: true, ...statusResponseFor(updated) });
    } catch (error) {
      respondError(res, error, requestId);
    }
  }

  static async remove(req: Request, res: Response) {
    const requestId = resolveRequestId(req);
    try {
      const current = getDraft(req);
      if (current.result_json) {
        throw catalogError('Importações já confirmadas permanecem no histórico de auditoria.', 409);
      }
      const running = activeJobs.get(current.id);
      if (running) {
        running.abortController.abort();
      }
      const purge = await StudioCatalogTempStorageService.purgeBatchTempFiles(req.tenantId!, current.id, 'batch_discarded');
      db.prepare('DELETE FROM studio_catalog_imports WHERE id = ? AND tenant_id = ? AND actor_id = ?')
        .run(current.id, req.tenantId, req.user!.userId);
      res.setHeader('X-Request-ID', requestId);
      res.json({
        deleted: true,
        id: current.id,
        tempFilesDeleted: purge.deletedCount
      });
    } catch (error) {
      respondError(res, error, requestId);
    }
  }

  static async analyze(req: Request, res: Response) {
    const tenantId = req.tenantId!;
    const actorId = req.user!.userId;
    const requestId = resolveRequestId(req);
    res.setHeader('X-Request-ID', requestId);

    try {
      const uploads = readCatalogUploads(req.body?.files);
      const files = [...new Map(uploads.map(file => [file.fingerprint, file])).values()];
      const fingerprint = hash(files.map(file => file.fingerprint).sort().join('|'));
      const lookup = db.prepare('SELECT * FROM studio_catalog_imports WHERE tenant_id = ? AND actor_id = ? AND fingerprint = ?');
      const saved = lookup.get(tenantId, actorId, fingerprint) as Draft | undefined;

      if (saved && (saved.result_json || saved.status === 'ready' || saved.status === 'completed')) {
        res.json(responseFor(tenantId, saved));
        return;
      }

      if (saved && (saved.status === 'queued' || saved.status === 'processing') && activeJobs.has(saved.id)) {
        res.status(202).json({ ...statusResponseFor(saved), deduplicated: true });
        return;
      }

      if (!GeminiService.isConfigured()) {
        throw Object.assign(catalogError('A análise por IA está indisponível neste momento.', 503), {
          code: 'AI_NOT_CONFIGURED',
          retryable: false
        });
      }

      if (activeJobCountForTenant(tenantId) >= 1 || activeJobs.size >= 4) {
        throw Object.assign(catalogError('Já há uma análise em andamento. Aguarde a conclusão ou cancele o lote atual.', 429), {
          code: 'ANALYSIS_IN_PROGRESS',
          retryable: true,
          retryAfterSeconds: 5
        });
      }

      const preparedInputs: PreparedCatalogInput[] = [];
      for (const file of files) {
        const prep = await prepareCatalogFile(file);
        preparedInputs.push({ ...prep, fingerprint: file.fingerprint });
      }
      const sources = files.map((file, i) => ({
        id: i + 1,
        fileName: file.fileName,
        copies: uploads.filter(upload => upload.fingerprint === file.fingerprint).length,
        mimeType: preparedInputs[i]?.mimeType || file.mimeType,
        fileSize: file.bytes.length
      }));

      const isAsync = req.body?.async === true || req.query.async === '1' || req.query.async === 'true';

      if (isAsync) {
        const expiresAtIso = computeTempExpiryIso();
        const targetBatchId = db.transaction(() => {
          const existing = lookup.get(tenantId, actorId, fingerprint) as Draft | undefined;
          const batchId = existing?.id || saved?.id || randomUUID();
          if (existing) {
            db.prepare(`
              UPDATE studio_catalog_imports
              SET sources_json = ?,
                  proposal_json = '{"services":[],"packages":[]}',
                  status = 'queued',
                  error_code = NULL,
                  error_message = NULL,
                  request_id = ?,
                  attempts = COALESCE(attempts, 0) + 1,
                  retryable = 0,
                  temp_expires_at = ?,
                  temp_purged_at = NULL,
                  updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ? AND actor_id = ?
            `).run(JSON.stringify(sources), requestId, expiresAtIso, existing.id, tenantId, actorId);
          } else {
            db.prepare(`
              INSERT INTO studio_catalog_imports (
                id, tenant_id, actor_id, fingerprint, sources_json, proposal_json,
                status, request_id, attempts, retryable, temp_expires_at
              ) VALUES (?, ?, ?, ?, ?, '{"services":[],"packages":[]}', 'queued', ?, 1, 0, ?)
            `).run(batchId, tenantId, actorId, fingerprint, JSON.stringify(sources), requestId, expiresAtIso);
          }
          logAudit(req, 'QUEUE_STUDIO_CATALOG_IMPORT', 'studio_catalog_imports', batchId, {
            requestId,
            files: sources.length,
            duplicateFiles: uploads.length - files.length
          });
          return batchId;
        })();

        try {
          await StudioCatalogTempStorageService.stageBatchTempFiles({
            tenantId,
            batchId: targetBatchId,
            inputs: preparedInputs,
            expiresAtIso
          });
        } catch (stageErr) {
          db.prepare(`
            UPDATE studio_catalog_imports
            SET status = 'failed',
                error_code = 'TEMP_STAGE_ERROR',
                error_message = 'Não foi possível preparar a área temporária dos arquivos. Tente novamente.',
                retryable = 0,
                temp_purged_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ? AND status = 'queued'
          `).run(targetBatchId, tenantId);
          throw stageErr;
        }

        const queuedDraft = lookup.get(tenantId, actorId, fingerprint) as Draft;
        startAsyncCatalogJob({ batchId: queuedDraft.id, tenantId, actorId, requestId });
        res.status(202).json(statusResponseFor(queuedDraft));
        return;
      }

      // Fluxo síncrono compatível com chamadas diretas de API/testes
      activeSyncCountByTenant.set(tenantId, (activeSyncCountByTenant.get(tenantId) || 0) + 1);
      const syncBatchId = saved?.id || randomUUID();
      try {
        const { proposal, diag, emptyExtraction } = await runGeminiExtraction(preparedInputs, { requestId });
        if (!proposal) {
          if (emptyExtraction) {
            throw Object.assign(
              catalogError('Nenhum serviço ou pacote foi identificado. Envie arquivos com o catálogo ou a tabela de preços.', 422),
              { code: 'AI_UNREADABLE_CONTENT', retryable: false }
            );
          }
          const fail = friendlyAiFailureMessage(diag);
          throw Object.assign(catalogError(fail.message, fail.status), {
            code: fail.code,
            retryable: fail.retryable,
            retryAfterSeconds: fail.retryAfterSeconds
          });
        }

        const draft = db.transaction(() => {
          const previous = lookup.get(tenantId, actorId, fingerprint) as Draft | undefined;
          if (previous && (previous.status === 'ready' || previous.status === 'completed' || previous.result_json)) {
            return previous;
          }
          if (previous) {
            db.prepare(`
              UPDATE studio_catalog_imports
              SET sources_json = ?,
                  proposal_json = ?,
                  status = 'ready',
                  error_code = NULL,
                  error_message = NULL,
                  request_id = ?,
                  attempts = COALESCE(attempts, 0) + 1,
                  retryable = 0,
                  temp_purged_at = datetime('now'),
                  updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ? AND actor_id = ?
            `).run(JSON.stringify(sources), JSON.stringify(proposal), requestId, previous.id, tenantId, actorId);
          } else {
            db.prepare(`
              INSERT INTO studio_catalog_imports (
                id, tenant_id, actor_id, fingerprint, sources_json, proposal_json,
                status, request_id, attempts, retryable, temp_purged_at
              ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, 1, 0, datetime('now'))
            `).run(syncBatchId, tenantId, actorId, fingerprint, JSON.stringify(sources), JSON.stringify(proposal), requestId);
          }
          const targetId = previous?.id || syncBatchId;
          logAudit(req, 'ANALYZE_STUDIO_CATALOG_IMPORT', 'studio_catalog_imports', targetId, {
            requestId,
            files: sources.length,
            duplicateFiles: uploads.length - files.length,
            services: proposal.services.length,
            packages: proposal.packages.length
          });
          return lookup.get(tenantId, actorId, fingerprint) as Draft;
        })();
        res.json(responseFor(tenantId, draft));
      } finally {
        const nextCount = Math.max(0, (activeSyncCountByTenant.get(tenantId) || 1) - 1);
        if (nextCount === 0) activeSyncCountByTenant.delete(tenantId);
        else activeSyncCountByTenant.set(tenantId, nextCount);
      }
    } catch (error) {
      respondError(res, error, requestId);
    }
  }

  static async retry(req: Request, res: Response) {
    const tenantId = req.tenantId!;
    const actorId = req.user!.userId;
    const requestId = resolveRequestId(req);
    res.setHeader('X-Request-ID', requestId);

    try {
      const current = getDraft(req);
      if (current.result_json || current.status === 'ready' || current.status === 'completed') {
        res.json(responseFor(tenantId, current));
        return;
      }
      if ((current.status === 'queued' || current.status === 'processing') && activeJobs.has(current.id)) {
        res.status(202).json({ ...statusResponseFor(current), deduplicated: true });
        return;
      }
      if (!GeminiService.isConfigured()) {
        throw Object.assign(catalogError('A análise por IA está indisponível neste momento.', 503), {
          code: 'AI_NOT_CONFIGURED',
          retryable: false
        });
      }
      if (!StudioCatalogTempStorageService.hasUnexpiredTempFiles(tenantId, current.id)) {
        await StudioCatalogTempStorageService.purgeBatchTempFiles(tenantId, current.id, 'expired_on_retry');
        db.prepare(`
          UPDATE studio_catalog_imports
          SET retryable = 0,
              error_code = 'TEMP_FILES_EXPIRED',
              error_message = 'Os arquivos temporários deste lote expiraram ou foram excluídos. Envie os arquivos novamente.',
              temp_purged_at = COALESCE(temp_purged_at, datetime('now')),
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(current.id, tenantId);
        throw Object.assign(
          catalogError('Os arquivos temporários deste lote expiraram ou foram excluídos. Envie os arquivos novamente.', 410),
          { code: 'TEMP_FILES_EXPIRED', retryable: false, batchId: current.id }
        );
      }
      if (activeJobCountForTenant(tenantId) >= 1) {
        throw Object.assign(catalogError('Já há uma análise em andamento para este estabelecimento. Aguarde a conclusão.', 429), {
          code: 'ANALYSIS_IN_PROGRESS',
          retryable: true,
          retryAfterSeconds: 5
        });
      }

      const newExpiry = computeTempExpiryIso();
      db.prepare(`
        UPDATE studio_catalog_imports
        SET status = 'queued',
            error_code = NULL,
            error_message = NULL,
            request_id = ?,
            attempts = COALESCE(attempts, 0) + 1,
            retryable = 0,
            temp_expires_at = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND actor_id = ? AND result_json IS NULL
      `).run(requestId, newExpiry, current.id, tenantId, actorId);

      const updated = getDraft(req);
      startAsyncCatalogJob({ batchId: current.id, tenantId, actorId, requestId });
      res.status(202).json(statusResponseFor(updated));
    } catch (error) {
      respondError(res, error, requestId);
    }
  }

  static save(req: Request, res: Response) {
    try {
      const draft = db.transaction(() => {
        const current = getDraft(req);
        if (current.result_json) throw catalogError('Esta importação já foi confirmada.', 409);
        if (current.status && !['ready'].includes(current.status)) {
          throw catalogError('Aguarde a conclusão da análise antes de editar o rascunho.', 409);
        }
        const proposal = reviewedProposal(req, current);
        db.prepare(`
          UPDATE studio_catalog_imports SET proposal_json = ?, revision = revision + 1, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ? AND actor_id = ?
        `).run(JSON.stringify(proposal), current.id, req.tenantId, req.user!.userId);
        return getDraft(req);
      })();
      res.json(responseFor(req.tenantId!, draft));
    } catch (error) {
      respondError(res, error);
    }
  }

  static async confirm(req: Request, res: Response) {
    const requestId = resolveRequestId(req);
    try {
      if (req.body?.confirmed !== true) throw catalogError('Confirme expressamente os cadastros selecionados.');
      const draft = db.transaction(() => {
        const current = getDraft(req);
        if (current.result_json) return current;
        if (current.status && !['ready'].includes(current.status)) {
          throw catalogError('Este lote ainda não está pronto para confirmação.', 409);
        }
        const proposal = reviewedProposal(req, current);
        const result = applyStudioCatalog(req, proposal);
        db.prepare(`
          UPDATE studio_catalog_imports
          SET proposal_json = ?,
              result_json = ?,
              status = 'completed',
              retryable = 0,
              temp_purged_at = COALESCE(temp_purged_at, datetime('now')),
              revision = revision + 1,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ? AND actor_id = ?
        `).run(JSON.stringify(proposal), JSON.stringify(result), current.id, req.tenantId, req.user!.userId);
        logAudit(req, 'CONFIRM_STUDIO_CATALOG_IMPORT', 'studio_catalog_imports', current.id, { ...result, requestId }, { required: true });
        return getDraft(req);
      })();

      // Exclusão defensiva adicional após conclusão definitiva (garante 0 arquivos temporários no storage/disco).
      await StudioCatalogTempStorageService.purgeBatchTempFiles(req.tenantId!, draft.id, 'import_confirmed');
      res.setHeader('X-Request-ID', requestId);
      res.json(responseFor(req.tenantId!, draft));
    } catch (error) {
      respondError(res, error, requestId);
    }
  }
}

function reviewedProposal(req: Request, draft: Draft) {
  if (req.body?.revision !== draft.revision) throw catalogError('Este rascunho foi alterado. Abra a versão mais recente antes de continuar.', 409);
  const proposal = normalizeProposal(req.body?.proposal, JSON.parse(draft.sources_json).length, false);
  const original = JSON.parse(draft.proposal_json) as StudioProposal;
  if (original.services.length !== proposal.services.length || original.packages.length !== proposal.packages.length) {
    throw catalogError('Para excluir uma proposta da importação, marque-a como Ignorar.');
  }
  for (const kind of ['services', 'packages'] as const) {
    proposal[kind].forEach((row, i) => {
      row.sources = original[kind][i].sources;
      row.issues = original[kind][i].issues;
    });
  }
  return proposal;
}
