import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { dbPath } from '../config/db-path';
import { buildR2Client } from './r2-storage.service';

// Formato do arquivo criptografado: MAGIC(4) | IV(12) | AUTH_TAG(16) | gzip(snapshot) cifrado com AES-256-GCM
const MAGIC = Buffer.from('ZBK1');
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + IV_LEN + TAG_LEN;
const REMOTE_PREFIX = 'backups/db/';
const BACKUP_FILE_RE = /^zemda-db-.+\.sqlite\.gz(\.enc)?$/;

export interface BackupResult {
  file: string;
  sizeBytes: number;
  encrypted: boolean;
  remoteKey: string | null;
  durationMs: number;
}

export interface RemoteBackup {
  key: string;
  sizeBytes: number;
  lastModified: Date;
}

function settings() {
  return {
    dir: process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups'),
    intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS) || 24,
    localRetention: Number(process.env.BACKUP_LOCAL_RETENTION) || 7,
    remoteRetentionDays: Number(process.env.BACKUP_REMOTE_RETENTION_DAYS) || 30,
    encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || '',
    bucket: process.env.BACKUP_R2_BUCKET || process.env.R2_BUCKET_NAME || 'zemda-files'
  };
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function remoteClient(): S3Client | null {
  if (process.env.R2_MOCK_STORAGE === 'true') return null;
  return buildR2Client();
}

function quickCheck(file: string): void {
  const snapshot = new DatabaseSync(file);
  try {
    const row = snapshot.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    if (row?.quick_check !== 'ok') {
      throw new Error(`Verificação de integridade falhou em ${path.basename(file)}: ${row?.quick_check ?? 'sem resposta'}`);
    }
  } finally {
    snapshot.close();
  }
}

function listLocalBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => BACKUP_FILE_RE.test(f)).sort().reverse();
}

async function compressAndEncrypt(snapshot: string, outPath: string, secret: string): Promise<void> {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const out = fs.createWriteStream(outPath);
  out.write(Buffer.concat([MAGIC, iv, Buffer.alloc(TAG_LEN)]));
  await pipeline(fs.createReadStream(snapshot), zlib.createGzip(), cipher, out);
  // A tag de autenticação só existe no fim da cifragem; é gravada no espaço reservado do cabeçalho.
  const fd = fs.openSync(outPath, 'r+');
  try {
    fs.writeSync(fd, cipher.getAuthTag(), 0, TAG_LEN, MAGIC.length + IV_LEN);
  } finally {
    fs.closeSync(fd);
  }
}

async function uploadRemote(client: S3Client, bucket: string, file: string): Promise<string> {
  const key = REMOTE_PREFIX + path.basename(file);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(file),
    ContentLength: fs.statSync(file).size,
    ContentType: 'application/octet-stream'
  }));
  return key;
}

export async function listRemoteBackups(): Promise<RemoteBackup[]> {
  const client = remoteClient();
  if (!client) return [];
  const { bucket } = settings();
  const items: RemoteBackup[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: REMOTE_PREFIX, ContinuationToken: token }));
    for (const obj of page.Contents ?? []) {
      if (obj.Key && BACKUP_FILE_RE.test(path.basename(obj.Key))) {
        items.push({ key: obj.Key, sizeBytes: obj.Size ?? 0, lastModified: obj.LastModified ?? new Date(0) });
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return items.sort((a, b) => b.key.localeCompare(a.key));
}

async function pruneRemote(client: S3Client, bucket: string, keep: string, retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const item of await listRemoteBackups()) {
    if (item.key !== keep && item.lastModified.getTime() < cutoff) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.key }));
      removed++;
    }
  }
  return removed;
}

function pruneLocal(dir: string, retention: number): number {
  const stale = listLocalBackups(dir).slice(retention);
  for (const f of stale) fs.rmSync(path.join(dir, f), { force: true });
  return stale.length;
}

/**
 * Gera um snapshot consistente do banco (VACUUM INTO), verifica a integridade, compacta,
 * criptografa (se BACKUP_ENCRYPTION_KEY estiver definida) e envia ao R2.
 * Dados de saúde nunca são enviados para fora do servidor sem criptografia.
 */
