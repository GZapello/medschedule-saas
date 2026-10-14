// Monitoramento de erros: alerta por e-mail em 5xx/exceções, com agrupamento, limite e sem vazar dados.
const assert = require('node:assert/strict');
const express = require('express');

process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = 're_test_only';
process.env.ERROR_ALERT_EMAILS = 'pedro@zemda.test, socio@zemda.test';
process.env.ERROR_ALERT_THROTTLE_MINUTES = '30';
process.env.ERROR_ALERT_MAX_PER_HOUR = '3';

// Relógio controlado para testar a janela de agrupamento e o limite por hora.
let clock = Date.now();
Date.now = () => clock;
const advanceMinutes = (m) => { clock += m * 60_000; };

// Intercepta só as chamadas à API do Resend; o resto (requisições ao app de teste) segue normal.
const realFetch = global.fetch;
const emails = [];
let resendMode = 'ok';
global.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.resend.com')) {
    if (resendMode === 'throw') throw new Error('rede fora do ar');
    emails.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: 'email_' + emails.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, options);
};

const { ErrorMonitor, sanitizePath } = require('./dist/services/error-monitor.service');

const app = express();
app.use(ErrorMonitor.requestMiddleware);
const api = express.Router();
api.get('/ok', (req, res) => res.json({ ok: true }));
api.get('/invalido', (req, res) => res.status(400).json({ error: 'dados inválidos' }));
api.get('/pacientes/:id', (req, res) => res.status(500).json({ error: 'Falha ao carregar paciente' }));
api.get('/outra-rota', (req, res) => res.status(502).json({ error: 'gateway' }));
api.get('/explode', () => { throw new Error('boom inesperado'); });
app.use('/api', api);
app.use((err, req, res, next) => {
  ErrorMonitor.captureRequestError(err, req, res);
  res.status(500).json({ error: err.message });
});

let passed = 0;
const check = async (label, fn) => { await fn(); passed++; console.log(`  ✅ ${label}`); };
// Mesmo erro, mesma origem: é assim que uma falha recorrente de um job aparece na prática.
const backupFailure = () => new Error('backup falhou: disco cheio');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const hit = async (path) => {
    await realFetch(base + path, { headers: { Connection: 'close' } }).then((r) => r.text());
    await new Promise((r) => setTimeout(r, 20));
    await ErrorMonitor.flush();
  };

  try {
    await check('Respostas 2xx/4xx não geram alerta', async () => {
      await hit('/api/ok');
      await hit('/api/invalido');
      assert.equal(emails.length, 0);
    });

    await check('Resposta 500 gera e-mail para todos os colaboradores, com a rota padronizada', async () => {
      await hit('/api/pacientes/pat-9f8e7d6c5b?token=eyJhbGciOiJIUzI1NiJ9.SEGREDO.assinatura');
      assert.equal(emails.length, 1);
      const [mail] = emails;
      assert.deepEqual(mail.to, ['pedro@zemda.test', 'socio@zemda.test']);
      assert.match(mail.subject, /\[Zemda\]\[produção\] HTTP 500 em GET \/api\/pacientes\/:id/);
      assert.match(mail.html, /Falha ao carregar paciente/);
    });

    await check('E-mail não contém token, query string nem ID do paciente', async () => {
      const { html, subject } = emails[0];
      for (const leak of ['SEGREDO', 'token=', 'eyJhbGci', 'pat-9f8e7d6c5b']) {
        assert.ok(!html.includes(leak) && !subject.includes(leak), `vazou: ${leak}`);
      }
    });

    await check('Repetições do mesmo erro dentro da janela são agrupadas (sem novo e-mail)', async () => {
      await hit('/api/pacientes/pat-1');
      await hit('/api/pacientes/pat-2');
      assert.equal(emails.length, 1);
    });

    await check('Depois da janela, novo alerta traz o total de ocorrências acumuladas', async () => {
      advanceMinutes(31);
      await hit('/api/pacientes/pat-3');
      assert.equal(emails.length, 2);
      assert.match(emails[1].subject, /\(3x\)/);
    });

    await check('Exceção no tratador central gera um único alerta (com stack), sem duplicar como 5xx', async () => {
      await hit('/api/explode');
      assert.equal(emails.length, 3);
      assert.match(emails[2].subject, /Error: boom inesperado/);
      assert.match(emails[2].html, /at /, 'stack trace presente');
    });

    await check('Limite de e-mails por hora é respeitado', async () => {
      await hit('/api/outra-rota');
      ErrorMonitor.captureException(backupFailure(), { source: 'backup' });
      await ErrorMonitor.flush();
      assert.equal(emails.length, 3);
    });

    await check('Após o limite liberar, o erro retido é alertado com a contagem', async () => {
      advanceMinutes(61);
      ErrorMonitor.captureException(backupFailure(), { source: 'backup' });
      await ErrorMonitor.flush();
      assert.equal(emails.length, 4);
      assert.match(emails[3].subject, /backup falhou: disco cheio \(2x\)/);
      assert.match(emails[3].html, /backup/);
    });

    await check('Falha no envio do e-mail nunca derruba a aplicação', async () => {
      resendMode = 'throw';
      ErrorMonitor.captureException(new Error('erro com Resend fora'), { source: 'teste' });
      await ErrorMonitor.flush();
      resendMode = 'ok';
    });

    await check('Sem destinatários configurados, nenhum e-mail é enviado', async () => {
      process.env.ERROR_ALERT_EMAILS = '';
      advanceMinutes(120);
      const before = emails.length;
      ErrorMonitor.captureException(new Error('sem destinatarios'), { source: 'teste' });
      await ErrorMonitor.flush();
      assert.equal(emails.length, before);
    });

    await check('Caminhos são higienizados (sem query string, IDs trocados por :id)', async () => {
      assert.equal(sanitizePath('/api/v1/files/att-83c0ad52-162c-4803-9502-1cffa944bf7f/url?token=abc'), '/api/v1/files/:id/url');
      assert.equal(sanitizePath('/api/v1/receipts/12345'), '/api/v1/receipts/:id');
      assert.equal(sanitizePath('/api/v1/public/download-android'), '/api/v1/public/download-android');
    });

    console.log(`\nRESULTADO: ${passed} verificações do monitoramento passaram.`);
  } catch (err) {
    console.error('❌ Falha no teste do monitoramento:', err);
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    server.close();
  }
})();
