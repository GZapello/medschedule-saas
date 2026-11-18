import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '../config/database';
import { r2StorageService } from './r2-storage.service';

export type PreparedCatalogInput = {
  fileName: string;
  mimeType: string;
  base64?: string;
  text?: string;
  fingerprint?: string;
};

type TempFileRow = {
  id: string;
  batch_id: string;
  tenant_id: string;
  storage_provider: 'cloudflare_r2' | 'local_tmp';
  object_key: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  fingerprint: string;
  temp_state: string;
  expires_at: string;
  created_at: string;
  deleted_at: string | null;
};

const TEMP_KEY_PREFIX = 'tmp/studio-catalog-imports/';
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9_-]{1,120}$/;
const SAFE_TEMP_KEY_RE = /^tmp\/studio-catalog-imports\/([a-zA-Z0-9_-]{1,120})\/([a-zA-Z0-9_-]{1,120})\/([a-zA-Z0-9_-]{1,120})\.([a-z0-9]{1,8})$/;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'txt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'txt'
};

function sanitizeSegment(raw: string): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (!SAFE_SEGMENT_RE.test(cleaned)) {
    throw new Error('Identificador inválido para armazenamento temporário de importação.');
  }
  return cleaned;
}

function getLocalTempRoot(): string {
  return path.resolve(process.env.STUDIO_IMPORT_TMP_DIR || path.join(os.tmpdir(), 'zemda-studio-catalog-imports'));
}

function toSqliteUtc(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/** Garante que apenas objetos estritamente isolados sob tmp/studio-catalog-imports/<tenant>/<batch>/<file> sejam manipulados ou removidos. */
export function isSafeCatalogTempKey(
  objectKey: string,
  expectedTenantId?: string,
  expectedBatchId?: string
): boolean {
  const key = String(objectKey || '').trim();
  if (!key.startsWith(TEMP_KEY_PREFIX) || key.includes('..') || key.includes('\\')) return false;
  if (key.startsWith('clinics/') || key.startsWith('backups/') || key.startsWith('patients/')) return false;
  const match = key.match(SAFE_TEMP_KEY_RE);
  if (!match) return false;
  if (expectedTenantId && match[1] !== sanitizeSegment(expectedTenantId)) return false;
  if (expectedBatchId && match[2] !== sanitizeSegment(expectedBatchId)) return false;
  return true;
}

export function getStudioImportTempTtlHours(): number {
  const parsed = Number(process.env.STUDIO_IMPORT_TEMP_TTL_HOURS);
  if (!Number.isFinite(parsed) || parsed <= 0) return 24;
  return Math.min(24, Math.max(1, Math.round(parsed)));
}

export function computeTempExpiryIso(ttlHours = getStudioImportTempTtlHours()): string {
  return toSqliteUtc(new Date(Date.now() + ttlHours * 3600_000));
}

function resolveLocalFilePath(objectKey: string, tenantId?: string, batchId?: string): string {
  if (!isSafeCatalogTempKey(objectKey, tenantId, batchId)) {
    throw new Error(`Chave temporária recusada por segurança: ${objectKey}`);
  }
  const root = getLocalTempRoot();
  const rel = objectKey.slice(TEMP_KEY_PREFIX.length);
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) {
    throw new Error('Caminho temporário fora do diretório isolado.');
  }
  return full;
}

function shouldUseCloudflareR2(): boolean {
  return Boolean(r2StorageService.isConfiguredClient && process.env.R2_MOCK_STORAGE !== 'true');
}

let cleanupWorkerTimer: ReturnType<typeof setInterval> | null = null;

