const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const root = process.cwd();
const dir = path.join(root, 'tmp', 'teleconsulta-local');
const log = fs.openSync(path.join(dir, 'server.log'), 'a');
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'COMSPEC']) if (process.env[key]) env[key] = process.env[key];
Object.assign(env, {
 NODE_ENV: 'development', PORT: '4000',
 DATABASE_PATH: path.join(dir, 'teste.db'),
 DOTENV_CONFIG_PATH: path.join(dir, 'isolated.env'),
 SEED_DEMO_DATA: 'true',
 JWT_SECRET: randomBytes(48).toString('hex'),
 ZEMDA_FILES_SIGNING_SECRET: randomBytes(48).toString('hex'),
 FRONTEND_DIST_PATH: path.join(root, 'frontend', 'dist'),
 ALLOWED_ORIGINS: 'http://localhost:4000,http://127.0.0.1:4000',
 APP_URL: 'http://localhost:4000', PUBLIC_APP_URL: 'http://localhost:4000',
 BACKUP_ENABLED: 'false', R2_MOCK_STORAGE: 'true'
});
const child = spawn(process.execPath, [path.join(root, 'backend', 'dist', 'server.js')], {
 cwd: path.join(root, 'backend'), env, detached: true, windowsHide: true, stdio: ['ignore', log, log]
});
fs.writeFileSync(path.join(dir, 'server.pid'), String(child.pid));
child.unref();
console.log(JSON.stringify({ pid: child.pid, url: 'http://localhost:4000', database: env.DATABASE_PATH }));
