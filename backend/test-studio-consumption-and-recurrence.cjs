const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'zemda-consumption-')), 'test.db');
process.env.DATABASE_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-studio-consumption-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-consumption-files-2026';
let TEST_PORT = 0;
process.env.PORT = String(TEST_PORT);

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
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 700) : ''}`);
    failed++;
    throw new Error(msg);
  }
}

function makeReq(method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
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
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {}, raw: data });
          } catch {
            resolve({ status: res.statusCode, data, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

function getFutureWeekdayIso(targetDow, minDaysAhead = 7) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + minDaysAhead, 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + diff);
  return base.toISOString().slice(0, 10);
}

async function runTests() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  TEST_PORT = server.address().port;

  console.log('\n=========================================================================================');
  console.log('TESTES: SIMPLIFICAÇÃO DE RECORRÊNCIA STUDIO + CONSUMO DOS ALUNOS (FINANCEIRO & ESTOQUE)');
  console.log('=========================================================================================\n');

  try {
    // 1. Seed 3 tenants: Studio, Misto, Clínica Tradicional
    const studioId = 'ten-st-' + uuidv4().slice(0, 6);
    const mixedId = 'ten-mx-' + uuidv4().slice(0, 6);
    const clinicId = 'ten-cl-' + uuidv4().slice(0, 6);

    let profType = db.prepare(`SELECT id FROM professions WHERE lower(name) = lower('Educação Física')`).get()?.id;
    if (!profType) {
      profType = 'prof-type-' + uuidv4().slice(0, 6);
      db.prepare(`INSERT OR IGNORE INTO professions (id, name) VALUES (?, 'Educação Física')`).run(profType);
    }

    const hours = JSON.stringify({
      monday: { enabled: true, open: '06:00', close: '22:00' },
      tuesday: { enabled: true, open: '06:00', close: '22:00' },
      wednesday: { enabled: true, open: '06:00', close: '22:00' },
      thursday: { enabled: true, open: '06:00', close: '22:00' },
      friday: { enabled: true, open: '06:00', close: '22:00' },
      saturday: { enabled: true, open: '08:00', close: '18:00' },
      sunday: { enabled: false, open: '08:00', close: '12:00' }
    });

    for (const [id, slug, name, email, profile] of [
      [studioId, 'studio-consumo-' + uuidv4().slice(0, 4), 'Studio Zen Movimento', 'studio@cons.test', 'studio'],
      [mixedId, 'misto-consumo-' + uuidv4().slice(0, 4), 'Espaço Misto Saúde & Studio', 'misto@cons.test', 'mixed'],
      [clinicId, 'clinica-cons-' + uuidv4().slice(0, 4), 'Clínica Médica Padrão', 'clinica@cons.test', 'clinic']
    ]) {
      db.prepare(`
        INSERT INTO tenants (
          id, name, trade_name, slug, email, establishment_profile, public_booking_enabled,
          status, billing_required, onboarding_completed, business_hours_json
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 'active', 0, 1, ?)
      `).run(id, name, name, slug, email, profile, hours);
    }

    const createUser = (tenantId, role, name, email, perms = []) => {
      const uid = 'usr-' + uuidv4().slice(0, 6);
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'hash', ?, 'active')`)
        .run(uid, tenantId, name, email, role);
      db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, ?, 'active', ?, ?)`)
        .run('cu-' + uuidv4().slice(0, 6), tenantId, uid, role, role === 'clinic_admin' ? 1 : 0, JSON.stringify(perms));
      const token = generateToken({ userId: uid, email, role, tenantId, name });
      return { uid, token, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId } };
    };

    const stAdmin = createUser(studioId, 'clinic_admin', 'Gestor Studio', 'gestor.studio@test.com');
    const stNoPermStaff = createUser(studioId, 'professional', 'Instrutor Sem Consumo', 'sem.cons@test.com', ['view_schedule', 'view_inventory', 'manage_inventory']);
    const stAuthStaff = createUser(studioId, 'professional', 'Instrutor Autorizado', 'com.cons@test.com', ['view_schedule', 'create_student_consumption']);
    const mxAdmin = createUser(mixedId, 'clinic_admin', 'Gestor Misto', 'gestor.misto@test.com');
    const clAdmin = createUser(clinicId, 'clinic_admin', 'Gestor Clínica', 'gestor.clinica@test.com');

    // Criar instrutores e alunos
    const profSt = 'prof-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled, remuneration_type, commission_percentage, fixed_salary)
      VALUES (?, ?, ?, 'Instrutora Carla', ?, ?, 'Instrutor', 1, 1, 'commission', 50, 0)
    `).run(profSt, studioId, stAuthStaff.uid, 'carla-' + uuidv4().slice(0, 4), profType);

    // Disponibilidade real da instrutora (Seg a Sex 08:00-18:00)
    for (const dow of [1, 2, 3, 4, 5]) {
      db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '08:00', '18:00', 1)`)
        .run('sch-' + uuidv4().slice(0, 6), studioId, profSt, dow);
    }

    const pat1 = 'pat-' + uuidv4().slice(0, 6);
    const pat2 = 'pat-' + uuidv4().slice(0, 6);
    const patMixed = 'pat-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, 'Aluno João Silva', '11999887766', '11122233344', datetime('now'))`).run(pat1, studioId);
    db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, 'Aluna Maria Souza', '11988776655', '22233344455', datetime('now'))`).run(pat2, studioId);
    db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, 'Aluno Misto Pedro', '11977665544', '33344455566', datetime('now'))`).run(patMixed, mixedId);

    // Mensalidade pendente de R$ 180,00 para João Silva (não deve ser alterada ao lançar ou quitar consumo!)
    const tuitionPayId = 'pay-tuition-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO payments (id, tenant_id, patient_id, amount, payment_method, status, due_date, notes)
      VALUES (?, ?, ?, 180.00, 'pix', 'pending', ?, 'Mensalidade Pilates Abril')
    `).run(tuitionPayId, studioId, pat1, getFutureWeekdayIso(1, 3));

    console.log('1) Recorrência Studio sem duplicação de dias (2 dias -> edit para 3 dias + aula individual)...');

    // Criar aula coletiva com 2 dias na grade (Seg e Qua 08:00)
    const grpCreate = await makeReq('POST', '/api/v1/services', stAdmin.headers, {
      professionalId: profSt,
      name: 'Pilates Studio Coletivo',
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 75,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 8,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'biweekly'],
      defaultRecurrenceFrequency: 'weekly',
      allowedPlanDurations: ['1_month', '3_months', '12_months'],
      defaultPlanDuration: '3_months',
      billingMode: 'monthly',
      pricingRule: 'four_weeks',
      frequencyPricing: {
        version: 1,
        enabled: true,
        unit: 'per_period',
        tables: { monthly: { 1: 26000, 2: 46000, 3: 62000 } }
      },
      classSchedules: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '08:50', professionalId: profSt, modality: 'presential', capacity: 8 },
        { dayOfWeek: 3, startTime: '08:00', endTime: '08:50', professionalId: profSt, modality: 'presential', capacity: 8 }
      ]
    });
    assert(
      grpCreate.status === 201 && JSON.stringify(grpCreate.data.allowed_recurrence_weekdays) === '[1,3]',
      'Aula coletiva com Seg e Qua deriva automaticamente [1, 3] da grade de turmas',
      grpCreate.data
    );
    const grpId = grpCreate.data.id;

    // Adicionar Sexta (5) diretamente à grade de turmas e atualizar serviço (3 dias semanais)
    const addFri = await makeReq('POST', `/api/v1/services/${grpId}/class-schedules`, stAdmin.headers, {
      weekdays: [5],
      startTime: '08:00',
      endTime: '08:50',
      professionalId: profSt,
      modality: 'presential',
      capacity: 8
    });
    assert(addFri.status === 201 || addFri.status === 200, 'Adicionar horário de Sexta na grade coletiva', addFri.data);

    const grpUpdate = await makeReq('PUT', `/api/v1/services/${grpId}`, stAdmin.headers, {
      name: 'Pilates Studio Coletivo 3x'
    });
    assert(
      grpUpdate.status === 200 && JSON.stringify(grpUpdate.data.allowed_recurrence_weekdays) === '[1,3,5]',
      'Editar serviço deriva automaticamente [1, 3, 5] após incluir Sexta na grade',
      grpUpdate.data
    );

    // Criar aula individual sem turmas coletivas e com plano de 12 meses mantendo ritmo semanal
    const indCreate = await makeReq('POST', '/api/v1/services', stAdmin.headers, {
      professionalId: profSt,
      name: 'Studio Personal Individual',
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 120,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'individual',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      allowedRecurrenceWeekdays: [1, 3],
      defaultRecurrenceFrequency: 'weekly',
      allowedPlanDurations: ['1_month', '12_months'],
      defaultPlanDuration: '12_months',
      billingMode: 'monthly',
      periodicPrice: 800,
      isPriceCustomized: true,
      weeklySessionsCount: 2
    });
    assert(
      indCreate.status === 201 && indCreate.data.service_kind === 'individual' && indCreate.data.default_plan_duration === '12_months',
      'Aula individual criada sem exigir turma coletiva e preservando vigência anual (12_months)',
      indCreate.data
    );

    // Verificar agendamento público coletivo usa os 3 dias da grade e plano de 12 meses gera aulas semanais
    const slugStudio = db.prepare('SELECT slug FROM tenants WHERE id = ?').get(studioId).slug;
    const pubSlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=${slugStudio}&serviceId=${grpId}&includeUpcoming=1`);
    assert(
      pubSlots.status === 200 && pubSlots.data.weeklySchedules.length === 3,
      'Agendamento público retorna os 3 encontros da grade coletiva',
      pubSlots.data
    );

    const startMon = getFutureWeekdayIso(1, 14);
    const entries2x = pubSlots.data.weeklySchedules
      .filter(cs => [1, 3].includes(cs.day_of_week))
      .map(cs => ({
        classScheduleId: cs.id,
        weekday: cs.day_of_week,
        startTime: cs.start_time,
        endTime: cs.end_time,
        professionalId: cs.professional_id,
        modality: 'presential'
      }));
    const endAnnual = new Date(`${startMon}T12:00:00Z`);
    endAnnual.setUTCMonth(endAnnual.getUTCMonth() + 12);
    const annualPreview = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: slugStudio,
      bookingIntent: 'recurring',
      serviceId: grpId,
      professionalId: profSt,
      classScheduleId: entries2x[0].classScheduleId,
      modality: 'presential',
      startTime: `${startMon}T08:00:00`,
      endTime: `${startMon}T08:50:00`,
      recurrence: {
        frequency: 'weekly',
        durationCode: '12_months',
        seriesMode: 'schedule_plan',
        scheduleEntries: entries2x,
        weekdays: [1, 3],
        endDate: endAnnual.toISOString().slice(0, 10)
      }
    });
    assert(
      annualPreview.status === 200 &&
      annualPreview.data.valid === true &&
      annualPreview.data.occurrences.length >= 90 &&
      annualPreview.data.pricing &&
      annualPreview.data.pricing.amount === 460 &&
      annualPreview.data.pricing.billingFrequency === 'monthly',
      'Contrato 12 meses continua gerando aulas semanais (~100 ocorrências) mantendo mensalidade R$ 460 para 2x/semana',
      { occCount: annualPreview.data?.occurrences?.length, pricing: annualPreview.data?.pricing }
    );

    console.log('\n2) Cadastro de Produtos no Estoque & Isolamento Clínico...');

    // Clínica tradicional bloqueada
    const clBlocked = await makeReq('GET', '/api/v1/studio/consumptions', clAdmin.headers);
    assert(clBlocked.status === 403, 'Clínica tradicional recebe 403 ao tentar acessar /v1/studio/consumptions', clBlocked);

    // Cadastrar produto de limpeza (NÃO comercializável por padrão)
    const cleanCreate = await makeReq('POST', '/api/v1/inventory', stAdmin.headers, {
      name: 'Desinfetante Uso Geral',
      category: 'escritorio',
      quantity: 15,
      unit: 'frasco',
      unitCost: 12.5
    });
    assert(cleanCreate.status === 201, 'Insumo comum cadastrado no estoque');
    const cleanRow = db.prepare('SELECT available_for_sale FROM inventory_items WHERE id = ?').get(cleanCreate.data.id);
    assert(Number(cleanRow.available_for_sale) === 0, 'Insumo comum vem com available_for_sale = 0 por padrão');

    // Cadastrar Água Mineral (comercializável R$ 5,00, estoque 20) e Barrinha de Proteína (comercializável R$ 8,00, estoque 10)
    const waterCreate = await makeReq('POST', '/api/v1/inventory', stAdmin.headers, {
      name: 'Água Mineral 500ml',
      category: 'escritorio',
      quantity: 20,
      unit: 'un',
      unitCost: 1.5,
      availableForSale: true,
      salePrice: 5.0,
      saleUnit: 'garrafa'
    });
    const barCreate = await makeReq('POST', '/api/v1/inventory', stAdmin.headers, {
      name: 'Barrinha de Proteína',
      category: 'escritorio',
      quantity: 10,
      unit: 'un',
      unitCost: 4.0,
      availableForSale: true,
      salePrice: 8.0,
      saleUnit: 'un'
    });
    assert(waterCreate.status === 201 && barCreate.status === 201, 'Produtos comercializáveis cadastrados no estoque');
    const waterId = waterCreate.data.id;
    const barId = barCreate.data.id;

    const sellableRes = await makeReq('GET', '/api/v1/studio/consumptions/sellable-products', stAdmin.headers);
    assert(
      sellableRes.status === 200 &&
      sellableRes.data.products.length === 2 &&
      !sellableRes.data.products.some(p => p.id === cleanCreate.data.id),
      'Lista /sellable-products retorna apenas produtos marcados como disponíveis para venda aos alunos',
      sellableRes.data.products
    );

    console.log('\n3) Permissões dos Funcionários (sem permissão vs autorizado vs gestor)...');

    // Funcionário SEM permissão create_student_consumption (mesmo tendo manage_inventory)
    const noPermGet = await makeReq('GET', '/api/v1/studio/consumptions', stNoPermStaff.headers);
    const noPermPost = await makeReq('POST', '/api/v1/studio/consumptions', stNoPermStaff.headers, {
      patientId: pat1,
      inventoryItemId: waterId,
      quantity: 1,
      paymentStatus: 'pending'
    });
    assert(
      noPermGet.status === 403 && noPermPost.status === 403,
      'Funcionário com manage_inventory mas SEM create_student_consumption é bloqueado (403)',
      { get: noPermGet.status, post: noPermPost.status }
    );

    // Funcionário AUTORIZADO (apenas create_student_consumption): tenta alterar preço -> 403; lança preço normal -> 201
    const priceTamper = await makeReq('POST', '/api/v1/studio/consumptions', stAuthStaff.headers, {
      patientId: pat1,
      inventoryItemId: barId,
      quantity: 1,
      unitPrice: 1.0,
      paymentStatus: 'pending'
    });
    assert(priceTamper.status === 403, 'Funcionário autorizado sem manage_financial é impedido de alterar preço unitário (403)', priceTamper.data);

    // Tentativa de vender produto não comercializável
    const nonSellableAttempt = await makeReq('POST', '/api/v1/studio/consumptions', stAuthStaff.headers, {
      patientId: pat1,
      inventoryItemId: cleanCreate.data.id,
      quantity: 1,
      paymentStatus: 'pending'
    });
    assert(nonSellableAttempt.status === 400, 'Venda de produto não comercializável é rejeitada (400)', nonSellableAttempt.data);

    console.log('\n4) Venda Pendente, Integração Saldo Aluno, Baixa Única e Idempotência...');

    // Funcionário autorizado lança Barrinha R$ 8,00 pendente para João Silva
    const consPending = await makeReq('POST', '/api/v1/studio/consumptions', stAuthStaff.headers, {
      patientId: pat1,
      inventoryItemId: barId,
      quantity: 1,
      paymentStatus: 'pending',
      notes: 'Consumo após treino',
      idempotencyKey: 'key-bar-1'
    });
    assert(
      consPending.status === 201 &&
      consPending.data.consumption.total_amount_cents === 800 &&
      consPending.data.consumption.payment_status === 'pending',
      'Venda pendente (Barrinha R$ 8,00) registrada pelo funcionário autorizado',
      consPending.data
    );
    const barAfter1 = db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(barId).quantity;
    assert(barAfter1 === 9, `Estoque da barrinha baixou de 10 para 9 (obtido: ${barAfter1})`);

    // Verifica saldo consolidado do aluno (180 + 8 = 188) sem alterar mensalidade
    const studentSum1 = await makeReq('GET', `/api/v1/studio/consumptions/student/${pat1}`, stAdmin.headers);
    const origTuition = db.prepare('SELECT amount, status FROM payments WHERE id = ?').get(tuitionPayId);
    assert(
      studentSum1.status === 200 &&
      studentSum1.data.pendingTuitionsCents === 18000 &&
      studentSum1.data.pendingProductsCents === 800 &&
      studentSum1.data.consolidatedPendingCents === 18800 &&
      origTuition.amount === 180 &&
      origTuition.status === 'pending',
      'Resumo financeiro do aluno consolida R$ 180 mensalidade + R$ 8 barrinha = R$ 188 mantendo lançamentos separados',
      studentSum1.data
    );

    // Garantir que NÃO entrou em prontuários clínicos (records)
    const clinicalRecordsCount = db.prepare('SELECT COUNT(*) as c FROM records WHERE tenant_id = ?').get(studioId).c;
    assert(clinicalRecordsCount === 0, 'Consumo não gera evolução nem registro em prontuários clínicos');

    // Quitação apenas da barrinha: mensalidade DEVE continuar pendente
    const staffSettleBlocked = await makeReq('POST', `/api/v1/studio/consumptions/${consPending.data.consumption.id}/settle`, stAuthStaff.headers, {
      paymentMethod: 'pix'
    });
    assert(staffSettleBlocked.status === 403, 'Funcionário comum sem permissão financeira não quita cobrança pendente (403)');

    const settleBar = await makeReq('POST', `/api/v1/studio/consumptions/${consPending.data.consumption.id}/settle`, stAdmin.headers, {
      paymentMethod: 'pix',
      paymentDate: new Date().toISOString().slice(0, 10)
    });
    const tuitionAfterBarPaid = db.prepare('SELECT status FROM payments WHERE id = ?').get(tuitionPayId).status;
    assert(
      settleBar.status === 200 &&
      settleBar.data.consumption.payment_status === 'paid' &&
      tuitionAfterBarPaid === 'pending' &&
      db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(barId).quantity === 9,
      'Quitar somente o produto mantém mensalidade pendente e não baixa estoque novamente',
      settleBar.data
    );

    console.log('\n5) Venda Já Paga no Caixa + Bloqueio Estoque Insuficiente + Idempotência...');

    // Abrir sessão de caixa para validar integração em dinheiro
    const regId = 'reg-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO cash_registers (id, tenant_id, user_id, operator_name, initial_balance, status, opened_at)
      VALUES (?, ?, ?, 'Gestor Studio', 100.00, 'open', datetime('now'))
    `).run(regId, studioId, stAdmin.uid);

    // Tentativa acima do estoque
    const overStock = await makeReq('POST', '/api/v1/studio/consumptions', stAdmin.headers, {
      patientId: pat1,
      inventoryItemId: waterId,
      quantity: 25,
      paymentStatus: 'paid',
      paymentMethod: 'cash'
    });
    assert(
      overStock.status === 409 &&
      db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(waterId).quantity === 20,
      'Venda acima do estoque é bloqueada (409) preservando saldo de 20 unidades',
      overStock.data
    );

    // Venda paga em dinheiro (2 águas = R$ 10,00) com chave idempotente + retry duplicado
    const paidWaterPayload = {
      patientId: pat1,
      inventoryItemId: waterId,
      quantity: 2,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      paymentDate: new Date().toISOString().slice(0, 10),
      amountReceived: 20,
      idempotencyKey: 'key-water-2'
    };
    const waterPaid1 = await makeReq('POST', '/api/v1/studio/consumptions', stAdmin.headers, paidWaterPayload);
    const waterPaid2 = await makeReq('POST', '/api/v1/studio/consumptions', stAdmin.headers, paidWaterPayload);
    assert(
      waterPaid1.status === 201 &&
      waterPaid2.status === 200 &&
      waterPaid2.data.idempotent === true &&
      waterPaid1.data.consumption.id === waterPaid2.data.consumption.id &&
      waterPaid1.data.consumption.total_amount_cents === 1000 &&
      db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(waterId).quantity === 18,
      'Venda paga (2 águas = R$ 10,00) + tentativa duplicada idempotente baixam estoque apenas 1 vez (20 -> 18)',
      { w1: waterPaid1.data.consumption?.id, w2: waterPaid2.data.idempotent }
    );

    // Verificar caixa aberto recebeu R$ 10,00 em dinheiro
    const cashCurrent = await makeReq('GET', '/api/v1/cash-register/current', stAdmin.headers);
    assert(
      cashCurrent.status === 200 && Number(cashCurrent.data.totalsByMethod?.cash) === 10 && Number(cashCurrent.data.drawerSummary?.expectedCash) === 110,
      'Caixa aberto reflete recebimento de R$ 10,00 em dinheiro (esperado R$ 110,00)',
      cashCurrent.data.drawerSummary
    );

    console.log('\n6) Cancelamento de Consumo Pendente + Estorno de Consumo Pago + Reversão Única de Estoque...');

    // Novo pendente (1 Barrinha) -> Cancelar com devolução de estoque
    const barPending2 = await makeReq('POST', '/api/v1/studio/consumptions', stAdmin.headers, {
      patientId: pat2,
      inventoryItemId: barId,
      quantity: 1,
      paymentStatus: 'pending'
    });
    assert(db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(barId).quantity === 8, 'Estoque barrinha 9 -> 8');

    const cancelPending = await makeReq('POST', `/api/v1/studio/consumptions/${barPending2.data.consumption.id}/cancel`, stAdmin.headers, {
      reason: 'Aluno desistiu na recepção',
      revertStock: true
    });
    assert(
      cancelPending.status === 200 &&
      cancelPending.data.consumption.payment_status === 'cancelled' &&
      cancelPending.data.consumption.stock_reverted === 1 &&
      db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(barId).quantity === 9,
      'Cancelar consumo pendente preserva histórico (status cancelled) e devolve estoque (8 -> 9)'
    );

    const cancelTwice = await makeReq('POST', `/api/v1/studio/consumptions/${barPending2.data.consumption.id}/cancel`, stAdmin.headers, {
      reason: 'Tentativa duplicada'
    });
    assert(cancelTwice.status === 409 && db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(barId).quantity === 9, 'Cancelamento duplicado é bloqueado (409) sem devolver estoque duas vezes');

    // Estorno do consumo pago em dinheiro (Água 2 un = R$ 10,00)
    const refundWater = await makeReq('POST', `/api/v1/studio/consumptions/${waterPaid1.data.consumption.id}/cancel`, stAdmin.headers, {
      reason: 'Produto com embalagem danificada',
      revertStock: true
    });
    const cashAfterRefund = await makeReq('GET', '/api/v1/cash-register/current', stAdmin.headers);
    assert(
      refundWater.status === 200 &&
      refundWater.data.consumption.payment_status === 'refunded' &&
      refundWater.data.consumption.stock_reverted === 1 &&
      db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(waterId).quantity === 20 &&
      Number(cashAfterRefund.data.drawerSummary?.estornos) === 10,
      'Estorno de consumo pago em dinheiro restaura estoque (18 -> 20), marca refunded e lança ESTORNO no caixa aberto',
      { waterQty: db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(waterId).quantity, drawer: cashAfterRefund.data.drawerSummary }
    );

    console.log('\n7) Estabelecimento Misto & Isolamento...');
    const mxProd = await makeReq('POST', '/api/v1/inventory', mxAdmin.headers, {
      name: 'Isotônico Studio Misto',
      category: 'escritorio',
      quantity: 12,
      unit: 'un',
      availableForSale: true,
      salePrice: 11.0,
      saleUnit: 'garrafa'
    });
    const mxCons = await makeReq('POST', '/api/v1/studio/consumptions', mxAdmin.headers, {
      patientId: patMixed,
      inventoryItemId: mxProd.data.id,
      quantity: 1,
      paymentStatus: 'paid',
      paymentMethod: 'pix'
    });
    assert(mxCons.status === 201 && mxCons.data.consumption.total_amount_cents === 1100, 'Estabelecimento Misto suporta Consumo dos Alunos normalmente', mxCons.data);

    // Isolamento cross-tenant: gestor Studio não enxerga nem altera consumo de Misto
    const crossTenant = await makeReq('POST', `/api/v1/studio/consumptions/${mxCons.data.consumption.id}/cancel`, stAdmin.headers, { reason: 'Cross' });
    assert(crossTenant.status === 404, 'Isolamento entre estabelecimentos impede acesso cruzado (404)');
  } catch (err) {
    console.error(err);
    failed++;
  } finally {
    server.close();
    try {
      db.close();
    } catch {}
    console.log(`\nRESULTADO FINAL BACKEND: ${passed} PASSOU | ${failed} FALHOU\n`);
    process.exit(failed ? 1 : 0);
  }
}

runTests();
