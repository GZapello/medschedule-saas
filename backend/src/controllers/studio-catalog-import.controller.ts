import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { GeminiService } from '../services/gemini.service';
import { applyStudioCatalog, readStudioImportCatalog, similarCatalogName } from '../services/studio-catalog-confirmation';
import { catalogError, hash, prepareCatalogFile, readCatalogUploads } from '../services/studio-catalog-files';
import { CATALOG_PROMPT, normalizeProposal } from '../services/studio-catalog-proposal';
import type { StudioProposal } from '../shared/studio-catalog-contract';

interface Draft {
  id: string;
  sources_json: string;
  proposal_json: string;
  result_json: string | null;
  revision: number;
  updated_at: string;
}
const inProgress = new Set<string>();

function getDraft(req: Request): Draft {
  const row = db.prepare('SELECT * FROM studio_catalog_imports WHERE id = ? AND tenant_id = ? AND actor_id = ?')
    .get(req.params.id, req.tenantId, req.user?.userId);
  if (!row) throw catalogError('Rascunho não encontrado.', 404);
  return row;
}

function responseFor(tenantId: string, draft: Draft) {
  const proposal = JSON.parse(draft.proposal_json) as StudioProposal;
  const catalog = readStudioImportCatalog(tenantId);
  const services = catalog.services.map(s => ({
    id: s.id, name: s.name, active: Boolean(s.active), type: s.studio_service_type, capacity: s.default_capacity
  }));
  const packages = catalog.packages.map(p => ({ ...p, active: Boolean(p.active) }));
  return {
    id: draft.id, revision: draft.revision, proposal, sources: JSON.parse(draft.sources_json),
    result: draft.result_json ? JSON.parse(draft.result_json) : null,
    catalog: { services, packages, professionals: catalog.professionals },
    matches: {
      services: Object.fromEntries(proposal.services.map(s => [s.key, services.filter(c => similarCatalogName(s.name, c.name)).slice(0, 12)])),
      packages: Object.fromEntries(proposal.packages.map(p => [p.key, packages.filter(c => similarCatalogName(p.name, c.name)).slice(0, 12)]))
    }
  };
}

function respondError(res: Response, error: unknown) {
  const status = (error as { status?: number }).status || 500;
  if (status >= 500) console.error('[StudioCatalogImport]', status);
  res.status(status).json({ error: status === 500 ? 'Falha ao processar a importação. Nenhum cadastro foi concluído.' : (error as Error).message });
}

export class StudioCatalogImportController {
  static list(req: Request, res: Response) {
    const rows = db.prepare(`
      SELECT id, sources_json, updated_at FROM studio_catalog_imports
      WHERE tenant_id = ? AND actor_id = ? AND result_json IS NULL
      ORDER BY updated_at DESC LIMIT 30
    `).all(req.tenantId, req.user!.userId);
    res.json(rows.map(row => ({ id: row.id, sources: JSON.parse(row.sources_json), updatedAt: row.updated_at })));
  }

  static get(req: Request, res: Response) {
    try { res.json(responseFor(req.tenantId!, getDraft(req))); }
    catch (error) { respondError(res, error); }
  }

  static async analyze(req: Request, res: Response) {
    const tenantId = req.tenantId!;
    const actorId = req.user!.userId;
    try {
      const uploads = readCatalogUploads(req.body?.files);
      const files = [...new Map(uploads.map(file => [file.fingerprint, file])).values()];
      const fingerprint = hash(files.map(file => file.fingerprint).sort().join('|'));
      const lookup = db.prepare('SELECT * FROM studio_catalog_imports WHERE tenant_id = ? AND actor_id = ? AND fingerprint = ?');
      const saved = lookup.get(tenantId, actorId, fingerprint) as Draft | undefined;
      if (saved) {
        res.json(responseFor(tenantId, saved));
        return;
      }
      if (!GeminiService.isConfigured()) throw catalogError('A análise por IA está indisponível neste momento.', 503);
      if (inProgress.has(tenantId) || inProgress.size >= 4) {
        throw catalogError('Já há análises em andamento. Aguarde um momento e tente novamente.', 429);
      }
      inProgress.add(tenantId);
      try {
        const inputs = [];
        for (const file of files) inputs.push(await prepareCatalogFile(file));
        const raw = await GeminiService.extractStudioCatalog(CATALOG_PROMPT, inputs);
        if (!raw) throw catalogError('A IA não conseguiu interpretar os arquivos. Tente novamente com arquivos mais legíveis ou em um lote menor.', 502);
        let proposal: StudioProposal;
        try { proposal = normalizeProposal(raw, files.length, true); }
        catch { throw catalogError('A análise voltou incompleta. Tente novamente com um lote menor.', 502); }
        if (!proposal.services.length && !proposal.packages.length) {
          throw catalogError('Nenhum serviço ou pacote foi identificado. Envie arquivos com o catálogo ou a tabela de preços.', 422);
        }
        const sources = files.map((file, i) => ({
          id: i + 1, fileName: file.fileName, copies: uploads.filter(upload => upload.fingerprint === file.fingerprint).length
        }));
        const draft = db.transaction(() => {
          const previous = lookup.get(tenantId, actorId, fingerprint) as Draft | undefined;
          if (previous) return previous;
          const id = randomUUID();
          db.prepare(`
            INSERT INTO studio_catalog_imports (id, tenant_id, actor_id, fingerprint, sources_json, proposal_json)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(id, tenantId, actorId, fingerprint, JSON.stringify(sources), JSON.stringify(proposal));
          logAudit(req, 'ANALYZE_STUDIO_CATALOG_IMPORT', 'studio_catalog_imports', id, {
            files: sources.length, duplicateFiles: uploads.length - files.length, services: proposal.services.length, packages: proposal.packages.length
          });
          return lookup.get(tenantId, actorId, fingerprint) as Draft;
        })();
        res.json(responseFor(tenantId, draft));
      } finally {
        inProgress.delete(tenantId);
      }
    } catch (error) { respondError(res, error); }
  }

  static save(req: Request, res: Response) {
    try {
      const draft = db.transaction(() => {
        const current = getDraft(req);
        if (current.result_json) throw catalogError('Esta importação já foi confirmada.', 409);
        const proposal = reviewedProposal(req, current);
        db.prepare(`
          UPDATE studio_catalog_imports SET proposal_json = ?, revision = revision + 1, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ? AND actor_id = ?
        `).run(JSON.stringify(proposal), current.id, req.tenantId, req.user!.userId);
        return getDraft(req);
      })();
      res.json(responseFor(req.tenantId!, draft));
    } catch (error) { respondError(res, error); }
  }

  static confirm(req: Request, res: Response) {
    try {
      if (req.body?.confirmed !== true) throw catalogError('Confirme expressamente os cadastros selecionados.');
      const draft = db.transaction(() => {
        const current = getDraft(req);
        if (current.result_json) return current;
        const proposal = reviewedProposal(req, current);
        const result = applyStudioCatalog(req, proposal);
        db.prepare(`
          UPDATE studio_catalog_imports
          SET proposal_json = ?, result_json = ?, revision = revision + 1, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ? AND actor_id = ?
        `).run(JSON.stringify(proposal), JSON.stringify(result), current.id, req.tenantId, req.user!.userId);
        logAudit(req, 'CONFIRM_STUDIO_CATALOG_IMPORT', 'studio_catalog_imports', current.id, result, { required: true });
        return getDraft(req);
      })();
      res.json(responseFor(req.tenantId!, draft));
    } catch (error) { respondError(res, error); }
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
