/**
 * Teste de Integração Automatizado: SaaS Multi-Clínicas
 * Cobre:
 * 1. Registro público de clínica com status "pending"
 * 2. Bloqueio de login antes da aprovação
 * 3. Aprovação pelo SuperAdmin e liberação de acesso
 * 4. Fluxo de Onboarding Wizard e validação de GESTOR_CLINICA
 * 5. Numeração sequencial independente de recibos por clínica (REC-000001 em ambas)
 * 6. Gestão de equipe: convite e aprovação de funcionários
 * 7. Proteção Anti-IDOR (retorno 403 entre clínicas distintas)
 * 8. LGPD: Bloqueio estrito de acesso a prontuários para SuperAdmin
 */

const BASE_URL = 'http://localhost:4000/api';

async function req(endpoint, method = 'GET', body = null, token = null, tenantId = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['x-tenant-id'] = tenantId;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data };
}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testsFailed++;
  }
}

async function runSuite() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO BATERIA DE TESTES DE INTEGRAÇÃO SAAS MULTI-CLÍNICAS');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // TESTE 1: Registro Público de Nova Clínica (Pendente de Aprovação)
  // -------------------------------------------------------------
  console.log('📌 ETAPA 1: Registro Público de Nova Clínica');
  const uniqueSuffix = Date.now().toString().slice(-5);
  const newClinicSlug = `clinica-teste-${uniqueSuffix}`;
  const managerEmail = `gestor.${uniqueSuffix}@testedominio.com`;

  const regResponse = await req('/v1/public/tenants/register', 'POST', {
    clinicName: `Clínica Teste Avançada ${uniqueSuffix}`,
    corporateName: `Clínica Teste Avançada LTDA ${uniqueSuffix}`,
    tradeName: `Clínica Teste ${uniqueSuffix}`,
    cnpjCpf: '12.345.678/0001-99',
    responsibleName: `Dr. Carlos Gestor ${uniqueSuffix}`,
    email: managerEmail,
    phone: '(11) 98888-7777',
    password: 'SenhaForte@2026',
    city: 'São Paulo',
    state: 'SP',
    termsAccepted: true,
    privacyAccepted: true
  });

  assert(regResponse.status === 201, `Registro público retornou status 201 Created (Recebido: ${regResponse.status})`);
  assert(regResponse.data.status === 'pending', `Clínica criada com status "pending" (Recebido: ${regResponse.data?.status})`);
  const registeredTenantId = regResponse.data.clinicId;

  // -------------------------------------------------------------
  // TESTE 2: Tentativa de Login antes da Aprovação (Deve Ser Bloqueado)
  // -------------------------------------------------------------
  console.log('\n📌 ETAPA 2: Tentativa de Login com Clínica Pendente');
  const loginPending = await req('/v1/auth/login', 'POST', {
    email: managerEmail,
    password: 'SenhaForte@2026'
  });

  assert(loginPending.status === 403, `Login com clínica pendente retorna 403 Forbidden (Recebido: ${loginPending.status})`);
  assert(loginPending.data.code === 'USER_PENDING' || loginPending.data.code === 'CLINIC_PENDING', `Código de erro indica pendência de aprovação (Recebido: ${loginPending.data?.code})`);

  // -------------------------------------------------------------
  // TESTE 3: SuperAdmin Aprova a Nova Clínica
  // -------------------------------------------------------------
  console.log('\n📌 ETAPA 3: Moderação do SaaS - SuperAdmin Aprova Cadastro');
  const adminLogin = await req('/v1/auth/login', 'POST', {
    email: 'admin@saas.com',
    password: '123456'
  });

  assert(adminLogin.status === 200, 'Login de SuperAdmin realizado com sucesso');
  const superToken = adminLogin.data.token;

  const metricsRes = await req('/v1/admin/metrics', 'GET', null, superToken);
  assert(metricsRes.status === 200 && metricsRes.data.pendingClinics >= 1, `Métricas do SaaS exibem clínicas pendentes (Total: ${metricsRes.data?.pendingClinics})`);

  const approveRes = await req(`/v1/admin/tenants/${registeredTenantId}/approve`, 'PUT', {}, superToken);
  assert(approveRes.status === 200, `Aprovação da clínica retornou status 200 (Recebido: ${approveRes.status})`);
  assert(approveRes.data.status === 'active', `Status da clínica alterado para "active"`);

  // -------------------------------------------------------------
  // TESTE 4: Login do Gestor Aprovado e Flag de Onboarding
  // -------------------------------------------------------------
  console.log('\n📌 ETAPA 4: Login do Gestor Aprovado & Onboarding Obrigatório');
  const managerLogin = await req('/v1/auth/login', 'POST', {
    email: managerEmail,
    password: 'SenhaForte@2026'
  });

  assert(managerLogin.status === 200, 'Login do Gestor autorizado após aprovação');
  assert(managerLogin.data.user.needsOnboarding === true, 'Flag needsOnboarding é TRUE no primeiro acesso do Gestor');
  const managerToken = managerLogin.data.token;

  // -------------------------------------------------------------
  // TESTE 5: Fluxo do Onboarding Wizard (Validação Backend GESTOR_CLINICA)
  // -------------------------------------------------------------
  console.log('\n📌 ETAPA 5: Execução do Onboarding Wizard & Confirmação do Gestor');
  
  // Etapa 1: Confirmar gestor no backend
  const confirmRes = await req('/v1/onboarding/confirm-manager', 'POST', { isManager: true }, managerToken, registeredTenantId);
  assert(confirmRes.status === 200 && confirmRes.data.success, 'Etapa 1: Papel de GESTOR_CLINICA validado e confirmado no backend');

  // Etapa 2: Dados da clínica
  const step2Res = await req('/v1/onboarding/step', 'POST', {
    step: 2,
    data: {
      corporateName: `Clínica Teste Avançada LTDA ${uniqueSuffix}`,
      tradeName: `Clínica Teste ${uniqueSuffix}`,
      cnpjCpf: '12.345.678/0001-99',
      phone: '(11) 3333-4444'
    }
  }, managerToken, registeredTenantId);
  assert(step2Res.status === 200, 'Etapa 2: Dados cadastrais da clínica salvos com sucesso');

  // Etapa 3: Endereço
  const step3Res = await req('/v1/onboarding/step', 'POST', {
    step: 3,
    data: {
      zipCode: '01310-100',
      street: 'Avenida Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP'
    }
  }, managerToken, registeredTenantId);
  assert(step3Res.status === 200, 'Etapa 3: Endereço com CEP validado e salvo');

  // Etapa 5: Conclusão do Onboarding e Configuração de Recibos
  const completeRes = await req('/v1/onboarding/complete', 'POST', {
    receiptSettings: {
      emitterType: 'pj',
      emitterName: `Clínica Teste Avançada LTDA ${uniqueSuffix}`,
      emitterDocument: '12.345.678/0001-99',
      emitterRegistry: 'CRM-SP 999999',
      emitterPhone: '(11) 3333-4444',
      emitterEmail: managerEmail,
      emitterAddress: 'Avenida Paulista, 1000, São Paulo - SP',
      receiptPrefix: 'REC-',
      nextSequence: 1
    }
  }, managerToken, registeredTenantId);
  assert(completeRes.status === 200 && completeRes.data.success, 'Onboarding concluído com sucesso!');

  // Verifica que auth/me agora retorna needsOnboarding = false
  const meRes = await req('/v1/auth/me', 'GET', null, managerToken, registeredTenantId);
  assert(meRes.data.user.needsOnboarding === false, 'Após conclusão do Onboarding, needsOnboarding é FALSE');

  // -------------------------------------------------------------
  // TESTE 6: Numeração Sequencial Independente de Recibos por Clínica
  // -------------------------------------------------------------
  console.log('\n📌 ETAPA 6: Emissão de Recibos Oficiais e Numeração Sequencial Independente');
  
  // Login na Clínica A ("Espaço Viver Bem")
  const clinicALogin = await req('/v1/auth/login', 'POST', {
    email: 'diretoria@viverbem.com',
    password: '123456'
  });
  const clinicAToken = clinicALogin.data.token;
  const clinicATenantId = clinicALogin.data.user.tenantId;

  // Clínica A emite um recibo
  const receiptA1 = await req('/v1/receipts', 'POST', {
    payerType: 'pf',
    payerName: 'Mariana Silva',
    payerDocument: '123.456.789-00',
    serviceDescription: 'Consulta Psicológica de Avaliação',
    serviceDate: '2026-09-10',
    grossAmount: 250.00,
    finalAmount: 250.00,
    paymentMethod: 'pix'
  }, clinicAToken, clinicATenantId);

  assert(receiptA1.status === 201, `Clínica A emitiu recibo com sucesso (Status: ${receiptA1.status})`);
  const numberA1 = receiptA1.data.receiptNumber;
  console.log(`     -> Número do Recibo na Clínica A: ${numberA1}`);

  // Clínica B (a recém-criada) emite seu primeiro recibo
  const receiptB1 = await req('/v1/receipts', 'POST', {
    payerType: 'pf',
    payerName: 'Roberto Oliveira',
    payerDocument: '987.654.321-99',
    serviceDescription: 'Sessão de Fonoaudiologia',
    serviceDate: '2026-09-10',
    grossAmount: 300.00,
    finalAmount: 300.00,
    paymentMethod: 'credit_card'
  }, managerToken, registeredTenantId);

  assert(receiptB1.status === 201, `Clínica B emitiu recibo com sucesso (Status: ${receiptB1.status})`);
  const numberB1 = receiptB1.data.receiptNumber;
  console.log(`     -> Número do Recibo na Clínica B: ${numberB1}`);

  assert(numberB1 === 'REC-000001', `Clínica B iniciou sua própria sequência independente em REC-000001 (Recebido: ${numberB1})`);

  // Clínica B emite seu segundo recibo
  const receiptB2 = await req('/v1/receipts', 'POST', {
    payerType: 'pj',
    payerName: 'Empresa Alpha Ltda',
    payerDocument: '00.111.222/0001-33',
    serviceDescription: 'Laudo Pericial Corporativo',
    serviceDate: '2026-09-10',
    grossAmount: 1200.00,
    finalAmount: 1200.00,
    paymentMethod: 'bank_transfer'
  }, managerToken, registeredTenantId);

  assert(receiptB2.data.receiptNumber === 'REC-000002', `Clínica B incrementou para REC-000002 (Recebido: ${receiptB2.data?.receiptNumber})`);

  // -------------------------------------------------------------
  // TESTE 7: Gestão de Equipe (Convite e Aprovação de Funcionários)
  // -------------------------------------------------------------
  console.log('\n📌 ETAPA 7: Gestão de Equipe e Convites de Funcionários');
  const employeeEmail = `recepcao.${uniqueSuffix}@testedominio.com`;

  const inviteRes = await req('/v1/staff/invite', 'POST', {
    name: 'Paula Recepcionista',
    email: employeeEmail,
    role: 'receptionist',
    phone: '(11) 97777-6666',
    permissions: ['view_schedule', 'create_appointment', 'create_patient']
  }, managerToken, registeredTenantId);

  assert(inviteRes.status === 201 && inviteRes.data.userId, `Funcionário criado com sucesso na equipe (Status: ${inviteRes.status})`);
  const newStaffUserId = inviteRes.data.userId;

  // Atualiza permissões do funcionário
  const permRes = await req(`/v1/staff/${newStaffUserId}/permissions`, 'PUT', {
    permissions: ['view_schedule', 'create_appointment', 'issue_receipt']
  }, managerToken, registeredTenantId);
  assert(permRes.status === 200, 'Permissões do funcionário atualizadas pelo Gestor');

  // Alterna status para inativo e ativo
  const toggleRes = await req(`/v1/staff/${newStaffUserId}/toggle-status`, 'PUT', {}, managerToken, registeredTenantId);
  assert(toggleRes.status === 200 && (toggleRes.data.status === 'blocked' || toggleRes.data.status === 'inactive'), 'Status do funcionário alternado para bloqueado/inativo');
  await req(`/v1/staff/${newStaffUserId}/toggle-status`, 'PUT', {}, managerToken, registeredTenantId);

  const staffList = await req('/v1/staff', 'GET', null, managerToken, registeredTenantId);
  const foundStaff = staffList.data.staff.find(s => s.email === employeeEmail);
  assert(foundStaff && foundStaff.status === 'active', 'Funcionário ativo listado na equipe da clínica');

  // -------------------------------------------------------------
  // TESTE 8: Proteção Anti-IDOR (Isolamento Estrito entre Clínicas)
  // -------------------------------------------------------------
  console.log('\n📌 ETAPA 8: Segurança Anti-IDOR (Tentativa de Cross-Tenant Access)');
  
  // Clínica A cria um paciente
  const createPatRes = await req('/v1/patients', 'POST', {
    fullName: `Paciente Confidencial Clínica A ${uniqueSuffix}`,
    phone: '(11) 99999-0000',
    email: `paciente.${uniqueSuffix}@segredo.com`
  }, clinicAToken, clinicATenantId);

  const patientAId = createPatRes.data.id;
  assert(createPatRes.status === 201 && patientAId, 'Paciente criado na Clínica A');

  // Gestor da Clínica B tenta acessar o paciente da Clínica A usando o ID direto
  const idorAttempt = await req(`/v1/patients/${patientAId}`, 'GET', null, managerToken, registeredTenantId);

  assert(idorAttempt.status === 403, `Tentativa de IDOR barrada com 403 Forbidden (Recebido: ${idorAttempt.status})`);
  assert(idorAttempt.data.code === 'FORBIDDEN_IDOR', `Código retornado é FORBIDDEN_IDOR (Recebido: ${idorAttempt.data?.code})`);

  // -------------------------------------------------------------
  // TESTE 9: LGPD - Restrição de Acesso a Prontuários para SuperAdmin
  // -------------------------------------------------------------
  console.log('\n📌 ETAPA 9: Conformidade LGPD - Bloqueio de Prontuário para SuperAdmin');
  
  // SuperAdmin tenta acessar registros clínicos confidenciais de um paciente
  const lgpdAttempt = await req(`/v1/clinical-records/patient/${patientAId}`, 'GET', null, superToken, clinicATenantId);

  assert(lgpdAttempt.status === 403, `Acesso de SuperAdmin a prontuário barrado com 403 Forbidden (Recebido: ${lgpdAttempt.status})`);
  assert(lgpdAttempt.data?.error?.includes('LGPD'), `Mensagem de erro explicita restrição LGPD (Recebido: "${lgpdAttempt.data?.error}")`);

  // -------------------------------------------------------------
  // RELATÓRIO FINAL
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`📊 RESULTADO DOS TESTES: ${testsPassed} PASSOU | ${testsFailed} FALHOU`);
  console.log('===============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 TODOS OS REQUISITOS MULTI-TENANT E SEGURANÇA FORAM VALIDADOS COM SUCESSO!\n');
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Erro fatal executando bateria de testes:', err);
  process.exit(1);
});
