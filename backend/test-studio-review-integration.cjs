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

  // 13. Padronização da Periodicidade Financeira (Bimestral, Bienal, Data final personalizada, Quantidade fixa de aulas e independência da Duração do Plano)
  // 13a. Duração Anual (12 meses) + Pagamento Bimestral (a cada 2 meses) -> 6 competências bimestrais exatas
  const bimonthlyPlanRes = await callController(BillingCenterController.createRecurringPlan, {
    body: {
      patientId: 'student-3',
      serviceId,
      professionalId: 'prof-ana',
      title: 'Contrato Anual c/ Pagamento Bimestral',
      amount: 600,
      billingFrequency: 'bimonthly',
      dueDay: 10,
      startDate: '2027-01-01',
      endDate: '2027-12-31',
      generateAllContractCycles: true
    }
  });
  assert.equal(bimonthlyPlanRes.status, 201, `Erro ao criar plano bimestral: ${JSON.stringify(bimonthlyPlanRes.body)}`);
  assert.equal(bimonthlyPlanRes.body.generatedPaymentIds.length, 6, 'Plano anual com periodicidade bimestral (2 meses) deve gerar exatamente 6 cobranças');
  const bimonthlyPayments = db.prepare(`
    SELECT competence_month, billing_cycle_start, billing_cycle_end, due_date
    FROM payments WHERE recurring_plan_id = ? ORDER BY billing_cycle_start ASC
  `).all(bimonthlyPlanRes.body.plan.id);
  assert.deepEqual(
    bimonthlyPayments.map(p => p.competence_month),
    ['2027-01', '2027-03', '2027-05', '2027-07', '2027-09', '2027-11'],
    'Competências bimestrais devem avançar de 2 em 2 meses'
  );

  // 13b. Duração Bienal (24 meses) + Pagamento Bienal (24 meses) -> 1 competência bienal de 24 meses
  const biennialPlanRes = await callController(BillingCenterController.createRecurringPlan, {
    body: {
      patientId: 'student-3',
      serviceId,
      professionalId: 'prof-ana',
      title: 'Contrato Bienal 24 Meses',
      amount: 5400,
      billingFrequency: 'biennial',
      dueDay: 15,
      startDate: '2027-01-01',
      endDate: '2028-12-31',
      generateAllContractCycles: true
    }
  });
  assert.equal(biennialPlanRes.status, 201, `Erro ao criar plano bienal: ${JSON.stringify(biennialPlanRes.body)}`);
  assert.equal(biennialPlanRes.body.generatedPaymentIds.length, 1, 'Plano de 24 meses com periodicidade bienal deve gerar exatamente 1 cobrança');
  const biennialPay = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(biennialPlanRes.body.generatedPaymentIds[0]);
  assert.equal(biennialPay.billing_cycle_start, '2027-01-01');
  assert.equal(biennialPay.billing_cycle_end, '2028-12-31');

  // 13c. Periodicidade "Data final personalizada" (custom_date): valida data final obrigatória e gera exatamente N cobranças
  const invalidCustomDateRes = await callController(BillingCenterController.createRecurringPlan, {
    body: {
      patientId: 'student-3',
      serviceId,
      professionalId: 'prof-ana',
      title: 'Plano Data Inválida',
      amount: 400,
      billingFrequency: 'custom_date',
      startDate: '2027-05-10',
      billingCustomEndDate: '2027-05-01' // anterior ao início -> deve falhar com 400
    }
  });
  assert.equal(invalidCustomDateRes.status, 400, 'Deve rejeitar periodicidade custom_date com data final anterior à inicial');

  const validCustomDateRes = await callController(BillingCenterController.createRecurringPlan, {
    body: {
      patientId: 'student-3',
      serviceId,
      professionalId: 'prof-ana',
      title: 'Plano Temporada Especial',
      amount: 350,
      billingFrequency: 'custom_date',
      dueDay: 10,
      startDate: '2027-03-01',
      billingCustomEndDate: '2027-05-20',
      billingChargesCount: 3,
      generateAllContractCycles: true
    }
  });
  assert.equal(validCustomDateRes.status, 201, `Erro em custom_date válido: ${JSON.stringify(validCustomDateRes.body)}`);
  assert.equal(validCustomDateRes.body.generatedPaymentIds.length, 3, 'Periodicidade custom_date com 3 cobranças deve gerar exatamente 3 cobranças');

  // 13d. Periodicidade "Quantidade fixa de aulas" (count): valida includedSessions obrigatório e gera exatamente N cobranças
  const invalidFixedCountRes = await callController(BillingCenterController.createRecurringPlan, {
    body: {
      patientId: 'student-3',
      serviceId,
      professionalId: 'prof-ana',
      title: 'Plano Sem Quantidade',
      amount: 400,
      billingFrequency: 'count',
      startDate: '2027-06-01'
    }
  });
  assert.equal(invalidFixedCountRes.status, 400, 'Deve rejeitar periodicidade count sem includedSessions');

  const validFixedCountRes = await callController(BillingCenterController.createRecurringPlan, {
    body: {
      patientId: 'student-3',
      serviceId,
      professionalId: 'prof-ana',
      title: 'Pacote Financeiro 10 Aulas',
      amount: 450,
      billingFrequency: 'count',
      includedSessions: 10,
      billingChargesCount: 2,
      dueDay: 12,
      startDate: '2027-06-01',
      generateAllContractCycles: true
    }
  });
  assert.equal(validFixedCountRes.status, 201, `Erro em count válido: ${JSON.stringify(validFixedCountRes.body)}`);
  assert.equal(validFixedCountRes.body.generatedPaymentIds.length, 2, 'Periodicidade count com 2 cobranças deve gerar exatamente 2 cobranças');
  assert.equal(Number(validFixedCountRes.body.plan.included_sessions), 10, 'Plano deve persistir included_sessions = 10');

  // =========================================================================
  // 14. DISPONIBILIDADE DE VAGAS EM TURMAS COLETIVAS E RECORRÊNCIA (10 CENÁRIOS)
  // =========================================================================
  console.log('14. Testando disponibilidade de vagas em turmas coletivas e recorrência (Cenários A a E + 10 validações)...');

  // Cria alunos adicionais para testar turma coletiva (prof-bruno e schedules já existem em studio-tenant)
  const studioTenantId = 'studio-tenant';
  for (let i = 4; i <= 7; i++) {
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone)
      VALUES (?, ?, ?, ?)
    `).run(`student-${i}`, studioTenantId, `Aluno Turma ${i}`, `1199999000${i}`);
  }

  // Cria serviço coletivo "Pilates Coletivo 15h" (Seg e Qua 15:00 às 15:55, capacidade 3, múltiplos instrutores)
  const createGroup15hRes = await callController(ServiceController.create, {
    body: {
      name: 'Pilates Coletivo 15h',
      durationMinutes: 55,
      price: 90,
      modality: 'presential',
      serviceKind: 'group',
      serviceDomain: 'studio',
      defaultCapacity: 3,
      professionalId: 'prof-ana',
      linkedProfessionalIds: ['prof-ana', 'prof-bruno'],
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom_weekdays', 'custom_interval'],
      defaultRecurrenceFrequency: 'weekly',
      allowedPlanDurations: ['1_month', '2_months', '3_months', '6_months', '12_months', '24_months', 'custom_date', 'count'],
      defaultPlanDuration: '1_month',
      billingMode: 'monthly',
      periodicPrice: 360,
      defaultBillingDueDay: 10,
      classSchedules: [
        {
          dayOfWeek: 1,
          startTime: '15:00',
          endTime: '15:55',
          professionalId: 'prof-ana',
          coInstructorIds: ['prof-bruno'],
          capacity: 3,
          modality: 'presential',
          effectiveStartDate: '2026-01-01'
        },
        {
          dayOfWeek: 3,
          startTime: '15:00',
          endTime: '15:55',
          professionalId: 'prof-ana',
          coInstructorIds: ['prof-bruno'],
          capacity: 3,
          modality: 'presential',
          effectiveStartDate: '2026-01-01'
        }
      ]
    }
  });
  assert.equal(createGroup15hRes.status, 201, `Erro ao criar turma 15h: ${JSON.stringify(createGroup15hRes.body)}`);
  const group15hServiceId = createGroup15hRes.body.id;
  const group15hSchedules = createGroup15hRes.body.class_schedules || [];
  assert.equal(group15hSchedules.length, 2, 'Deve ter criado 2 horários na grade semanal (Seg e Qua 15:00-15:55)');
  const mon15hSched = group15hSchedules.find(s => Number(s.day_of_week) === 1);
  const wed15hSched = group15hSchedules.find(s => Number(s.day_of_week) === 3);

  // Aluno 4 contrata recorrência nas segundas-feiras de 2027-08-02 a 2027-09-02 (5 segundas-feiras: 02, 09, 16, 23, 30/08)
  const student4MonRec = await callController(AppointmentController.createRecurring, {
    body: {
      patientId: 'student-4',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      startTime: '2027-08-02T15:00:00',
      endTime: '2027-08-02T15:55:00',
      modality: 'presential',
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'monthly',
        amount: 360,
        dueDay: 10,
        startDate: '2027-08-02',
        endDate: '2027-09-02',
        generateInitialCycle: true,
        initialPaymentStatus: 'paid'
      },
      recurrence: {
        frequency: 'weekly',
        durationCode: '1_month',
        seriesMode: 'schedule_plan',
        scheduleEntries: [
          {
            classScheduleId: mon15hSched.id,
            dayOfWeek: 1,
            startTime: '15:00',
            endTime: '15:55',
            professionalId: 'prof-ana',
            coInstructorIds: ['prof-bruno'],
            modality: 'presential'
          }
        ]
      }
    }
  });
  assert.equal(student4MonRec.status, 201, `Erro ao inscrever Aluno 4 nas segundas: ${JSON.stringify(student4MonRec.body)}`);
  assert.equal(student4MonRec.body.createdCount, 5, 'Aluno 4 deve ter 5 aulas nas segundas-feiras');

  // Cenário do print: Aluno 5 tenta agendar recorrência semanal em Seg e Qua (15:00 às 15:55), vigência mensal (9 aulas: 5 Seg + 4 Qua)
  // Mesmo com Aluno 4 já inscrito nas 5 segundas-feiras, TODAS as 9/9 aulas devem estar disponíveis (com 2 vagas restantes nas segundas e 3 nas quartas)!
  const previewStudent5MonWed = await callController(AppointmentController.previewRecurring, {
    body: {
      patientId: 'student-5',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      classScheduleId: wed15hSched.id,
      startTime: '2027-08-02T15:00:00',
      endTime: '2027-08-02T15:55:00',
      modality: 'presential',
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        weekdays: [1, 3]
      }
    }
  });
  assert.equal(previewStudent5MonWed.status, 200, `Erro no preview Seg+Qua: ${JSON.stringify(previewStudent5MonWed.body)}`);
  assert.equal(previewStudent5MonWed.body.totalCount, 10, 'Série mensal Seg+Qua de 02/08/2027 a 02/09/2027 deve prever 10 aulas (5 Seg + 5 Qua)');
  assert.equal(previewStudent5MonWed.body.availableCount, 10, `Todas as 10/10 aulas devem estar disponíveis (recebido ${previewStudent5MonWed.body.availableCount}/10: ${JSON.stringify(previewStudent5MonWed.body.occurrences.filter(o => !o.available))})`);
  assert.equal(previewStudent5MonWed.body.valid, true, 'Preview deve ser válido (10/10 disponíveis)');
  const monOccPreview = previewStudent5MonWed.body.occurrences.find(o => o.dayOfWeek === 1);
  const wedOccPreview = previewStudent5MonWed.body.occurrences.find(o => o.dayOfWeek === 3);
  assert.equal(monOccPreview.remainingSpots, 2, 'Segundas-feiras devem ter 2 vagas restantes (1/3 ocupada pelo Aluno 4)');
  assert.equal(monOccPreview.statusLabel, 'Disponível — 2 vagas restantes', 'Status da segunda-feira deve ser "Disponível — 2 vagas restantes"');
  assert.equal(wedOccPreview.remainingSpots, 3, 'Quartas-feiras devem ter 3 vagas restantes (0/3 ocupadas)');
  assert.equal(wedOccPreview.statusLabel, 'Disponível — 3 vagas restantes', 'Status da quarta-feira deve ser "Disponível — 3 vagas restantes"');

  // Confirma a inscrição recorrente do Aluno 5 (Seg e Qua, cobrança trimestral) e verifica reutilização das ocorrências existentes sem duplicar turmas
  const bookStudent5MonWed = await callController(AppointmentController.createRecurring, {
    body: {
      patientId: 'student-5',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      startTime: '2027-08-02T15:00:00',
      endTime: '2027-08-02T15:55:00',
      modality: 'presential',
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'quarterly',
        amount: 960,
        dueDay: 10,
        startDate: '2027-08-02',
        endDate: '2027-09-02',
        generateInitialCycle: true,
        initialPaymentStatus: 'pending'
      },
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '1_month',
        weekdays: [1, 3]
      }
    }
  });
  assert.equal(bookStudent5MonWed.status, 201, `Erro ao confirmar série Seg+Qua do Aluno 5: ${JSON.stringify(bookStudent5MonWed.body)}`);
  assert.equal(bookStudent5MonWed.body.createdCount, 10, 'Deve criar 10 agendamentos para o Aluno 5');

  // Verifica que na segunda-feira 2027-08-02 existe apenas UMA class_occurrences compartilhada por Aluno 4 e Aluno 5
  const occsAug02 = db.prepare(`
    SELECT id FROM class_occurrences
    WHERE tenant_id = ? AND service_id = ? AND REPLACE(substr(start_time, 1, 16), ' ', 'T') = '2027-08-02T15:00' AND status != 'cancelled'
  `).all(studioTenantId, group15hServiceId);
  assert.equal(occsAug02.length, 1, 'Não deve duplicar class_occurrences para o mesmo horário da turma');
  const sharedOccAug02Id = occsAug02[0].id;
  const apptsInSharedOcc = db.prepare(`
    SELECT patient_id FROM appointments WHERE tenant_id = ? AND occurrence_id = ? AND status != 'cancelled'
  `).all(studioTenantId, sharedOccAug02Id);
  assert.equal(apptsInSharedOcc.length, 2, 'Os 2 alunos devem estar vinculados à mesma ocorrência em 2027-08-02');

  // Verifica participantes (múltiplos instrutores: titular prof-ana + coinstrutor prof-bruno) na ocorrência compartilhada
  const occParticipants = db.prepare(`
    SELECT professional_id, role FROM session_instructor_participants WHERE tenant_id = ? AND occurrence_id = ?
  `).all(studioTenantId, sharedOccAug02Id);
  assert.ok(occParticipants.some(p => p.professional_id === 'prof-ana' && p.role === 'primary'), 'Titular prof-ana presente na ocorrência');
  assert.ok(occParticipants.some(p => p.professional_id === 'prof-bruno' && p.role === 'co_instructor'), 'Coinstrutor prof-bruno presente na ocorrência');

  // Cenário D — Mesmo aluno já inscrito: Aluno 5 tenta se inscrever novamente em 2027-08-02T15:00
  const dupPreviewRes = await callController(AppointmentController.previewRecurring, {
    body: {
      patientId: 'student-5',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      startTime: '2027-08-02T15:00:00',
      endTime: '2027-08-02T15:55:00',
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        durationCode: 'count',
        maxOccurrences: 2
      }
    }
  });
  assert.equal(dupPreviewRes.status, 200);
  assert.equal(dupPreviewRes.body.valid, false, 'Preview deve bloquear inscrição duplicada do mesmo aluno');
  assert.equal(dupPreviewRes.body.occurrences[0].reasonCode, 'ALREADY_ENROLLED', 'Código deve ser ALREADY_ENROLLED');
  assert.equal(dupPreviewRes.body.occurrences[0].reasonMessage, 'Aluno já inscrito', 'Mensagem deve ser "Aluno já inscrito"');
  assert.equal(dupPreviewRes.body.occurrences[0].statusLabel, 'Aluno já inscrito', 'StatusLabel deve ser "Aluno já inscrito"');

  const dupSingleRes = await callController(AppointmentController.create, {
    body: {
      patientId: 'student-5',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      startTime: '2027-08-02T15:00:00',
      endTime: '2027-08-02T15:55:00',
      modality: 'presential'
    }
  });
  assert.equal(dupSingleRes.status, 409, 'Agendamento avulso duplicado na mesma turma deve retornar 409');
  assert.equal(dupSingleRes.body.code, 'ALREADY_ENROLLED', 'Código de bloqueio duplicado deve ser ALREADY_ENROLLED');

  // Aluno 6 preenche a 3ª e última vaga de 2027-08-02T15:00 (com contrato anual)
  const student6BookRes = await callController(AppointmentController.create, {
    body: {
      patientId: 'student-6',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      startTime: '2027-08-02T15:00:00',
      endTime: '2027-08-02T15:55:00',
      modality: 'presential',
      billingChoice: 'enroll_periodic',
      enrollBillingPlan: {
        billingFrequency: 'annual',
        amount: 3600,
        dueDay: 10,
        startDate: '2027-08-02',
        endDate: '2028-08-02',
        generateInitialCycle: true,
        initialPaymentStatus: 'paid'
      }
    }
  });
  assert.equal(student6BookRes.status, 201, `Aluno 6 deve ocupar a 3ª vaga: ${JSON.stringify(student6BookRes.body)}`);
  assert.equal(student6BookRes.body.occurrenceId, sharedOccAug02Id, 'Aluno 6 deve compartilhar a mesma occurrenceId');

  // Cenário B — Turma lotada (3/3 vagas ocupadas em 2027-08-02T15:00): Aluno 7 tenta agendar
  const fullPreviewRes = await callController(AppointmentController.previewRecurring, {
    body: {
      patientId: 'student-7',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      startTime: '2027-08-02T15:00:00',
      endTime: '2027-08-02T15:55:00',
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        durationCode: 'count',
        maxOccurrences: 2
      }
    }
  });
  assert.equal(fullPreviewRes.status, 200);
  assert.equal(fullPreviewRes.body.occurrences[0].available, false, '02/08 deve estar indisponível (lotada 3/3)');
  assert.equal(fullPreviewRes.body.occurrences[0].reasonCode, 'CLASS_FULL', 'Código deve ser CLASS_FULL');
  assert.equal(fullPreviewRes.body.occurrences[0].reasonMessage, 'Turma lotada', 'Mensagem deve ser "Turma lotada"');
  assert.equal(fullPreviewRes.body.occurrences[0].statusLabel, 'Turma lotada', 'StatusLabel deve ser "Turma lotada"');
  assert.equal(fullPreviewRes.body.occurrences[1].available, true, '09/08 deve estar disponível (2/3 ocupadas -> 1 vaga restante)');
  assert.equal(fullPreviewRes.body.occurrences[1].statusLabel, 'Disponível — 1 vaga restante', 'StatusLabel de 09/08 deve ser "Disponível — 1 vaga restante"');

  const fullSingleRes = await callController(AppointmentController.create, {
    body: {
      patientId: 'student-7',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      startTime: '2027-08-02T15:00:00',
      endTime: '2027-08-02T15:55:00',
      modality: 'presential'
    }
  });
  assert.equal(fullSingleRes.status, 409, 'Agendamento avulso em turma lotada deve retornar 409');
  assert.equal(fullSingleRes.body.code, 'CLASS_FULL', 'Código deve ser CLASS_FULL');

  // Cenário C — Instrutor ocupado em OUTRO atendimento individual conflitante (em 2027-08-11T15:00)
  const createIndivSrvRes = await callController(ServiceController.create, {
    body: {
      name: 'Avaliação Postural Individual',
      durationMinutes: 55,
      price: 150,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      professionalId: 'prof-ana'
    }
  });
  const indivSrvId = createIndivSrvRes.body.id;
  db.prepare(`
    INSERT INTO appointments (
      id, tenant_id, appointment_number, patient_id, professional_id, service_id,
      start_time, end_time, status, modality, service_kind
    ) VALUES ('apt-indiv-conflict', ?, 'AG-2027-9999', 'student-7', 'prof-ana', ?, '2027-08-11T15:00:00', '2027-08-11T15:55:00', 'scheduled', 'presential', 'individual')
  `).run(studioTenantId, indivSrvId);

  const conflictPreviewRes = await callController(AppointmentController.previewRecurring, {
    body: {
      patientId: 'student-6',
      professionalId: 'prof-ana',
      serviceId: group15hServiceId,
      startTime: '2027-08-04T15:00:00',
      endTime: '2027-08-04T15:55:00',
      modality: 'presential',
      recurrence: {
        frequency: 'weekly',
        durationCode: 'count',
        maxOccurrences: 2
      }
    }
  });
  assert.equal(conflictPreviewRes.status, 200);
  assert.equal(conflictPreviewRes.body.occurrences[0].available, true, '04/08 (quarta) deve estar disponível');
  assert.equal(conflictPreviewRes.body.occurrences[1].available, false, '11/08 (quarta com atendimento individual conflitante) deve estar bloqueada');
  assert.equal(conflictPreviewRes.body.occurrences[1].reasonCode, 'PROFESSIONAL_CONFLICT', 'Código deve ser PROFESSIONAL_CONFLICT');
  assert.equal(conflictPreviewRes.body.occurrences[1].reasonMessage, 'Conflito com outro atendimento', 'Mensagem deve ser "Conflito com outro atendimento"');
  assert.equal(conflictPreviewRes.body.occurrences[1].statusLabel, 'Conflito com outro atendimento', 'StatusLabel deve ser "Conflito com outro atendimento"');

  // Verifica lista de chamada (getRoster) na ocorrência compartilhada de 2027-08-02 (3 alunos inscritos)
  const rosterAug02Res = await callController(ClassAttendanceController.getRoster, {
    params: { occurrenceId: sharedOccAug02Id }
  });
  assert.equal(rosterAug02Res.status, 200);
  assert.equal(rosterAug02Res.body.roster.length, 3, 'Lista de presença da turma de 02/08 deve listar todos os 3 alunos inscritos');

  console.log('✅ TODOS OS 14 BLOCOS DE TESTES DE INTEGRAÇÃO DO ZEMDA STUDIO PASSARAM COM SUCESSO!');
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
