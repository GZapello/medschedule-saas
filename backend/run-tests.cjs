// Executa todos os testes de integração determinísticos (test-*.cjs) em processos
// isolados, cada um com seu próprio banco SQLite temporário, e resume o resultado.
// Scripts que dependem de um servidor já rodando em localhost:4000 (test-*.js e
// test-suite.ts) são smoke tests manuais e não fazem parte desta bateria.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testFiles = fs.readdirSync(__dirname)
  .filter((f) => /^test-.*\.cjs$/.test(f))
  .filter(f => process.argv.length <= 2 || process.argv.slice(2).includes(f))
  .sort();

if (testFiles.length === 0) {
  console.error('Nenhum arquivo test-*.cjs encontrado.');
  process.exit(1);
}

const results = [];

for (const file of testFiles) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-test-'));
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    EMAIL_OTP_SECRET: 'test-only-otp-secret',
    GEMINI_API_KEY: '',
    RESEND_API_KEY: '',
    DATABASE_PATH: path.join(tmpDir, 'test.sqlite'),
    JWT_SECRET: process.env.JWT_SECRET || 'test-only-jwt-secret-nao-usar-em-producao',
    ZEMDA_FILES_SIGNING_SECRET: process.env.ZEMDA_FILES_SIGNING_SECRET || 'test-only-files-signing-secret',
    INFOBIP_API_KEY: process.env.INFOBIP_API_KEY || 'test-only-infobip-api-key',
    INFOBIP_BASE_URL: process.env.INFOBIP_BASE_URL || 'https://test.api.infobip.com',
    INFOBIP_WHATSAPP_SENDER: process.env.INFOBIP_WHATSAPP_SENDER || '5511999999999',
    APP_URL: process.env.APP_URL || 'https://zemda.test',
    R2_MOCK_STORAGE: process.env.R2_MOCK_STORAGE || 'true'
  };

  console.log(`\n=== ${file} ===`);
  const start = Date.now();
  const run = spawnSync(process.execPath, [file], { cwd: __dirname, env, stdio: 'inherit', timeout: 180000 });
  const durationMs = Date.now() - start;

  if (path.dirname(path.resolve(tmpDir)) !== path.resolve(os.tmpdir()) || !path.basename(tmpDir).startsWith('zemda-test-')) {
    throw new Error('Diretório temporário de teste fora do local esperado');
  }
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  results.push({ file, passed: run.status === 0, durationMs });
}

console.log('\n\n=== RESUMO ===');
for (const result of results) console.log(`${result.passed ? '✓' : '✗'} ${result.file} (${result.durationMs}ms)`);
const failed = results.filter(result => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} testes passaram.`);
if (failed.length) { console.error('Falhas:', failed.map(result => result.file).join(', ')); process.exit(1); }
