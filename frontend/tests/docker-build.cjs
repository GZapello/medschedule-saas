// Build with only the backend sources made available by the frontend Docker stage.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const repository = path.resolve(__dirname, '../..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-frontend-docker-'));
const frontend = path.join(workspace, 'frontend');
fs.cpSync(path.join(repository, 'frontend'), frontend, {
  recursive: true,
  filter: source => !['node_modules', 'dist', '.git', 'android'].includes(path.basename(source))
});
const stage = fs.readFileSync(path.join(repository, 'Dockerfile'), 'utf8').split('# Stage 2:')[0];
for (const line of stage.split(/\r?\n/)) {
  const match = /^COPY (backend\/\S+) (\S+)\s*$/.exec(line);
  if (!match) continue;
  const destination = path.resolve(frontend, match[2]);
  assert.ok(destination.startsWith(workspace + path.sep), 'Docker copy must stay inside isolated workspace');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(repository, match[1]), destination, { recursive: true });
}
// Reuse installed packages; source files remain isolated from the full backend.
fs.symlinkSync(path.join(repository, 'frontend/node_modules'), path.join(frontend, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const bin = path.join(repository, 'frontend/node_modules');
for (const [script, args] of [['typescript/bin/tsc', []], ['vite/bin/vite.js', ['build']]]) {
  const result = spawnSync(process.execPath, [path.join(bin, script), ...args], { cwd: frontend, stdio: 'inherit', timeout: 180000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('PASS frontend build using only Dockerfile COPY sources:', workspace);
