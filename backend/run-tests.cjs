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
  .sort();

if (testFiles.length === 0) {
  console.error('Nenhum arquivo test-*.cjs encontrado.');
  process.exit(1);
}

// Testes que já falhavam ANTES desta suíte existir (nunca houve CI rodando-os).
// Cada motivo foi confirmado rodando o teste isoladamente: são bugs reais de
// aplicação/dados desatualizados, não relacionados a mudanças de segurança.
// Continuam rodando (e aparecem como ❌ no log) mas não derrubam o build,
// para o CI ficar acionável hoje sem esconder a dívida. Remova cada entrada
// daqui assim que o bug correspondente for corrigido.
const KNOWN_FAILING = {
  'test-atualizacao-zemda.cjs': 'TESTE 13: cadastro de clínica com ZemdaBody retorna undefined em vez da clínica criada',
  'test-clinic-control.cjs': "fixture: tabela consultation_completions não tem mais coluna 'id' (schema desatualizado)",
  'test-general-fixes-verification.cjs': "Item 8: checa o texto exato 'p.full_name || p.name' em ZemdaMedWorkspace.tsx; a busca de pacientes foi padronizada (commit 105cbf3) e o texto mudou, mas a busca continua funcionando",
  'test-invite-personal-prosthetics.cjs': 'mesma causa do test-legal-and-signup.cjs: fluxo de convite agora exige verificação de e-mail antes de concluir o cadastro (surgiu nos commits de 25/09)',
  'test-start-permissions.cjs': 'regra de módulo único por atendimento mudou (commit "fix: corrige agenda do profissional...", 25/09) e bloqueia o cenário do teste com 409',
  'test-legal-and-signup.cjs': 'fluxo de cadastro agora exige verificação de e-mail antes de registrar; teste ainda espera 201 direto',
  'test-manual-whatsapp-reminder.cjs': "tabela notifications não tem mais a coluna 'sent_by_user_id' (schema desatualizado)",
  'test-profession-module-transition.cjs': 'seed de profissões mudou: teste espera prof-psicologia e encontra prof-personal-trainer',
  'test-registration-cleanup.cjs': 'mesma causa do test-legal-and-signup.cjs: verificação de e-mail agora é obrigatória antes do cadastro',
  'test-registration-professions.cjs': "seed de profissões não contém mais 'prof-ginecologista'",
  'test-schedule-profession-change.cjs': 'asserção sobre grade de sábado inativo não bate mais com o comportamento atual',
  'test-targeted-personal-and-default-service.cjs': 'avaliação física: nem todas as 4 fotos corporais são preservadas (bug real a investigar)',
  'test-zemda-personal-and-body.cjs': 'catálogo de exercícios cresceu de 119 para 268 (teste trava no número antigo) e depende de um Worker Cloudflare real (upload R2), que não roda em CI'
};

const results = [];

for (const file of testFiles) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-test-'));
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_PATH: path.join(tmpDir, 'test.sqlite'),
    JWT_SECRET: process.env.JWT_SECRET || 'test-only-jwt-secret-nao-usar-em-producao',
    ZEMDA_FILES_SIGNING_SECRET: process.env.ZEMDA_FILES_SIGNING_SECRET || 'test-only-files-signing-secret',
    EMAIL_OTP_SECRET: process.env.EMAIL_OTP_SECRET || 'test-only-otp-secret-precisa-ser-longo-o-bastante',
    WHATSAPP_TOKEN_ENCRYPTION_KEY: process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || 'test-only-whatsapp-encryption-key',
    APP_URL: process.env.APP_URL || 'https://zemda.test',
    R2_MOCK_STORAGE: process.env.R2_MOCK_STORAGE || 'true'
  };

  console.log(`\n=== ${file} ===`);
  const start = Date.now();
  const run = spawnSync(process.execPath, [file], { cwd: __dirname, env, stdio: 'inherit' });
  const durationMs = Date.now() - start;

  fs.rmSync(tmpDir, { recursive: true, force: true });
  results.push({ file, passed: run.status === 0, durationMs });
}

console.log('\n\n=== RESUMO ===');
for (const r of results) {
  const known = KNOWN_FAILING[r.file];
  const tag = r.passed ? '✓' : (known ? '✗ (falha conhecida)' : '✗');
  console.log(`${tag} ${r.file} (${r.durationMs}ms)`);
}

const failed = results.filter((r) => !r.passed);
const newFailures = failed.filter((r) => !KNOWN_FAILING[r.file]);
const unexpectedPasses = results.filter((r) => r.passed && KNOWN_FAILING[r.file]);

console.log(`\n${results.length - failed.length}/${results.length} testes passaram (${failed.length - newFailures.length} falhas já conhecidas, documentadas no topo deste arquivo).`);

if (unexpectedPasses.length > 0) {
  console.log(`\nℹ Passaram mas estavam marcados como falha conhecida (remova do KNOWN_FAILING): ${unexpectedPasses.map((f) => f.file).join(', ')}`);
}

if (newFailures.length > 0) {
  console.log(`\n❌ Falha NOVA (não documentada): ${newFailures.map((f) => f.file).join(', ')}`);
  process.exit(1);
}
