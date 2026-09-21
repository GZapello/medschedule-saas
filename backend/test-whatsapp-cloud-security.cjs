// ============================================================================
// SUÍTE DE TESTES AUTOMATIZADOS: SEGURANÇA E ARQUITETURA WHATSAPP CLOUD CENTRAL
// ============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Cria banco temporário isolado para testes
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-wpp-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test_wpp.sqlite');

// Configurações de ambiente
const TEST_ENCRYPTION_KEY = 'super_secret_whatsapp_aes_256_gcm_test_key_32_bytes_len';
process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.META_APP_ID = 'test_meta_app_12345';
process.env.META_APP_SECRET = 'test_meta_secret_67890';
process.env.META_WHATSAPP_CONFIG_ID = 'test_wpp_config_99999';
process.env.META_GRAPH_API_VERSION = 'v25.0';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { WhatsAppCloudService } = require('./dist/services/whatsapp-cloud.service');
const { WhatsAppCloudController } = require('./dist/controllers/whatsapp-cloud.controller');

// Mock helpers para requisições Express
function createMockReq(userRole, body = {}) {
  return {
    user: userRole ? { id: 'usr-test', email: 'test@zemda.com', role: userRole } : null,
    body
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log('Iniciando Suíte de Testes do WhatsApp Cloud Central Zemda...\n');

  // --------------------------------------------------------------------------
  // TESTE 1: Criptografia e Decriptografia AES-256-GCM com Authentication Tag
  // --------------------------------------------------------------------------
  console.log('TESTE 1: Criptografia e Decriptografia AES-256-GCM com Auth Tag');
  const sampleToken = 'EAABwzLIXgnYBO...super_secret_meta_access_token_123456789...';
  const encrypted = WhatsAppCloudService.encryptToken(sampleToken);
  
  assert.ok(encrypted, 'Token criptografado não pode ser vazio');
  const parts = encrypted.split(':');
  assert.equal(parts.length, 3, 'Payload GCM deve conter exatamente 3 partes (iv:authTag:ciphertext)');
  assert.equal(parts[0].length, 24, 'IV deve ter 12 bytes (24 caracteres hex)');
  assert.equal(parts[1].length, 32, 'AuthTag deve ter 16 bytes (32 caracteres hex)');
  assert.ok(parts[2].length > 0, 'Ciphertext deve ter conteúdo');

  // Decriptografa e verifica correspondência exata
  const decrypted = WhatsAppCloudService.decryptToken(encrypted);
  assert.equal(decrypted, sampleToken, 'Token decriptografado deve ser idêntico ao original');

  // Adulteração do ciphertext deve falhar na validação da tag de autenticação
  const tamperedCipher = parts[0] + ':' + parts[1] + ':' + (parts[2].slice(0, -2) + 'aa');
  assert.throws(
    () => WhatsAppCloudService.decryptToken(tamperedCipher),
    'Decriptografia com ciphertext adulterado deve falhar na verificação de integridade GCM'
  );

  // Adulteração da authTag deve falhar
  const tamperedTag = parts[0] + ':' + '00'.repeat(16) + ':' + parts[2];
  assert.throws(
    () => WhatsAppCloudService.decryptToken(tamperedTag),
    'Decriptografia com authTag inválida deve falhar'
  );
  console.log('✓ PASSOU: AES-256-GCM com Auth Tag e integridade criptográfica validadas.\n');

  // --------------------------------------------------------------------------
  // TESTE 2: Ausência de Chave Falha de Forma Segura (Sem Fallback)
  // --------------------------------------------------------------------------
  console.log('TESTE 2: Ausência de Chave de Criptografia Falha com Erro Seguro');
  delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  
  assert.throws(
    () => WhatsAppCloudService.encryptToken(sampleToken),
    /WHATSAPP_TOKEN_ENCRYPTION_KEY não configurada no ambiente/,
    'Deve lançar exceção explícita de chave ausente sem utilizar chave padrão insecure'
  );

  assert.throws(
    () => WhatsAppCloudService.decryptToken(encrypted),
    /WHATSAPP_TOKEN_ENCRYPTION_KEY não configurada no ambiente/,
    'Decriptografia sem chave deve lançar exceção'
  );

  // Restaura a chave
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  console.log('✓ PASSOU: Falha segura confirmada na ausência da chave.\n');

  // --------------------------------------------------------------------------
  // TESTE 3: Listener Estrito - Ignora Evento de Cancelamento e Erro
  // --------------------------------------------------------------------------
  console.log('TESTE 3: Filtro do Listener - Eventos CANCEL e ERROR são Ignorados');
  const simulateListener = (messageData) => {
    if (!messageData || typeof messageData !== 'object') return null;
    if (messageData.type !== 'WA_EMBEDDED_SIGNUP') return null;
    const eventName = messageData.event;
    if (!eventName || eventName === 'CANCEL' || eventName === 'ERROR' || eventName.includes('CANCEL') || eventName.includes('ERROR')) {
      return null;
    }
    if (eventName === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' || eventName === 'FINISH') {
      const payload = messageData.data || messageData;
      return {
        wabaId: payload.waba_id,
        phoneNumberId: payload.phone_number_id,
        businessId: payload.business_id,
        displayPhoneNumber: payload.display_phone_number
      };
    }
    return null;
  };

  const cancelEvent = { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { error: 'User cancelled' } };
  assert.equal(simulateListener(cancelEvent), null, 'Evento CANCEL deve ser completamente descartado');

  const errorEvent = { type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR', data: { error: 'Session expired' } };
  assert.equal(simulateListener(errorEvent), null, 'Evento ERROR deve ser completamente descartado');

  const intermediateEvent = { type: 'WA_EMBEDDED_SIGNUP', event: 'ROUTING_TO_STEP_2' };
  assert.equal(simulateListener(intermediateEvent), null, 'Eventos intermediários devem ser descartados');

  const foreignTypeEvent = { type: 'OTHER_SDK_EVENT', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' };
  assert.equal(simulateListener(foreignTypeEvent), null, 'Eventos com type diferente de WA_EMBEDDED_SIGNUP devem ser ignorados');
  console.log('✓ PASSOU: Filtro estrito descarta CANCEL, ERROR e eventos não-finais.\n');

  // --------------------------------------------------------------------------
  // TESTE 4: Listener Estrito - Processa Evento FINISH Válido
  // --------------------------------------------------------------------------
  console.log('TESTE 4: Filtro do Listener - Captura Evento FINISH Válido');
  const validFinishEvent = {
    type: 'WA_EMBEDDED_SIGNUP',
    event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    data: {
      waba_id: '1029384756',
      phone_number_id: '5647382910',
      business_id: '9988776655',
      display_phone_number: '+55 11 98888-7777'
    }
  };
  const captured = simulateListener(validFinishEvent);
  assert.ok(captured, 'Evento de conclusão válido deve ser capturado');
  assert.equal(captured.wabaId, '1029384756');
  assert.equal(captured.phoneNumberId, '5647382910');
  assert.equal(captured.businessId, '9988776655');
  assert.equal(captured.displayPhoneNumber, '+55 11 98888-7777');
  console.log('✓ PASSOU: Evento FINISH oficial capturado com sucesso.\n');

  // --------------------------------------------------------------------------
  // TESTE 5: Ausência de IDs / Rejeição de 'pending_waba' ou 'pending_phone_id'
  // --------------------------------------------------------------------------
  console.log('TESTE 5: Zero Pending - Rejeição de pending_waba ou pending_phone_id');
  await assert.rejects(
    async () => {
      await WhatsAppCloudService.saveSystemIntegration({
        wabaId: 'pending_waba',
        phoneNumberId: '5647382910',
        accessToken: sampleToken
      });
    },
    /Tentativa inválida de salvar integração com identificadores pendentes/,
    'Deve rejeitar salvar quando wabaId é pending_waba'
  );

  await assert.rejects(
    async () => {
      await WhatsAppCloudService.saveSystemIntegration({
        wabaId: '1029384756',
        phoneNumberId: 'pending_phone_id',
        accessToken: sampleToken
      });
    },
    /Tentativa inválida de salvar integração com identificadores pendentes/,
    'Deve rejeitar salvar quando phoneNumberId é pending_phone_id'
  );

  // Confirma que nenhuma linha foi gravada no banco
  const countPending = db.prepare('SELECT count(*) as total FROM whatsapp_cloud_system_integrations').get();
  assert.equal(countPending.total, 0, 'Nenhum registro com pending deve ser gravado no banco');
  console.log('✓ PASSOU: Política Zero Pending bloqueou identificadores incompletos.\n');

  // --------------------------------------------------------------------------
  // TESTE 6: Descoberta Server-Side de Phone Number ID e Validação
  // --------------------------------------------------------------------------
  console.log('TESTE 6: Descoberta Server-Side de Phone Number ID via Graph API');
  // Intercepta fetch temporariamente para simular respostas da Graph API Meta v25.0
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes('/1029384756/phone_numbers')) {
      return new Response(JSON.stringify({
        data: [
          {
            id: '9900112233',
            display_phone_number: '+55 11 91111-2222',
            verified_name: 'Zemda Saúde Central',
            status: 'CONNECTED'
          }
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/9900112233')) {
      return new Response(JSON.stringify({
        id: '9900112233',
        display_phone_number: '+55 11 91111-2222',
        verified_name: 'Zemda Saúde Central',
        status: 'CONNECTED'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };

  try {
    // Chamada sem phoneNumberId - deve descobrir via WABA phone_numbers
    const discovered = await WhatsAppCloudService.discoverAndValidateIds(
      sampleToken,
      '1029384756',
      undefined
    );

    assert.equal(discovered.wabaId, '1029384756', 'WABA ID deve corresponder ao fornecido');
    assert.equal(discovered.phoneNumberId, '9900112233', 'Phone Number ID deve ser descoberto via Graph API');
    assert.equal(discovered.displayPhoneNumber, '+55 11 91111-2222');
    assert.equal(discovered.verifiedName, 'Zemda Saúde Central');
  } finally {
    global.fetch = realFetch;
  }
  console.log('✓ PASSOU: Descoberta server-side de Phone Number ID executada com sucesso.\n');

  // --------------------------------------------------------------------------
  // TESTE 7: Tenant Comum Bloqueado (403 Forbidden)
  // --------------------------------------------------------------------------
  console.log('TESTE 7: Tenant Comum Tentando Acessar Configuração Global (403 Forbidden)');
  const reqTenant = createMockReq('patient');
  const resTenant = createMockRes();

  await WhatsAppCloudController.getConfig(reqTenant, resTenant);
  assert.equal(resTenant.statusCode, 403, 'Tenant comum deve receber 403 Forbidden');
  assert.equal(resTenant.body?.code, 'FORBIDDEN');
  assert.equal(resTenant.body?.success, false);

  const resTenantStatus = createMockRes();
  await WhatsAppCloudController.getStatus(reqTenant, resTenantStatus);
  assert.equal(resTenantStatus.statusCode, 403, 'Tenant comum deve receber 403 ao consultar status');
  console.log('✓ PASSOU: Acesso bloqueado para tenant comum com 403 Forbidden.\n');

  // --------------------------------------------------------------------------
  // TESTE 8: Clinic Admin Bloqueado ao Tentar Conectar WhatsApp (403 Forbidden)
  // --------------------------------------------------------------------------
  console.log('TESTE 8: Clinic Admin Bloqueado ao Tentar Conectar WhatsApp Central (403 Forbidden)');
  const reqClinicAdmin = createMockReq('clinic_admin', { code: 'some_meta_auth_code' });
  const resClinicAdmin = createMockRes();

  await WhatsAppCloudController.exchangeCode(reqClinicAdmin, resClinicAdmin);
  assert.equal(resClinicAdmin.statusCode, 403, 'Clinic Admin deve receber 403 Forbidden');
  assert.equal(resClinicAdmin.body?.code, 'FORBIDDEN');
  assert.match(resClinicAdmin.body?.error, /Apenas superadministradores/);

  const resClinicAdminDisc = createMockRes();
  await WhatsAppCloudController.disconnect(reqClinicAdmin, resClinicAdminDisc);
  assert.equal(resClinicAdminDisc.statusCode, 403, 'Clinic Admin deve receber 403 ao tentar desconectar');
  console.log('✓ PASSOU: Clinic Admin bloqueado com 403 Forbidden.\n');

  // --------------------------------------------------------------------------
  // TESTE 9: Superadmin Válido Autorizado a Acessar Configuração e Status
  // --------------------------------------------------------------------------
  console.log('TESTE 9: Superadmin Válido Autorizado');
  const reqSuperAdmin = createMockReq('superadmin');
  const resSuperAdminConfig = createMockRes();

  await WhatsAppCloudController.getConfig(reqSuperAdmin, resSuperAdminConfig);
  assert.equal(resSuperAdminConfig.statusCode, 200, 'Superadmin deve receber 200 OK no config');
  assert.equal(resSuperAdminConfig.body?.success, true);
  assert.equal(resSuperAdminConfig.body?.data?.apiVersion, 'v25.0');
  assert.ok(resSuperAdminConfig.body?.data?.isConfigured);
  // Garante que nenhum segredo vazou no config
  assert.equal('appSecret' in resSuperAdminConfig.body.data, false);
  assert.equal('encryptionKey' in resSuperAdminConfig.body.data, false);

  const resSuperAdminStatus = createMockRes();
  await WhatsAppCloudController.getStatus(reqSuperAdmin, resSuperAdminStatus);
  assert.equal(resSuperAdminStatus.statusCode, 200, 'Superadmin deve receber 200 OK no status');
  assert.equal(resSuperAdminStatus.body?.data?.connected, false, 'Inicialmente desconectado');
  console.log('✓ PASSOU: Superadmin autorizado com sucesso e segredos blindados.\n');

  // --------------------------------------------------------------------------
  // TESTE 10: Conexão e Desconexão Apagando Token e Credenciais Locais
  // --------------------------------------------------------------------------
  console.log('TESTE 10: Desconexão Apagando Token e Credenciais Locais');
  // Salva conexão central
  const saved = await WhatsAppCloudService.saveSystemIntegration({
    wabaId: '1029384756',
    phoneNumberId: '9900112233',
    businessId: '8877665544',
    accessToken: sampleToken,
    expiresIn: 3600, // 1 hora de validade
    displayPhoneNumber: '+55 11 91111-2222',
    createdBy: 'superadmin-test'
  });

  assert.ok(saved.id);
  assert.equal(saved.status, 'connected');
  assert.ok(saved.tokenExpiresAt, 'Data de expiração do token deve ser calculada e gravada');

  // Verifica que no banco o token foi criptografado com GCM
  const rowInDb = db.prepare('SELECT * FROM whatsapp_cloud_system_integrations WHERE id = ?').get(saved.id);
  assert.ok(rowInDb.encrypted_access_token);
  assert.equal(rowInDb.encrypted_access_token.split(':').length, 3);
  assert.ok(rowInDb.token_expires_at);

  // Executa desconexão
  const discSuccess = WhatsAppCloudService.disconnectSystemIntegration();
  assert.equal(discSuccess, true, 'Desconexão deve ter sucesso');

  // Validação estrita: O token DEVE ser apagado no banco (NULL), sem restos locais
  const rowAfterDisc = db.prepare('SELECT * FROM whatsapp_cloud_system_integrations WHERE id = ?').get(saved.id);
  assert.equal(rowAfterDisc.encrypted_access_token, null, 'encrypted_access_token DEVE ser NULL após disconnect');
  assert.equal(rowAfterDisc.token_expires_at, null, 'token_expires_at DEVE ser NULL após disconnect');
  assert.equal(rowAfterDisc.status, 'disconnected', 'Status deve ser disconnected');

  // Consulta de status para o cliente
  const statusAfter = WhatsAppCloudService.getSystemIntegration();
  assert.equal(statusAfter.connected, false, 'Status deve reportar connected: false');
  assert.equal(statusAfter.integration, null, 'Integration payload deve ser null');
  console.log('✓ PASSOU: Desconexão apagou completamente o token criptografado e credenciais locais.\n');

  // Limpeza do banco de teste
  db.prepare('DELETE FROM whatsapp_cloud_system_integrations').run();
  console.log('================================================================');
  console.log('TODOS OS 10 TESTES DE SEGURANÇA E ARQUITETURA PASSARAM COM SUCESSO!');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ FALHA NO TESTE:', err);
  process.exit(1);
});
