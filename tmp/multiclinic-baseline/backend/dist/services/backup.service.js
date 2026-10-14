"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRemoteBackups = listRemoteBackups;
exports.createBackup = createBackup;
exports.downloadRemoteBackup = downloadRemoteBackup;
exports.restoreBackup = restoreBackup;
exports.localBackups = localBackups;
exports.startBackupScheduler = startBackupScheduler;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const zlib_1 = __importDefault(require("zlib"));
const promises_1 = require("stream/promises");
const node_sqlite_1 = require("node:sqlite");
const client_s3_1 = require("@aws-sdk/client-s3");
const db_path_1 = require("../config/db-path");
const r2_storage_service_1 = require("./r2-storage.service");
// Formato do arquivo criptografado: MAGIC(4) | IV(12) | AUTH_TAG(16) | gzip(snapshot) cifrado com AES-256-GCM
const MAGIC = Buffer.from('ZBK1');
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + IV_LEN + TAG_LEN;
const REMOTE_PREFIX = 'backups/db/';
const BACKUP_FILE_RE = /^zemda-db-.+\.sqlite\.gz(\.enc)?$/;
function settings() {
    return {
        dir: process.env.BACKUP_DIR || path_1.default.join(path_1.default.dirname(db_path_1.dbPath), 'backups'),
        intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS) || 24,
        localRetention: Number(process.env.BACKUP_LOCAL_RETENTION) || 7,
        remoteRetentionDays: Number(process.env.BACKUP_REMOTE_RETENTION_DAYS) || 30,
        encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || '',
        bucket: process.env.BACKUP_R2_BUCKET || process.env.R2_BUCKET_NAME || 'zemda-files'
    };
}
function deriveKey(secret) {
    return crypto_1.default.createHash('sha256').update(secret).digest();
}
function remoteClient() {
    if (process.env.R2_MOCK_STORAGE === 'true')
        return null;
    return (0, r2_storage_service_1.buildR2Client)();
}
function quickCheck(file) {
    const snapshot = new node_sqlite_1.DatabaseSync(file);
    try {
        const row = snapshot.prepare('PRAGMA quick_check').get();
        if (row?.quick_check !== 'ok') {
            throw new Error(`Verificação de integridade falhou em ${path_1.default.basename(file)}: ${row?.quick_check ?? 'sem resposta'}`);
        }
    }
    finally {
        snapshot.close();
    }
}
function listLocalBackups(dir) {
    if (!fs_1.default.existsSync(dir))
        return [];
    return fs_1.default.readdirSync(dir).filter((f) => BACKUP_FILE_RE.test(f)).sort().reverse();
}
async function compressAndEncrypt(snapshot, outPath, secret) {
    const iv = crypto_1.default.randomBytes(IV_LEN);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
    const out = fs_1.default.createWriteStream(outPath);
    out.write(Buffer.concat([MAGIC, iv, Buffer.alloc(TAG_LEN)]));
    await (0, promises_1.pipeline)(fs_1.default.createReadStream(snapshot), zlib_1.default.createGzip(), cipher, out);
    // A tag de autenticação só existe no fim da cifragem; é gravada no espaço reservado do cabeçalho.
    const fd = fs_1.default.openSync(outPath, 'r+');
    try {
        fs_1.default.writeSync(fd, cipher.getAuthTag(), 0, TAG_LEN, MAGIC.length + IV_LEN);
    }
    finally {
        fs_1.default.closeSync(fd);
    }
}
async function uploadRemote(client, bucket, file) {
    const key = REMOTE_PREFIX + path_1.default.basename(file);
    await client.send(new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fs_1.default.createReadStream(file),
        ContentLength: fs_1.default.statSync(file).size,
        ContentType: 'application/octet-stream'
    }));
    return key;
}
async function listRemoteBackups() {
    const client = remoteClient();
    if (!client)
        return [];
    const { bucket } = settings();
    const items = [];
    let token;
    do {
        const page = await client.send(new client_s3_1.ListObjectsV2Command({ Bucket: bucket, Prefix: REMOTE_PREFIX, ContinuationToken: token }));
        for (const obj of page.Contents ?? []) {
            if (obj.Key && BACKUP_FILE_RE.test(path_1.default.basename(obj.Key))) {
                items.push({ key: obj.Key, sizeBytes: obj.Size ?? 0, lastModified: obj.LastModified ?? new Date(0) });
            }
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return items.sort((a, b) => b.key.localeCompare(a.key));
}
async function pruneRemote(client, bucket, keep, retentionDays) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const item of await listRemoteBackups()) {
        if (item.key !== keep && item.lastModified.getTime() < cutoff) {
            await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: bucket, Key: item.key }));
            removed++;
        }
    }
    return removed;
}
function pruneLocal(dir, retention) {
    const stale = listLocalBackups(dir).slice(retention);
    for (const f of stale)
        fs_1.default.rmSync(path_1.default.join(dir, f), { force: true });
    return stale.length;
}
/**
 * Gera um snapshot consistente do banco (VACUUM INTO), verifica a integridade, compacta,
 * criptografa (se BACKUP_ENCRYPTION_KEY estiver definida) e envia ao R2.
 * Dados de saúde nunca são enviados para fora do servidor sem criptografia.
 */
