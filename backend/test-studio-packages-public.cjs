const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_packages_public.db');
process.env.JWT_SECRET = 'test-studio-pkg-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-pkg-files-secret-123456';
process.env.PORT = '3101';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failed++;
  }
}

function makeReq(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3101,
        path: urlPath,
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
      },
      res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

function getNextWeekdayIso(targetWeekday, offsetWeeks = 1) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const diff = (targetWeekday - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + diff + (offsetWeeks - 1) * 7);
  return base.toISOString().slice(0, 10);
}

function addDaysIso(dateIso, days) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function runTests() {
  const server = app.listen(3101);
  console.log('\n==============================================================');
  console.log('SUÍTE DE TESTES: PACOTES MULTISSERVIÇOS, WHATSAPP E STUDIO PÚBLICO');
  console.log('==============================================================\n');

  try {
    const studioTenant = 'ten-studio-' + uuidv4().slice(0, 8);
    const mixedTenant = 'ten-mixed-' + uuidv4().slice(0, 8);
    const clinicTenant = 'ten-clinic-' + uuidv4().slice(0, 8);

    const insTenant = db.prepare(`
      INSERT INTO tenants (id, name, trade_name, slug, email, status, billing_required, public_booking_enabled, establishment_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioTenant, 'Studio Movimento Viva', 'Studio Movimento Viva', 'movimento-viva', 'studio@zemda.test', 'studio');
    insTenant.run(mixedTenant, 'Espaço Integrado Misto', 'Espaço Misto', 'espaco-misto', 'misto@zemda.test', 'mixed');
    insTenant.run(clinicTenant, 'Clínica Tradicional Saúde', 'Clínica Saúde', 'clinica-saude', 'clinica@zemda.test', 'clinic');

    // Users & tokens
    const adminStudioUser = 'usr-adm-st';
    const recepStudioUser = 'usr-rec-st';
    const adminClinicUser = 'usr-adm-cl';
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestora Studio', 'adm@studio.test', 'hash', 'clinic_admin', 'active')`).run(adminStudioUser, studioTenant);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Recepção Studio', 'rec@studio.test', 'hash', 'receptionist', 'active')`).run(recepStudioUser, studioTenant);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestor Clínica', 'adm@clinica.test', 'hash', 'clinic_admin', 'active')`).run(adminClinicUser, clinicTenant);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["view_financial","manage_financial","manage_services","view_all_schedules"]')`).run('cu-' + uuidv4().slice(0, 8), studioTenant, adminStudioUser);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'receptionist', 'active', 0, '["view_financial","manage_financial","view_all_schedules"]')`).run('cu-' + uuidv4().slice(0, 8), studioTenant, recepStudioUser);
    db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["view_financial","manage_financial","manage_services","view_all_schedules"]')`).run('cu-' + uuidv4().slice(0, 8), clinicTenant, adminClinicUser);

    const tokAdminStudio = generateToken({ userId: adminStudioUser, tenantId: studioTenant, email: 'adm@studio.test', role: 'clinic_admin', name: 'Gestora Studio' });
    const tokAdminClinic = generateToken({ userId: adminClinicUser, tenantId: clinicTenant, email: 'adm@clinica.test', role: 'clinic_admin', name: 'Gestor Clínica' });

    const authStudio = { Authorization: `Bearer ${tokAdminStudio}`, 'x-tenant-id': studioTenant };
    const authClinic = { Authorization: `Bearer ${tokAdminClinic}`, 'x-tenant-id': clinicTenant };

    // Professionals + Schedules (Segunda a Sábado 08:00-20:00)
    const profPilates = 'prof-pil-' + uuidv4().slice(0, 6);
    const profDanca = 'prof-dan-' + uuidv4().slice(0, 6);
    const profClinica = 'prof-cli-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, 'Instrutora Carla (Pilates)', 'carla-pilates', 'prof-instrutor', 'Instrutor', 1, 1)`).run(profPilates, studioTenant);
    db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, 'Instrutor Marcos (Dança)', 'marcos-danca', 'prof-instrutor', 'Instrutor', 1, 1)`).run(profDanca, studioTenant);
    db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, 'Dra. Helena (Clínica)', 'helena-med', 'prof-medico', 'Médico', 1, 1)`).run(profClinica, clinicTenant);

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '08:00', '20:00', 1)`);
    for (let dow = 1; dow <= 6; dow++) {
      insSched.run(uuidv4(), studioTenant, profPilates, dow);
      insSched.run(uuidv4(), studioTenant, profDanca, dow);
      insSched.run(uuidv4(), clinicTenant, profClinica, dow);
    }

    // Services
    const srvPilates = 'srv-pil-' + uuidv4().slice(0, 6);
    const srvDanca = 'srv-dan-' + uuidv4().slice(0, 6);
    const srvZumba = 'srv-zum-' + uuidv4().slice(0, 6);
    const srvClinica = 'srv-cli-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Pilates Aparelhos', 50, 10, 80, 'presential', 'individual', 1, 1, 1)`).run(srvPilates, studioTenant, profPilates);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Dança Contemporânea', 50, 10, 65, 'presential', 'group', 6, 1, 1)`).run(srvDanca, studioTenant, profDanca);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Zumba Fitness', 50, 10, 50, 'presential', 'group', 10, 1, 1)`).run(srvZumba, studioTenant, profDanca);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality, service_kind, default_capacity, allow_recurrence, active) VALUES (?, ?, ?, 'Consulta Clínica', 50, 0, 250, 'presential', 'individual', 1, 0, 1)`).run(srvClinica, clinicTenant, profClinica);

    // Students in Studio
    const alunoAna = 'pat-ana-' + uuidv4().slice(0, 6);
    const alunoSemFone = 'pat-semfone-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, whatsapp, active) VALUES (?, ?, 'Ana Clara Ribeiro', '11988887777', '11988887777', 1)`).run(alunoAna, studioTenant);
    db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, whatsapp, active) VALUES (?, ?, 'Bruno Sem Contato', '000', NULL, 1)`).run(alunoSemFone, studioTenant);

    const monday1 = getNextWeekdayIso(1, 1);
    const monday2 = getNextWeekdayIso(1, 2);
    const monday3 = getNextWeekdayIso(1, 3);
    const tuesday1 = getNextWeekdayIso(2, 1);
    const wednesday1 = getNextWeekdayIso(3, 1);
    const thursday1 = getNextWeekdayIso(4, 1);
    const friday1 = getNextWeekdayIso(5, 1);

    // -----------------------------------------------------------------
    // TESTE A & B: Pacote Multisserviços + Zero Cobrança Individual + Múltiplos Instrutores
    // -----------------------------------------------------------------
    console.log('--- TESTE A & B: Pacote Multisserviços & Zero Cobrança Individual ---');
    const createClinicPkgRes = await makeReq('POST', '/api/v1/packages', authClinic, {
      name: 'Pacote Bloqueado Clínica',
      price: 100,
      items: [{ serviceId: srvClinica, includedCredits: 4 }]
    });
    assert(createClinicPkgRes.status === 403, 'Clínica tradicional bloqueada ao tentar criar pacote de Studio (403)');

    const pkgMultiRes = await makeReq('POST', '/api/v1/packages', authStudio, {
      name: 'Movimento Completo (Pilates + Dança + Zumba)',
      description: '2 Pilates, 2 Dança e 2 Zumba no mês',
      billingType: 'recurring_monthly',
      price: 220,
      creditMode: 'per_service',
      validityDays: 30,
      dueDay: 10,
      absentConsumptionPolicy: 'consume',
      cancellationHoursLimit: 12,
      allowPublicBooking: true,
      items: [
        { serviceId: srvPilates, includedCredits: 2, weeklyFrequency: 1 },
        { serviceId: srvDanca, includedCredits: 2, weeklyFrequency: 1 },
        { serviceId: srvZumba, includedCredits: 2, weeklyFrequency: 1 }
      ]
    });
    assert(pkgMultiRes.status === 201 && pkgMultiRes.data?.package?.id, 'Pacote multissserviços criado com serviços de instrutores distintos');
    const pkgMultiId = pkgMultiRes.data.package.id;
    assert(pkgMultiRes.data.package.total_credits === 6, 'Total de créditos somado corretamente (2+2+2 = 6)');

    // Contratar pacote para Ana
    const contractRes = await makeReq('POST', '/api/v1/package-contracts', authStudio, {
      packageId: pkgMultiId,
      studentId: alunoAna,
      startDate: monday1,
      paymentStatus: 'paid',
      contractStatus: 'active'
    });
    assert(contractRes.status === 201 && contractRes.data?.contract?.id, 'Contrato do pacote multissserviços criado');
    const contractAnaId = contractRes.data.contract.id;
    const payCountForContract = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE package_contract_id = ?`).get(contractAnaId).c;
    assert(payCountForContract === 1, 'Criada exatamente 1 cobrança mensal pelo pacote (não 3 cobranças separadas)');

    // Agendar 1 Pilates (Prof Carla) e 1 Dança (Prof Marcos) cobertos pelo pacote
    const apptPil1 = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: alunoAna,
      professionalId: profPilates,
      serviceId: srvPilates,
      packageContractId: contractAnaId,
      startTime: `${monday1}T09:00:00`,
      endTime: `${monday1}T09:50:00`,
      modality: 'presential'
    });
    if (apptPil1.status !== 201) console.log('  [DEBUG apptPil1]', apptPil1.status, apptPil1.data);
    assert(apptPil1.status === 201, 'Aula 1 de Pilates (Prof. Carla) agendada via pacote');

    const apptDan1 = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: alunoAna,
      professionalId: profDanca,
      serviceId: srvDanca,
      packageContractId: contractAnaId,
      startTime: `${tuesday1}T10:00:00`,
      endTime: `${tuesday1}T10:50:00`,
      modality: 'presential'
    });
    if (apptDan1.status !== 201) console.log('  [DEBUG apptDan1]', apptDan1.status, apptDan1.data);
    assert(apptDan1.status === 201, 'Aula 1 de Dança (Prof. Marcos) agendada no mesmo pacote');

    // Verificar ZERO cobrança individual por sessão coberta
    const sessionPays = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE appointment_id IN (?, ?)`).get(apptPil1.data.id, apptDan1.data.id).c;
    assert(sessionPays === 0, 'Zero cobranças individuais geradas na tabela payments para sessões cobertas pelo pacote');

    // Agendar 2ª Pilates na semana 2 e tentar 3ª Pilates na semana 3 (excedendo limite 2 de Pilates)
    const apptPil2 = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: alunoAna,
      professionalId: profPilates,
      serviceId: srvPilates,
      packageContractId: contractAnaId,
      startTime: `${monday2}T09:00:00`,
      endTime: `${monday2}T09:50:00`,
      modality: 'presential'
    });
    assert(apptPil2.status === 201, 'Aula 2 de Pilates agendada dentro do limite (2/2)');

    const apptPil3Fail = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: alunoAna,
      professionalId: profPilates,
      serviceId: srvPilates,
      packageContractId: contractAnaId,
      startTime: `${monday3}T09:00:00`,
      endTime: `${monday3}T09:50:00`,
      modality: 'presential'
    });
    assert(apptPil3Fail.status === 409, 'Bloqueado excesso de créditos por modalidade no pacote (3ª Pilates rejeitada HTTP 409)');

    // Verificar resumo de créditos (3 reserved, 0 used, 3 remaining)
    let contractSnap = await makeReq('GET', `/api/v1/package-contracts/${contractAnaId}`, authStudio);
    assert(
      contractSnap.data.contract.summary.creditsReserved === 3 &&
      contractSnap.data.contract.summary.creditsUsed === 0 &&
      contractSnap.data.contract.summary.creditsRemaining === 3,
      'Separação correta entre créditos reservados (3), utilizados (0) e restantes (3)'
    );

    // -----------------------------------------------------------------
    // TESTE C: Cancelamento Restitui Crédito Reservado
    // -----------------------------------------------------------------
    console.log('\n--- TESTE C: Cancelamento Restitui Direito Reservado ---');
    const cancelPil2 = await makeReq('PUT', `/api/v1/appointments/${apptPil2.data.id}/status`, authStudio, {
      status: 'cancelled',
      reason: 'Aluna remarcou com antecedência'
    });
    assert(cancelPil2.status === 200, 'Cancelamento da aula futura de Pilates executado');
    contractSnap = await makeReq('GET', `/api/v1/package-contracts/${contractAnaId}`, authStudio);
    assert(
      contractSnap.data.contract.summary.creditsReserved === 2 &&
      contractSnap.data.contract.summary.creditsRemaining === 4,
      'Crédito reservado restituído após cancelamento (reserved=2, remaining=4)'
    );

    // -----------------------------------------------------------------
    // TESTE D: Presença vs Falta (Política consume vs refund)
    // -----------------------------------------------------------------
    console.log('\n--- TESTE D: Chamada Explícita (Present vs Absent Consume/Refund) ---');
    // Marcar presença na aula 1 de Pilates (consume)
    const occPilRow = db.prepare(`SELECT occurrence_id FROM appointments WHERE id = ?`).get(apptPil1.data.id);
    const markPresent = await makeReq(
      'PUT',
      `/api/v1/classes/occurrences/${occPilRow?.occurrence_id || 'direct'}/attendance/${apptPil1.data.id}`,
      authStudio,
      { attendanceStatus: 'present' }
    );
    assert(markPresent.status === 200, 'Chamada marcada como presente para aula de Pilates');

    // Marcar falta (absent) na aula 1 de Dança (contrato tem policy='consume')
    const occDanRow = db.prepare(`SELECT occurrence_id FROM appointments WHERE id = ?`).get(apptDan1.data.id);
    const markAbsentConsume = await makeReq(
      'PUT',
      `/api/v1/classes/occurrences/${occDanRow?.occurrence_id || 'direct'}/attendance/${apptDan1.data.id}`,
      authStudio,
      { attendanceStatus: 'absent' }
    );
    assert(markAbsentConsume.status === 200, 'Chamada marcada como falta para aula de Dança (policy=consume)');

    contractSnap = await makeReq('GET', `/api/v1/package-contracts/${contractAnaId}`, authStudio);
    assert(
      contractSnap.data.contract.summary.creditsReserved === 0 &&
      contractSnap.data.contract.summary.creditsUsed === 2 &&
      contractSnap.data.contract.summary.creditsRemaining === 4,
      'Presença + Falta (policy consume) converteram reservas em créditos utilizados (reserved=0, used=2, remaining=4)'
    );

    // Pacote Pool Livre com policy='refund'
    const pkgFreeRes = await makeReq('POST', '/api/v1/packages', authStudio, {
      name: 'Pacote Livre Flex',
      billingType: 'one_time',
      price: 300,
      creditMode: 'shared_pool',
      totalCredits: 4,
      validityDays: 45,
      installmentsCount: 2,
      absentConsumptionPolicy: 'refund',
      items: [{ serviceId: srvPilates }, { serviceId: srvZumba }]
    });
    assert(pkgFreeRes.status === 201, 'Pacote livre (shared_pool, 2x, falta=refund) criado');
    const cFreeRes = await makeReq('POST', '/api/v1/package-contracts', authStudio, {
      packageId: pkgFreeRes.data.package.id,
      studentId: alunoSemFone,
      startDate: monday1,
      paymentStatus: 'pending',
      contractStatus: 'requested'
    });
    assert(cFreeRes.status === 201 && cFreeRes.data.contract.payments.length === 2, 'Pacote pagamento único 2x gerou exatamente 2 parcelas do pacote');

    // Quitar primeira parcela na Central de Cobranças -> ativa contrato! (TESTE E)
    console.log('\n--- TESTE E: Quitação Ativa Contrato Pendente ---');
    const firstPayId = cFreeRes.data.contract.payments[0].id;
    const markPaidRes = await makeReq('POST', `/api/v1/financial/collections/${firstPayId}/mark-paid`, authStudio, { paymentMethod: 'pix' });
    assert(markPaidRes.status === 200, 'Parcela quitada na Central de Cobranças');
    const cFreeAfterPay = await makeReq('GET', `/api/v1/package-contracts/${cFreeRes.data.contract.id}`, authStudio);
    assert(
      cFreeAfterPay.data.contract.contract_status === 'active' &&
      cFreeAfterPay.data.contract.payment_status === 'partial',
      'Contrato solicitado ativado automaticamente ao quitar 1ª parcela (status=active, payment=partial)'
    );

    // Reservar Zumba no pool livre + marcar absent (policy=refund) -> restitui crédito!
    const apptZumbaFree = await makeReq('POST', '/api/v1/appointments', authStudio, {
      patientId: alunoSemFone,
      professionalId: profDanca,
      serviceId: srvZumba,
      packageContractId: cFreeRes.data.contract.id,
      startTime: `${friday1}T15:00:00`,
      endTime: `${friday1}T15:50:00`,
      modality: 'presential'
    });
    if (apptZumbaFree.status !== 201) console.log('  [DEBUG apptZumbaFree]', apptZumbaFree.status, apptZumbaFree.data);
    assert(apptZumbaFree.status === 201, 'Aula de Zumba agendada consumindo pool compartilhado');
    if (apptZumbaFree.data?.id) {
      const zOcc = db.prepare(`SELECT occurrence_id FROM appointments WHERE id = ?`).get(apptZumbaFree.data.id);
      await makeReq('PUT', `/api/v1/classes/occurrences/${zOcc.occurrence_id}/attendance/${apptZumbaFree.data.id}`, authStudio, { attendanceStatus: 'absent' });
    }
    const cFreeAfterAbsent = await makeReq('GET', `/api/v1/package-contracts/${cFreeRes.data.contract.id}`, authStudio);
    assert(
      cFreeAfterAbsent.data.contract.summary.creditsReserved === 0 &&
      cFreeAfterAbsent.data.contract.summary.creditsUsed === 0 &&
      cFreeAfterAbsent.data.contract.summary.creditsRemaining === 4,
      'Política refund em falta restituiu o crédito integralmente ao saldo (remaining=4)'
    );

    // -----------------------------------------------------------------
    // TESTE F: Edição de Catálogo Não Altera Histórico
    // -----------------------------------------------------------------
    console.log('\n--- TESTE F: Preservação Histórica após Edição de Catálogo ---');
    const updPkg = await makeReq('PUT', `/api/v1/packages/${pkgMultiId}`, authStudio, {
      name: 'Movimento Editado Caríssimo',
      price: 499,
      creditMode: 'per_service',
      items: [
        { serviceId: srvPilates, includedCredits: 10 },
        { serviceId: srvDanca, includedCredits: 5 },
        { serviceId: srvZumba, includedCredits: 5 }
      ]
    });
    assert(updPkg.status === 200, 'Pacote atualizado no catálogo para R$ 499 e 20 créditos');
    const histContract = await makeReq('GET', `/api/v1/package-contracts/${contractAnaId}`, authStudio);
    assert(
      histContract.data.contract.contracted_price === 220 &&
      histContract.data.contract.summary.creditsTotal === 6,
      'Contrato histórico de Ana preservou preço R$ 220 e total 6 aulas intactos'
    );

    // -----------------------------------------------------------------
    // TESTE G: Botão Rápido WhatsApp & Janela Vence em Breve (7 dias)
    // -----------------------------------------------------------------
    console.log('\n--- TESTE G: Central de Cobranças (Vence em Breve 7 dias & Telefone) ---');
    const todayIso = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const fiveDaysDue = addDaysIso(todayIso, 5);
    db.prepare(`
      INSERT INTO payments (id, tenant_id, patient_id, amount, payment_method, status, due_date, notes, service_id, package_contract_id)
      VALUES ('pay-soon-5d', ?, ?, 190, 'pix', 'pending', ?, 'Mensalidade Movimento', ?, ?)
    `).run(studioTenant, alunoAna, fiveDaysDue, srvPilates, contractAnaId);

    const colSoonRes = await makeReq('GET', '/api/v1/financial/collections?status=due_soon', authStudio);
    assert(colSoonRes.status === 200, 'Consulta status=due_soon executada');
    const foundSoon = (colSoonRes.data.collections || []).find(c => c.id === 'pay-soon-5d');
    assert(
      Boolean(foundSoon && foundSoon.derived_status === 'due_soon' && foundSoon.patient_whatsapp === '11988887777'),
      'Cobrança com vencimento em 5 dias classificada corretamente como due_soon e trazendo patient_whatsapp real'
    );
    const colAll = await makeReq('GET', '/api/v1/financial/collections?status=open', authStudio);
    const foundNoPhone = (colAll.data.collections || []).find(c => c.patient_id === alunoSemFone);
    assert(
      Boolean(foundNoPhone && !foundNoPhone.patient_whatsapp && foundNoPhone.patient_phone === '000'),
      'Aluno sem telefone válido retornado sem número inventado para exibir WhatsApp indisponível'
    );

    // -----------------------------------------------------------------
    // TESTE H: Agendamento Público Studio, Misto e Preservação de Clínica
    // -----------------------------------------------------------------
    console.log('\n--- TESTE H: Agendamento Público Studio / Misto / Clínica ---');
    const pubClinic = await makeReq('GET', '/api/v1/public/tenants/clinica-saude');
    assert(
      pubClinic.status === 200 &&
      pubClinic.data?.tenant?.establishment_profile === 'clinic' &&
      Array.isArray(pubClinic.data?.packages) &&
      pubClinic.data.packages.length === 0,
      'Clínica tradicional retorna establishment_profile=clinic e 0 pacotes, preservando fluxo clínico'
    );
    const pubClinicBlockStudio = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'clinica-saude',
      mode: 'service',
      serviceId: srvClinica,
      startTime: `${monday1}T11:00:00`,
      student: { fullName: 'Teste', phone: '11977776666' }
    });
    assert(pubClinicBlockStudio.status === 403, 'Clínica tradicional bloqueada de usar rota específica de Studio');

    const pubMixed = await makeReq('GET', '/api/v1/public/tenants/espaco-misto');
    assert(pubMixed.status === 200 && pubMixed.data?.tenant?.establishment_profile === 'mixed', 'Estabelecimento Misto expõe establishment_profile=mixed');

    const pubStudio = await makeReq('GET', '/api/v1/public/tenants/movimento-viva');
    assert(
      pubStudio.status === 200 &&
      pubStudio.data?.tenant?.establishment_profile === 'studio' &&
      pubStudio.data.packages.length >= 2,
      'Studio expõe establishment_profile=studio e lista pacotes públicos'
    );

    // Consultar slots públicos de Dança com "Qualquer instrutor disponível" e ver vagas
    const slotsDanca = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=movimento-viva&serviceId=${srvDanca}&date=${thursday1}&professionalId=any`);
    assert(
      slotsDanca.status === 200 &&
      slotsDanca.data.slots.length > 0 &&
      slotsDanca.data.slots[0].remainingSpots === 6,
      'Slots públicos do Studio mostram instrutor e vagas restantes reais na turma (6 vagas)'
    );

    // Agendamento público de aula com recorrência semanal finita (2 semanas)
    const pubServiceBook = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'movimento-viva',
      mode: 'service',
      serviceId: srvDanca,
      professionalId: 'any',
      startTime: `${thursday1}T14:00:00`,
      recurrence: { frequency: 'weekly', maxOccurrences: 2 },
      student: { fullName: 'Lucas Martins Público', phone: '11991234567' }
    });
    assert(
      pubServiceBook.status === 201 &&
      pubServiceBook.data.appointments.length === 2 &&
      pubServiceBook.data.paymentPending === true,
      'Agendamento público Studio de aula coletiva recorrente (2 semanas) criado com paymentPending=true'
    );
    const lucasPays = db.prepare(`SELECT status FROM payments WHERE appointment_id = ?`).get(pubServiceBook.data.appointments[0].id);
    assert(lucasPays?.status === 'pending', 'Cobrança gerada no agendamento público é pending (jamais marcada paga sem quitação)');

    // Vaga na turma de quinta 14:00 caiu de 6 para 5
    const slotsDancaAfter = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=movimento-viva&serviceId=${srvDanca}&date=${thursday1}&professionalId=any`);
    const slot14 = slotsDancaAfter.data.slots.find(s => s.time === '14:00');
    assert(slot14 && slot14.remainingSpots === 5, 'Vagas restantes na turma diminuíram atomicamente de 6 para 5 após reserva online');

    // Solicitação pública de Pacote Multisserviços com aulas de Pilates (Carla) e Zumba (Marcos)
    const pubPkgBook = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'movimento-viva',
      mode: 'package',
      packageId: pkgMultiId,
      schedules: [
        { serviceId: srvPilates, professionalId: profPilates, startTime: `${friday1}T09:00:00` },
        { serviceId: srvZumba, professionalId: 'any', startTime: `${friday1}T18:00:00` }
      ],
      student: { fullName: 'Mariana Souza Pacote', phone: '11995554444' }
    });
    assert(
      pubPkgBook.status === 201 &&
      pubPkgBook.data.contractStatus === 'requested' &&
      pubPkgBook.data.paymentStatus === 'pending' &&
      pubPkgBook.data.paymentPending === true &&
      pubPkgBook.data.appointments.length === 2,
      'Solicitação pública de pacote multissserviços registrou contrato requested/pending e reservou 2 horários com instrutores distintos'
    );
    const marianaApptPays = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE appointment_id IN (?, ?)`).get(
      pubPkgBook.data.appointments[0].id,
      pubPkgBook.data.appointments[1].id
    ).c;
    assert(marianaApptPays === 0, 'Solicitação pública via pacote NÃO gerou cobranças por sessão avulsa');

    // -----------------------------------------------------------------
    // TESTE I & J: Isolamento Multi-tenant + Proteção contra Cross-Tenant
    // -----------------------------------------------------------------
    console.log('\n--- TESTE J: Isolamento Multi-Tenant ---');
    const crossTenantGet = await makeReq('GET', `/api/v1/package-contracts/${contractAnaId}`, authClinic);
    assert(crossTenantGet.status === 404, 'Clínica B não consegue ler contrato de pacote do Studio A (HTTP 404)');

    console.log('\n==============================================================');
    console.log(`RESULTADO FINAL: ${passed} PASSARAM, ${failed} FALHARAM.`);
    console.log('==============================================================\n');
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('Erro fatal durante execução dos testes:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
