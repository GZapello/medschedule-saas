// Backup: snapshot criptografado, envio ao R2 (simulado), retenção e restauração verificada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { DatabaseSync } = require('node:sqlite');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-backup-test-'));
process.env.DATABASE_PATH = path.join(root, 'live.sqlite');
process.env.BACKUP_DIR = path.join(root, 'backups');
process.env.BACKUP_ENCRYPTION_KEY = 'chave-de-teste-do-backup';
process.env.R2_MOCK_STORAGE = 'false';
process.env.R2_ENDPOINT = 'https://r2.zemda.test';
process.env.R2_ACCESS_KEY_ID = 'test';
process.env.R2_SECRET_ACCESS_KEY = 'test';
process.env.BACKUP_R2_BUCKET = 'zemda-backups-test';

// R2 simulado em memória: intercepta os comandos do SDK S3.
const remote = new Map();
const { S3Client } = require('@aws-sdk/client-s3');
S3Client.prototype.send = async function (command) {
  const name = command.constructor.name;
  const input = command.input;
  assert.equal(input.Bucket, 'zemda-backups-test');
  if (name === 'PutObjectCommand') {
    const chunks = [];
    for await (const c of input.Body) chunks.push(c);
    remote.set(input.Key, { body: Buffer.concat(chunks), lastModified: new Date() });
    return {};
  }
  if (name === 'ListObjectsV2Command') {
    const Contents = [...remote.entries()]
      .filter(([k]) => k.startsWith(input.Prefix))
      .map(([Key, v]) => ({ Key, Size: v.body.length, LastModified: v.lastModified }));
    return { Contents, IsTruncated: false };
  }
  if (name === 'DeleteObjectCommand') {
    remote.delete(input.Key);
    return {};
  }
  if (name === 'GetObjectCommand') {
    return { Body: Readable.from(remote.get(input.Key).body) };
  }
  throw new Error('Comando S3 inesperado: ' + name);
};

const { db, initializeDatabase } = require('./dist/config/database');
const backup = require('./dist/services/backup.service');

let passed = 0;
const check = async (label, fn) => {
  await fn();
  passed++;
  console.log(`  ✅ ${label}`);
};

(async () => {
  initializeDatabase();
  db.exec("CREATE TABLE IF NOT EXISTS backup_probe (valor TEXT)");
  db.prepare('INSERT INTO backup_probe (valor) VALUES (?)').run('marcador-original');

  let first;
  await check('Backup criptografado é gerado e enviado ao R2', async () => {
    first = await backup.createBackup();
    assert.ok(first.file.endsWith('.sqlite.gz.enc'));
    assert.equal(first.encrypted, true);
    assert.equal(first.remoteKey, 'backups/db/' + path.basename(first.file));
    assert.ok(remote.has(first.remoteKey));
    const raw = fs.readFileSync(first.file);
    assert.equal(raw.subarray(0, 4).toString(), 'ZBK1');
    assert.ok(!raw.includes(Buffer.from('SQLite format 3')), 'conteúdo não pode estar legível');
    assert.ok(!raw.includes(Buffer.from('marcador-original')), 'dados não podem aparecer em texto claro');
  });

  await check('Nenhum snapshot temporário sem criptografia fica no disco', async () => {
    const leftovers = fs.readdirSync(process.env.BACKUP_DIR).filter((f) => f.includes('.tmp'));
    assert.deepEqual(leftovers, []);
  });

  // Alterações depois do backup não podem aparecer na restauração.
  db.prepare('UPDATE backup_probe SET valor = ?').run('alterado-depois');

  await check('Restauração recupera exatamente o estado do backup', async () => {
    const target = path.join(root, 'restaurado.sqlite');
    await backup.restoreBackup(first.file, target);
    const restored = new DatabaseSync(target);
    assert.equal(restored.prepare('SELECT valor FROM backup_probe').get().valor, 'marcador-original');
    assert.ok(restored.prepare('SELECT COUNT(*) AS n FROM categories').get().n > 0, 'tabelas do sistema presentes');
    restored.close();
  });

  await check('Arquivo adulterado é rejeitado', async () => {
    const tampered = path.join(root, 'adulterado.enc');
    const buf = fs.readFileSync(first.file);
    buf[buf.length - 10] ^= 0xff;
    fs.writeFileSync(tampered, buf);
    await assert.rejects(backup.restoreBackup(tampered, path.join(root, 'x.sqlite')), /descriptografar/);
    assert.ok(!fs.existsSync(path.join(root, 'x.sqlite')));
  });

  await check('Chave errada é rejeitada', async () => {
    process.env.BACKUP_ENCRYPTION_KEY = 'outra-chave';
    await assert.rejects(backup.restoreBackup(first.file, path.join(root, 'y.sqlite')), /descriptografar/);
    process.env.BACKUP_ENCRYPTION_KEY = 'chave-de-teste-do-backup';
  });

  await check('Retenção local mantém só os N backups mais recentes', async () => {
    process.env.BACKUP_LOCAL_RETENTION = '2';
    await backup.createBackup();
    await backup.createBackup();
    await backup.createBackup();
    assert.equal(backup.localBackups().length, 2);
    delete process.env.BACKUP_LOCAL_RETENTION;
  });

  await check('Retenção remota apaga backups mais antigos que o limite', async () => {
    remote.set('backups/db/zemda-db-2000-01-01T00-00-00-000Z.sqlite.gz.enc', { body: Buffer.from('x'), lastModified: new Date(Date.now() - 40 * 86400000) });
    remote.set('backups/outra-coisa.txt', { body: Buffer.from('x'), lastModified: new Date(Date.now() - 400 * 86400000) });
    await backup.createBackup();
    assert.ok(!remote.has('backups/db/zemda-db-2000-01-01T00-00-00-000Z.sqlite.gz.enc'));
    assert.ok(remote.has('backups/outra-coisa.txt'), 'objetos fora do padrão de backup não são tocados');
  });

  await check('Restauração a partir do backup mais recente no R2', async () => {
    const [latest] = await backup.listRemoteBackups();
    const downloaded = path.join(root, 'baixado.enc');
    await backup.downloadRemoteBackup(latest.key, downloaded);
    const target = path.join(root, 'do-r2.sqlite');
    await backup.restoreBackup(downloaded, target);
    const restored = new DatabaseSync(target);
    assert.equal(restored.prepare('SELECT valor FROM backup_probe').get().valor, 'alterado-depois');
    restored.close();
  });

  await check('Sem chave de criptografia: backup só local (nunca envia texto claro ao R2)', async () => {
    delete process.env.BACKUP_ENCRYPTION_KEY;
    const before = remote.size;
    const r = await backup.createBackup();
    assert.ok(r.file.endsWith('.sqlite.gz'));
    assert.equal(r.remoteKey, null);
    assert.equal(remote.size, before);
    const target = path.join(root, 'sem-chave.sqlite');
    await backup.restoreBackup(r.file, target);
    assert.ok(fs.existsSync(target));
  });

  console.log(`\nRESULTADO: ${passed} verificações de backup passaram.`);
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    // No Windows o banco ainda aberto por este processo não pode ser apagado; o diretório temporário fica para o SO.
  }
})().catch((err) => {
  console.error('❌ Falha no teste de backup:', err);
  process.exitCode = 1;
});
