const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'zemda-frequency-')), 'test.db');
process.env.DATABASE_PATH = DB_PATH;
process.env.JWT_SECRET = 'test-studio-service-billing-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-service-billing-files-2026';
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
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 600) : ''}`);
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

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0)).toISOString().slice(0, 10);
}

function getFutureWeekdayIso(targetDow, minDaysAhead = 7) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + minDaysAhead, 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + diff);
  return base.toISOString().slice(0, 10);
}

function addMonthsClampIso(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1, 12, 0, 0));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  TEST_PORT = server.address().port;

  console.log('\n=========================================================================================');
  console.log('Preços por frequência: integração HTTP e invariantes financeiros');
  console.log('=========================================================================================\n');

  try {
    const studioId = 'ten-st-' + uuidv4().slice(0, 6);
    const mixedId = 'ten-mx-' + uuidv4().slice(0, 6);
    const clinicId = 'ten-cl-' + uuidv4().slice(0, 6);
    const otherStudioId = 'ten-os-' + uuidv4().slice(0, 6);

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

    const insTenant = db.prepare(`
      INSERT INTO tenants (
        id, name, trade_name, slug, email, status, billing_required,
        public_booking_enabled, establishment_profile, business_hours_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioId, 'Studio Zen', 'Studio Zen', 'studio-zen-bil', 'zen@bil.test', 'studio', hours);
    insTenant.run(mixedId, 'Espaço Misto', 'Espaço Misto', 'misto-bil', 'misto@bil.test', 'mixed', hours);
    insTenant.run(clinicId, 'Clínica Padrão', 'Clínica Padrão', 'clinica-bil', 'cli@bil.test', 'clinic', hours);
    insTenant.run(otherStudioId, 'Outro Studio', 'Outro Studio', 'outro-bil', 'outro@bil.test', 'studio', hours);

    const admUser = 'usr-adm-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestora Ana', 'ana@bil.test', 'h', 'clinic_admin', 'active')`).run(admUser, studioId);

    const insCU = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial","manage_financial","view_schedule","manage_patients","manage_payroll"]')`);
    for (const tid of [studioId, mixedId, clinicId, otherStudioId]) {
      insCU.run('cu-' + uuidv4().slice(0, 8), tid, admUser);
    }

    const mkHeaders = (tid) => ({
      Authorization: `Bearer ${generateToken({ userId: admUser, tenantId: tid, email: 'ana@bil.test', role: 'clinic_admin' })}`,
      'x-tenant-id': tid
    });
    const authStudio = mkHeaders(studioId);
    const authMixed = mkHeaders(mixedId);
    const authClinic = mkHeaders(clinicId);
    const authOther = mkHeaders(otherStudioId);

    const insProf = db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, slug, profession_id, profession_name,
        active, public_booking_enabled, remuneration_type, commission_percentage, fixed_salary
      ) VALUES (?, ?, NULL, ?, ?, ?, 'Educador Físico', 1, 1, 'commission', 50, 0)
    `);
    const profSt1 = 'prof-st1-' + uuidv4().slice(0, 6);
    const profSt2 = 'prof-st2-' + uuidv4().slice(0, 6);
    const profMx = 'prof-mx-' + uuidv4().slice(0, 6);
    const profCl = 'prof-cl-' + uuidv4().slice(0, 6);
    const profOs = 'prof-os-' + uuidv4().slice(0, 6);
    insProf.run(profSt1, studioId, 'Instrutora Lia', 'lia-st', profType);
    insProf.run(profSt2, studioId, 'Instrutor Caio', 'caio-st', profType);
    insProf.run(profMx, mixedId, 'Prof Misto', 'mx-mx', profType);
    insProf.run(profCl, clinicId, 'Dra. Clínica', 'cl-cl', profType);
    insProf.run(profOs, otherStudioId, 'Outro Prof', 'os-os', profType);

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '06:00', '22:00', 1)`);
    for (let dow = 1; dow <= 6; dow++) {
      insSched.run(uuidv4(), studioId, profSt1, dow);
      insSched.run(uuidv4(), studioId, profSt2, dow);
      insSched.run(uuidv4(), mixedId, profMx, dow);
      insSched.run(uuidv4(), clinicId, profCl, dow);
      insSched.run(uuidv4(), otherStudioId, profOs, dow);
    }

    const insPat = db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone, cpf, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`);
    const pat1 = 'pat-1-' + uuidv4().slice(0, 6);
    const pat2 = 'pat-2-' + uuidv4().slice(0, 6);
    const pat3 = 'pat-3-' + uuidv4().slice(0, 6);
    const pat4 = 'pat-4-' + uuidv4().slice(0, 6);
    const pat5 = 'pat-5-' + uuidv4().slice(0, 6);
    const patMx = 'pat-mx-' + uuidv4().slice(0, 6);
    const patCl = 'pat-cl-' + uuidv4().slice(0, 6);
    const patOs = 'pat-os-' + uuidv4().slice(0, 6);
    insPat.run(pat1, studioId, 'Aluno Dropin', '11988880001', '11111111101');
    insPat.run(pat2, studioId, 'Aluna Mensal', '11988880002', '11111111102');
    insPat.run(pat3, studioId, 'Aluna Trimestral', '11988880003', '11111111103');
    insPat.run(pat4, studioId, 'Aluno Anual+Tri', '11988880004', '11111111104');
    insPat.run(pat5, studioId, 'Aluna Semestral/Pacote', '11988880005', '11111111105');
    insPat.run(patMx, mixedId, 'Paciente Misto', '11988880006', '11111111106');
    insPat.run(patCl, clinicId, 'Paciente Clínica', '11988880007', '11111111107');
    insPat.run(patOs, otherStudioId, 'Aluno Outro', '11988880008', '11111111108');

    const pure = require('./dist/utils/studio-frequency-pricing');
    const { calculateStudioRecurringPrice: calc } = require('./dist/utils/studio-pricing');
    const config = { version: 1, enabled: true, unit: 'per_period', tables: { monthly: { 1: 18000, 2: 32000, 3: 45000 } } };
    for (const [mode, months] of Object.entries({monthly:1,bimonthly:2,quarterly:3,semiannual:6,annual:12,biennial:24})) {
      const base = { serviceName:'Teste', sessionPrice:80, weeklySessionsCount:2, billingMode:mode, pricingRule:'four_weeks' };
      assert(calc({...base,frequencyPricing:{...config,tables:{[mode]:{2:32000}}}}).effectivePrice === 320, mode+' total exato sem multiplicação');
      assert(calc({...base,frequencyPricing:{...config,unit:'per_session',tables:{per_session:{2:1700}}}}).effectivePrice === 17*8*months, mode+' preço por aula');
      assert(calc({...base,frequencyPricing:{...config,enabled:false},customPrice:900,isPriceCustomized:true}).effectivePrice===900, mode+' desativado preserva preço anterior');
    }
    const base = { serviceName:'Teste',sessionPrice:80,weeklySessionsCount:9,billingMode:'monthly',frequencyPricing:{...config,unit:'per_session',tables:{per_session:{9:1700}}} };
    assert(calc({...base,pricingRule:'four_weeks'}).effectivePrice===612,'9 encontros sem limite fixo de 7');
    assert(calc({...base,pricingRule:'annual_average'}).effectivePrice===663,'Média anual por aula');
    assert(calc({...base,pricingRule:'scheduled_sessions',scheduledSessionsCount:40}).effectivePrice===680,'Calendário real por aula');
    for (const count of [1,2,3,7,9]) {
      const rows=Array.from({length:count},(_,i)=>({dayOfWeek:1,startTime:`${String(6+i).padStart(2,'0')}:00`,endTime:`${String(7+i).padStart(2,'0')}:00`,professionalId:profSt1}));
      assert(pure.offeredWeeklyMeetings(rows).length===count, count+' encontros no mesmo dia');
    }
    for (const bad of [0,-1,3.4,'32000',Number.MAX_SAFE_INTEGER+1]) {
      let rejected=false;try{pure.normalizeFrequencyPricing({...config,tables:{monthly:{2:bad}}});}catch{rejected=true;}
      assert(rejected,'Validação centavos '+bad);
    }
    const startMon=getFutureWeekdayIso(1,7);
    const servicePayload={professionalId:profSt1,name:'Pilates frequência',durationMinutes:60,price:80,modality:'presential',serviceDomain:'studio',serviceKind:'group',defaultCapacity:20,billingMode:'monthly',periodicPrice:640,pricingRule:'four_weeks',weeklySessionsCount:3,allowRecurrence:true,allowedRecurrenceFrequencies:['weekly','custom_weekdays'],defaultRecurrenceFrequency:'weekly',frequencyPricing:config,
      classSchedules:[{dayOfWeek:1,startTime:'08:00',endTime:'09:00',professionalId:profSt1,modality:'presential',capacity:20},{dayOfWeek:1,startTime:'10:00',endTime:'11:00',professionalId:profSt1,modality:'presential',capacity:20},{dayOfWeek:3,startTime:'08:00',endTime:'09:00',professionalId:profSt1,modality:'presential',capacity:20}]};
    const created=await makeReq('POST','/api/v1/services',authStudio,servicePayload);
    assert(created.status===201,'Criar serviço com tabela',created.data);
    const service=created.data; const id=service.id;
    const listed=await makeReq('GET','/api/v1/services',authStudio);
    assert(listed.data.find(s=>s.id===id)?.frequency_pricing.tables.monthly[2]===32000,'Recuperar tabela ao editar',listed.data);
    const invalid=await makeReq('PUT','/api/v1/services/'+id,authStudio,{frequencyPricing:{...config,tables:{monthly:{2:0}}}});
    assert(invalid.status===400,'Backend rejeita zero');
    const foreign=await makeReq('PUT','/api/v1/services/'+id,authOther,{frequencyPricing:config});
    assert(foreign.status===404,'Isolamento entre estabelecimentos');
    const mixed=await makeReq('POST','/api/v1/services',authClinic,{...servicePayload,professionalId:profCl,classSchedules:[]});
    assert(mixed.status===400,'Outros perfis não aceitam tabela');
    const entries=service.class_schedules.filter(s=>s.day_of_week===1).map(s=>({classScheduleId:s.id,weekday:s.day_of_week,startTime:s.start_time,endTime:s.end_time,professionalId:profSt1,modality:'presential'}));
    const recurrence={frequency:'weekly',durationCode:'1_month',seriesMode:'schedule_plan',scheduleEntries:entries};
    const booked=await makeReq('POST','/api/v1/appointments/recurring',authStudio,{patientId:pat2,professionalId:profSt1,serviceId:id,startTime:startMon+'T08:00:00',endTime:startMon+'T09:00:00',modality:'presential',billingChoice:'enroll_periodic',enrollBillingPlan:{billingFrequency:'monthly',amount:1,dueDay:10,generateInitialCycle:true},recurrence});
    assert(booked.status===201,'Contratar agenda interna',booked.data);
    const plan=db.prepare('SELECT * FROM recurring_billing_plans WHERE id=?').get(booked.data.billingPlanId);
    assert(plan.amount===320 && plan.weekly_sessions_snapshot===2,'Backend seleciona 2x e ignora total adulterado',plan);
    assert(db.prepare('SELECT COUNT(*) c FROM payments WHERE recurring_plan_id=?').get(plan.id).c===1,'Uma cobrança pelo ciclo interno');
    assert(db.prepare('SELECT COUNT(*) c FROM payments WHERE patient_id=? AND appointment_id IS NOT NULL').get(pat2).c===0,'Sem pagamentos avulsos internos');
    const change=await makeReq('PUT','/api/v1/services/'+id,authStudio,{frequencyPricing:{...config,tables:{monthly:{1:19000,2:35000,3:49000}}}});
    assert(change.status===200,'Editar preços',change.data);
    assert(db.prepare('SELECT amount FROM recurring_billing_plans WHERE id=?').get(plan.id).amount===320,'Contrato anterior mantém snapshot');
    const publicBody={tenantSlug:'studio-zen-bil',mode:'service',serviceId:id,professionalId:profSt1,classScheduleId:entries[0].classScheduleId,startTime:startMon+'T08:00:00',endTime:startMon+'T09:00:00',modality:'presential',recurrence,student:{fullName:'Aluno Público Teste',phone:'11988776655',whatsapp:'11988776655',email:'public@frequency.test'}};
    const pub=await makeReq('POST','/api/v1/public/studio/bookings',{},publicBody);
    assert(pub.status===201,'Contratar pelo link público',pub.data);
    const pubPlanId=pub.data.appointments[0].billingPlanId;
    const pubPlan=db.prepare('SELECT * FROM recurring_billing_plans WHERE id=?').get(pubPlanId);
    assert(pubPlan.amount===350 && pubPlan.weekly_sessions_snapshot===2,'Público usa tabela atual e dois encontros no mesmo dia',pubPlan);
    assert(db.prepare('SELECT COUNT(*) c FROM payments WHERE recurring_plan_id=?').get(pubPlanId).c===1,'Uma cobrança por plano público');
    assert(db.prepare('SELECT COUNT(*) c FROM payments WHERE patient_id=? AND appointment_id IS NOT NULL').get(pubPlan.patient_id).c===0,'Zero cobranças individuais públicas');
    assert(pub.data.appointments.every(a=>a.price===0),'Resposta informa aulas cobertas');
    const duplicate=await makeReq('POST','/api/v1/public/studio/bookings',{},publicBody);
    assert(duplicate.status===409,'Repetir reserva não duplica contrato/cobrança',duplicate.data);
    const before=JSON.stringify(db.prepare('SELECT * FROM recurring_billing_plans WHERE id=?').get(plan.id));
    db.prepare('UPDATE class_schedules SET active=0 WHERE id=? AND tenant_id=?').run(entries[1].classScheduleId,studioId);
    const {quoteFrequencyPlan}=require('./dist/services/frequency-pricing.service');
    let unavailable=false;try{quoteFrequencyPlan({tenantId:studioId,serviceId:id,billingFrequency:'monthly',startDate:startMon,slots:entries.map(e=>({startTime:startMon+'T'+e.startTime,endTime:startMon+'T'+e.endTime,classScheduleId:e.classScheduleId,professionalId:profSt1}))});}catch{unavailable=true;}
    assert(unavailable,'Grade reduzida rejeita frequência indisponível');
    assert(before===JSON.stringify(db.prepare('SELECT * FROM recurring_billing_plans WHERE id=?').get(plan.id)),'Grade não altera contrato vigente');
    assert(JSON.parse(db.prepare('SELECT frequency_pricing_json FROM services WHERE id=?').get(id).frequency_pricing_json).tables.monthly[3]===49000,'Grade reduzida preserva preços indisponíveis');
    const off=await makeReq('PUT','/api/v1/services/'+id,authStudio,{frequencyPricing:{...config,enabled:false}});
    assert(off.status===200 && off.data.frequency_pricing.tables.monthly[2]===32000,'Desativar mantém valores salvos');
    assert(quoteFrequencyPlan({tenantId:studioId,serviceId:id,billingFrequency:'monthly',startDate:startMon,slots:[]})===null,'Desativado retorna ao comportamento existente');

    // Individual Studio service with custom_weekdays [1, 3, 5] + per_session table + 2_months plan on monthly billing
    const indSrvPayload = {
      professionalId: profSt2,
      name: 'Musculação Individual Dias Específicos',
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 80,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'individual',
      billingMode: 'monthly',
      pricingRule: 'four_weeks',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
      allowedRecurrenceWeekdays: [1, 3, 5],
      defaultRecurrenceFrequency: 'custom_weekdays',
      allowedPlanDurations: ['1_month', '2_months', '3_months'],
      defaultPlanDuration: '1_month',
      frequencyPricing: { version: 1, enabled: true, unit: 'per_session', tables: { per_session: { 1: 8000, 2: 7500, 3: 7000 } } }
    };
    const indCreated = await makeReq('POST', '/api/v1/services', authStudio, indSrvPayload);
    assert(indCreated.status === 201 && JSON.stringify(indCreated.data.allowed_recurrence_weekdays) === '[1,3,5]', 'Criar aula individual com dias específicos persistidos', indCreated.data);
    const indId = indCreated.data.id;

    const indFreqMeetings = await makeReq('POST', '/api/v1/services/frequency-meetings', authStudio, {
      professionalIds: [profSt2], durationMinutes: 60, bufferMinutes: 0, modality: 'presential', serviceDomain: 'studio', allowedWeekdays: [1, 3, 5]
    });
    assert(indFreqMeetings.status === 200 && indFreqMeetings.data.meetings.length > 0 && indFreqMeetings.data.meetings.every(m => [1, 3, 5].includes(m.weekday)), 'Reuniões individuais respeitam dias específicos [1,3,5]');

    const indSlotsRes = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-zen-bil&serviceId=${indId}&includeUpcoming=1&includeWeekly=1`);
    assert(indSlotsRes.status === 200 && JSON.stringify(indSlotsRes.data.allowedRecurrenceWeekdays) === '[1,3,5]' && indSlotsRes.data.weeklyMeetings.every(m => [1, 3, 5].includes(m.weekday)), 'Slots públicos individuais retornam e filtram por dias específicos');

    const startWed = addDaysIso(startMon, 2);
    const indRecEntries = [
      { dayOfWeek: 1, weekday: 1, startTime: '14:00', endTime: '15:00', professionalId: profSt2, modality: 'presential', classScheduleId: null },
      { dayOfWeek: 3, weekday: 3, startTime: '14:00', endTime: '15:00', professionalId: profSt2, modality: 'presential', classScheduleId: null }
    ];
    const indPreview = await makeReq('POST', '/api/v1/public/studio/recurrence-preview', {}, {
      tenantSlug: 'studio-zen-bil',
      bookingIntent: 'recurring',
      serviceId: indId,
      professionalId: profSt2,
      modality: 'presential',
      startTime: startMon + 'T14:00:00',
      endTime: startMon + 'T15:00:00',
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '2_months',
        seriesMode: 'schedule_plan',
        scheduleEntries: indRecEntries,
        weekdays: [1, 3],
        endDate: addMonthsClampIso(startMon, 2)
      }
    });
    assert(
      indPreview.status === 200 &&
      indPreview.data.valid === true &&
      indPreview.data.pricing &&
      indPreview.data.pricing.weeklyCount === 2 &&
      indPreview.data.pricing.amount === 600 &&
      indPreview.data.pricing.averagePricePerSession === 75 &&
      indPreview.data.pricing.billingFrequency === 'monthly',
      'Preview público individual 2x/sem calcula R$ 75/aula = R$ 600/mês preservando periodicidade mensal em plano de 2 meses',
      indPreview.data
    );

    const indPublicBook = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-zen-bil',
      bookingIntent: 'recurring',
      mode: 'service',
      serviceId: indId,
      professionalId: profSt2,
      modality: 'presential',
      startTime: startMon + 'T14:00:00',
      endTime: startMon + 'T15:00:00',
      recurrence: {
        frequency: 'custom_weekdays',
        durationCode: '2_months',
        seriesMode: 'schedule_plan',
        scheduleEntries: indRecEntries,
        weekdays: [1, 3],
        endDate: addMonthsClampIso(startMon, 2)
      },
      student: { fullName: 'Aluno Individual Recorrente', phone: '11977665544', whatsapp: '11977665544', email: 'ind.rec@test.com' }
    });
    assert(indPublicBook.status === 201 && indPublicBook.data.appointments.length >= 16, 'Reserva pública recorrente individual 2x/sem por 2 meses cria série', indPublicBook.data);
    const indPlan = db.prepare('SELECT * FROM recurring_billing_plans WHERE id = ?').get(indPublicBook.data.appointments[0].billingPlanId);
    assert(indPlan && indPlan.amount === 600 && indPlan.billing_frequency === 'monthly' && indPlan.weekly_sessions_snapshot === 2, 'Contrato recorrente individual registra mensalidade R$ 600 com 2x/sem', indPlan);
    assert(startWed > startMon, 'Sanidade de data');
  } catch(err) { console.error(err);failed++; }
  finally { server.close();try{db.close();}catch{} console.log(`RESULTADO: ${passed} PASSOU | ${failed} FALHOU`);process.exit(failed?1:0); }
}
runTests();
