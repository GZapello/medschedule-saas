/**
 * Testes Automatizados da Integração WhatsApp via Infobip (Zemda)
 * Etapa 1 — Migração Definitiva + Teste de Conexão
 */
const assert = require('assert');

async function runTests() {
  console.log('=== [INÍCIO] Testes de Integração WhatsApp Infobip ===');

  // Limpa variáveis de ambiente para testar validação de ausência
  const originalEnv = { ...process.env };
  delete process.env.INFOBIP_API_KEY;
  delete process.env.INFOBIP_BASE_URL;
  delete process.env.INFOBIP_WHATSAPP_SENDER;

  const { InfobipService } = require('./dist/services/infobip.service');
  const { WhatsAppService } = require('./dist/services/whatsapp.service');

  // ==========================================
  // TESTE 1: Estado não configurado
  // ==========================================
  console.log('\n[1] Testando status quando variáveis não estão configuradas...');
  assert.strictEqual(InfobipService.isConfigured(), false);
  assert.strictEqual(WhatsAppService.isConnected(), false);

  const unconfiguredStatus = InfobipService.getStatus();
  assert.strictEqual(unconfiguredStatus.provider, 'infobip');
  assert.strictEqual(unconfiguredStatus.hasApiKey, false);
  assert.strictEqual(unconfiguredStatus.hasBaseUrl, false);
  assert.strictEqual(unconfiguredStatus.hasSender, false);
  assert.strictEqual(unconfiguredStatus.isConfigured, false);
  console.log('✅ Teste 1 passou: Ausência de credenciais reportada corretamente.');

  // ==========================================
  // TESTE 2: Validações pré-envio com variáveis ausentes
  // ==========================================
  console.log('\n[2] Testando falha segura de envio quando variáveis ausentes...');
  const sendMissingKey = await InfobipService.sendTextMessage('5511999998888', 'Teste');
  assert.strictEqual(sendMissingKey.success, false);
  assert.match(sendMissingKey.error, /INFOBIP_API_KEY/);

  process.env.INFOBIP_API_KEY = 'test-mock-key-12345';
  const sendMissingUrl = await InfobipService.sendTextMessage('5511999998888', 'Teste');
  assert.strictEqual(sendMissingUrl.success, false);
  assert.match(sendMissingUrl.error, /INFOBIP_BASE_URL/);

  process.env.INFOBIP_BASE_URL = 'https://test.api.infobip.com';
  const sendMissingSender = await InfobipService.sendTextMessage('5511999998888', 'Teste');
  assert.strictEqual(sendMissingSender.success, false);
  assert.match(sendMissingSender.error, /INFOBIP_WHATSAPP_SENDER/);
  console.log('✅ Teste 2 passou: Erros descritivos retornados para cada variável faltante.');

  // ==========================================
  // TESTE 3: Normalização de Base URL
  // ==========================================
  console.log('\n[3] Testando normalização de Base URL...');
  process.env.INFOBIP_BASE_URL = 'test.api.infobip.com/';
  assert.strictEqual(InfobipService.getBaseUrl(), 'https://test.api.infobip.com');
  assert.strictEqual(InfobipService.getBaseUrlHost(), 'test.api.infobip.com');

  process.env.INFOBIP_BASE_URL = 'http://insecure.infobip.com///';
  assert.strictEqual(InfobipService.getBaseUrl(), 'http://insecure.infobip.com');
  assert.strictEqual(InfobipService.getBaseUrlHost(), 'insecure.infobip.com');
  console.log('✅ Teste 3 passou: URLs normalizadas com sucesso sem barras finais e com protocolo.');

  // ==========================================
  // TESTE 4: Validação e status com configuração completa
  // ==========================================
  console.log('\n[4] Testando diagnóstico de status configurado...');
  process.env.INFOBIP_API_KEY = 'valid-secret-key-xyz';
  process.env.INFOBIP_BASE_URL = 'https://abc123.api.infobip.com';
  process.env.INFOBIP_WHATSAPP_SENDER = '5511999999999';

  assert.strictEqual(InfobipService.isConfigured(), true);
  assert.strictEqual(WhatsAppService.isConnected(), true);

  const configuredStatus = WhatsAppService.getStatus();
  assert.strictEqual(configuredStatus.provider, 'infobip');
  assert.strictEqual(configuredStatus.hasApiKey, true);
  assert.strictEqual(configuredStatus.hasBaseUrl, true);
  assert.strictEqual(configuredStatus.baseUrlHost, 'abc123.api.infobip.com');
  assert.strictEqual(configuredStatus.hasSender, true);
  assert.strictEqual(configuredStatus.sender, '5511999999999');
  assert.strictEqual(configuredStatus.isConfigured, true);
  // Garante que a chave da API NUNCA seja vazada no status
  assert.strictEqual(configuredStatus.apiKey, undefined);
  console.log('✅ Teste 4 passou: Status completo gerado sem vazamento de segredos.');

  // ==========================================
  // TESTE 5: Validação de Destinatário e Mensagem
  // ==========================================
  console.log('\n[5] Testando validação de destinatário e conteúdo...');
  const emptyTo = await WhatsAppService.sendTextMessage({ recipientPhone: '', messageText: 'Olá' });
  assert.strictEqual(emptyTo.success, false);
  assert.match(emptyTo.error, /não informado/);

  const invalidTo = await WhatsAppService.sendTextMessage({ recipientPhone: '123', messageText: 'Olá' });
  assert.strictEqual(invalidTo.success, false);
  assert.match(invalidTo.error, /inválido/);

  const emptyMsg = await WhatsAppService.sendTextMessage({ recipientPhone: '5511988887777', messageText: '   ' });
  assert.strictEqual(emptyMsg.success, false);
  assert.match(emptyMsg.error, /não pode ser vazio/);
  console.log('✅ Teste 5 passou: Rejeição correta para parâmetros mal formatados.');

  // ==========================================
  // TESTE 6: Interceptação Sandbox / Números Mock
  // ==========================================
  console.log('\n[6] Testando interceptação sandbox sem chamadas de rede externas...');
  const sandboxTest = await WhatsAppService.sendTextMessage({
    recipientPhone: '(11) 99999-0000',
    messageText: 'Mensagem de teste sandbox'
  });
  assert.strictEqual(sandboxTest.success, true);
  assert.match(sandboxTest.messageId, /^mock-infobip-/);
  assert.strictEqual(sandboxTest.status.name, 'SANDBOX_MOCK');
  console.log('✅ Teste 6 passou: Números sandbox interceptados com sucesso em ambiente seguro.');

  // Restaura ambiente original
  process.env = originalEnv;
  console.log('\n🎉 TODOS OS TESTES DE INFOBIP PASSARAM COM SUCESSO!\n');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de Infobip:', err);
  process.exit(1);
});