async function createBackup() {
    const cfg = settings();
    const started = Date.now();
    fs_1.default.mkdirSync(cfg.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshot = path_1.default.join(cfg.dir, `snapshot-${stamp}.sqlite.tmp`);
    const encrypted = cfg.encryptionKey.length > 0;
    const outFile = path_1.default.join(cfg.dir, `zemda-db-${stamp}.sqlite.gz${encrypted ? '.enc' : ''}`);
    const { db } = await Promise.resolve().then(() => __importStar(require('../config/database')));
    try {
        db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
        quickCheck(snapshot);
        if (encrypted) {
            await compressAndEncrypt(snapshot, outFile, cfg.encryptionKey);
        }
        else {
            await (0, promises_1.pipeline)(fs_1.default.createReadStream(snapshot), zlib_1.default.createGzip(), fs_1.default.createWriteStream(outFile));
        }
    }
    catch (err) {
        fs_1.default.rmSync(outFile, { force: true });
        throw err;
    }
    finally {
        fs_1.default.rmSync(snapshot, { force: true });
    }
    let remoteKey = null;
    const client = remoteClient();
    if (client && encrypted) {
        remoteKey = await uploadRemote(client, cfg.bucket, outFile);
        await pruneRemote(client, cfg.bucket, remoteKey, cfg.remoteRetentionDays);
    }
    pruneLocal(cfg.dir, cfg.localRetention);
    return {
        file: outFile,
        sizeBytes: fs_1.default.statSync(outFile).size,
        encrypted,
        remoteKey,
        durationMs: Date.now() - started
    };
}
async function downloadRemoteBackup(key, destination) {
    const client = remoteClient();
    if (!client)
        throw new Error('R2 não configurado: defina R2_ACCOUNT_ID/R2_ENDPOINT, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.');
    const res = await client.send(new client_s3_1.GetObjectCommand({ Bucket: settings().bucket, Key: key }));
    if (!res.Body)
        throw new Error(`Backup remoto vazio: ${key}`);
    await (0, promises_1.pipeline)(res.Body, fs_1.default.createWriteStream(destination));
}
/**
 * Descriptografa/descompacta um arquivo de backup para `target` e verifica a integridade do resultado.
 * Não toca no banco em uso: a troca do arquivo é feita manualmente com o serviço parado.
 */
async function restoreBackup(backupFile, target) {
    const fd = fs_1.default.openSync(backupFile, 'r');
    const header = Buffer.alloc(HEADER_LEN);
    const read = fs_1.default.readSync(fd, header, 0, HEADER_LEN, 0);
    fs_1.default.closeSync(fd);
    const tmpTarget = `${target}.restoring`;
    const verifiedGzip = `${target}.gz.restoring`;
    try {
        let gzipSource = backupFile;
        if (read === HEADER_LEN && header.subarray(0, MAGIC.length).equals(MAGIC)) {
            const secret = settings().encryptionKey;
            if (!secret)
                throw new Error('Backup criptografado: defina BACKUP_ENCRYPTION_KEY com a mesma chave usada para gerá-lo.');
            const iv = header.subarray(MAGIC.length, MAGIC.length + IV_LEN);
            const tag = header.subarray(MAGIC.length + IV_LEN, HEADER_LEN);
            const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
            decipher.setAuthTag(tag);
            // O GCM só autentica no fim: descriptografa inteiro antes de descompactar qualquer byte.
            try {
                await (0, promises_1.pipeline)(fs_1.default.createReadStream(backupFile, { start: HEADER_LEN }), decipher, fs_1.default.createWriteStream(verifiedGzip));
            }
            catch {
                throw new Error('Falha ao descriptografar: chave BACKUP_ENCRYPTION_KEY incorreta ou arquivo corrompido/adulterado.');
            }
            gzipSource = verifiedGzip;
        }
        await (0, promises_1.pipeline)(fs_1.default.createReadStream(gzipSource), zlib_1.default.createGunzip(), fs_1.default.createWriteStream(tmpTarget));
        quickCheck(tmpTarget);
        fs_1.default.renameSync(tmpTarget, target);
    }
    catch (err) {
        fs_1.default.rmSync(tmpTarget, { force: true });
        throw err;
    }
    finally {
        fs_1.default.rmSync(verifiedGzip, { force: true });
    }
}
function localBackups() {
    const { dir } = settings();
    return listLocalBackups(dir).map((f) => path_1.default.join(dir, f));
}
let schedulerStarted = false;
/**
 * Agenda backups periódicos no próprio processo. Ativo por padrão em produção
 * (desligue com BACKUP_ENABLED=false; ligue fora de produção com BACKUP_ENABLED=true).
 */
function startBackupScheduler(onError) {
    const enabled = process.env.BACKUP_ENABLED
        ? process.env.BACKUP_ENABLED === 'true'
        : process.env.NODE_ENV === 'production';
    if (!enabled || schedulerStarted)
        return;
    schedulerStarted = true;
    const cfg = settings();
    if (!cfg.encryptionKey) {
        console.warn('[Backup] BACKUP_ENCRYPTION_KEY não definida: backups ficarão só no volume local (sem cópia externa no R2).');
    }
    else if (!remoteClient()) {
        console.warn('[Backup] R2 não configurado: backups ficarão só no volume local (sem cópia externa).');
    }
    const intervalMs = cfg.intervalHours * 60 * 60 * 1000;
    const newest = listLocalBackups(cfg.dir)[0];
    let lastRun = newest ? fs_1.default.statSync(path_1.default.join(cfg.dir, newest)).mtimeMs : 0;
    let running = false;
    const tick = async () => {
        if (running || Date.now() - lastRun < intervalMs)
            return;
        running = true;
        try {
            const result = await createBackup();
            lastRun = Date.now();
            console.log(`[Backup] Concluído: ${path_1.default.basename(result.file)} (${(result.sizeBytes / 1048576).toFixed(1)} MB, ${result.durationMs} ms)${result.remoteKey ? ` → R2 ${result.remoteKey}` : ' (somente local)'}`);
        }
        catch (err) {
            console.error('[Backup] Falha ao gerar backup:', err);
            onError?.(err);
        }
        finally {
            running = false;
        }
    };
    setTimeout(tick, 60_000).unref();
    setInterval(tick, 15 * 60_000).unref();
    console.log(`[Backup] Agendador ativo: a cada ${cfg.intervalHours}h, retenção local de ${cfg.localRetention} arquivos e remota de ${cfg.remoteRetentionDays} dias.`);
}