export class StudioCatalogTempStorageService {
  private static async writeBatchToProvider(
    provider: 'cloudflare_r2' | 'local_tmp',
    params: { tenantId: string; batchId: string; inputs: PreparedCatalogInput[] },
    expiresAtIso: string
  ): Promise<{ provider: 'cloudflare_r2' | 'local_tmp'; count: number; expiresAtIso: string }> {
    const tenantSeg = sanitizeSegment(params.tenantId);
    const batchSeg = sanitizeSegment(params.batchId);
    const createdKeys: string[] = [];

    try {
      const insertStmt = db.prepare(`
        INSERT INTO studio_catalog_import_temp_files (
          id, batch_id, tenant_id, storage_provider, object_key,
          original_file_name, mime_type, file_size, fingerprint,
          temp_state, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
      `);

      const recordsToPersist: Array<() => void> = [];
      for (const item of params.inputs) {
        const fileId = `tmp-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const isTextPayload = typeof item.text === 'string' && !item.base64;
        const ext = isTextPayload ? 'txt' : (EXTENSION_BY_MIME[item.mimeType] || 'bin');
        const objectKey = `${TEMP_KEY_PREFIX}${tenantSeg}/${batchSeg}/${fileId}.${ext}`;
        if (!isSafeCatalogTempKey(objectKey, params.tenantId, params.batchId)) {
          throw new Error('Falha ao gerar chave temporária segura.');
        }

        const buffer = isTextPayload
          ? Buffer.from(item.text || '', 'utf8')
          : Buffer.from(item.base64 || '', 'base64');
        const storedMime = isTextPayload ? 'text/plain; charset=utf-8' : item.mimeType;

        if (provider === 'cloudflare_r2') {
          await r2StorageService.uploadFile(objectKey, buffer, storedMime, {
            'zemda-module': 'studio-catalog-import',
            'zemda-temporary': 'true',
            'zemda-tenant-id': tenantSeg,
            'zemda-batch-id': batchSeg,
            'zemda-expires-at': expiresAtIso
          });
        } else {
          const targetPath = resolveLocalFilePath(objectKey, params.tenantId, params.batchId);
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.writeFileSync(targetPath, buffer);
        }
        createdKeys.push(objectKey);

        const fingerprint = item.fingerprint || fileId;
        const originalMime = item.mimeType;
        const sizeBytes = buffer.length;
        recordsToPersist.push(() => {
          insertStmt.run(
            fileId,
            params.batchId,
            params.tenantId,
            provider,
            objectKey,
            item.fileName,
            originalMime,
            sizeBytes,
            fingerprint,
            expiresAtIso
          );
        });
      }

      db.transaction(() => {
        for (const runInsert of recordsToPersist) runInsert();
      })();

      return { provider, count: createdKeys.length, expiresAtIso };
    } catch (err) {
      for (const objectKey of createdKeys) {
        try {
          if (provider === 'cloudflare_r2') {
            await r2StorageService.deleteFile(objectKey);
          } else {
            const p = resolveLocalFilePath(objectKey, params.tenantId, params.batchId);
            if (fs.existsSync(p)) fs.unlinkSync(p);
          }
        } catch (_) {}
      }
      throw err;
    }
  }

  static async stageBatchTempFiles(params: {
    tenantId: string;
    batchId: string;
    inputs: PreparedCatalogInput[];
    expiresAtIso?: string;
  }): Promise<{ provider: 'cloudflare_r2' | 'local_tmp'; count: number; expiresAtIso: string }> {
    const expiresAtIso = params.expiresAtIso || computeTempExpiryIso();
    // Remove quaisquer restos temporários anteriores do mesmo lote antes de gravar novos.
    await this.purgeBatchTempFiles(params.tenantId, params.batchId, 'restage');

    if (shouldUseCloudflareR2()) {
      try {
        return await this.writeBatchToProvider('cloudflare_r2', params, expiresAtIso);
      } catch (r2Err: any) {
        console.warn(
          '[StudioCatalogTempStorage] Falha ao gravar arquivo temporário no R2; usando armazenamento temporário isolado em disco local:',
          r2Err?.code || r2Err?.message || r2Err
        );
      }
    }

    return await this.writeBatchToProvider('local_tmp', params, expiresAtIso);
  }

  static hasUnexpiredTempFiles(tenantId: string, batchId: string, nowIso = toSqliteUtc(new Date())): boolean {
    const row = db.prepare(`
      SELECT COUNT(*) AS cnt FROM studio_catalog_import_temp_files
      WHERE tenant_id = ? AND batch_id = ? AND temp_state != 'deleted' AND expires_at > ?
    `).get(tenantId, batchId, nowIso) as { cnt: number } | undefined;
    return Number(row?.cnt || 0) > 0;
  }

  static async loadBatchTempInputs(
    tenantId: string,
    batchId: string,
    nowIso = toSqliteUtc(new Date())
  ): Promise<PreparedCatalogInput[]> {
    const rows = db.prepare(`
      SELECT * FROM studio_catalog_import_temp_files
      WHERE tenant_id = ? AND batch_id = ? AND temp_state != 'deleted'
      ORDER BY created_at ASC, id ASC
    `).all(tenantId, batchId) as TempFileRow[];

    if (rows.length === 0 || rows.some((r) => r.expires_at <= nowIso)) {
      return [];
    }

    db.prepare(`
      UPDATE studio_catalog_import_temp_files
      SET temp_state = 'processing'
      WHERE tenant_id = ? AND batch_id = ? AND temp_state != 'deleted'
    `).run(tenantId, batchId);

    const inputs: PreparedCatalogInput[] = [];
    for (const row of rows) {
      if (!isSafeCatalogTempKey(row.object_key, tenantId, batchId)) {
        throw new Error('Referência de arquivo temporário inválida.');
      }
      let bytes: Buffer;
      if (row.storage_provider === 'cloudflare_r2') {
        try {
          bytes = await r2StorageService.getObjectBuffer(row.object_key, 12 * 1024 * 1024);
        } catch (err: any) {
          console.warn('[StudioCatalogTempStorage] Falha ao ler temporário no R2:', err?.code || err?.message || err);
          return [];
        }
      } else {
        const filePath = resolveLocalFilePath(row.object_key, tenantId, batchId);
        if (!fs.existsSync(filePath)) {
          return [];
        }
        bytes = fs.readFileSync(filePath);
      }

      if (row.object_key.endsWith('.txt')) {
        inputs.push({
          fileName: row.original_file_name,
          mimeType: row.mime_type,
          text: bytes.toString('utf8'),
          fingerprint: row.fingerprint
        });
      } else {
        inputs.push({
          fileName: row.original_file_name,
          mimeType: row.mime_type,
          base64: bytes.toString('base64'),
          fingerprint: row.fingerprint
        });
      }
    }
    return inputs;
  }

  static markBatchTempRetryAvailable(tenantId: string, batchId: string): void {
    db.prepare(`
      UPDATE studio_catalog_import_temp_files
      SET temp_state = 'retry_available'
      WHERE tenant_id = ? AND batch_id = ? AND temp_state != 'deleted'
    `).run(tenantId, batchId);
  }

  static async purgeBatchTempFiles(
    tenantId: string,
    batchId: string,
    reason: string
  ): Promise<{ deletedCount: number; remainingActiveCount: number; errors: number }> {
    const rows = db.prepare(`
      SELECT * FROM studio_catalog_import_temp_files
      WHERE tenant_id = ? AND batch_id = ? AND temp_state != 'deleted'
    `).all(tenantId, batchId) as TempFileRow[];

    let deletedCount = 0;
    let errors = 0;
    const deletedRowIds: string[] = [];

    for (const row of rows) {
      if (!isSafeCatalogTempKey(row.object_key, tenantId, batchId)) {
        console.error('[StudioCatalogTempStorage] Chave bloqueada antes da exclusão:', row.object_key);
        errors++;
        continue;
      }
      try {
        if (row.storage_provider === 'cloudflare_r2') {
          await r2StorageService.deleteFile(row.object_key);
        } else {
          const fullPath = resolveLocalFilePath(row.object_key, tenantId, batchId);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
          const batchDir = path.dirname(fullPath);
          if (fs.existsSync(batchDir) && fs.readdirSync(batchDir).length === 0) {
            fs.rmdirSync(batchDir);
          }
        }
        deletedRowIds.push(row.id);
        deletedCount++;
      } catch (err: any) {
        errors++;
        console.warn(`[StudioCatalogTempStorage] Falha ao remover objeto temporário (${reason}):`, row.id, err?.message || err);
      }
    }

    if (deletedRowIds.length > 0) {
      const nowIso = toSqliteUtc(new Date());
      const updStmt = db.prepare(`
        UPDATE studio_catalog_import_temp_files
        SET temp_state = 'deleted', deleted_at = ?
        WHERE id = ? AND tenant_id = ? AND batch_id = ?
      `);
      db.transaction(() => {
        for (const id of deletedRowIds) {
          updStmt.run(nowIso, id, tenantId, batchId);
        }
      })();
    }

    const remainingRow = db.prepare(`
      SELECT COUNT(*) AS cnt FROM studio_catalog_import_temp_files
      WHERE tenant_id = ? AND batch_id = ? AND temp_state != 'deleted'
    `).get(tenantId, batchId) as { cnt: number } | undefined;
    const remainingActiveCount = Number(remainingRow?.cnt || 0);

    if (remainingActiveCount === 0 && (deletedCount > 0 || reason !== 'restage')) {
      db.prepare(`
        UPDATE studio_catalog_imports
        SET temp_purged_at = COALESCE(temp_purged_at, datetime('now'))
        WHERE id = ? AND tenant_id = ?
      `).run(batchId, tenantId);
    }

    return { deletedCount, remainingActiveCount, errors };
  }

  static async cleanupExpiredOrAbandonedBatches(nowIso = toSqliteUtc(new Date())): Promise<{ batchesCleaned: number; filesDeleted: number }> {
    const expiredPairs = db.prepare(`
      SELECT DISTINCT tenant_id, batch_id
      FROM studio_catalog_import_temp_files
      WHERE temp_state != 'deleted' AND expires_at <= ?
      LIMIT 100
    `).all(nowIso) as Array<{ tenant_id: string; batch_id: string }>;

    let batchesCleaned = 0;
    let filesDeleted = 0;

    for (const pair of expiredPairs) {
      const res = await this.purgeBatchTempFiles(pair.tenant_id, pair.batch_id, 'ttl_expired');
      filesDeleted += res.deletedCount;
      batchesCleaned++;

      db.prepare(`
        UPDATE studio_catalog_imports
        SET retryable = 0,
            error_code = COALESCE(error_code, 'TEMP_FILES_EXPIRED'),
            status = CASE WHEN status IN ('queued', 'processing') THEN 'failed' ELSE status END,
            error_message = CASE
              WHEN status IN ('queued', 'processing', 'failed') AND (error_message IS NULL OR error_message = '')
                THEN 'Prazo dos arquivos temporários expirado. Envie os arquivos novamente se precisar reanalisar.'
              ELSE error_message
            END,
            temp_purged_at = COALESCE(temp_purged_at, datetime('now'))
        WHERE id = ? AND tenant_id = ? AND status NOT IN ('ready', 'completed')
      `).run(pair.batch_id, pair.tenant_id);
    }

    return { batchesCleaned, filesDeleted };
  }

  static async recoverInterruptedJobsOnStartup(): Promise<{ expiredCleaned: number; interruptedMarkedRetryable: number }> {
    const expiredRes = await this.cleanupExpiredOrAbandonedBatches();
    const stuck = db.prepare(`
      SELECT id, tenant_id, temp_expires_at
      FROM studio_catalog_imports
      WHERE status IN ('queued', 'processing')
    `).all() as Array<{ id: string; tenant_id: string; temp_expires_at: string | null }>;

    const nowIso = toSqliteUtc(new Date());
    let interruptedMarkedRetryable = 0;

    for (const job of stuck) {
      const canRetry = this.hasUnexpiredTempFiles(job.tenant_id, job.id, nowIso);
      if (canRetry) {
        this.markBatchTempRetryAvailable(job.tenant_id, job.id);
      } else {
        await this.purgeBatchTempFiles(job.tenant_id, job.id, 'startup_orphan_expired');
      }
      db.prepare(`
        UPDATE studio_catalog_imports
        SET status = 'failed',
            error_code = ?,
            error_message = ?,
            retryable = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND status IN ('queued', 'processing')
      `).run(
        canRetry ? 'BACKEND_RESTARTED' : 'TEMP_FILES_EXPIRED',
        canRetry
          ? 'O servidor foi reiniciado durante a análise. Clique em "Tentar novamente" para retomar.'
          : 'A análise foi interrompida e os arquivos temporários expiraram. Envie os arquivos novamente.',
        canRetry ? 1 : 0,
        job.id,
        job.tenant_id
      );
      if (canRetry) interruptedMarkedRetryable++;
    }

    return { expiredCleaned: expiredRes.filesDeleted, interruptedMarkedRetryable };
  }

  static startCleanupWorker(intervalMs = 15 * 60_000): void {
    if (cleanupWorkerTimer) return;
    cleanupWorkerTimer = setInterval(() => {
      void this.cleanupExpiredOrAbandonedBatches().catch((err) => {
        console.warn('[StudioCatalogTempStorage] Aviso na rotina periódica de limpeza:', err?.message || err);
      });
    }, intervalMs);
    cleanupWorkerTimer.unref();
  }
}
