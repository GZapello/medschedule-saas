const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-studio-review-test-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-secret-for-studio-review-123456';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const { ServiceController } = require('./dist/controllers/service.controller');
const { AppointmentController } = require('./dist/controllers/appointment.controller');
const { BillingCenterController } = require('./dist/controllers/billing-center.controller');
const { ClassAttendanceController } = require('./dist/controllers/class-attendance.controller');
const { PersonalController } = require('./dist/controllers/personal.controller');
require('./dist/services/notification.service').NotificationService.scheduleAppointmentReminder = () => {};

function callController(fn, reqOverrides = {}) {
  let statusCode = 200;
  let body = null;
  const req = {
    path: reqOverrides.path || '/v1/test',
    tenantId: reqOverrides.tenantId || 'studio-tenant',
    headers: reqOverrides.headers || {},
    params: reqOverrides.params || {},
    query: reqOverrides.query || {},
    body: reqOverrides.body || {},
    user: reqOverrides.user || {
      userId: 'admin-user',
      role: 'clinic_admin',
      name: 'Gestor Studio'
    }
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    }
  };
  return Promise.resolve(fn(req, res)).then(() => ({ status: statusCode, body }));
}

async function runTests() {
  console.log('--- Iniciando suíte de integração completa: Revisão e Integração do Zemda Studio ---');

  // Setup Studio Tenant + Users + Professionals + Patients + Schedules
  db.prepare(`
    INSERT INTO tenants (id, name, slug, email, status, establishment_profile)
    VALUES ('studio-tenant', 'Zemda Pilates & Studio', 'zemda-pilates-studio', 'studio@zemda.local', 'active', 'studio')
  `).run();

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role)
    VALUES
      ('admin-user', 'studio-tenant', 'Gestor Studio', 'admin@studio.local', 'hash', 'clinic_admin'),
      ('inst1-user', 'studio-tenant', 'Instrutora Ana', 'ana@studio.local', 'hash', 'professional'),
      ('inst2-user', 'studio-tenant', 'Instrutor Bruno', 'bruno@studio.local', 'hash', 'professional'),
      ('recep-user', 'studio-tenant', 'Recepção Carla', 'carla@studio.local', 'hash', 'receptionist')
  `).run();

  db.prepare(`
    INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, profession_name, zemda_personal_enabled, active)
    VALUES
      ('prof-ana', 'inst1-user', 'studio-tenant', 'Instrutora Ana', 'prof-fisioterapeuta', 'Fisioterapeuta', 1, 1),
      ('prof-bruno', 'inst2-user', 'studio-tenant', 'Instrutor Bruno', 'prof-personal-trainer', 'Educador Físico', 1, 1)
  `).run();

  for (let d = 0; d < 7; d++) {
    db.prepare(`
      INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
      VALUES (?, 'studio-tenant', 'prof-ana', ?, '07:00', '21:00', 1)
    `).run(`sched-ana-${d}`, d);
    db.prepare(`
      INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
      VALUES (?, 'studio-tenant', 'prof-bruno', ?, '07:00', '21:00', 1)
    `).run(`sched-bruno-${d}`, d);
  }

  db.prepare(`
    INSERT INTO patients (id, tenant_id, full_name, phone)
    VALUES
      ('student-1', 'studio-tenant', 'Mariana Aluna', '11999990001'),
      ('student-2', 'studio-tenant', 'Carlos Aluno', '11999990002'),
      ('student-3', 'studio-tenant', 'Fernanda Aluna', '11999990003')
  `).run();

  // 1. Criar Templates do ZemdaPersonal usando exercícios canônicos da biblioteca protegida
  const tpl1Res = await callController(PersonalController.createTemplate, {
    user: { userId: 'inst1-user', role: 'professional', name: 'Instrutora Ana' },
    body: {
      title: 'Pilates Solo & Core - Nível I',
      description: 'Sequência base de ativação de core e mobilidade de coluna',
      goal: 'Mobilidade e Core',
      structure_type: 'Por Grupo Muscular',
      workouts: [
        {
          label: 'Bloco Principal',
          name: 'Core & Estabilidade',
          exercises: [
            { exercise_id: 'ex-abdominal-infra-barra', name: 'Abdominal Infra na Barra', sets: 3, reps: '12', rest_seconds: 45, notes: 'Controle excêntrico' },
            { exercise_id: 'ex-abducao-decubito', name: 'Abdução de Quadril em Decúbito Lateral', sets: 3, reps: '15', rest_seconds: 45, notes: 'Manter lombar apoiada' }
          ]
        }
      ]
    }
  });
  assert.equal(tpl1Res.status, 201, `Falha ao criar template 1: ${JSON.stringify(tpl1Res.body)}`);
  const template1Id = tpl1Res.body.id;

  const tpl2Res = await callController(PersonalController.createTemplate, {
    user: { userId: 'inst1-user', role: 'professional', name: 'Instrutora Ana' },
    body: {
      title: 'Pilates Avançado - Força & Controle',
      description: 'Treino avançado para turmas intermediárias/avançadas',
      goal: 'Força',
      structure_type: 'Full Body',
      workouts: [
        {
          label: 'Série A',
          name: 'Força Global',
          exercises: [
            { exercise_id: 'ex-003', exercise_name: 'Cadeira Extensora', sets: 4, reps: '10', rest_seconds: 60, notes: 'Pico de contração 2s' }
          ]
        }
      ]
    }
  });
  assert.equal(tpl2Res.status, 201);
  const template2Id = tpl2Res.body.id;

  // 2. Cadastrar serviço Studio com valor definido (R$ 95,00 avulso / R$ 320,00 mensal), 2 templates vinculados e grade Seg/Qua 08:00 (vagas = 2)
  const createSvcRes = await callController(ServiceController.create, {
    body: {
      professionalId: 'prof-ana',
      linkedProfessionalIds: ['prof-ana', 'prof-bruno'],
      name: 'Aula de Pilates Studio',
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 95,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 2,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'biweekly', 'custom_weekdays'],
      defaultRecurrenceFrequency: 'weekly',
      allowedPlanDurations: ['1_month', '3_months', '6_months', '12_months', 'count', 'custom_date'],
      defaultPlanDuration: '1_month',
      billingMode: 'monthly',
      periodicPrice: 320,
      defaultBillingDueDay: 10,
      defaultTemplateId: template1Id,
      linkedTemplateIds: [template1Id, template2Id],
      classSchedules: [
        {
          dayOfWeek: 1, // Segunda-feira
          startTime: '08:00',
          endTime: '08:50',
          capacity: 2,
          professionalId: 'prof-ana',
          coInstructorIds: ['prof-bruno'],
          modality: 'presential'
        },
        {
          dayOfWeek: 3, // Quarta-feira
          startTime: '08:00',
          endTime: '08:50',
          capacity: 2,
          professionalId: 'prof-ana',
          coInstructorIds: ['prof-bruno'],
          modality: 'presential'
        }
      ]
    }
  });
  assert.equal(createSvcRes.status, 201, `Erro ao criar serviço: ${JSON.stringify(createSvcRes.body)}`);
  const serviceId = createSvcRes.body.id;
  const schedules = createSvcRes.body.class_schedules;
  assert.equal(schedules.length, 2, 'Deve criar os 2 horários da grade (Seg e Qua 08:00)');

  // 3. Validar que listagem de serviços NUNCA retorna R$ 0,00 indevidamente, mesmo se professional_services.custom_price for corrompido para 0
  db.prepare(`UPDATE professional_services SET custom_price = 0 WHERE service_id = ?`).run(serviceId);
  const listSvcRes = await callController(ServiceController.list);
  assert.equal(listSvcRes.status, 200);
  const listedSvc = listSvcRes.body.find(s => s.id === serviceId);
  assert.ok(listedSvc, 'Serviço deve estar na listagem');
  assert.equal(Number(listedSvc.price), 95, 'Preço do serviço deve ser 95.00 mesmo se custom_price foi zerado');
  assert.equal(Number(listedSvc.periodic_price), 320, 'Preço periódico deve ser 320.00');
  assert.equal(listedSvc.default_template_id, template1Id, 'Template padrão deve vir vinculado');
  assert.equal(listedSvc.linked_templates.length, 2, 'Ambos os templates devem vir vinculados ao serviço');

  // 4. Testar Aula Avulsa (Opção C): usa o preço de referência R$ 95,00 ou ajuste manual com motivo, SEM sobrescrever services.price
  const dropInRes = await callController(AppointmentController.create, {
    body: {
      patientId: 'student-3',
      professionalId: 'prof-ana',
      serviceId,
      appointmentPrice: 75,
      priceOverrideReason: 'Aula experimental com desconto',
      billingChoice: 'drop_in',
      startTime: '2026-12-07T08:00:00', // Segunda-feira futura
      endTime: '2026-12-07T08:50:00',
      modality: 'presential'
    }
  });
  assert.equal(dropInRes.status, 201, `Erro ao agendar aula avulsa: ${JSON.stringify(dropInRes.body)}`);
  const dropInAppt = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(dropInRes.body.id);
  assert.equal(dropInAppt.price_override_reason, 'Aula experimental com desconto');
  assert.equal(Number(dropInAppt.catalog_price_snapshot), 95);
  const svcAfterDropIn = db.prepare(`SELECT price FROM services WHERE id = ?`).get(serviceId);
  assert.equal(Number(svcAfterDropIn.price), 95, 'Preço de catálogo no banco JAMAIS deve ser alterado pelo agendamento avulso');

  // 5. Contratação Mensal com aulas 2x por semana (Seg e Qua) — Opção B
  const monthlyRecurringRes = await callController(AppointmentController.createRecurring, {
    body: {
      patientId: 'student-1',
      professionalId: 'prof-ana',
      serviceId,
      appointmentPrice: 0,
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'monthly',
        amount: 320,
        dueDay: 10,
        startDate: '2026-12-09',
        endDate: '2027-01-08',
        paymentMethod: 'pix',
        generateInitialCycle: true,
        generateAllContractCycles: true,
        initialPaymentStatus: 'paid'
      },
      startTime: '2026-12-09T08:00:00',
      endTime: '2026-12-09T08:50:00',
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        durationCode: '1_month',
        seriesMode: 'cadence_duration',
        endDate: '2027-01-08',
        scheduleEntries: schedules.map(cs => ({
          classScheduleId: cs.id,
          weekday: cs.day_of_week,
          startTime: cs.start_time.slice(0, 5),
          endTime: cs.end_time.slice(0, 5),
          professionalId: cs.professional_id,
          coInstructorIds: ['prof-bruno'],
          modality: 'presential'
        }))
      }
    }
  });
  assert.equal(monthlyRecurringRes.status, 201, `Erro ao criar contratação mensal 2x/semana: ${JSON.stringify(monthlyRecurringRes.body)}`);
  const monthlyPlanId = monthlyRecurringRes.body.billingPlanId;
  assert.ok(monthlyPlanId, 'Deve retornar billingPlanId');
  assert.ok(monthlyRecurringRes.body.createdCount >= 8, `Esperado >= 8 aulas em 1 mês 2x/semana, criado: ${monthlyRecurringRes.body.createdCount}`);

  // Verificar vínculo bidirecional entre recurring_billing_plans e class_series + zero cobranças avulsas por aula
  const monthlyPlanRow = db.prepare(`SELECT * FROM recurring_billing_plans WHERE id = ?`).get(monthlyPlanId);
  assert.equal(monthlyPlanRow.series_id, monthlyRecurringRes.body.seriesId, 'Plano deve referenciar series_id');
  assert.equal(Number(monthlyPlanRow.weekly_frequency), 2, 'Frequência semanal deve ser 2x/semana');
  const perAppointmentPaidCharges = db.prepare(`
    SELECT COUNT(*) as cnt FROM payments
    WHERE patient_id = 'student-1' AND appointment_id IS NOT NULL AND amount > 0
  `).get().cnt;
  assert.equal(perAppointmentPaidCharges, 0, 'Nenhuma aula coberta pelo plano pode gerar cobrança avulsa > 0');

  // 6. Contratação Anual com aulas semanais durante 1 ano (NUNCA 1 aula por ano!) + cobranças trimestrais
  const annualRecurringRes = await callController(AppointmentController.createRecurring, {
    body: {
      patientId: 'student-2',
      professionalId: 'prof-ana',
      serviceId,
      appointmentPrice: 0,
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'quarterly',
        amount: 890,
        dueDay: 15,
        startDate: '2027-02-01',
        endDate: '2028-02-01',
        paymentMethod: 'credit_card',
        generateInitialCycle: true,
        generateAllContractCycles: true,
        initialPaymentStatus: 'pending'
      },
      startTime: '2027-02-01T08:00:00',
      endTime: '2027-02-01T08:50:00',
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        durationCode: '12_months',
        seriesMode: 'cadence_duration',
        endDate: '2028-02-01',
        scheduleEntries: [
          {
            classScheduleId: schedules[0].id,
            weekday: schedules[0].day_of_week,
            startTime: '08:00',
            endTime: '08:50',
            professionalId: 'prof-ana',
            coInstructorIds: ['prof-bruno'],
            modality: 'presential'
          }
        ]
      }
    }
  });
  assert.equal(annualRecurringRes.status, 201, `Erro no contrato anual: ${JSON.stringify(annualRecurringRes.body)}`);
  assert.ok(annualRecurringRes.body.createdCount >= 50, `Contrato anual semanal deve gerar >= 50 aulas no ano, gerou ${annualRecurringRes.body.createdCount}`);
  const quarterlyChargesCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM payments WHERE recurring_plan_id = ?
  `).get(annualRecurringRes.body.billingPlanId).cnt;
  assert.ok(quarterlyChargesCount >= 4, `Esperado >= 4 competências trimestrais no contrato anual, encontrou ${quarterlyChargesCount}`);

  // 7. Agendamento utilizando contratação existente (Opção A)
  const reusePlanRes = await callController(AppointmentController.create, {
    body: {
      patientId: 'student-1',
      professionalId: 'prof-ana',
      serviceId,
      appointmentPrice: 0,
      billingChoice: 'existing_plan',
      billingPlanId: monthlyPlanId,
      startTime: '2026-12-11T10:00:00',
      endTime: '2026-12-11T10:50:00',
      isCustomTime: true,
      modality: 'presential'
    }
  });
  assert.equal(reusePlanRes.status, 201, `Erro ao usar plano existente: ${JSON.stringify(reusePlanRes.body)}`);
  const reusedAppt = db.prepare(`SELECT recurring_plan_id FROM appointments WHERE id = ?`).get(reusePlanRes.body.id);
  assert.equal(reusedAppt.recurring_plan_id, monthlyPlanId, 'Agendamento deve ficar vinculado ao plano existente');

  // 8. Validar limite de vagas da turma (capacity = 2) e bloqueio de duplicidade do mesmo aluno
  // Em 2026-12-09T08:00:00 já temos student-1 inscrito. Vamos inscrever student-2 (2/2 vagas) e tentar student-3 (deve dar 409 CLASS_FULL).
  const dupStudentRes = await callController(AppointmentController.create, {
    body: {
      patientId: 'student-1',
      professionalId: 'prof-ana',
      serviceId,
      appointmentPrice: 0,
      billingChoice: 'existing_plan',
      billingPlanId: monthlyPlanId,
      startTime: '2026-12-09T08:00:00',
      endTime: '2026-12-09T08:50:00',
      modality: 'presential'
    }
  });
  assert.equal(dupStudentRes.status, 409, 'Mesmo aluno não pode ser agendado duas vezes na mesma ocorrência');

  const secondSeatRes = await callController(AppointmentController.create, {
    body: {
      patientId: 'student-2',
      professionalId: 'prof-ana',
      serviceId,
      appointmentPrice: 95,
      billingChoice: 'drop_in',
      startTime: '2026-12-09T08:00:00',
      endTime: '2026-12-09T08:50:00',
      modality: 'presential'
    }
  });
  assert.equal(secondSeatRes.status, 201, 'Segundo aluno deve preencher a 2ª vaga (2/2)');

  const overflowSeatRes = await callController(AppointmentController.create, {
    body: {
      patientId: 'student-3',
      professionalId: 'prof-ana',
      serviceId,
      appointmentPrice: 95,
      billingChoice: 'drop_in',
      startTime: '2026-12-09T08:00:00',
      endTime: '2026-12-09T08:50:00',
      modality: 'presential'
    }
  });
  assert.equal(overflowSeatRes.status, 409, 'Terceiro aluno deve ser bloqueado quando a turma (2 vagas) estiver lotada');

  // 9. Remarcação de aula coletiva (reschedule) movendo para nova class_occurrences e liberando vaga na turma anterior
  const moveSeatRes = await callController(AppointmentController.reschedule, {
    params: { id: secondSeatRes.body.id },
    body: {
      startTime: '2026-12-16T08:00:00',
      endTime: '2026-12-16T08:50:00'
    }
  });
  assert.equal(moveSeatRes.status, 200, `Erro ao remarcar aula de turma: ${JSON.stringify(moveSeatRes.body)}`);
  const oldOccId = secondSeatRes.body.occurrenceId;
  const newOccId = db.prepare(`SELECT occurrence_id FROM appointments WHERE id = ?`).get(secondSeatRes.body.id).occurrence_id;
  assert.ok(oldOccId && newOccId, 'Ocorrências antiga e nova devem existir');
  assert.notEqual(newOccId, oldOccId, 'Remarcação para outra data deve vincular o agendamento à class_occurrences da nova data');

  // 10. Plano de exercícios da aula: consultar, percorrer, trocar template apenas para a aula em andamento e criar novo template
  const rosterRes = await callController(ClassAttendanceController.getRoster, {
    user: { userId: 'inst1-user', role: 'professional', name: 'Instrutora Ana' },
    params: { occurrenceId: oldOccId }
  });
  assert.equal(rosterRes.status, 200);
  assert.ok(rosterRes.body.exercisePlan, 'Roster da aula deve trazer o Plano de exercícios da aula');
  assert.equal(rosterRes.body.exercisePlan.templateId, template1Id, 'Deve carregar automaticamente o template padrão do serviço');
  assert.ok(rosterRes.body.exercisePlan.workouts[0].exercises[0].gif_url || rosterRes.body.exercisePlan.workouts[0].exercises[0].fallback_url, 'Exercícios devem vir enriquecidos com mídia da biblioteca oficial');
  assert.equal(rosterRes.body.roster[0].recurring_plan_id, monthlyPlanId, 'Lista de chamada deve identificar o plano do aluno');

  // Recepcionista não pode editar plano de exercícios da aula
  const recepPlanEdit = await callController(ClassAttendanceController.updateOccurrenceExercisePlan, {
    user: { userId: 'recep-user', role: 'receptionist', name: 'Recepção Carla' },
    params: { occurrenceId: oldOccId },
    body: { action: 'switch_template', templateId: template2Id }
  });
  assert.equal(recepPlanEdit.status, 403, 'Recepção não deve poder alterar o plano de exercícios da aula');

  // Instrutora troca o template apenas para esta aula (template1 -> template2)
  const switchPlanRes = await callController(ClassAttendanceController.updateOccurrenceExercisePlan, {
    user: { userId: 'inst1-user', role: 'professional', name: 'Instrutora Ana' },
    params: { occurrenceId: oldOccId },
    body: { action: 'switch_template', templateId: template2Id }
  });
  assert.equal(switchPlanRes.status, 200);
  assert.equal(switchPlanRes.body.exercisePlan.templateId, template2Id, 'Aula atual deve passar a usar o template 2');

  // Verificar que outra aula da mesma série continua com o template padrão (template 1) e o serviço não foi alterado
  const otherOccPlanRes = await callController(ClassAttendanceController.getOccurrenceExercisePlan, {
    user: { userId: 'inst1-user', role: 'professional', name: 'Instrutora Ana' },
    params: { occurrenceId: newOccId }
  });
  assert.equal(otherOccPlanRes.status, 200);
  assert.equal(otherOccPlanRes.body.exercisePlan.templateId, template1Id, 'Outras aulas devem manter o template padrão do serviço');

  // Marcar progresso de execução dos exercícios na aula
  const execUpdateRes = await callController(ClassAttendanceController.updateOccurrenceExercisePlan, {
    user: { userId: 'inst1-user', role: 'professional', name: 'Instrutora Ana' },
    params: { occurrenceId: oldOccId },
    body: {
      action: 'update_execution',
      executionState: {
        currentDivisionIdx: 0,
        currentExerciseIdx: 0,
        completedExerciseKeys: ['0:0'],
        sessionNotes: 'Turma executou com ótima estabilidade escapular'
      }
    }
  });
  assert.equal(execUpdateRes.status, 200);
  assert.deepEqual(execUpdateRes.body.exercisePlan.executionState.completedExerciseKeys, ['0:0']);

  // Criar novo template diretamente durante a aula e salvar na biblioteca
  const createDuringClassRes = await callController(ClassAttendanceController.updateOccurrenceExercisePlan, {
    user: { userId: 'inst1-user', role: 'professional', name: 'Instrutora Ana' },
    params: { occurrenceId: oldOccId },
    body: {
      action: 'create_and_apply_template',
      title: 'Pilates Mobilidade Express',
      goal: 'Mobilidade',
      structure_type: 'Livre',
      linkToService: true,
      workouts: [
        {
          label: 'Único',
          name: 'Mobilidade Torácica e Quadril',
          exercises: [
            { exercise_id: 'ex-001', exercise_name: 'Agachamento Livre com Barra', sets: 2, reps: '10', rest_seconds: 30 }
          ]
        }
      ]
    }
  });
  assert.equal(createDuringClassRes.status, 200);
  assert.equal(createDuringClassRes.body.exercisePlan.title, 'Pilates Mobilidade Express');

  // 11. Presença, falta e relatórios: registrar presença e falta sem alterar cobranças periódicas
  const student1ApptOnOldOcc = rosterRes.body.roster[0].appointment_id;
  const markPresentRes = await callController(ClassAttendanceController.markAttendance, {
    user: { userId: 'inst1-user', role: 'professional', name: 'Instrutora Ana' },
    params: { occurrenceId: oldOccId, appointmentId: student1ApptOnOldOcc },
    body: { attendanceStatus: 'present' }
  });
  assert.equal(markPresentRes.status, 200);

  // Confirmar que o pagamento pago no plano NÃO marcou presença nas demais aulas futuras (continuam pending)
  const pendingAttendanceCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM appointments
    WHERE patient_id = 'student-1' AND recurring_plan_id = ? AND id != ? AND COALESCE(attendance_status, 'pending') = 'pending'
  `).get(monthlyPlanId, student1ApptOnOldOcc).cnt;
  assert.ok(pendingAttendanceCount >= 7, 'Pagamento confirmado jamais deve marcar presença automática nas aulas futuras');

  // Relatório de frequência deve exibir o resumo de contrato do aluno e ambos os instrutores (titular e coinstrutor)
  const reportRes = await callController(ClassAttendanceController.getAttendanceReports, {
    query: { startDate: '2026-12-01', endDate: '2027-01-31' }
  });
  assert.equal(reportRes.status, 200);
  const st1Report = reportRes.body.byStudent.find(s => s.patient_id === 'student-1');
  assert.ok(st1Report && st1Report.contract_summary.includes('Aula de Pilates Studio'), 'Relatório por aluno deve identificar o contrato ativo');
  const instructorIdsInReport = reportRes.body.byInstructor.map(i => i.professional_id);
  assert.ok(instructorIdsInReport.includes('prof-ana') && instructorIdsInReport.includes('prof-bruno'), 'Relatório por instrutor deve considerar titular e coinstrutores');

  // 12. Alterar horário futuro do contrato, renovar contrato e encerrar preservando histórico
  const rescheduleContractRes = await callController(BillingCenterController.rescheduleContractClasses, {
    params: { id: monthlyPlanId },
    body: {
      fromDate: '2026-12-20',
      newStartTime: '09:00',
      newEndTime: '09:50',
      reason: 'Aluna mudou para o horário das 09h em dezembro'
    }
  });
  assert.equal(rescheduleContractRes.status, 200, `Erro ao alterar horário futuro do contrato: ${JSON.stringify(rescheduleContractRes.body)}`);
  assert.ok(rescheduleContractRes.body.rescheduledCount >= 1, 'Deve remarcar as aulas futuras a partir de 01/12');

  const renewRes = await callController(BillingCenterController.renewRecurringPlan, {
    params: { id: monthlyPlanId },
    body: {
      durationMonths: 1,
      generateAllContractCycles: true
    }
  });
  assert.equal(renewRes.status, 200, `Erro ao renovar contrato: ${JSON.stringify(renewRes.body)}`);
  assert.ok(renewRes.body.generatedPaymentIds.length >= 1, 'Renovação deve gerar a nova competência financeira');

  const historyRes = await callController(BillingCenterController.getContractHistory, {
    params: { id: monthlyPlanId }
  });
  assert.equal(historyRes.status, 200);
  const actions = historyRes.body.history.map(h => h.action);
  assert.ok(
    actions.includes('CREATE_CONTRACT') && actions.includes('RESCHEDULE_CONTRACT_CLASSES') && actions.includes('RENEW_CONTRACT'),
    `Histórico deve registrar CREATE_CONTRACT, RESCHEDULE_CONTRACT_CLASSES e RENEW_CONTRACT. Encontrado: ${actions.join(', ')}`
  );

  // Cancelar contrato futuro preservando presença já registrada e pagamento pago
  const cancelContractRes = await callController(BillingCenterController.updateRecurringPlan, {
    params: { id: monthlyPlanId },
    body: {
      status: 'cancelled',
      statusReason: 'Solicitação da aluna',
      cancelFutureAppointments: true,
      cancelFuturePendingPayments: true
    }
  });
  assert.equal(cancelContractRes.status, 200);
  const preservedPresentAppt = db.prepare(`SELECT attendance_status FROM appointments WHERE id = ?`).get(student1ApptOnOldOcc);
  assert.equal(preservedPresentAppt.attendance_status, 'present', 'Cancelamento do contrato deve preservar o histórico de presença já realizada');
  const preservedPaidPayment = db.prepare(`SELECT COUNT(*) as cnt FROM payments WHERE recurring_plan_id = ? AND status = 'paid'`).get(monthlyPlanId).cnt;
  assert.ok(preservedPaidPayment >= 1, 'Cancelamento do contrato deve preservar cobranças já pagas');

  console.log('✅ TODOS OS 12 BLOCOS DE TESTES DE INTEGRAÇÃO DO ZEMDA STUDIO PASSARAM COM SUCESSO!');
}

runTests()
  .then(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Falha nos testes:', err);
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    process.exit(1);
  });
