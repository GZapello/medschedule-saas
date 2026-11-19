/**
 * Suíte E2E Definitiva — Planos de Academia (Musculação), Complementos Opcionais por Opção Comercial,
 * Agenda Real em Grupo (até 4 alunos), Créditos Fixos vs Semanal Garantida, Importação IA e Matrículas.
 *
 * Cobre integralmente os cenários obrigatórios de:
 *  - Planos de Musculação (Mensal/Trimestral/Semestral/Anual Acesso livre e 3x/sem, sem horário marcado/instrutor/duração)
 *  - Vínculo estrito de complementos por opção comercial (IDs estáveis, habilitado SOMENTE no Anual, oculto nos demais)
 *  - Preservação de vínculo ao editar opção e limpeza segura ao remover opção (sem vazar para outros planos nem alterar contratos históricos)
 *  - Contratação somente Musculação vs Musculação + Personal 1x (R$ 219,99/mês) vs Personal 2x (R$ 319,99/mês)
 *  - Duração independente (Personal mensal 1 mês sobre Musculação Anual 12 meses) + Periodicidades mistas
 *  - Agenda do serviço complementar em grupo até 4 vagas (compartilhando 1 única class_occurrence, sem bloquear profissional 4x, bloqueando no 5º aluno e corrida na última vaga)
 *  - Regra de créditos: 4 créditos fixos/mês (nunca força 5ª sessão em mês de 5 segundas) vs 8 créditos fixos vs frequência semanal garantida
 *  - Agendamento posterior à aprovação (`after_confirmation`)
 *  - Importação Inteligente com IA: Musculação + Personal + lote combinado + pergunta "Em quais planos este acompanhamento poderá ser contratado?" + vínculo somente no plano escolhido + sem duplicação + exclusão de temporários
 *  - Matrículas e Financeiro: benefícios separados, zero créditos em somente musculação, sem cobrança duplicada, cancelamento apenas do complemento mantendo musculação ativa, renovação do plano-base, RBAC profissional, multi-tenant e clínica inalterada.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-gym-def-'));
const TEST_DB = path.join(TEST_DIR, 'test.db');

process.env.DATABASE_PATH = TEST_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'zemda-test-secret-gym-definitive';
process.env.NODE_ENV = 'test';

const { initializeDatabase, db } = require('./dist/config/database');
const { generateToken } = require('./dist/utils/jwt');
initializeDatabase();

const express = require('express');
const apiRoutes = require('./dist/routes').default;

const { normalizeProposal } = require('./dist/services/studio-catalog-proposal');
const {
  buildProposalDiagnostics,
  readStudioImportCatalog,
  applyStudioCatalog
} = require('./dist/services/studio-catalog-confirmation');
const {
  addonAppliesToBaseOption,
  calculatePlanWithAddonsBreakdown,
  isCommercialOptionNonScheduled,
  isServiceNonScheduledForPublic,
  normalizeCommercialPriceOptions
} = require('./dist/utils/studio-access-and-commercial');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', apiRoutes);

function req(server, method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: `/api${urlPath}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data = raw;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {}
          resolve({ status: res.statusCode, data });
        });
      }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function seedStudioTenant({ id, slug, name, timezone = 'America/Sao_Paulo' }) {
  db.prepare(`
    INSERT INTO tenants (
      id, slug, public_booking_slug, public_booking_sequence, public_booking_enabled,
      name, email, status, onboarding_completed, onboarding_status, manager_confirmed,
      billing_required, establishment_profile, timezone
    ) VALUES (?, ?, ?, 1, 1, ?, ?, 'active', 1, 'active', 1, 0, 'studio', ?)
  `).run(id, slug, slug, name, `${id}@test.invalid`, timezone);

  const adminId = `usr-adm-${id}`;
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
    VALUES (?, ?, ?, ?, 'hash', 'clinic_admin', 'active', 'active', 1)
  `).run(adminId, id, `Gestor ${name}`, `admin@${id}.test`);

  const profUserId = `usr-pro-${id}`;
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
    VALUES (?, ?, ?, ?, 'hash', 'professional', 'active', 'active', 1)
  `).run(profUserId, id, `Personal Bruno ${id}`, `personal@${id}.test`);

  const prof2UserId = `usr-pro2-${id}`;
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
    VALUES (?, ?, ?, ?, 'hash', 'professional', 'active', 'active', 1)
  `).run(prof2UserId, id, `Nutri Clara ${id}`, `nutri@${id}.test`);

  db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
    VALUES (?, ?, ?, 'clinic_admin', 'active', 1, NULL)
  `).run(`cu-adm-${id}`, id, adminId);

  db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
    VALUES (?, ?, ?, 'professional', 'active', 0, NULL)
  `).run(`cu-pro-${id}`, id, profUserId);

  db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
    VALUES (?, ?, ?, 'professional', 'active', 0, NULL)
  `).run(`cu-pro2-${id}`, id, prof2UserId);

  const profPersonalId = `prof-pers-${id}`;
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active, public_booking_enabled, created_at)
    VALUES (?, ?, ?, ?, 'prof-personal-trainer', 'Personal Trainer', 1, 1, datetime('now'))
  `).run(profPersonalId, id, profUserId, `Personal Bruno`);

  // Profissional clínica não habilitada para Personal
  const profUnqualifiedId = `prof-clin-${id}`;
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active, public_booking_enabled, created_at)
    VALUES (?, ?, ?, ?, 'prof-nutricionista', 'Nutricionista', 1, 1, datetime('now'))
  `).run(profUnqualifiedId, id, prof2UserId, `Dra. Clara Nutri`);

  // Escala do Personal Bruno (Seg a Sáb 07:00-20:00)
  for (let dow = 1; dow <= 6; dow++) {
    db.prepare(`
      INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
      VALUES (?, ?, ?, ?, '07:00', '20:00', 1)
    `).run(`sch-${id}-${dow}`, id, profPersonalId, dow);
  }

  return {
    tenantId: id,
    slug,
    adminId,
    profUserId,
    profPersonalId,
    profUnqualifiedId,
    adminToken: generateToken({ userId: adminId, tenantId: id, role: 'clinic_admin', email: `admin@${id}.test` }),
    profToken: generateToken({ userId: profUserId, tenantId: id, role: 'professional', email: `personal@${id}.test` })
  };
}

function nextWeekdayYmd(targetDow, minDaysAhead = 14) {
  // Usa mês com 5 ocorrências de segunda-feira quando solicitado ou data futura limpa
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDaysAhead);
  while (d.getUTCDay() !== targetDow) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function findNext5OccurrenceMondayStart() {
  // Encontra o dia 1º de um mês futuro com >= 29 dias que caia em segunda-feira (garante 5 segundas: 01, 08, 15, 22, 29!)
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 2; // pelo menos 2 meses à frente
  for (let tries = 0; tries < 48; tries++) {
    const dt = new Date(Date.UTC(year, month, 1, 12, 0, 0));
    const daysInMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0, 12, 0, 0)).getUTCDate();
    if (dt.getUTCDay() === 1 && daysInMonth >= 29) {
      return dt.toISOString().slice(0, 10);
    }
    month++;
  }
  return nextWeekdayYmd(1, 35);
}

let passed = 0;
let failed = 0;
async function test(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${label}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${label}`);
    console.error('        ', err && err.stack ? err.stack : err);
  }
}

(async () => {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    console.log('==============================================================================');
    console.log(' SUÍTE E2E DEFINITIVA — PLANOS DE ACADEMIA, COMPLEMENTOS POR OPÇÃO E AGENDA');
    console.log('==============================================================================');

    const studio = seedStudioTenant({ id: 'ten-gym-def', slug: 'studio-teste-gym', name: 'Studio Teste' });
    const studioB = seedStudioTenant({ id: 'ten-gym-other', slug: 'studio-outro', name: 'Outro Studio' });
    const authAdmin = { token: studio.adminToken };
    const authProf = { token: studio.profToken };
    const authAdminB = { token: studioB.adminToken };

    // Cria Clínica Pura para regressão
    db.prepare(`
      INSERT INTO tenants (
        id, slug, public_booking_slug, public_booking_sequence, public_booking_enabled,
        name, email, status, onboarding_completed, onboarding_status, manager_confirmed,
        billing_required, establishment_profile, timezone
      ) VALUES ('ten-clin-pure', 'clinica-pura', 'clinica-pura', 1, 1, 'Clínica Pura', 'clin@test.invalid', 'active', 1, 'active', 1, 0, 'clinic', 'America/Sao_Paulo')
    `).run();
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
      VALUES ('usr-clin-adm', 'ten-clin-pure', 'Dra Admin', 'adm@clin.test', 'hash', 'clinic_admin', 'active', 'active', 1)
    `).run();
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
      VALUES ('cu-clin-adm', 'ten-clin-pure', 'usr-clin-adm', 'clinic_admin', 'active', 1, NULL)
    `).run();
    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, active, public_booking_enabled, created_at)
      VALUES ('prof-clin-1', 'ten-clin-pure', 'usr-clin-adm', 'Dra Ana', 'prof-psicologo', 'Psicólogo', 1, 1, datetime('now'))
    `).run();
    const authClinic = { token: generateToken({ userId: 'usr-clin-adm', tenantId: 'ten-clin-pure', role: 'clinic_admin', email: 'adm@clin.test' }) };

    // Cria serviço complementar real: Acompanhamento Personal (Grupo até 4 alunos, 60 min)
    let personalSrvId = null;
    let muscSrvId = null;
    let zumbaSrvId = null;
    let optAnualId = 'opt-musc-anual-livre';
    let optMensalLivreId = 'opt-musc-mensal-livre';
    let optTrimLivreId = 'opt-musc-trim-livre';
    let optSemLivreId = 'opt-musc-sem-livre';
    let optMensal3xId = 'opt-musc-mensal-3x';
    let optTrim3xId = 'opt-musc-trim-3x';
    let optSem3xId = 'opt-musc-sem-3x';
    let addon1xId = 'addon-pers-1x';
    let addon2xId = 'addon-pers-2x';
    let addonWeeklyGuarId = 'addon-pers-weekly-guar';
    let addonAfterConfirmId = 'addon-pers-after';
    let personalClassSchedMonId = null;
    let personalClassSchedWedId = null;

    console.log('\n--- Bloco 1: Cadastro de Serviços, Classificação de Planos de Academia e Opções Comerciais ---');

    await test('[01] Criar serviço complementar Acompanhamento Personal (grupo até 4 alunos) com grade real e profissional habilitado', async () => {
      const r = await req(server, 'POST', '/v1/services', {
        ...authAdmin,
        body: {
          name: 'Acompanhamento Personal',
          serviceDomain: 'studio',
          studioServiceType: 'group',
          serviceKind: 'group',
          defaultCapacity: 4,
          professionalId: studio.profPersonalId,
          linkedProfessionalIds: [studio.profPersonalId],
          durationMinutes: 60,
          bufferMinutes: 0,
          maxAdvanceDays: 365,
          modality: 'presential',
          allowSingleBooking: true,
          allowPlanBooking: true,
          allowPublicBooking: true,
          price: 90,
          billingMode: 'monthly',
          periodicPrice: 120,
          classSchedules: [
            { dayOfWeek: 1, startTime: '08:00', endTime: '09:00', capacity: 4, professionalId: studio.profPersonalId, allowPublicBooking: true },
            { dayOfWeek: 1, startTime: '10:00', endTime: '11:00', capacity: 4, professionalId: studio.profPersonalId, allowPublicBooking: true },
            { dayOfWeek: 3, startTime: '08:00', endTime: '09:00', capacity: 4, professionalId: studio.profPersonalId, allowPublicBooking: true },
            { dayOfWeek: 5, startTime: '18:00', endTime: '19:00', capacity: 4, professionalId: studio.profPersonalId, allowPublicBooking: true }
          ]
        }
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      personalSrvId = r.data.id;
      const scheds = db.prepare(`SELECT id, day_of_week, start_time FROM class_schedules WHERE service_id = ? AND active = 1`).all(personalSrvId);
      personalClassSchedMonId = scheds.find((s) => Number(s.day_of_week) === 1 && s.start_time === '08:00')?.id;
      personalClassSchedWedId = scheds.find((s) => Number(s.day_of_week) === 3)?.id;
      assert.ok(personalClassSchedMonId && personalClassSchedWedId);
    });

    await test('[02] Cadastrar Musculação (facility_access) SEM profissional/duração/buffer/módulo clínico com 7 opções comerciais (Mensal/Trim/Sem/Anual Livre e 3x/sem) e Personal SOMENTE no Anual', async () => {
      const r = await req(server, 'POST', '/v1/services', {
        ...authAdmin,
        body: {
          name: 'Musculação',
          description: 'Acesso completo à sala de musculação',
          serviceDomain: 'studio',
          studioServiceType: 'facility_access',
          modality: 'presential',
          allowSingleBooking: false,
          allowPlanBooking: true,
          allowPublicBooking: true,
          allowPublicPlanBooking: true,
          billingMode: 'monthly',
          periodicPrice: 99.99,
          accessConfig: { accessMode: 'unlimited', allowedWeekdays: [1, 2, 3, 4, 5, 6] },
          commercialPriceOptions: [
            { id: optMensalLivreId, label: 'Mensal — Acesso livre', accessType: 'scheduled', frequencyType: 'unlimited', contractDurationCode: '1_month', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 15400, allowOptionalAddons: false },
            { id: optTrimLivreId, label: 'Trimestral — Acesso livre', accessType: 'unlimited', frequencyType: 'unlimited', contractDurationCode: '3_months', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 14300, allowOptionalAddons: false },
            { id: optSemLivreId, label: 'Semestral — Acesso livre', accessType: 'unlimited', frequencyType: 'unlimited', contractDurationCode: '6_months', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 13200, allowOptionalAddons: false },
            { id: optAnualId, label: 'Anual — Acesso livre', accessType: 'scheduled', frequencyType: 'unlimited', contractDurationCode: '12_months', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 9999, allowOptionalAddons: true },
            { id: optMensal3xId, label: 'Mensal — 3x por semana', accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 3, contractDurationCode: '1_month', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 13200, allowOptionalAddons: false },
            { id: optTrim3xId, label: 'Trimestral — 3x por semana', accessType: 'limited', frequencyType: 'weekly', frequencyCount: 3, contractDurationCode: '3_months', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 12650, allowOptionalAddons: false },
            { id: optSem3xId, label: 'Semestral — 3x por semana', accessType: 'limited', frequencyType: 'weekly', frequencyCount: 3, contractDurationCode: '6_months', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 11550, allowOptionalAddons: false }
          ],
          optionalAddons: {
            enabled: true,
            allowMultiple: false,
            promptTitle: 'Deseja adicionar acompanhamento personal?',
            noAddonLabel: 'Não, somente musculação',
            options: [
              {
                id: addon1xId,
                addonServiceId: personalSrvId,
                label: 'Sim, 1x por semana (4 aulas/mês)',
                active: true,
                allowPublicBooking: true,
                acceptedBaseOptionIds: [optAnualId],
                baseOptionRestrictionMode: 'selected',
                frequencyType: 'weekly',
                frequencyCount: 1,
                creditMode: 'fixed_credits',
                creditsPerCycle: 4,
                additionalPriceCents: 12000,
                comboDiscountType: 'none',
                comboDiscountValue: 0,
                billingPeriodicity: 'monthly',
                durationMode: '1_month',
                scheduleTiming: 'during_purchase',
                attendanceFormat: 'group',
                sessionCapacity: 4,
                enabledProfessionalIds: [studio.profPersonalId]
              },
              {
                id: addon2xId,
                addonServiceId: personalSrvId,
                label: 'Sim, 2x por semana (8 aulas/mês)',
                active: true,
                allowPublicBooking: true,
                acceptedBaseOptionIds: [optAnualId],
                baseOptionRestrictionMode: 'selected',
                frequencyType: 'weekly',
                frequencyCount: 2,
                creditMode: 'fixed_credits',
                creditsPerCycle: 8,
                additionalPriceCents: 22000,
                comboDiscountType: 'none',
                comboDiscountValue: 0,
                billingPeriodicity: 'monthly',
                durationMode: '1_month',
                scheduleTiming: 'during_purchase',
                attendanceFormat: 'group',
                sessionCapacity: 4,
                enabledProfessionalIds: [studio.profPersonalId]
              },
              {
                id: addonWeeklyGuarId,
                addonServiceId: personalSrvId,
                label: 'Personal 1x/sem (semanal garantida)',
                active: true,
                allowPublicBooking: true,
                acceptedBaseOptionIds: [optAnualId],
                baseOptionRestrictionMode: 'selected',
                frequencyType: 'weekly',
                frequencyCount: 1,
                creditMode: 'weekly_guaranteed',
                creditsPerCycle: null,
                additionalPriceCents: 13500,
                comboDiscountType: 'none',
                comboDiscountValue: 0,
                billingPeriodicity: 'monthly',
                durationMode: '1_month',
                scheduleTiming: 'during_purchase',
                attendanceFormat: 'group',
                sessionCapacity: 4,
                enabledProfessionalIds: [studio.profPersonalId]
              },
              {
                id: addonAfterConfirmId,
                addonServiceId: personalSrvId,
                label: 'Personal 1x/sem (agendar após aprovação)',
                active: true,
                allowPublicBooking: true,
                acceptedBaseOptionIds: [optAnualId],
                baseOptionRestrictionMode: 'selected',
                frequencyType: 'weekly',
                frequencyCount: 1,
                creditMode: 'fixed_credits',
                creditsPerCycle: 4,
                additionalPriceCents: 12000,
                comboDiscountType: 'none',
                comboDiscountValue: 0,
                billingPeriodicity: 'monthly',
                durationMode: '1_month',
                scheduleTiming: 'after_confirmation',
                attendanceFormat: 'group',
                sessionCapacity: 4,
                enabledProfessionalIds: [studio.profPersonalId]
              }
            ]
          }
        }
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      muscSrvId = r.data.id;

      // Verifica no banco: zero profissional, zero clinical_module, zero agendamento obrigatório
      const row = db.prepare(`SELECT * FROM services WHERE id = ?`).get(muscSrvId);
      assert.equal(row.professional_id, null);
      assert.equal(row.clinical_module, null);
      assert.equal(Number(row.requires_appointment), 0);
      assert.equal(row.studio_service_type, 'facility_access');

      // Verifica classificação normalizada: NENHUMA opção de facility_access pode ficar como 'scheduled'!
      const savedOpts = normalizeCommercialPriceOptions(row.commercial_price_options_json, { studioServiceType: 'facility_access' });
      assert.equal(savedOpts.length, 7);
      assert.ok(savedOpts.every((o) => o.accessType !== 'scheduled'), 'Nenhuma opção de Musculação pode ter accessType=scheduled');
      assert.equal(savedOpts.find((o) => o.id === optAnualId).accessType, 'unlimited');
      assert.equal(savedOpts.find((o) => o.id === optMensal3xId).accessType, 'limited');
      assert.equal(savedOpts.find((o) => o.id === optAnualId).allowOptionalAddons, true);
      assert.equal(savedOpts.find((o) => o.id === optMensalLivreId).allowOptionalAddons, false);
    });

    await test('[03] Rejeitar profissional não habilitado (clínica pura) ao vincular em complemento Personal', async () => {
      const current = await req(server, 'GET', '/v1/services', authAdmin);
      const musc = current.data.find((s) => s.id === muscSrvId);
      const badOpts = musc.optional_addons.options.map((o, idx) =>
        idx === 0 ? { ...o, enabledProfessionalIds: [studio.profUnqualifiedId] } : o
      );
      const r = await req(server, 'PUT', `/v1/services/${muscSrvId}`, {
        ...authAdmin,
        body: { optionalAddons: { ...musc.optional_addons, options: badOpts } }
      });
      assert.equal(r.status, 400, 'Profissional sem habilitação para Personal deve ser recusado');
    });

    await test('[04] Catálogo público retorna Musculação sem "scheduled", sem exigir profissional e com complementos restritos ao ID do Anual', async () => {
      const r = await req(server, 'GET', `/v1/public/tenants/${studio.slug}`);
      assert.equal(r.status, 200);
      const musc = r.data.services.find((s) => s.id === muscSrvId);
      assert.ok(musc, 'Musculação deve aparecer no catálogo público mesmo sem profissional vinculado');
      assert.equal(isServiceNonScheduledForPublic(musc), true);
      assert.ok(musc.commercial_price_options.every((o) => o.accessType === 'unlimited' || o.accessType === 'limited'));

      // Testa visibilidade condicional em TODAS as 7 opções comerciais!
      const optById = new Map(musc.commercial_price_options.map((o) => [o.id, o]));
      const addons = musc.optional_addons.options;
      assert.equal(addons.filter((a) => addonAppliesToBaseOption(a, optById.get(optAnualId))).length, 4, 'Anual deve exibir os 4 complementos habilitados');
      for (const blockedId of [optMensalLivreId, optTrimLivreId, optSemLivreId, optMensal3xId, optTrim3xId, optSem3xId]) {
        assert.equal(
          addons.filter((a) => addonAppliesToBaseOption(a, optById.get(blockedId))).length,
          0,
          `Opção ${blockedId} NÃO deve exibir complementos`
        );
      }
    });

    await test('[05] Edição de preço/rótulo do plano Anual preserva vínculos por ID estável; remoção de opção comercial não vaza complemento para outros planos', async () => {
      // Adiciona opção temporária 'opt-temp-anual-2' com complemento exclusivo, depois remove 'opt-temp-anual-2'
      const rList = await req(server, 'GET', '/v1/services', authAdmin);
      const musc = rList.data.find((s) => s.id === muscSrvId);
      const tempOptId = 'opt-temp-especial';
      const tempAddonId = 'addon-temp-exclusivo';

      const withTemp = await req(server, 'PUT', `/v1/services/${muscSrvId}`, {
        ...authAdmin,
        body: {
          commercialPriceOptions: [
            ...musc.commercial_price_options.map((o) => (o.id === optAnualId ? { ...o, label: 'Anual — Acesso livre VIP' } : o)),
            { id: tempOptId, label: 'Especial 2 meses', accessType: 'unlimited', frequencyType: 'unlimited', contractDurationCode: '2_months', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 14000, allowOptionalAddons: true }
          ],
          optionalAddons: {
            ...musc.optional_addons,
            options: [
              ...musc.optional_addons.options,
              {
                id: tempAddonId,
                addonServiceId: personalSrvId,
                label: 'Complemento Exclusivo Temp',
                active: true,
                allowPublicBooking: true,
                acceptedBaseOptionIds: [tempOptId],
                baseOptionRestrictionMode: 'selected',
                frequencyType: 'weekly',
                frequencyCount: 1,
                creditMode: 'fixed_credits',
                creditsPerCycle: 4,
                additionalPriceCents: 10000,
                billingPeriodicity: 'monthly',
                durationMode: '1_month',
                scheduleTiming: 'after_confirmation'
              }
            ]
          }
        }
      });
      assert.equal(withTemp.status, 200);

      // Agora remove 'opt-temp-especial' e restaura label original do Anual
      const afterRemove = await req(server, 'PUT', `/v1/services/${muscSrvId}`, {
        ...authAdmin,
        body: {
          commercialPriceOptions: musc.commercial_price_options
        }
      });
      assert.equal(afterRemove.status, 200);

      const reloaded = (await req(server, 'GET', '/v1/services', authAdmin)).data.find((s) => s.id === muscSrvId);
      const tempAddon = reloaded.optional_addons.options.find((o) => o.id === tempAddonId);
      assert.ok(tempAddon);
      assert.deepEqual(tempAddon.acceptedBaseOptionIds, [], 'ID órfão deve ser removido');
      assert.equal(tempAddon.baseOptionRestrictionMode, 'selected', 'Modo restrito deve ser preservado para NÃO vazar para outros planos');
      // Confirma que tempAddon NÃO aplica a nenhuma das 7 opções restantes!
      for (const co of reloaded.commercial_price_options) {
        assert.equal(addonAppliesToBaseOption(tempAddon, co), false, `Complemento órfão jamais pode vazar para ${co.id}`);
      }
      // E os complementos do Anual continuam preservados por ID estável!
      const anualOpt = reloaded.commercial_price_options.find((o) => o.id === optAnualId);
      assert.equal(addonAppliesToBaseOption(reloaded.optional_addons.options.find((o) => o.id === addon1xId), anualOpt), true);

      // Remove o tempAddon para manter catálogo limpo
      await req(server, 'PUT', `/v1/services/${muscSrvId}`, {
        ...authAdmin,
        body: {
          optionalAddons: {
            ...reloaded.optional_addons,
            options: reloaded.optional_addons.options.filter((o) => o.id !== tempAddonId)
          }
        }
      });
    });

    console.log('\n--- Bloco 2: Cálculos Financeiros, Bloqueios em Planos Não Autorizados e Contratação Somente Musculação ---');

    await test('[06] Cálculo financeiro: R$ 99,99 sozinho; +1x R$ 120 = R$ 219,99/mês; +2x R$ 220 = R$ 319,99/mês; duração independente 1 mês vs 12 meses; periodicidades mistas separadas', async () => {
      const musc = (await req(server, 'GET', '/v1/services', authAdmin)).data.find((s) => s.id === muscSrvId);
      const anual = musc.commercial_price_options.find((o) => o.id === optAnualId);
      const a1 = musc.optional_addons.options.find((o) => o.id === addon1xId);
      const a2 = musc.optional_addons.options.find((o) => o.id === addon2xId);

      const bd1 = calculatePlanWithAddonsBreakdown({ baseOption: anual, selectedAddons: [a1] });
      assert.equal(bd1.consolidatedMonthlyCents, 21999, '99,99 + 120,00 = 219,99/mês');
      assert.equal(bd1.firstChargeDueCents, 21999);
      assert.equal(bd1.base.contractMonths, 12);
      assert.equal(bd1.addons[0].durationMonths, 1, 'Complemento mensal NÃO pode virar contrato anual automaticamente');
      assert.equal(bd1.addons[0].isIndependentDuration, true);
      assert.equal(bd1.allDurationsAligned, false);
      assert.equal(bd1.totalContractAmountCents, 9999 * 12 + 12000, 'Total considera 12 meses da base + 1 mês do complemento independente');

      const bd2 = calculatePlanWithAddonsBreakdown({ baseOption: anual, selectedAddons: [a2] });
      assert.equal(bd2.consolidatedMonthlyCents, 31999, '99,99 + 220,00 = 319,99/mês');
      assert.equal(bd2.addons[0].creditsPerCycle, 8);

      // Periodicidade mista (Base Anual à vista R$ 1.199,88 + Personal mensal R$ 120/mês) -> NÃO soma em mensal consolidado
      const anualOneTime = { ...anual, paymentPeriodicity: 'one_time', commercialUnit: 'contract_total', amountCents: 119988 };
      const bdMixed = calculatePlanWithAddonsBreakdown({ baseOption: anualOneTime, selectedAddons: [a1] });
      assert.equal(bdMixed.hasMixedPeriodicities, true);
      assert.equal(bdMixed.consolidatedMonthlyCents, null, 'Periodicidades diferentes não podem ser misturadas');
      assert.equal(bdMixed.recurringSchedules.length, 1);
      assert.equal(bdMixed.recurringSchedules[0].periodicity, 'monthly');
      assert.equal(bdMixed.recurringSchedules[0].totalCycleAmountCents, 12000);
    });

    await test('[07] Backend bloqueia tentativa de contratar Personal no plano Mensal, Trimestral, Semestral ou 3x/sem (slots e booking)', async () => {
      // Slots rejeita quando baseCommercialOptionId não autoriza o addon
      const slotReject = await req(
        server,
        'GET',
        `/v1/public/studio/slots?tenantSlug=${studio.slug}&serviceId=${personalSrvId}&baseServiceId=${muscSrvId}&addonOptionId=${addon1xId}&baseCommercialOptionId=${optMensalLivreId}`
      );
      assert.equal(slotReject.status, 400);

      // Booking rejeita para todas as 6 opções não autorizadas
      for (const blockedId of [optMensalLivreId, optTrimLivreId, optSemLivreId, optMensal3xId, optTrim3xId, optSem3xId]) {
        const b = await req(server, 'POST', '/v1/public/studio/bookings', {
          body: {
            tenantSlug: studio.slug,
            mode: 'access_plan',
            serviceId: muscSrvId,
            commercialOptionId: blockedId,
            selectedAddonOptionIds: [addonAfterConfirmId],
            startDate: nextWeekdayYmd(1, 10),
            student: { fullName: 'Aluno Bloqueado', phone: '11999990001' }
          }
        });
        assert.equal(b.status, 400, `Plano ${blockedId} deve rejeitar addon não autorizado`);
      }
    });

    let soloGymContractId = null;
    await test('[08] Contratação pública SOMENTE Musculação (Anual Acesso livre e Mensal 3x/sem): zero agenda, zero instrutor, zero sessões, zero créditos', async () => {
      const b = await req(server, 'POST', '/v1/public/studio/bookings', {
        body: {
          tenantSlug: studio.slug,
          mode: 'access_plan',
          serviceId: muscSrvId,
          commercialOptionId: optAnualId,
          selectedAddonOptionIds: [],
          startDate: nextWeekdayYmd(1, 10),
          student: { fullName: 'Gabriel Somente Academia', phone: '11988880001', email: 'gabriel.solo@test.com' }
        }
      });
      assert.equal(b.status, 201, JSON.stringify(b.data));
      assert.equal(b.data.status, 'awaiting_confirmation');
      assert.equal((b.data.appointments || []).length, 0, 'Não deve criar sessões fictícias de musculação');

      const approve = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${b.data.id}/approve`, authAdmin);
      assert.equal(approve.status, 200, JSON.stringify(approve.data));
      soloGymContractId = approve.data.billingPlanId || approve.data.recurringPlanId || approve.data.contractId;
      assert.ok(soloGymContractId, JSON.stringify(approve.data));

      // Verifica detalhe da matrícula: zero agendamentos, zero créditos de personal
      const det = await req(server, 'GET', `/v1/studio/enrollments/${soloGymContractId}`, authAdmin);
      assert.equal(det.status, 200);
      assert.equal(det.data.appointments.length, 0);
      assert.equal(det.data.enrollment.creditsTotal || 0, 0, 'Somente academia não deve exibir créditos de personal');

      // Testa também contratação Mensal 3x/sem sem agendamento
      const b3x = await req(server, 'POST', '/v1/public/studio/bookings', {
        body: {
          tenantSlug: studio.slug,
          mode: 'access_plan',
          serviceId: muscSrvId,
          commercialOptionId: optMensal3xId,
          startDate: nextWeekdayYmd(1, 10),
          student: { fullName: 'Maria 3x Semana', phone: '11988880002' }
        }
      });
      assert.equal(b3x.status, 201);
      assert.equal((b3x.data.appointments || []).length, 0);
    });

    console.log('\n--- Bloco 3: Agenda Real do Complemento Personal, Grupo até 4 Alunos, Créditos Fixos vs Semanal Garantida e Concorrência ---');

    const fiveMonStart = findNext5OccurrenceMondayStart(); // 1º do mês que cai numa segunda (5 segundas no mês!)
    let combinedContractId = null;
    let combinedAddonEntId = null;

    await test('[09] Personal 1x/sem com 4 créditos fixos em mês com 5 segundas gera EXATAMENTE 4 sessões (NUNCA 5ª sessão obrigatória) e cobra R$ 219,99', async () => {
      const slotRes = await req(
        server,
        'GET',
        `/v1/public/studio/slots?tenantSlug=${studio.slug}&serviceId=${personalSrvId}&baseServiceId=${muscSrvId}&addonOptionId=${addon1xId}&baseCommercialOptionId=${optAnualId}&date=${fiveMonStart}`
      );
      assert.equal(slotRes.status, 200, JSON.stringify(slotRes.data));
      assert.ok(slotRes.data.slots.length > 0, `Deve haver horário às 08:00 em ${fiveMonStart}`);
      const slot08 = slotRes.data.slots.find((s) => s.time === '08:00');
      assert.ok(slot08);
      assert.equal(slot08.capacity, 4);
      assert.equal(slot08.remainingSpots, 4);

      const b = await req(server, 'POST', '/v1/public/studio/bookings', {
        body: {
          tenantSlug: studio.slug,
          mode: 'access_plan',
          serviceId: muscSrvId,
          commercialOptionId: optAnualId,
          selectedAddonOptionIds: [addon1xId],
          startDate: fiveMonStart,
          addonSchedules: [
            {
              addonOptionId: addon1xId,
              serviceId: personalSrvId,
              professionalId: studio.profPersonalId,
              classScheduleId: personalClassSchedMonId,
              modality: 'presential',
              startTime: `${fiveMonStart}T08:00:00`,
              endTime: `${fiveMonStart}T09:00:00`,
              recurrence: { frequency: 'weekly', durationCode: '1_month' }
            }
          ],
          student: { fullName: 'Gabriel Combo 1x', phone: '11988881001', email: 'gabriel.combo@test.com' }
        }
      });
      assert.equal(b.status, 201, JSON.stringify(b.data));
      assert.equal(b.data.appointments.length, 4, '4 créditos fixos em mês de 5 segundas deve gerar EXATAMENTE 4 aulas, nunca 5!');

      const appRes = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${b.data.id}/approve`, authAdmin);
      assert.equal(appRes.status, 200, JSON.stringify(appRes.data));
      combinedContractId = appRes.data.contractId || appRes.data.packageContract?.id;
      assert.ok(combinedContractId, JSON.stringify(appRes.data));

      const det = await req(server, 'GET', `/v1/studio/enrollments/${combinedContractId}`, authAdmin);
      assert.equal(det.status, 200);
      assert.equal(det.data.appointments.length, 4);
      const baseEnt = det.data.entitlements.find((e) => e.entitlement_role === 'base');
      const addonEnt = det.data.entitlements.find((e) => e.entitlement_role === 'addon');
      assert.ok(baseEnt && addonEnt, 'Benefícios de Musculação e Personal devem estar registrados separadamente');
      assert.equal(baseEnt.entitlement_type, 'facility_access');
      assert.equal(baseEnt.credits_total, 0);
      assert.equal(addonEnt.credit_mode_snapshot, 'fixed_credits');
      assert.equal(addonEnt.credits_total, 4);
      assert.equal(addonEnt.addon_pricing.durationMonths, 1);
      assert.ok(addonEnt.addon_pricing.endDate, 'Vigência independente do complemento deve estar registrada');
      combinedAddonEntId = addonEnt.id;

      // Cobrança única consolidada inicial = R$ 219,99 (sem duplicidade)
      assert.equal(det.data.payments.length, 1);
      assert.equal(Number(det.data.payments[0].amount), 219.99);
    });

    await test('[10] Grupo até 4 alunos: 4 alunos compartilham a MESMA class_occurrence (sem bloquear profissional 4x), 5º aluno é bloqueado (CLASS_FULL)', async () => {
      // Aluno 1 (Gabriel) já está na turma de 08:00 em fiveMonStart (restam 3 vagas)
      const checkAfter1 = await req(
        server,
        'GET',
        `/v1/public/studio/slots?tenantSlug=${studio.slug}&serviceId=${personalSrvId}&baseServiceId=${muscSrvId}&addonOptionId=${addon1xId}&baseCommercialOptionId=${optAnualId}&date=${fiveMonStart}`
      );
      const slotAfter1 = checkAfter1.data.slots.find((s) => s.time === '08:00');
      assert.equal(slotAfter1.remainingSpots, 3, 'Após 1º aluno devem restar 3 vagas na turma de 4');

      // Inscreve e aprova alunos 2 e 3 no mesmo horário (08:00)
      for (const n of [2, 3]) {
        const b = await req(server, 'POST', '/v1/public/studio/bookings', {
          body: {
            tenantSlug: studio.slug,
            mode: 'access_plan',
            serviceId: muscSrvId,
            commercialOptionId: optAnualId,
            selectedAddonOptionIds: [addon1xId],
            startDate: fiveMonStart,
            addonSchedules: [
              {
                addonOptionId: addon1xId,
                serviceId: personalSrvId,
                professionalId: studio.profPersonalId,
                classScheduleId: personalClassSchedMonId,
                modality: 'presential',
                startTime: `${fiveMonStart}T08:00:00`,
                endTime: `${fiveMonStart}T09:00:00`,
                recurrence: { frequency: 'weekly', durationCode: '1_month' }
              }
            ],
            student: { fullName: `Aluno Grupo ${n}`, phone: `1198888100${n}` }
          }
        });
        assert.equal(b.status, 201, `Aluno ${n} deve conseguir vaga na turma de 4`);
        const ap = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${b.data.id}/approve`, authAdmin);
        assert.equal(ap.status, 200);
      }

      // Verifica que resta exatamente 1 vaga!
      const checkAfter3 = await req(
        server,
        'GET',
        `/v1/public/studio/slots?tenantSlug=${studio.slug}&serviceId=${personalSrvId}&baseServiceId=${muscSrvId}&addonOptionId=${addon1xId}&baseCommercialOptionId=${optAnualId}&date=${fiveMonStart}`
      );
      assert.equal(checkAfter3.data.slots.find((s) => s.time === '08:00').remainingSpots, 1, 'Deve restar exatamente 1 última vaga');

      // Corrida simultânea na última (4ª) vaga: aluno 4 e aluno 5 tentam ao mesmo tempo
      const [res4, res5] = await Promise.all([
        req(server, 'POST', '/v1/public/studio/bookings', {
          body: {
            tenantSlug: studio.slug,
            mode: 'access_plan',
            serviceId: muscSrvId,
            commercialOptionId: optAnualId,
            selectedAddonOptionIds: [addon1xId],
            startDate: fiveMonStart,
            addonSchedules: [{
              addonOptionId: addon1xId, serviceId: personalSrvId, professionalId: studio.profPersonalId,
              classScheduleId: personalClassSchedMonId, modality: 'presential',
              startTime: `${fiveMonStart}T08:00:00`, endTime: `${fiveMonStart}T09:00:00`,
              recurrence: { frequency: 'weekly', durationCode: '1_month' }
            }],
            student: { fullName: 'Aluno Grupo 4', phone: '11988881004' }
          }
        }),
        req(server, 'POST', '/v1/public/studio/bookings', {
          body: {
            tenantSlug: studio.slug,
            mode: 'access_plan',
            serviceId: muscSrvId,
            commercialOptionId: optAnualId,
            selectedAddonOptionIds: [addon1xId],
            startDate: fiveMonStart,
            addonSchedules: [{
              addonOptionId: addon1xId, serviceId: personalSrvId, professionalId: studio.profPersonalId,
              classScheduleId: personalClassSchedMonId, modality: 'presential',
              startTime: `${fiveMonStart}T08:00:00`, endTime: `${fiveMonStart}T09:00:00`,
              recurrence: { frequency: 'weekly', durationCode: '1_month' }
            }],
            student: { fullName: 'Aluno Grupo 5 Excedente', phone: '11988881005' }
          }
        })
      ]);

      const statuses = [res4.status, res5.status].sort();
      assert.deepEqual(statuses, [201, 409], 'Corrida na última vaga deve aprovar 1 reserva e bloquear a outra com 409');
      const winner = res4.status === 201 ? res4 : res5;
      const app4 = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${winner.data.id}/approve`, authAdmin);
      assert.equal(app4.status, 200);

      // Todos os 4 alunos devem compartilhar UMA ÚNICA class_occurrence em fiveMonStart 08:00!
      const occs = db.prepare(`
        SELECT id, capacity FROM class_occurrences
        WHERE tenant_id = ? AND service_id = ? AND start_time = ? AND status != 'cancelled'
      `).all(studio.tenantId, personalSrvId, `${fiveMonStart}T08:00:00`);
      assert.equal(occs.length, 1, 'Os 4 alunos devem compartilhar 1 única ocorrência de turma');
      assert.equal(Number(occs[0].capacity), 4);
      const enrolledAppts = db.prepare(`
        SELECT id, occurrence_id FROM appointments
        WHERE tenant_id = ? AND occurrence_id = ? AND status != 'cancelled'
      `).all(studio.tenantId, occs[0].id);
      assert.equal(enrolledAppts.length, 4);

      // Horário agora está lotado (0 vagas)
      const checkFull = await req(
        server,
        'GET',
        `/v1/public/studio/slots?tenantSlug=${studio.slug}&serviceId=${personalSrvId}&baseServiceId=${muscSrvId}&addonOptionId=${addon1xId}&baseCommercialOptionId=${optAnualId}&date=${fiveMonStart}`
      );
      const slotFull = checkFull.data.slots.find((s) => s.time === '08:00');
      assert.ok(!slotFull || slotFull.isFull || slotFull.remainingSpots === 0, 'Turma lotada não deve oferecer novas vagas');
    });

    await test('[11] Personal 2x/sem (8 créditos fixos R$ 220/mês) gera EXATAMENTE 8 aulas (R$ 319,99/mês) e weekly_guaranteed gera todas as 5 segundas do mês', async () => {
      // Usa sexta-feira 18:00 e quarta-feira 08:00 (vagas livres!)
      const firstWed = new Date(`${fiveMonStart}T12:00:00Z`);
      firstWed.setUTCDate(firstWed.getUTCDate() + 2); // quarta-feira da mesma semana
      const wedIso = firstWed.toISOString().slice(0, 10);
      const firstFri = new Date(`${fiveMonStart}T12:00:00Z`);
      firstFri.setUTCDate(firstFri.getUTCDate() + 4); // sexta-feira da mesma semana
      const friIso = firstFri.toISOString().slice(0, 10);
      const friSchedId = db.prepare(`SELECT id FROM class_schedules WHERE service_id = ? AND day_of_week = 5 AND active = 1`).get(personalSrvId).id;

      // 2x/sem com 8 créditos fixos
      const b2x = await req(server, 'POST', '/v1/public/studio/bookings', {
        body: {
          tenantSlug: studio.slug,
          mode: 'access_plan',
          serviceId: muscSrvId,
          commercialOptionId: optAnualId,
          selectedAddonOptionIds: [addon2xId],
          startDate: fiveMonStart,
          addonSchedules: [
            {
              addonOptionId: addon2xId, serviceId: personalSrvId, professionalId: studio.profPersonalId,
              classScheduleId: personalClassSchedWedId, modality: 'presential',
              startTime: `${wedIso}T08:00:00`, endTime: `${wedIso}T09:00:00`,
              recurrence: { frequency: 'weekly', durationCode: '1_month' }
            },
            {
              addonOptionId: addon2xId, serviceId: personalSrvId, professionalId: studio.profPersonalId,
              classScheduleId: friSchedId, modality: 'presential',
              startTime: `${friIso}T18:00:00`, endTime: `${friIso}T19:00:00`,
              recurrence: { frequency: 'weekly', durationCode: '1_month' }
            }
          ],
          student: { fullName: 'Aluno Personal 2x', phone: '11988882001' }
        }
      });
      assert.equal(b2x.status, 201, JSON.stringify(b2x.data));
      assert.equal(b2x.data.appointments.length, 8, 'Personal 2x/sem (8 créditos fixos) deve gerar EXATAMENTE 8 sessões');
      const ap2x = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${b2x.data.id}/approve`, authAdmin);
      assert.equal(ap2x.status, 200);
      const det2x = await req(server, 'GET', `/v1/studio/enrollments/${ap2x.data.contractId}`, authAdmin);
      assert.equal(Number(det2x.data.payments[0].amount), 319.99, '99,99 + 220,00 = R$ 319,99/mês');
      assert.equal(det2x.data.entitlements.find((e) => e.entitlement_role === 'addon').credits_total, 8);

      // weekly_guaranteed na segunda-feira às 10:00 (mês com 5 segundas!)
      const mon10SchedId = db.prepare(`SELECT id FROM class_schedules WHERE service_id = ? AND day_of_week = 1 AND start_time = '10:00' AND active = 1`).get(personalSrvId).id;

      const bGuar = await req(server, 'POST', '/v1/public/studio/bookings', {
        body: {
          tenantSlug: studio.slug,
          mode: 'access_plan',
          serviceId: muscSrvId,
          commercialOptionId: optAnualId,
          selectedAddonOptionIds: [addonWeeklyGuarId],
          startDate: fiveMonStart,
          addonSchedules: [{
            addonOptionId: addonWeeklyGuarId, serviceId: personalSrvId, professionalId: studio.profPersonalId,
            classScheduleId: mon10SchedId, modality: 'presential',
            startTime: `${fiveMonStart}T10:00:00`, endTime: `${fiveMonStart}T11:00:00`,
            recurrence: { frequency: 'weekly', durationCode: '1_month' }
          }],
          student: { fullName: 'Aluno Semanal Garantida', phone: '11988882002' }
        }
      });
      assert.equal(bGuar.status, 201, JSON.stringify(bGuar.data));
      assert.equal(bGuar.data.appointments.length, 5, 'Frequência semanal garantida em mês de 5 segundas deve gerar todas as 5 ocorrências!');
      const apGuar = await req(server, 'POST', `/v1/studio/enrollments/public-requests/${bGuar.data.id}/approve`, authAdmin);
      assert.equal(apGuar.status, 200);
      const detGuar = await req(server, 'GET', `/v1/studio/enrollments/${apGuar.data.contractId}`, authAdmin);
      assert.equal(detGuar.data.entitlements.find((e) => e.entitlement_role === 'addon').credit_mode_snapshot, 'weekly_guaranteed');
    });

    await test('[12] Agendamento posterior à aprovação (`after_confirmation`) permite concluir solicitação sem selecionar horário antecipadamente', async () => {
      const b = await req(server, 'POST', '/v1/public/studio/bookings', {
        body: {
          tenantSlug: studio.slug,
          mode: 'access_plan',
          serviceId: muscSrvId,
          commercialOptionId: optAnualId,
          selectedAddonOptionIds: [addonAfterConfirmId],
          startDate: fiveMonStart,
          student: { fullName: 'Aluno Pós Aprovação', phone: '11988882003' }
        }
      });
      assert.equal(b.status, 201, JSON.stringify(b.data));
      assert.equal((b.data.appointments || []).length, 0);
    });

    console.log('\n--- Bloco 4: Matrículas, Cancelamento Independente do Complemento, Renovação da Base e Permissões ---');

    await test('[13] Cancelar APENAS o complemento Personal mantém Musculação Anual ativa, cancela sessões futuras do Personal, reduz cobrança pendente e registra histórico', async () => {
      const cancelRes = await req(
        server,
        'POST',
        `/v1/studio/enrollments/${combinedContractId}/entitlements/${combinedAddonEntId}/cancel`,
        {
          ...authAdmin,
          body: { reason: 'Aluno optou por seguir apenas na musculação' }
        }
      );
      assert.equal(cancelRes.status, 200, JSON.stringify(cancelRes.data));

      const det = await req(server, 'GET', `/v1/studio/enrollments/${combinedContractId}`, authAdmin);
      assert.equal(det.status, 200);
      assert.equal(det.data.enrollment.contractStatus, 'active', 'Plano-base Musculação deve permanecer ATIVO');
      const baseEnt = det.data.entitlements.find((e) => e.entitlement_role === 'base');
      const addonEnt = det.data.entitlements.find((e) => e.id === combinedAddonEntId);
      assert.notEqual(baseEnt.entitlement_status, 'cancelled');
      assert.equal(addonEnt.entitlement_status, 'cancelled');
      assert.ok(det.data.appointments.every((a) => a.status === 'cancelled'), 'Sessões futuras do Personal cancelado devem ser canceladas');
      assert.equal(Number(det.data.payments[0].amount), 99.99, 'Cobrança pendente combinada (219,99) deve reduzir exatamente para 99,99 da musculação');
      assert.ok(det.data.history.some((h) => h.action === 'CANCEL_ADDON'));
    });

    await test('[14] Renovação do plano-base (Musculação solo) estende vigência sem erro + Profissional não vê valores financeiros administrativos', async () => {
      const renewRes = await req(server, 'POST', `/v1/studio/enrollments/${soloGymContractId}/lifecycle`, {
        ...authAdmin,
        body: { action: 'renew', generateRenewalCharge: true }
      });
      assert.equal(renewRes.status, 200, JSON.stringify(renewRes.data));

      // RBAC: profissional consulta matrícula e não recebe valores financeiros administrativos
      const profDet = await req(server, 'GET', `/v1/studio/enrollments/${combinedContractId}`, authProf);
      assert.equal(profDet.status, 200);
      assert.equal(profDet.data.payments.length, 0, 'Profissional não deve ver faturas/pagamentos administrativos');
    });

    console.log('\n--- Bloco 5: Importação Inteligente com IA (Musculação + Personal + Escopo por Plano) ---');

    await test('[15] IA extrai lote combinado (tabela Musculação + tabela Personal até 4 alunos), pergunta quais planos aceitam, bloqueia se não confirmado, vincula SOMENTE o Anual sem duplicar', async () => {
      const extractedProposal = normalizeProposal(
        {
          services: [
            {
              name: 'Musculação Importada',
              type: 'access_unlimited',
              modality: 'presential',
              prices: [
                { label: 'Mensal — Acesso livre', amountCents: 15400, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'unlimited', frequencyCount: null, evidence: 'Mensal Livre R$ 154' },
                { label: 'Trimestral — Acesso livre', amountCents: 14300, unit: 'per_month', paymentPeriod: 'monthly', duration: '3_months', frequencyType: 'unlimited', frequencyCount: null, evidence: 'Trimestral Livre R$ 143' },
                { label: 'Semestral — Acesso livre', amountCents: 13200, unit: 'per_month', paymentPeriod: 'monthly', duration: '6_months', frequencyType: 'unlimited', frequencyCount: null, evidence: 'Semestral Livre R$ 132' },
                { label: 'Anual — Acesso livre', amountCents: 9999, unit: 'per_month', paymentPeriod: 'monthly', duration: '12_months', frequencyType: 'unlimited', frequencyCount: null, evidence: 'Anual Livre R$ 99,99' },
                { label: 'Mensal — 3x por semana', amountCents: 13200, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 3, evidence: 'Mensal 3x/sem R$ 132' }
              ],
              schedules: [{ dayOfWeek: 1, startTime: '06:00', endTime: '22:00', evidence: 'Horário de funcionamento' }],
              professionalNames: ['Personal Bruno']
            },
            {
              name: 'Personal Acompanhamento IA',
              type: 'group',
              modality: 'presential',
              capacity: 4,
              durationMinutes: 60,
              notes: 'Grupos de até 4 alunos. Mensalidade da academia cobrada separadamente.',
              prices: [
                { label: '1x por semana (4 aulas/mês)', amountCents: 12000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 1, creditMode: 'fixed_credits', creditsPerCycle: 4, evidence: '1x/sem 4 aulas/mês R$ 120' },
                { label: '2x por semana (8 aulas/mês)', amountCents: 22000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 2, creditMode: 'fixed_credits', creditsPerCycle: 8, evidence: '2x/sem 8 aulas/mês R$ 220' }
              ]
            }
          ],
          packages: []
        },
        2,
        true
      );

      const gymProp = extractedProposal.services.find((s) => s.name === 'Musculação Importada');
      const persProp = extractedProposal.services.find((s) => s.name === 'Personal Acompanhamento IA');
      assert.ok(gymProp && persProp);
      assert.equal(gymProp.schedules.length, 0, 'Musculação importada não deve gerar agenda profissional');
      assert.equal(gymProp.professionalNames.length, 0, 'Musculação importada não deve vincular instrutor');
      assert.equal(gymProp.optionalAddons.length, 2, 'IA deve propor 2 complementos (1x R$ 120 e 2x R$ 220) a partir da tabela separada');
      assert.ok(gymProp.optionalAddons.every((a) => a.baseOptionScopeUnclear === true && a.baseOptionScopeMode === 'undecided'), 'Não pode auto-vincular a todos os planos');
      assert.ok(gymProp.issues.some((i) => i.includes('Em quais planos este acompanhamento poderá ser contratado?')));

      // Diagnóstico emite alerta bloqueante pedindo escolha de planos (usa studioB limpo para importar Musculação + Personal sem conflitar com studioA)
      const catalog = readStudioImportCatalog(studioB.tenantId);
      const pendingProposal = {
        services: [
          { ...gymProp, action: 'create', reviewed: true, issues: [], optionalAddons: gymProp.optionalAddons.map((a) => ({ ...a, addonServiceRef: persProp.key })) },
          { ...persProp, action: 'create', reviewed: true, issues: [], professionalId: studioB.profPersonalId }
        ],
        packages: []
      };
      const diag = buildProposalDiagnostics(studioB.tenantId, pendingProposal, catalog, { services: {}, packages: {} });
      assert.ok(diag.alerts.some((al) => al.id.startsWith('addon-scope-') && al.severity === 'blocking'));

      // Confirmação falha enquanto o gestor não escolher quais planos aceitam o complemento
      assert.throws(() => {
        applyStudioCatalog({ tenantId: studioB.tenantId, user: { userId: studioB.adminId } }, pendingProposal);
      }, /Em quais planos/i);

      // Gestor seleciona SOMENTE "Anual — Acesso livre" (p4) na revisão e confirma
      const anualPrice = gymProp.prices.find((p) => p.duration === '12_months');
      assert.ok(anualPrice && anualPrice.key);
      const confirmedProposal = {
        services: [
          {
            ...gymProp,
            action: 'create',
            reviewed: true,
            issues: [],
            optionalAddons: gymProp.optionalAddons.map((a) => ({
              ...a,
              addonServiceRef: persProp.key,
              baseOptionScopeMode: 'selected',
              baseOptionScopeUnclear: false,
              acceptedBasePriceKeys: [anualPrice.key]
            }))
          },
          { ...persProp, action: 'create', reviewed: true, issues: [], professionalId: studioB.profPersonalId }
        ],
        packages: []
      };

      const receipt = applyStudioCatalog({ tenantId: studioB.tenantId, user: { userId: studioB.adminId } }, confirmedProposal);
      assert.equal(receipt.services.length, 2);

      // Tentar importar novamente no mesmo estabelecimento é bloqueado contra duplicação!
      assert.throws(() => {
        applyStudioCatalog({ tenantId: studioB.tenantId, user: { userId: studioB.adminId } }, confirmedProposal);
      }, /Já existe um serviço/i);

      // Verifica no catálogo oficial salvo!
      const savedGym = db.prepare(`SELECT * FROM services WHERE id = ?`).get(receipt.services[0].id);
      assert.equal(savedGym.professional_id, null);
      assert.equal(Number(savedGym.requires_appointment), 0);
      const savedCommOpts = normalizeCommercialPriceOptions(savedGym.commercial_price_options_json, { studioServiceType: 'facility_access' });
      const savedAnual = savedCommOpts.find((o) => o.contractDurationCode === '12_months');
      const savedMensal = savedCommOpts.find((o) => o.contractDurationCode === '1_month' && o.accessType === 'unlimited');
      const saved3x = savedCommOpts.find((o) => o.frequencyCount === 3);
      assert.equal(savedAnual.allowOptionalAddons, true);
      assert.equal(savedMensal.allowOptionalAddons, false);
      assert.equal(saved3x.allowOptionalAddons, false);
      assert.equal(saved3x.accessType, 'limited');

      const savedAddons = JSON.parse(savedGym.optional_addons_json);
      assert.equal(savedAddons.enabled, true);
      assert.equal(savedAddons.allowMultiple, false, 'Opções do mesmo serviço complementar (1x vs 2x) devem ser escolha única');
      assert.equal(savedAddons.options.length, 2);
      for (const ao of savedAddons.options) {
        assert.deepEqual(ao.acceptedBaseOptionIds, [savedAnual.id], 'Addon deve apontar SOMENTE para o ID real do plano Anual');
        assert.equal(ao.baseOptionRestrictionMode, 'selected');
        assert.equal(addonAppliesToBaseOption(ao, savedAnual), true);
        assert.equal(addonAppliesToBaseOption(ao, savedMensal), false);
        assert.equal(addonAppliesToBaseOption(ao, saved3x), false);
      }
    });

    console.log('\n--- Bloco 6: Regressão (Avulsa + Planos, Multi-tenant e Clínica Pura) ---');

    await test('[16] Serviço coletivo com aula avulsa + planos (Zumba) preservado + isolamento multi-tenant + clínica pura inalterada', async () => {
      const zRes = await req(server, 'POST', '/v1/services', {
        ...authAdmin,
        body: {
          name: 'Zumba Studio',
          serviceDomain: 'studio',
          studioServiceType: 'group',
          serviceKind: 'group',
          defaultCapacity: 15,
          professionalId: studio.profPersonalId,
          durationMinutes: 50,
          modality: 'presential',
          allowSingleBooking: true,
          allowPlanBooking: true,
          price: 45,
          billingMode: 'monthly',
          periodicPrice: 150,
          commercialPriceOptions: [
            { id: 'z-m-2x', label: 'Mensal 2x/sem', accessType: 'scheduled', frequencyType: 'weekly', frequencyCount: 2, contractDurationCode: '1_month', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 15000 }
          ]
        }
      });
      assert.equal(zRes.status, 201);
      zumbaSrvId = zRes.data.id;
      const zRow = db.prepare(`SELECT price, requires_appointment, studio_service_type FROM services WHERE id = ?`).get(zumbaSrvId);
      assert.equal(Number(zRow.price), 45);
      assert.equal(Number(zRow.requires_appointment), 1);

      // Multi-tenant: Studio B não consegue acessar nem vincular serviço do Studio A
      const cross = await req(server, 'POST', '/v1/services', {
        ...authAdminB,
        body: {
          name: 'Academia B',
          serviceDomain: 'studio',
          studioServiceType: 'facility_access',
          modality: 'presential',
          billingMode: 'monthly',
          periodicPrice: 100,
          optionalAddons: {
            enabled: true,
            options: [{ id: 'x1', addonServiceId: personalSrvId, label: 'Cross', additionalPriceCents: 10000 }]
          }
        }
      });
      assert.equal(cross.status, 400, 'Cross-tenant addon link deve ser bloqueado');

      // Clínica pura continua funcionando sem optionalAddons e rejeitando payload Studio
      const clinOk = await req(server, 'POST', '/v1/services', {
        ...authClinic,
        body: {
          name: 'Sessão de Psicoterapia',
          professionalId: 'prof-clin-1',
          durationMinutes: 50,
          price: 200,
          modality: 'both'
        }
      });
      assert.equal(clinOk.status, 201);
      const clinBad = await req(server, 'POST', '/v1/services', {
        ...authClinic,
        body: {
          name: 'Clínica com Addon',
          professionalId: 'prof-clin-1',
          durationMinutes: 50,
          price: 200,
          optionalAddons: { enabled: true, options: [{ id: 'c1', addonServiceId: clinOk.data.id, label: 'X', additionalPriceCents: 5000 }] }
        }
      });
      assert.equal(clinBad.status, 400, 'Clínica pura não deve aceitar optionalAddons de Studio');
    });

    await test('[17] Serviço legado (studio_service_type=individual mas com opções accessType=unlimited) ainda é tratado como não agendável sem exigir horários', async () => {
      const legacy = await req(server, 'POST', '/v1/services', {
        ...authAdmin,
        body: {
          name: 'Academia Legada',
          serviceDomain: 'studio',
          studioServiceType: 'individual',
          professionalId: studio.profPersonalId,
          durationMinutes: 60,
          modality: 'presential',
          allowSingleBooking: false,
          allowPlanBooking: true,
          allowPublicBooking: true,
          allowPublicPlanBooking: true,
          billingMode: 'monthly',
          periodicPrice: 99.99,
          commercialPriceOptions: [
            { id: 'leg-anual', label: 'Anual — Acesso livre', accessType: 'unlimited', frequencyType: 'unlimited', contractDurationCode: '12_months', paymentPeriodicity: 'monthly', commercialUnit: 'per_month', amountCents: 9999 }
          ]
        }
      });
      assert.equal(legacy.status, 201);
      const pub = await req(server, 'GET', `/v1/public/tenants/${studio.slug}`);
      const legPub = pub.data.services.find((s) => s.id === legacy.data.id);
      assert.equal(isServiceNonScheduledForPublic(legPub), true);
      assert.equal(isCommercialOptionNonScheduled(legPub, legPub.commercial_price_options[0]), true);

      // Booking público sem horário/profissional deve funcionar direto como access_plan!
      const bLeg = await req(server, 'POST', '/v1/public/studio/bookings', {
        body: {
          tenantSlug: studio.slug,
          mode: 'service',
          serviceId: legacy.data.id,
          commercialOptionId: 'leg-anual',
          startDate: nextWeekdayYmd(1, 10),
          student: { fullName: 'Aluno Legado', phone: '11988883001' }
        }
      });
      assert.equal(bLeg.status, 201, JSON.stringify(bLeg.data));
      assert.equal((bLeg.data.appointments || []).length, 0);
    });

    console.log('\n==============================================================================');
    console.log(` RESUMO DEFINITIVO: ${passed} PASSARAM | ${failed} FALHARAM`);
    console.log('==============================================================================');
    if (failed > 0) process.exitCode = 1;
  } finally {
    await new Promise((r) => server.close(r));
    try { db.close(); } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      try { if (fs.existsSync(TEST_DB + suffix)) fs.unlinkSync(TEST_DB + suffix); } catch {}
    }
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  }
})();
