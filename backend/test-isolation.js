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

async function runIsolationTests() {
  console.log('--- TESTANDO ISOLAMENTO MULTI-CLÍNICA E PERMISSÕES ---');
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
    // 1. Login como gestor da clínica 1 (Viver Bem)
    const loginClinic1 = await request('POST', '/v1/auth/login', {
      email: 'diretoria@viverbem.com',
      password: '123456'
    });
    assert(loginClinic1.status === 200, 'Gestor da Clínica 1 logado com sucesso');
    const token1 = loginClinic1.data.token;
    const tenant1Id = loginClinic1.data.tenant.id;

    // 2. Criar uma nova clínica via cadastro público
    const uniqueEmail = `aurora.${Date.now()}@clinica.com`;
    const newClinicRes = await request('POST', '/v1/public/tenants/register', {
      clinicName: `Clínica Aurora ${Date.now()}`,
      responsibleName: 'Dra. Aurora Silva',
      email: uniqueEmail,
      password: 'senhaSegura123',
      phone: '(11) 98888-7777',
      city: 'São Paulo',
      state: 'SP',
      termsAccepted: true,
      privacyAccepted: true
    });
    assert(newClinicRes.status === 201, 'Segunda clínica criada com sucesso');
    const tenant2Id = newClinicRes.data.clinicId;

    // 3. Aprovação da segunda clínica pelo Superadmin do SaaS
    const superLogin = await request('POST', '/v1/auth/login', {
      email: 'admin@saas.com',
      password: '123456'
    });
    assert(superLogin.status === 200, 'Superadmin autenticado com sucesso');
    const superToken = superLogin.data.token;

    const approveClinic = await request('PUT', `/v1/admin/tenants/${tenant2Id}/approve`, {}, {
      'Authorization': `Bearer ${superToken}`
    });
    assert(approveClinic.status === 200, 'SuperAdmin aprovou a Clínica 2');

    // 4. Login da gestora da Clínica 2 após aprovação
    const loginClinic2 = await request('POST', '/v1/auth/login', {
      email: uniqueEmail,
      password: 'senhaSegura123'
    });
    assert(loginClinic2.status === 200, 'Gestora da Clínica 2 autenticada com sucesso');
    const token2 = loginClinic2.data.token;

    // 5. Teste de isolamento de equipe:
    // Gestor da Clínica 1 busca equipe
    const staffClinic1 = await request('GET', '/v1/staff', null, {
      'Authorization': `Bearer ${token1}`,
      'X-Tenant-ID': tenant1Id
    });
    // Gestora da Clínica 2 busca equipe
    const staffClinic2 = await request('GET', '/v1/staff', null, {
      'Authorization': `Bearer ${token2}`,
      'X-Tenant-ID': tenant2Id
    });

    const clinic1UserIds = new Set(staffClinic1.data.staff.map(s => s.id));
    const clinic2UserIds = new Set(staffClinic2.data.staff.map(s => s.id));

    // Nenhum usuário da clínica 2 deve estar na lista da clínica 1 e vice-versa
    let overlap = false;
    for (const id of clinic1UserIds) {
      if (clinic2UserIds.has(id)) overlap = true;
    }
    assert(!overlap, 'Isolamento de equipe estrito: Usuários da Clínica 2 isolados da Clínica 1');

    // 6. Tentativa de violação: Gestora da Clínica 2 tenta acessar dados da Clínica 1
    const crossAccessRes = await request('GET', '/v1/staff', null, {
      'Authorization': `Bearer ${token2}`,
      'X-Tenant-ID': tenant1Id // Tentando forçar o tenant da clínica 1
    });
    assert(crossAccessRes.status === 403, 'Tentativa de cross-tenant bloqueada pelo middleware com HTTP 403');

    // 7. Tentativa de violação: Gestora da Clínica 2 tenta aprovar usuário de outra clínica
    const targetStaffId = staffClinic1.data.staff[0].id;
    const crossApproveRes = await request('PUT', `/v1/staff/${targetStaffId}/approve`, {}, {
      'Authorization': `Bearer ${token2}`,
      'X-Tenant-ID': tenant2Id
    });
    assert(crossApproveRes.status === 403 || crossApproveRes.status === 404, 'Tentativa de manipular usuário de outra clínica rejeitada com 403/404');

    console.log(`\n--- RESUMO DE ISOLAMENTO MULTI-CLÍNICA ---`);
    console.log(`Total aprovados: ${passed}`);
    console.log(`Total falhas: ${failed}`);
    if (failed === 0) {
      console.log('🎉 ISOLAMENTO MULTI-CLÍNICA VERIFICADO COM SUCESSO!');
    } else {
      console.error('⚠️ ALGUNS TESTES FALHARAM!');
      process.exit(1);
    }
  } catch (err) {
    console.error('Erro nos testes de isolamento:', err);
    process.exit(1);
  }
}

runIsolationTests();
