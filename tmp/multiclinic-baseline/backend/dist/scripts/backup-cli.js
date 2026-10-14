"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const backup_service_1 = require("../services/backup.service");
const USAGE = `Uso:
  npm run backup -- create
      Gera um backup agora (e envia ao R2 se configurado).
  npm run backup -- list
      Lista backups locais e remotos.
  npm run backup -- restore <origem> <destino.sqlite> [--force]
      <origem> pode ser: caminho de um arquivo local | r2:<chave> | latest (mais recente no R2, senão local).
      Gera um banco restaurado em <destino.sqlite>. NÃO substitui o banco em uso:
      pare o serviço e troque o arquivo manualmente (ver docs/BACKUP.md).`;
async function resolveSource(source) {
    const noop = () => { };
    if (source === 'latest') {
        const remote = await (0, backup_service_1.listRemoteBackups)();
        if (remote.length > 0)
            return resolveSource(`r2:${remote[0].key}`);
        const local = (0, backup_service_1.localBackups)();
        if (local.length === 0)
            throw new Error('Nenhum backup encontrado (nem no R2, nem localmente).');
        return { file: local[0], cleanup: noop };
    }
    if (source.startsWith('r2:')) {
        const key = source.slice(3);
        const tmp = path_1.default.join(fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'zemda-restore-')), path_1.default.basename(key));
        console.log(`Baixando ${key} do R2...`);
        await (0, backup_service_1.downloadRemoteBackup)(key, tmp);
        return { file: tmp, cleanup: () => fs_1.default.rmSync(path_1.default.dirname(tmp), { recursive: true, force: true }) };
    }
    if (!fs_1.default.existsSync(source))
        throw new Error(`Arquivo não encontrado: ${source}`);
    return { file: source, cleanup: noop };
}
async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'create') {
        const r = await (0, backup_service_1.createBackup)();
        console.log(`Backup criado: ${r.file}`);
        console.log(`Tamanho: ${(r.sizeBytes / 1048576).toFixed(2)} MB | Criptografado: ${r.encrypted ? 'sim' : 'NÃO'} | R2: ${r.remoteKey ?? 'não enviado'}`);
        return;
    }
    if (command === 'list') {
        console.log('Locais:');
        for (const f of (0, backup_service_1.localBackups)())
            console.log(`  ${f} (${(fs_1.default.statSync(f).size / 1048576).toFixed(2)} MB)`);
        const remote = await (0, backup_service_1.listRemoteBackups)();
        console.log(remote.length ? 'R2:' : 'R2: nenhum (ou R2 não configurado)');
        for (const r of remote)
            console.log(`  r2:${r.key} (${(r.sizeBytes / 1048576).toFixed(2)} MB, ${r.lastModified.toISOString()})`);
        return;
    }
    if (command === 'restore') {
        const [source, target] = args.filter((a) => !a.startsWith('--'));
        if (!source || !target)
            throw new Error(USAGE);
        if (fs_1.default.existsSync(target) && !args.includes('--force')) {
            throw new Error(`${target} já existe. Use --force para sobrescrever (nunca aponte para o banco em uso com o serviço rodando).`);
        }
        const { file, cleanup } = await resolveSource(source);
        try {
            await (0, backup_service_1.restoreBackup)(file, target);
        }
        finally {
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
