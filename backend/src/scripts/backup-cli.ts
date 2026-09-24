import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createBackup,
  restoreBackup,
  listRemoteBackups,
  downloadRemoteBackup,
  localBackups
} from '../services/backup.service';

const USAGE = `Uso:
  npm run backup -- create
      Gera um backup agora (e envia ao R2 se configurado).
  npm run backup -- list
      Lista backups locais e remotos.
  npm run backup -- restore <origem> <destino.sqlite> [--force]
      <origem> pode ser: caminho de um arquivo local | r2:<chave> | latest (mais recente no R2, senão local).
      Gera um banco restaurado em <destino.sqlite>. NÃO substitui o banco em uso:
      pare o serviço e troque o arquivo manualmente (ver docs/BACKUP.md).`;

async function resolveSource(source: string): Promise<{ file: string; cleanup: () => void }> {
  const noop = () => {};
  if (source === 'latest') {
    const remote = await listRemoteBackups();
    if (remote.length > 0) return resolveSource(`r2:${remote[0].key}`);
    const local = localBackups();
    if (local.length === 0) throw new Error('Nenhum backup encontrado (nem no R2, nem localmente).');
    return { file: local[0], cleanup: noop };
  }
  if (source.startsWith('r2:')) {
    const key = source.slice(3);
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-restore-')), path.basename(key));
    console.log(`Baixando ${key} do R2...`);
    await downloadRemoteBackup(key, tmp);
    return { file: tmp, cleanup: () => fs.rmSync(path.dirname(tmp), { recursive: true, force: true }) };
  }
  if (!fs.existsSync(source)) throw new Error(`Arquivo não encontrado: ${source}`);
  return { file: source, cleanup: noop };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === 'create') {
    const r = await createBackup();
    console.log(`Backup criado: ${r.file}`);
    console.log(`Tamanho: ${(r.sizeBytes / 1048576).toFixed(2)} MB | Criptografado: ${r.encrypted ? 'sim' : 'NÃO'} | R2: ${r.remoteKey ?? 'não enviado'}`);
    return;
  }

  if (command === 'list') {
    console.log('Locais:');
    for (const f of localBackups()) console.log(`  ${f} (${(fs.statSync(f).size / 1048576).toFixed(2)} MB)`);
    const remote = await listRemoteBackups();
    console.log(remote.length ? 'R2:' : 'R2: nenhum (ou R2 não configurado)');
    for (const r of remote) console.log(`  r2:${r.key} (${(r.sizeBytes / 1048576).toFixed(2)} MB, ${r.lastModified.toISOString()})`);
    return;
  }

  if (command === 'restore') {
    const [source, target] = args.filter((a) => !a.startsWith('--'));
    if (!source || !target) throw new Error(USAGE);
    if (fs.existsSync(target) && !args.includes('--force')) {
      throw new Error(`${target} já existe. Use --force para sobrescrever (nunca aponte para o banco em uso com o serviço rodando).`);
    }
    const { file, cleanup } = await resolveSource(source);
    try {
      await restoreBackup(file, target);
    } finally {
      cleanup();
    }
    console.log(`Banco restaurado e verificado (PRAGMA quick_check = ok): ${target}`);
    return;
  }

  console.log(USAGE);
  process.exitCode = command ? 1 : 0;
}

main().catch((err) => {
  console.error(`Erro: ${err?.message || err}`);
  process.exitCode = 1;
});
