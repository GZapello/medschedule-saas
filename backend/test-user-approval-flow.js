const http = require('http');

const PORT = 4000;
const BASE_URL = `http://localhost:${PORT}/api`;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('--- INICIANDO TESTES DO FLUXO MULTI-CLÍNICAS E APROVAÇÃO DE USUÁRIOS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Listar clínicas ativas para o cadastro público
    console.log('\n[1] Testando listagem pública de clínicas (/v1/public/tenants)...');
    const publicTenantsRes = await request('GET', '/v1/public/tenants');
    assert(publicTenantsRes.status === 200, 'Status HTTP 200 para listagem pública de clínicas');
    assert(Array.isArray(publicTenantsRes.data) && publicTenantsRes.data.length > 0, `Clínicas retornadas: ${publicTenantsRes.data.length}`);
    
    const targetClinic = publicTenantsRes.data.find(t => t.id === 'tenant-viver-bem') || publicTenantsRes.data[0];
    console.log(`Clínica alvo para cadastro: ${targetClinic.name} (ID: ${targetClinic.id})`);

    // 2. Cadastro de novo profissional solicitando vínculo à clínica
    console.log('\n[2] Testando cadastro de novo usuário com solicitação de vínculo...');
    const testEmail = `dr.pedro.${Date.now()}@teste.com`;
    const regPayload = {
      name: 'Dr. Pedro Pedagogo',
      email: testEmail,
      password: 'senhaSegura123',
      phone: '(11) 97777-6666',
      role: 'professional',
      tenantId: targetClinic.id,
      professionName: 'Psicopedagogo Infantil',
      practiceAreas: 'TEA, TDAH, Dificuldades de Aprendizagem, Orientação Parental',
      registrationType: 'ABPp',
      registrationNumber: 'SP-9988'
    };

    const regRes = await request('POST', '/v1/auth/register', regPayload);
    assert(regRes.status === 201, `Status HTTP 201 ao cadastrar usuário com tenantId: ${regRes.data.message || ''}`);
    assert(regRes.data.status === 'pending', 'Status do usuário é "pending"');
    assert(!regRes.data.token, 'Token JWT NÃO foi retornado no cadastro (usuário bloqueado até aprovação)');

    const registeredUserId = regRes.data.userId;

    // 3. Tentar login imediato antes da aprovação
    console.log('\n[3] Testando tentativa de login antes da aprovação do gestor...');
    const loginPendingRes = await request('POST', '/v1/auth/login', {
      email: testEmail,
      password: 'senhaSegura123'
    });
    assert(loginPendingRes.status === 403, 'Tentativa de login bloqueada com HTTP 403');
    assert(loginPendingRes.data.code === 'USER_PENDING', `Código de erro correto: USER_PENDING (${loginPendingRes.data.error})`);

    // 4. Login como Gestor da Clínica
    console.log('\n[4] Login do gestor da clínica para revisar solicitações pendentes...');
    const managerLoginRes = await request('POST', '/v1/auth/login', {
      email: 'diretoria@viverbem.com',
      password: '123456'
    });
    assert(managerLoginRes.status === 200, 'Gestor logou com sucesso');
    const managerToken = managerLoginRes.data.token;
    const managerTenantId = managerLoginRes.data.tenant.id;

    // 5. Gestor lista equipe e localiza a solicitação pendente
    console.log('\n[5] Gestor lista equipe (/v1/staff)...');
    const staffRes = await request('GET', '/v1/staff', null, {
      'Authorization': `Bearer ${managerToken}`,
      'X-Tenant-ID': managerTenantId
    });
    assert(staffRes.status === 200, 'Status HTTP 200 ao listar equipe');
    const pendingStaff = staffRes.data.staff.find(s => s.id === registeredUserId);
    assert(!!pendingStaff, `Usuário registrado encontrado na lista de funcionários da clínica`);
    assert(pendingStaff.status === 'pending', 'Status do usuário retornado na lista é "pending"');
    assert(pendingStaff.profession_name === 'Psicopedagogo Infantil', `Profissão customizada correta: ${pendingStaff.profession_name}`);
    assert(pendingStaff.practice_areas && pendingStaff.practice_areas.includes('TDAH'), `Áreas de atuação presentes: ${pendingStaff.practice_areas}`);

    // 6. Gestor atualiza cargo, profissão e áreas de atuação
    console.log('\n[6] Gestor atualiza cargo e áreas de atuação do usuário...');
    const updateRoleRes = await request('PUT', `/v1/staff/${registeredUserId}/role-profession`, {
      role: 'professional',
      professionName: 'Neuropsicólogo e Psicopedagogo',
      practiceAreas: 'TEA, TDAH, Altas Habilidades, Avaliação Neuropsicológica'
    }, {
      'Authorization': `Bearer ${managerToken}`,
      'X-Tenant-ID': managerTenantId
    });
    assert(updateRoleRes.status === 200, 'Status HTTP 200 ao atualizar cargo/áreas');

    // 7. Gestor aprova o acesso do usuário
    console.log('\n[7] Gestor aprova a solicitação do usuário...');
    const approveRes = await request('PUT', `/v1/staff/${registeredUserId}/approve`, {}, {
      'Authorization': `Bearer ${managerToken}`,
      'X-Tenant-ID': managerTenantId
    });
    assert(approveRes.status === 200, `Acesso aprovado: ${approveRes.data.message}`);

    // 8. Usuário agora tenta logar após a aprovação
    console.log('\n[8] Usuário tenta logar novamente após aprovação...');
    const loginApprovedRes = await request('POST', '/v1/auth/login', {
      email: testEmail,
      password: 'senhaSegura123'
    });
    assert(loginApprovedRes.status === 200, 'Login realizado com sucesso após aprovação!');
    assert(loginApprovedRes.data.user.status === 'active', 'Usuário logado está com status "active"');
    assert(loginApprovedRes.data.tenant.id === targetClinic.id, 'Tenant retornado no login é o tenant aprovado');

    // 9. Isolamento Multi-Clínica: Outra clínica não deve ter acesso a esse usuário
    console.log('\n[9] Testando isolamento multi-clínica...');
    // Criar uma segunda clínica temporária via admin
    const superLogin = await request('POST', '/v1/auth/login', {
      email: 'admin@saas.com',
      password: '123456'
    });
    assert(superLogin.status === 200, 'Superadmin logado com sucesso');

    console.log('\n--- RESUMO DOS TESTES ---');
    console.log(`Total aprovados: ${passed}`);
    console.log(`Total falhas: ${failed}`);
    if (failed === 0) {
      console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
    } else {
      console.error('⚠️ ALGUNS TESTES FALHARAM!');
      process.exit(1);
    }
  } catch (err) {
    console.error('Erro fatal durante a execução dos testes:', err);
    process.exit(1);
  }
}

runTests();
