const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_academia_studio_homologation.db');
process.env.JWT_SECRET = 'test-academia-studio-homologation-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-academia-studio-files-secret-123456';
process.env.PORT = '3129';

for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
    fs.unlinkSync(process.env.DATABASE_PATH + ext);
  }
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

function assert(cond, msg, detail) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
    failed++;
  }
}

function makeReq(method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3129,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
          } catch {
            resolve({ status: res.statusCode, data, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getNextWeekdayIso(targetDow, weekOffset = 1) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + diff + (weekOffset - 1) * 7);
  return base.toISOString().slice(0, 10);
}

async function runHomologation() {
  const server = await new Promise(resolve => {
    const s = app.listen(3129, '127.0.0.1', () => resolve(s));
  });

  try {
    console.log('========================================================================');
    console.log(' SUÍTE DE HOMOLOGAÇÃO — ACADEMIA & STUDIO (18 CENÁRIOS OBRIGATÓRIOS)');
    console.log('========================================================================');

    // Setup de 4 tenants: Studio A, Studio B (Multitenant), Clínica Pura, Misto
    const studioTenantId = 'ten-acad-a';
    const studioBTenantId = 'ten-acad-b';
    const clinicTenantId = 'ten-clin-pure';
    const mixedTenantId = 'ten-mixed-est';

    const insertTenant = db.prepare(`
      INSERT INTO tenants (
        id, slug, public_booking_slug, public_booking_sequence, public_booking_enabled,
        name, trade_name, email, status, onboarding_completed, onboarding_status, manager_confirmed,
        billing_required, establishment_profile, client_term_label
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'active', 1, 'active', 1, 0, ?, ?)
    `);

    insertTenant.run(studioTenantId, 'iron-studio', 'iron-studio', 101, 'Iron Academia & Studio', 'Iron Academia & Studio', 'contato@ironstudio.com', 'studio', 'Aluno');
    insertTenant.run(studioBTenantId, 'other-gym', 'other-gym', 102, 'Outra Academia B', 'Outra Academia B', 'contato@othergym.com', 'studio', 'Aluno');
    insertTenant.run(clinicTenantId, 'clinica-saude', 'clinica-saude', 103, 'Clínica Saúde Pura', 'Clínica Saúde Pura', 'contato@clinicasaude.com', 'clinic', 'Paciente');
    insertTenant.run(mixedTenantId, 'centro-misto', 'centro-misto', 104, 'Centro Integrado Misto', 'Centro Integrado Misto', 'contato@centromisto.com', 'mixed', 'Cliente');

    const createAdminAndProf = (tId, prefix, profIdCode = 'prof-personal-trainer', profName = 'Personal Trainer / Educação Física') => {
      const uId = `usr-${prefix}-adm`;
      const pId = `prof-${prefix}-1`;
      db.prepare(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified, zemda_personal_enabled)
        VALUES (?, ?, ?, ?, 'hash', 'clinic_admin', 'active', 'active', 1, 1)
      `).run(uId, tId, `Gestor ${prefix}`, `adm@${prefix}.com`);

      db.prepare(`
        INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, zemda_personal_enabled)
        VALUES (?, ?, ?, 'clinic_admin', 'active', 1, 1)
      `).run(`cu-${prefix}`, tId, uId);

      db.prepare(`
        INSERT INTO professionals (
          id, tenant_id, user_id, name, profession_id, profession_name,
          public_booking_enabled, remuneration_type, commission_percentage, active
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 'commission', 40, 1)
      `).run(pId, tId, uId, `Instrutor ${prefix}`, profIdCode, profName);

      // Escala de Segunda a Sábado 06:00 às 22:00
      for (let dow = 1; dow <= 6; dow++) {
        db.prepare(`
          INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
          VALUES (?, ?, ?, ?, '06:00', '22:00', 1)
        `).run(`sch-${prefix}-${dow}`, tId, pId, dow);
      }

      const token = generateToken({ userId: uId, tenantId: tId, role: 'clinic_admin', email: `adm@${prefix}.com` });
      return { userId: uId, profId: pId, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tId } };
    };

    const studioAuth = createAdminAndProf(studioTenantId, 'acadA');
    const studioBAuth = createAdminAndProf(studioBTenantId, 'acadB');
    const clinicAuth = createAdminAndProf(clinicTenantId, 'clinP', 'prof-medico', 'Médico');
    const mixedAuth = createAdminAndProf(mixedTenantId, 'mixedM');

    // ========================================================================
    // CENÁRIO 1 — ACADEMIA LIVRE (Sem agendamento, sem ocupar agenda)
    // ========================================================================
    console.log('\n--- Cenário 1: Academia Livre ---');
    const resMuscLivre = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      name: 'Musculação Livre',
      studioServiceType: 'facility_access',
      requiresAppointment: false,
      allowPublicBooking: true,
      price: 129.9,
      periodicPrice: 129.9,
      billingMode: 'monthly',
      accessConfig: {
        accessMode: 'unlimited',
        allowSameDayReentry: true,
        allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
        maxSimultaneousCapacity: 50,
        blockOnOverdue: true,
        overdueGraceDays: 0
      }
    });
    assert(resMuscLivre.status === 201, 'Serviço Tipo A (Musculação Livre) criado sem exigir profissional', resMuscLivre.data);
    const muscLivreId = resMuscLivre.data.id;
    assert(resMuscLivre.data.studio_service_type === 'facility_access', 'studio_service_type persistido como facility_access');
    assert(resMuscLivre.data.requires_appointment === 0, 'requires_appointment === 0');

    // Cria Aluno 1
    const resStudent1 = await makeReq('POST', '/api/v1/patients', studioAuth.headers, {
      fullName: 'Carlos Musculação Livre',
      phone: '11988881111',
      cpf: '11122233344'
    });
    const student1Id = resStudent1.data.id;

    // Matricula Aluno 1 no plano mensal de Musculação Livre
    const mondayIso = getNextWeekdayIso(1, 1);
    const resEnroll1 = await makeReq('POST', '/api/v1/studio/enrollments', studioAuth.headers, {
      studentId: student1Id,
      serviceId: muscLivreId,
      contractKind: 'access_plan',
      contractDurationCode: '1_month',
      paymentPeriodicity: 'monthly',
      accessMode: 'unlimited',
      startDate: mondayIso,
      amount: 129.9,
      initialPaymentStatus: 'paid'
    });
    assert(resEnroll1.status === 201, 'Matrícula de Acesso Livre criada com sucesso', resEnroll1.data);

    // ========================================================================
    // VERIFICAÇÃO DA REMOÇÃO DO CONTROLE DE ACESSO & PORTARIA
    // ========================================================================
    const removedAccessLogs = await makeReq('GET', '/api/v1/studio/access/logs', studioAuth.headers);
    const removedAccessCheckin = await makeReq('POST', '/api/v1/studio/access/check-in', studioAuth.headers, { studentId: student1Id });
    const removedQrRoute = await makeReq('GET', `/api/v1/studio/access/students/${student1Id}/qr-token`, studioAuth.headers);
    assert(
      removedAccessLogs.status === 404 && removedAccessCheckin.status === 404 && removedQrRoute.status === 404,
      'Rotas exclusivas de Controle de Acesso & Portaria foram removidas (404)'
    );

    const apptsCount1 = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ? AND patient_id = ?`).get(studioTenantId, student1Id).c;
    const paysCount1 = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE tenant_id = ? AND patient_id = ?`).get(studioTenantId, student1Id).c;
    assert(apptsCount1 === 0, 'Plano de Acesso Livre gerou 0 agendamentos na agenda de profissionais');
    assert(paysCount1 === 1, 'Apenas 1 cobrança mensal foi gerada para o contrato');

    // ========================================================================
    // CENÁRIO 2 — ACADEMIA LIMITADA (3x por semana preservada como condição comercial)
    // ========================================================================
    console.log('\n--- Cenário 2: Academia Limitada (3x/semana como condição contratual) ---');
    const resMusc3x = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      name: 'Musculação 3x Semana',
      studioServiceType: 'facility_access',
      requiresAppointment: false,
      price: 99.9,
      periodicPrice: 99.9,
      billingMode: 'monthly',
      accessConfig: {
        accessMode: 'limited',
        maxEntriesPerWeek: 3,
        allowedWeekdays: [1, 2, 3, 4, 5, 6]
      }
    });
    const musc3xId = resMusc3x.data.id;

    const resStudent2 = await makeReq('POST', '/api/v1/patients', studioAuth.headers, {
      fullName: 'Mariana Limitada 3x',
      phone: '11988882222',
      cpf: '22233344455'
    });
    const student2Id = resStudent2.data.id;

    const resEnroll2 = await makeReq('POST', '/api/v1/studio/enrollments', studioAuth.headers, {
      studentId: student2Id,
      serviceId: musc3xId,
      contractKind: 'access_plan',
      accessMode: 'limited',
      maxEntriesPerWeek: 3,
      startDate: mondayIso,
      initialPaymentStatus: 'paid'
    });
    assert(
      resEnroll2.status === 201 && resEnroll2.data.plan?.weekly_frequency === 3,
      'Plano com frequência semanal limitada (3x/semana) preservado como condição comercial sem portaria'
    );

    // ========================================================================
    // CENÁRIO 3 — PERSONAL INDIVIDUAL (Com adicional de horário de pico)
    // ========================================================================
    console.log('\n--- Cenário 3: Personal Individual & Adicional de Horário ---');
    const resPersonalInd = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      professionalId: studioAuth.profId,
      name: 'Personal Individual',
      studioServiceType: 'individual',
      serviceKind: 'individual',
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 100,
      billingMode: 'per_session',
      pricingAdjustments: [
        {
          id: 'pico-noite',
          label: 'Adicional Horário de Pico',
          adjustmentType: 'surcharge',
          valueType: 'fixed',
          amount: 25,
          incidence: 'per_student',
          weekdays: [1, 2, 3, 4, 5],
          startTime: '18:00',
          endTime: '21:00',
          active: true
        }
      ]
    });
    const personalIndId = resPersonalInd.data.id;
    assert(resPersonalInd.status === 201 && resPersonalInd.data.pricing_adjustments.length === 1, 'Personal Individual criado com regra de adicional de horário de pico');

    const nextTue = getNextWeekdayIso(2, 2);
    const apptPeak = await makeReq('POST', '/api/v1/appointments', studioAuth.headers, {
      patientId: student1Id,
      professionalId: studioAuth.profId,
      serviceId: personalIndId,
      startTime: `${nextTue}T19:00:00`,
      endTime: `${nextTue}T20:00:00`,
      modality: 'presential'
    });
    assert(apptPeak.status === 201, 'Agendamento de Personal Individual criado às 19:00 (horário de pico)', apptPeak.data);
    const peakPay = db.prepare(`SELECT amount FROM payments WHERE appointment_id = ?`).get(apptPeak.data.id);
    assert(Number(peakPay?.amount) === 125, 'Cobrança gerada com adicional de horário de pico (R$ 100 + R$ 25 = R$ 125)', peakPay);

    // ========================================================================
    // CENÁRIO 4 — PERSONAL EM DUPLA (Ocorrência compartilhada de 2 vagas)
    // ========================================================================
    console.log('\n--- Cenário 4: Personal em Dupla (2 vagas) ---');
    const resPersonalDupla = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      professionalId: studioAuth.profId,
      name: 'Personal em Dupla',
      studioServiceType: 'group',
      serviceKind: 'group',
      defaultCapacity: 2,
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 80
    });
    const personalDuplaId = resPersonalDupla.data.id;

    const nextWed = getNextWeekdayIso(3, 2);
    const duplaAppt1 = await makeReq('POST', '/api/v1/appointments', studioAuth.headers, {
      patientId: student1Id,
      professionalId: studioAuth.profId,
      serviceId: personalDuplaId,
      startTime: `${nextWed}T09:00:00`,
      endTime: `${nextWed}T10:00:00`,
      modality: 'presential'
    });
    const duplaAppt2 = await makeReq('POST', '/api/v1/appointments', studioAuth.headers, {
      patientId: student2Id,
      professionalId: studioAuth.profId,
      serviceId: personalDuplaId,
      startTime: `${nextWed}T09:00:00`,
      endTime: `${nextWed}T10:00:00`,
      modality: 'presential'
    });
    assert(duplaAppt1.status === 201 && duplaAppt2.status === 201, 'Ambos os alunos da dupla agendados no mesmo horário com o mesmo profissional');
    assert(duplaAppt1.data.occurrenceId && duplaAppt1.data.occurrenceId === duplaAppt2.data.occurrenceId, 'Ambos compartilham a mesma ocorrência (class_occurrences)', { occ1: duplaAppt1.data.occurrenceId, occ2: duplaAppt2.data.occurrenceId });

    // Tenta 3º aluno na dupla (deve bloquear por capacidade = 2)
    const resStudent3 = await makeReq('POST', '/api/v1/patients', studioAuth.headers, {
      fullName: 'Terceiro Aluno',
      phone: '11988883333'
    });
    const student3Id = resStudent3.data.id;
    const duplaAppt3 = await makeReq('POST', '/api/v1/appointments', studioAuth.headers, {
      patientId: student3Id,
      professionalId: studioAuth.profId,
      serviceId: personalDuplaId,
      startTime: `${nextWed}T09:00:00`,
      endTime: `${nextWed}T10:00:00`,
      modality: 'presential'
    });
    assert(duplaAppt3.status === 409, '3º aluno bloqueado ao tentar entrar em Personal em Dupla (capacidade 2/2)', duplaAppt3.data);

    // ========================================================================
    // CENÁRIOS 5, 6, 7 — PILATES COLETIVO (6 vagas), FUNCIONAL (12), DANÇA (20)
    // ========================================================================
    console.log('\n--- Cenários 5, 6 e 7: Pilates Coletivo, Funcional e Dança ---');
    const resPilates = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      professionalId: studioAuth.profId,
      name: 'Pilates Studio Coletivo',
      studioServiceType: 'group',
      serviceKind: 'group',
      defaultCapacity: 6,
      durationMinutes: 50,
      price: 90,
      billingMode: 'monthly',
      periodicPrice: 350,
      classSchedules: [{ weekdays: [1, 3, 5], startTime: '08:00', endTime: '08:50', capacity: 6, professionalId: studioAuth.profId }]
    });
    const resFuncional = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      professionalId: studioAuth.profId,
      name: 'Treinamento Funcional',
      studioServiceType: 'group',
      serviceKind: 'group',
      defaultCapacity: 12,
      durationMinutes: 50,
      price: 60,
      classSchedules: [{ weekdays: [2, 4], startTime: '07:00', endTime: '07:50', capacity: 12, professionalId: studioAuth.profId }]
    });
    const resDanca = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      professionalId: studioAuth.profId,
      name: 'Dança & Ritmos',
      studioServiceType: 'group',
      serviceKind: 'group',
      defaultCapacity: 20,
      durationMinutes: 60,
      price: 70,
      classSchedules: [{ weekdays: [2, 4], startTime: '19:00', endTime: '20:00', capacity: 20, professionalId: studioAuth.profId }]
    });
    assert(resPilates.status === 201 && resFuncional.status === 201 && resDanca.status === 201, 'Turmas de Pilates (6 vagas), Funcional (12 vagas) e Dança (20 vagas) criadas com grade semanal');

    // ========================================================================
    // CENÁRIOS 8 E 9 — PACOTE COMBINADO (Academia Livre + 8 Personal + Entrega de Treino)
    // ========================================================================
    console.log('\n--- Cenários 8 e 9: Pacote Combinado & Serviço Entregável sem Agendamento ---');
    const resEntregaTreino = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      name: 'Entrega de Treino Periodizado',
      studioServiceType: 'non_scheduled',
      requiresAppointment: false,
      price: 120
    });
    const entregaTreinoId = resEntregaTreino.data.id;
    assert(resEntregaTreino.status === 201 && resEntregaTreino.data.requires_appointment === 0, 'Serviço Entregável (Tipo D) criado sem exigir agendamento');

    // Tenta agendar horário para serviço não agendável -> deve bloquear com NON_SCHEDULABLE_SERVICE
    const tryScheduleNonSched = await makeReq('POST', '/api/v1/appointments', studioAuth.headers, {
      patientId: student3Id,
      professionalId: studioAuth.profId,
      serviceId: entregaTreinoId,
      startTime: `${nextWed}T15:00:00`,
      endTime: `${nextWed}T16:00:00`
    });
    assert(tryScheduleNonSched.status === 400 && tryScheduleNonSched.data.code === 'NON_SCHEDULABLE_SERVICE', 'Serviço não agendável bloqueia criação de agendamento fictício na agenda');

    // Cria Pacote Combinado: Musculação Livre + 8 sessões de Personal + 1 Entrega de Treino
    const resComboPkg = await makeReq('POST', '/api/v1/packages', studioAuth.headers, {
      name: 'Combo Academia Livre + 8 Personal + Ficha de Treino',
      billingType: 'recurring_monthly',
      billingFrequency: 'monthly',
      price: 550,
      creditMode: 'per_service',
      validityDays: 30,
      items: [
        { serviceId: muscLivreId, itemType: 'facility_access', accessMode: 'unlimited', itemPrice: 110 },
        { serviceId: personalIndId, itemType: 'scheduled_service', includedCredits: 8, weeklyFrequency: 2, itemPrice: 400 },
        { serviceId: entregaTreinoId, itemType: 'deliverable', includedCredits: 1, itemPrice: 40 }
      ]
    });
    assert(resComboPkg.status === 201, 'Pacote Combinado criado no catálogo', resComboPkg.data);
    const comboPkgId = resComboPkg.data.package.id;

    // Contrata o Pacote Combinado para o Aluno 3
    const resComboContract = await makeReq('POST', '/api/v1/package-contracts', studioAuth.headers, {
      packageId: comboPkgId,
      studentId: student3Id,
      startDate: mondayIso,
      contractStatus: 'active',
      paymentStatus: 'paid'
    });
    assert(resComboContract.status === 201, 'Contrato do Pacote Combinado ativado para o Aluno 3');
    const comboContractId = resComboContract.data.contract.id;

    // Verifica que o benefício de acesso livre NÃO interfere nem consome créditos das 8 sessões de Personal
    const contractInitial = await makeReq('GET', `/api/v1/package-contracts/${comboContractId}`, studioAuth.headers);
    const personalEntBefore = contractInitial.data.contract.entitlements.find(e => e.service_id === personalIndId);
    const accessEntInitial = contractInitial.data.contract.entitlements.find(e => e.service_id === muscLivreId);
    assert(
      personalEntBefore.credits_remaining === 8 && personalEntBefore.credits_used === 0 && accessEntInitial?.entitlement_type === 'facility_access',
      'Pacote combinado mantém acesso livre e 8 créditos de Personal separados'
    );

    // Agora agenda e realiza 1 sessão de Personal coberta pelo pacote combinado
    const nextThu = getNextWeekdayIso(4, 2);
    const comboAppt = await makeReq('POST', '/api/v1/appointments', studioAuth.headers, {
      patientId: student3Id,
      professionalId: studioAuth.profId,
      serviceId: personalIndId,
      packageContractId: comboContractId,
      startTime: `${nextThu}T10:00:00`,
      endTime: `${nextThu}T11:00:00`,
      modality: 'presential'
    });
    assert(comboAppt.status === 201, 'Sessão de Personal agendada utilizando o Pacote Combinado', comboAppt.data);

    await makeReq('PUT', `/api/v1/classes/occurrences/${comboAppt.data.id}/attendance/${comboAppt.data.id}`, studioAuth.headers, {
      attendanceStatus: 'present'
    });
    const contractAfterPersonal = await makeReq('GET', `/api/v1/package-contracts/${comboContractId}`, studioAuth.headers);
    const personalEntAfter = contractAfterPersonal.data.contract.entitlements.find(e => e.service_id === personalIndId);
    assert(personalEntAfter.credits_used === 1 && personalEntAfter.credits_remaining === 7, 'Sessão de Personal realizada consumiu 1 crédito de Personal (restam 7)');

    // Registra a entrega do benefício não agendável (Entrega de Treino)
    const deliverableEnt = contractAfterPersonal.data.contract.entitlements.find(e => e.service_id === entregaTreinoId);
    const deliverRes = await makeReq('POST', `/api/v1/studio/enrollments/${comboContractId}/entitlements/${deliverableEnt.id}/deliver`, studioAuth.headers, {
      notes: 'Ficha de treino A/B entregue no aplicativo'
    });
    assert(deliverRes.status === 200, 'Benefício entregável (Entrega de Treino) registrado sem criar agendamento');

    // ========================================================================
    // CENÁRIO 10 — AGENDAMENTO PÚBLICO (Plano de Acesso sem horário + Aula + Pacote)
    // ========================================================================
    console.log('\n--- Cenário 10: Agendamento Público (Plano de Acesso sem horário) ---');
    const pubProfile = await makeReq('GET', '/api/v1/public/tenants/iron-studio');
    assert(pubProfile.status === 200, 'Perfil público carregado');
    const pubHasAccessPlan = pubProfile.data.services.some(s => s.id === muscLivreId && s.studio_service_type === 'facility_access');
    assert(pubHasAccessPlan, 'Plano de Acesso (sem profissional obrigatório) listado na página pública');

    const pubAccessReq = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'iron-studio',
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: muscLivreId,
      startDate: mondayIso,
      contractDurationCode: '3_months',
      student: {
        fullName: ' Fernanda Pública Acesso',
        phone: '11977776666',
        whatsapp: '11977776666',
        email: 'fernanda@teste.com'
      }
    });
    assert(pubAccessReq.status === 201 && pubAccessReq.data.status === 'awaiting_confirmation', 'Solicitação pública de Plano de Acesso criada sem exigir escolha de horário', pubAccessReq.data);

    // Confirma a solicitação pública de Plano de Acesso
    const confirmPubAccess = await makeReq('POST', `/api/v1/internal-notifications/${pubAccessReq.data.requestId}/confirm`, studioAuth.headers, {});
    assert(confirmPubAccess.status === 200 && confirmPubAccess.data.billingPlanId, 'Solicitação pública de Plano de Acesso confirmada gerando matrícula ativa e 0 agendamentos', confirmPubAccess.data);
    assert(Array.isArray(confirmPubAccess.data.appointmentIds) && confirmPubAccess.data.appointmentIds.length === 0, 'Confirmação de Plano de Acesso criou 0 agendamentos na agenda');

    // Testa assinatura anual com opção comercial sem exigir agendamento via link público
    const resAnualMusc = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      name: 'Plano Anual Academia Total',
      studioServiceType: 'facility_access',
      requiresAppointment: false,
      allowPublicBooking: true,
      price: 119.9,
      periodicPrice: 119.9,
      billingMode: 'annual',
      defaultPlanDuration: '12_months',
      commercialPriceOptions: [
        {
          id: 'opt-anual-12m',
          label: 'Plano Anual 12 meses',
          accessType: 'unlimited',
          frequencyType: 'unlimited',
          contractDurationCode: '12_months',
          paymentPeriodicity: 'annual',
          commercialUnit: 'contract_total',
          amountCents: 119000,
          active: true
        }
      ]
    });
    assert(resAnualMusc.status === 201, 'Plano Anual sem agendamento criado com opção comercial');

    const resPublicHiddenSrv = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      name: 'Plano VIP Oculto Interno',
      studioServiceType: 'facility_access',
      requiresAppointment: false,
      allowPublicBooking: false,
      price: 299
    });
    assert(resPublicHiddenSrv.status === 201, 'Serviço privado (allowPublicBooking=false) criado para validar filtro');

    // Cria turma de Zumba Qua/Sex com capacidade 1 e valida catálogo público antes e depois de lotar vagas
    const resZumba = await makeReq('POST', '/api/v1/services', studioAuth.headers, {
      professionalId: studioAuth.profId,
      name: 'Zumba Quarta e Sexta',
      studioServiceType: 'group',
      serviceKind: 'group',
      defaultCapacity: 1,
      durationMinutes: 50,
      price: 55,
      allowPublicBooking: true,
      classSchedules: [{ weekdays: [3, 5], startTime: '19:00', endTime: '19:50', capacity: 1, professionalId: studioAuth.profId }]
    });
    assert(resZumba.status === 201, 'Aula coletiva de Zumba Qua/Sex criada');

    const pubProfile2 = await makeReq('GET', '/api/v1/public/tenants/iron-studio');
    const pubServices2 = pubProfile2.data?.services || [];
    const pubPackages2 = pubProfile2.data?.packages || [];
    assert(
      pubServices2.some(s => s.id === resAnualMusc.data.id && s.commercial_price_options?.length === 1) &&
      pubServices2.some(s => s.id === resZumba.data.id && s.weekly_schedule_summary?.length > 0) &&
      pubServices2.some(s => s.id === personalIndId) &&
      !pubServices2.some(s => s.id === resPublicHiddenSrv.data.id) &&
      pubPackages2.some(p => p.id === comboPkgId),
      'Catálogo público exibe planos (com opção anual), turmas Qua/Sex, individuais e pacotes combinados, e oculta serviço privado'
    );

    // Contrata Plano Anual pelo link público sem escolher horário e valida status awaiting_confirmation
    const pubAnualReq = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'iron-studio',
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: resAnualMusc.data.id,
      commercialOptionId: 'opt-anual-12m',
      startDate: mondayIso,
      student: {
        fullName: 'Carlos Plano Anual',
        phone: '11966665544',
        whatsapp: '11966665544',
        email: 'carlos.anual@teste.com'
      }
    });
    assert(pubAnualReq.status === 201 && pubAnualReq.data.status === 'awaiting_confirmation', 'Contratação pública de Plano Anual ficou pendente de aprovação sem conceder acesso ativo', pubAnualReq.data);

    // Contrata Pacote Combinado pelo link público escolhendo horário APENAS do componente agendável (Personal)
    const nextFri = getNextWeekdayIso(5, 2);
    const pubPkgReq = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'iron-studio',
      mode: 'package',
      packageId: comboPkgId,
      schedules: [
        {
          serviceId: personalIndId,
          professionalId: studioAuth.profId,
          modality: 'presential',
          startTime: `${nextFri}T15:00:00`,
          endTime: `${nextFri}T16:00:00`
        }
      ],
      student: {
        fullName: 'Marina Pacote Público',
        phone: '11955554433'
      }
    });
    assert(pubPkgReq.status === 201 && pubPkgReq.data.status === 'awaiting_confirmation', 'Solicitação pública de pacote combinado aceitou horário apenas do item agendável', pubPkgReq.data);

    // Garante que turma publicada com todas as vagas preenchidas continua visível com motivo claro
    const zumbaOccsRes = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=iron-studio&serviceId=${resZumba.data.id}&includeUpcoming=1`);
    const zumbaUpcoming = zumbaOccsRes.data?.upcomingSlots || [];
    for (let i = 0; i < zumbaUpcoming.length; i++) {
      const slot = zumbaUpcoming[i];
      const patTmp = await makeReq('POST', '/api/v1/patients', studioAuth.headers, {
        fullName: `Aluno Lotação ${i + 1}`,
        phone: `119900010${String(i).padStart(2, '0')}`
      });
      await makeReq('POST', '/api/v1/appointments', studioAuth.headers, {
        patientId: patTmp.data.id,
        professionalId: slot.professionalId,
        serviceId: resZumba.data.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        modality: 'presential'
      });
    }
    const pubProfileFull = await makeReq('GET', '/api/v1/public/tenants/iron-studio');
    const zumbaPubCard = (pubProfileFull.data?.services || []).find(s => s.id === resZumba.data.id);
    assert(
      Boolean(zumbaPubCard) &&
      zumbaPubCard.all_upcoming_full === true &&
      typeof zumbaPubCard.public_booking_unavailable_reason === 'string' &&
      zumbaPubCard.weekly_schedule_summary?.length > 0,
      'Turma publicada (Zumba Qua/Sex) permanece visível com grade semanal e aviso claro mesmo quando sem vagas',
      zumbaPubCard
    );

    // ========================================================================
    // CENÁRIO 11 — FINANCEIRO, CONGELAMENTO E CANCELAMENTO
    // ========================================================================
    console.log('\n--- Cenário 11: Financeiro, Congelamento e Cancelamento ---');
    const resStudentOverdue = await makeReq('POST', '/api/v1/patients', studioAuth.headers, {
      fullName: 'Roberto Contrato Pendente',
      phone: '11966665555'
    });
    const studentOverdueId = resStudentOverdue.data.id;
    const overdueEnroll = await makeReq('POST', '/api/v1/studio/enrollments', studioAuth.headers, {
      studentId: studentOverdueId,
      serviceId: muscLivreId,
      contractKind: 'access_plan',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      initialPaymentStatus: 'pending'
    });
    assert(overdueEnroll.status === 201 && overdueEnroll.data.contractId, 'Matrícula financeira com cobrança pendente criada em Matrículas e Planos');

    // Testa Congelamento (freeze) e Cancelamento preservando pagamentos quitados
    const freezeRes = await makeReq('POST', `/api/v1/studio/enrollments/${resEnroll1.data.contractId}/lifecycle`, studioAuth.headers, {
      action: 'freeze',
      frozenFromDate: '2026-01-01',
      frozenUntilDate: '2026-01-15',
      reason: 'Viagem de férias'
    });
    assert(freezeRes.status === 200 && freezeRes.data.plan.contract_status === 'frozen', 'Contrato congelado com sucesso e registrado no histórico');

    const cancelRes = await makeReq('POST', `/api/v1/studio/enrollments/${resEnroll1.data.contractId}/lifecycle`, studioAuth.headers, {
      action: 'cancel',
      reason: 'Mudança de cidade'
    });
    const paidStillIntact = db.prepare(`SELECT status FROM payments WHERE recurring_plan_id = ?`).get(resEnroll1.data.contractId);
    assert(cancelRes.status === 200 && paidStillIntact?.status === 'paid', 'Cancelamento do contrato preservou cobrança já quitada (status = paid)');

    // ========================================================================
    // CENÁRIOS 12, 13 E 14 — ISOLAMENTO DE CLÍNICAS, MISTO E MULTITENANT
    // ========================================================================
    console.log('\n--- Cenários 12, 13 e 14: Isolamento de Clínicas, Misto e Multitenant ---');
    const clinicTryStudioRoute = await makeReq('GET', '/api/v1/studio/enrollments', clinicAuth.headers);
    assert(clinicTryStudioRoute.status === 403, 'Clínica pura recebe 403 ao tentar acessar rotas de Academia & Studio');

    const clinicServiceRes = await makeReq('POST', '/api/v1/services', clinicAuth.headers, {
      professionalId: clinicAuth.profId,
      name: 'Consulta Médica Clínica',
      durationMinutes: 30,
      price: 250
    });
    assert(clinicServiceRes.status === 201 && clinicServiceRes.data.service_domain === 'clinical', 'Serviço criado em Clínica Pura permanece 100% no domínio clinical');

    // Estabelecimento Misto: cria serviço clínico e serviço de Academia
    const mixedClinSrv = await makeReq('POST', '/api/v1/services', mixedAuth.headers, {
      professionalId: mixedAuth.profId,
      name: 'Consulta Fisioterapia Misto',
      serviceDomain: 'clinical',
      durationMinutes: 50,
      price: 180
    });
    const mixedStudioSrv = await makeReq('POST', '/api/v1/services', mixedAuth.headers, {
      name: 'Academia Livre Misto',
      serviceDomain: 'studio',
      studioServiceType: 'facility_access',
      requiresAppointment: false,
      price: 110
    });
    assert(mixedClinSrv.data.service_domain === 'clinical' && mixedStudioSrv.data.service_domain === 'studio', 'Estabelecimento Misto separa perfeitamente serviços clínicos e de Academia & Studio');

    const crossTenantEnrollments = await makeReq('GET', '/api/v1/studio/enrollments', studioBAuth.headers);
    assert(
      crossTenantEnrollments.status === 200 &&
      !(crossTenantEnrollments.data?.enrollments || []).some(e => e.studentId === student1Id || e.studentId === student2Id),
      'Isolamento Multitenant garante que outro Studio não vê matrículas de Iron Studio'
    );

    // ========================================================================
    // CENÁRIO 17 E 18 — REATIVAÇÃO E DESEMPENHO DE RELATÓRIOS
    // ========================================================================
    console.log('\n--- Cenários 17 e 18: Reativação Contratual e Desempenho ---');
    const reactivate1 = await makeReq('POST', `/api/v1/studio/enrollments/${resEnroll1.data.contractId}/lifecycle`, studioAuth.headers, {
      action: 'reactivate'
    });
    assert(reactivate1.status === 200, 'Contrato reativado preservando histórico contratual');

    const t0 = Date.now();
    const repRes = await makeReq('GET', '/api/v1/personal/attendance-reports', studioAuth.headers);
    const elapsedMs = Date.now() - t0;
    assert(
      repRes.status === 200 &&
      repRes.data.enrollmentMetrics &&
      repRes.data.accessMetrics === undefined &&
      repRes.data.studioFinancialMetrics,
      `Relatório consolidado de Academia & Studio retornado sem accessMetrics em ${elapsedMs}ms (< 500ms)`,
      {
        elapsedMs,
        enrollmentMetrics: repRes.data.enrollmentMetrics
      }
    );

    console.log('\n========================================================================');
    console.log(` RESULTADO FINAL: ${passed} APROVADOS | ${failed} FALHAS`);
    console.log('========================================================================');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    server.close();
    for (const ext of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
          fs.unlinkSync(process.env.DATABASE_PATH + ext);
        }
      } catch {}
    }
  }
}

runHomologation().catch(err => {
  console.error('Erro fatal na suíte de homologação:', err);
  process.exit(1);
});