export async function createBackup(): Promise<BackupResult> {
  const cfg = settings();
  const started = Date.now();
  fs.mkdirSync(cfg.dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshot = path.join(cfg.dir, `snapshot-${stamp}.sqlite.tmp`);
  const encrypted = cfg.encryptionKey.length > 0;
  const outFile = path.join(cfg.dir, `zemda-db-${stamp}.sqlite.gz${encrypted ? '.enc' : ''}`);

  const { db } = await import('../config/database');
  try {
    db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    quickCheck(snapshot);

    if (encrypted) {
      await compressAndEncrypt(snapshot, outFile, cfg.encryptionKey);
    } else {
      await pipeline(fs.createReadStream(snapshot), zlib.createGzip(), fs.createWriteStream(outFile));
    }
  } catch (err) {
    fs.rmSync(outFile, { force: true });
    throw err;
  } finally {
    fs.rmSync(snapshot, { force: true });
  }

  let remoteKey: string | null = null;
  const client = remoteClient();
  if (client && encrypted) {
    remoteKey = await uploadRemote(client, cfg.bucket, outFile);
    await pruneRemote(client, cfg.bucket, remoteKey, cfg.remoteRetentionDays);
  }
  pruneLocal(cfg.dir, cfg.localRetention);

  return {
    file: outFile,
    sizeBytes: fs.statSync(outFile).size,
    encrypted,
    remoteKey,
    durationMs: Date.now() - started
  };
}

export async function downloadRemoteBackup(key: string, destination: string): Promise<void> {
  const client = remoteClient();
  if (!client) throw new Error('R2 não configurado: defina R2_ACCOUNT_ID/R2_ENDPOINT, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.');
  const res = await client.send(new GetObjectCommand({ Bucket: settings().bucket, Key: key }));
  if (!res.Body) throw new Error(`Backup remoto vazio: ${key}`);
  await pipeline(res.Body as Readable, fs.createWriteStream(destination));
}

/**
 * Descriptografa/descompacta um arquivo de backup para `target` e verifica a integridade do resultado.
 * Não toca no banco em uso: a troca do arquivo é feita manualmente com o serviço parado.
 */
export async function restoreBackup(backupFile: string, target: string): Promise<void> {
  const fd = fs.openSync(backupFile, 'r');
  const header = Buffer.alloc(HEADER_LEN);
  const read = fs.readSync(fd, header, 0, HEADER_LEN, 0);
  fs.closeSync(fd);

  const tmpTarget = `${target}.restoring`;
  const verifiedGzip = `${target}.gz.restoring`;
  try {
    let gzipSource = backupFile;
    if (read === HEADER_LEN && header.subarray(0, MAGIC.length).equals(MAGIC)) {
      const secret = settings().encryptionKey;
      if (!secret) throw new Error('Backup criptografado: defina BACKUP_ENCRYPTION_KEY com a mesma chave usada para gerá-lo.');
      const iv = header.subarray(MAGIC.length, MAGIC.length + IV_LEN);
      const tag = header.subarray(MAGIC.length + IV_LEN, HEADER_LEN);
      const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
      decipher.setAuthTag(tag);
      // O GCM só autentica no fim: descriptografa inteiro antes de descompactar qualquer byte.
      try {
        await pipeline(fs.createReadStream(backupFile, { start: HEADER_LEN }), decipher, fs.createWriteStream(verifiedGzip));
      } catch {
        throw new Error('Falha ao descriptografar: chave BACKUP_ENCRYPTION_KEY incorreta ou arquivo corrompido/adulterado.');
      }
      gzipSource = verifiedGzip;
    }
    await pipeline(fs.createReadStream(gzipSource), zlib.createGunzip(), fs.createWriteStream(tmpTarget));
    quickCheck(tmpTarget);
    fs.renameSync(tmpTarget, target);
  } catch (err) {
    fs.rmSync(tmpTarget, { force: true });
    throw err;
  } finally {
    fs.rmSync(verifiedGzip, { force: true });
  }
}

export function localBackups(): string[] {
  const { dir } = settings();
  return listLocalBackups(dir).map((f) => path.join(dir, f));
}

let schedulerStarted = false;

/**
 * Agenda backups periódicos no próprio processo. Ativo por padrão em produção
 * (desligue com BACKUP_ENABLED=false; ligue fora de produção com BACKUP_ENABLED=true).
 */
export function startBackupScheduler(onError?: (err: unknown) => void): void {
  const enabled = process.env.BACKUP_ENABLED
    ? process.env.BACKUP_ENABLED === 'true'
    : process.env.NODE_ENV === 'production';
  if (!enabled || schedulerStarted) return;
  schedulerStarted = true;

  const cfg = settings();
  if (!cfg.encryptionKey) {
    console.warn('[Backup] BACKUP_ENCRYPTION_KEY não definida: backups ficarão só no volume local (sem cópia externa no R2).');
  } else if (!remoteClient()) {
    console.warn('[Backup] R2 não configurado: backups ficarão só no volume local (sem cópia externa).');
  }

  const intervalMs = cfg.intervalHours * 60 * 60 * 1000;
  const newest = listLocalBackups(cfg.dir)[0];
  let lastRun = newest ? fs.statSync(path.join(cfg.dir, newest)).mtimeMs : 0;
  let running = false;

  const tick = async () => {
    if (running || Date.now() - lastRun < intervalMs) return;
    running = true;
    try {
      const result = await createBackup();
      lastRun = Date.now();
      console.log(`[Backup] Concluído: ${path.basename(result.file)} (${(result.sizeBytes / 1048576).toFixed(1)} MB, ${result.durationMs} ms)${result.remoteKey ? ` → R2 ${result.remoteKey}` : ' (somente local)'}`);
    } catch (err) {
      console.error('[Backup] Falha ao gerar backup:', err);
      onError?.(err);
    } finally {
      running = false;
    }
  };

  setTimeout(tick, 60_000).unref();
  setInterval(tick, 15 * 60_000).unref();
  console.log(`[Backup] Agendador ativo: a cada ${cfg.intervalHours}h, retenção local de ${cfg.localRetention} arquivos e remota de ${cfg.remoteRetentionDays} dias.`);
}
