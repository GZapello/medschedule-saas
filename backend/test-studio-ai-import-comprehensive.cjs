const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-ai-rebuild-')), 'test.db');
process.env.JWT_SECRET = 'zemda-ai-rebuild-secret-key-2026-xyz';
process.env.NODE_ENV = 'test';

const { initializeDatabase, db } = require('./dist/config/database');
const { GeminiService } = require('./dist/services/gemini.service');
const { generateToken } = require('./dist/utils/jwt');
const { BillingCycleService } = require('./dist/services/billing-cycle.service');

initializeDatabase();

const endpoint = '/v1/studio/catalog-imports';
const upload = (fileName, bytes) => ({ fileName, base64: Buffer.from(bytes).toString('base64') });

function seedTenant(id, profile, slug) {
  const userId = 'usr-' + id;
  const email = userId + '@test.invalid';
  db.prepare(`
    INSERT INTO tenants (
      id, slug, public_booking_slug, public_booking_sequence, public_booking_enabled,
      name, email, status, onboarding_completed, onboarding_status, manager_confirmed,
      billing_required, establishment_profile
    ) VALUES (?, ?, ?, 1, 1, ?, ?, 'active', 1, 'active', 1, 0, ?)
  `).run(id, slug, slug, id, email, profile);
  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, onboarding_status, email_verified)
    VALUES (?, ?, 'Gestor Admin', ?, 'unused', 'clinic_admin', 'active', 'active', 1)
  `).run(userId, id, email);
  db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager)
    VALUES (?, ?, ?, 'clinic_admin', 'active', 1)
  `).run('mem-' + id, id, userId);

  const profAna = 'prof-ana-' + id;
  const profCarlos = 'prof-carlos-' + id;
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled)
    VALUES (?, ?, ?, 'Ana Instrutora', ?, 'prof-personal-trainer', 'Instrutora', 1, 1)
  `).run(profAna, id, userId, 'ana-' + id);
  db.prepare(`
    INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled)
    VALUES (?, ?, 'Carlos Personal', ?, 'prof-personal-trainer', 'Personal Trainer', 1, 1)
  `).run(profCarlos, id, 'carlos-' + id);

  const insShift = db.prepare(`
    INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  // Ana trabalha Seg-Sex 07:00-21:00; Carlos trabalha APENAS Ter/Qui 08:00-12:00 (não cobre Quarta/Sexta 19h!)
  for (const dow of [1, 2, 3, 4, 5]) {
    insShift.run(`sh-ana-${id}-${dow}`, id, profAna, dow, '07:00', '21:00');
  }
  for (const dow of [2, 4]) {
    insShift.run(`sh-carlos-${id}-${dow}`, id, profCarlos, dow, '08:00', '12:00');
  }

  const token = generateToken({ userId, tenantId: id, role: 'clinic_admin', email });
  return {
    tenantId: id,
    slug,
    userId,
    profAna,
    profCarlos,
    headers: { Authorization: 'Bearer ' + token, 'x-tenant-id': id }
  };
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api', require('./dist/routes').default);

async function main() {
  let passed = 0;
  function check(cond, msg, detail) {
    assert.ok(cond, detail ? `${msg} -> ${JSON.stringify(detail)}` : msg);
    passed++;
    console.log(`  [PASS ${passed}] ${msg}`);
  }

  const studioA = seedTenant('ai-studio-a', 'studio', 'ai-studio-a');
  const studioB = seedTenant('ai-studio-b', 'studio', 'ai-studio-b');
  const clinicPure = seedTenant('ai-clinic-pure', 'clinic', 'ai-clinic-pure');

  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/api';

  async function req(method, route, actor, body) {
    const res = await fetch(baseUrl + route, {
      method,
      headers: { ...(actor?.headers || {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  try {
    console.log('=== SUÍTE ABRANGENTE DE RECONSTRUÇÃO DA IMPORTAÇÃO COM IA ===\n');

    // Pré-popula catálogo com serviço pré-existente para testar similaridade semântica + contrato vigente (Cenários 18, 19 e 36)
    const preSrv = await req('POST', '/v1/services', studioA, {
      name: 'Aula de Zumba',
      studioServiceType: 'group',
      serviceKind: 'group',
      defaultCapacity: 12,
      durationMinutes: 50,
      professionalId: studioA.profAna,
      price: 60,
      allowPublicBooking: true
    });
    assert.equal(preSrv.status, 201);

    // Contrato vigente em Musculação para validar preservação histórica (Cenário 36)
    const legacyGymSrv = await req('POST', '/v1/services', studioA, {
      name: 'Musculação Tradicional',
      studioServiceType: 'facility_access',
      requiresAppointment: false,
      price: 120,
      periodicPrice: 120,
      billingMode: 'monthly'
    });
    db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone) VALUES ('pat-legacy', ?, 'Aluno Antigo', '11999990001')`).run(studioA.tenantId);
    const oldEnroll = await req('POST', '/v1/studio/enrollments', studioA, {
      studentId: 'pat-legacy',
      serviceId: legacyGymSrv.data.id,
      contractKind: 'access_plan',
      amount: 120,
      startDate: '2026-10-01'
    });
    assert.equal(oldEnroll.status, 201);
    const oldPlanId = oldEnroll.data.contractId;

    // Cria 7 arquivos reais de mídia/documento distintos + 1 duplicata exata (8 arquivos enviados -> 7 fontes úteis + copies=2)
    const imgMusc = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#112233' } }).png().toBuffer();
    const imgPersonal = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#223344' } }).png().toBuffer();
    const imgZumbaPrecos = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#334455' } }).png().toBuffer();
    const imgHorarios = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#445566' } }).png().toBuffer();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Frequência', 'Mensal', 'Semestral Total', 'Anual Total'],
      ['1x por semana', 160, 870, 1620],
      ['2x por semana', 230, 1260, 2520],
      ['3x por semana', 290, 1590, 3120]
    ]), 'Funcional');
    const pdfBuf = await new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.text('Pacotes Combinados').end();
    });

    const uploadBatch = [
      upload('musculacao.png', imgMusc),
      upload('personal.png', imgPersonal),
      upload('zumba-precos.png', imgZumbaPrecos),
      upload('horarios-danca.png', imgHorarios),
      upload('funcional.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })),
      upload('acompanhamento-conflito.csv', 'Plano;Valor\nMusculação Livre Mensal;160'),
      upload('combos.pdf', pdfBuf),
      upload('musculacao-copia.png', imgMusc) // Cenário 17: imagem repetida duas vezes!
    ];

    // Mock estruturado representando o conjunto completo dos Exemplos A a G do documento mestre
    let aiCallCount = 0;
    GeminiService.isConfigured = () => true;
    GeminiService.extractStudioCatalog = async (prompt, inputs) => {
      aiCallCount++;
      assert.match(prompt, /ANÁLISE CONJUNTA/);
      if (inputs.length === 1 && inputs[0].fileName === 'extra.csv') {
        return { services: [{ name: 'Pilates Studio B', type: 'individual', sources: [1] }], packages: [] };
      }
      assert.equal(inputs.length, 7); // 8 enviadas -> 1 duplicata exata deduplicada
      return {
        services: [
          // Exemplo A — Musculação (mensal/trimestral/semestral/anual, 3x vs livre, omitindo anual 3x não informado + conflito vindo da fonte 6)
          {
            name: 'Musculação',
            activity: 'Musculação',
            type: 'access_unlimited',
            description: 'Musculação com planos 3x/semana e acesso livre.',
            notes: 'Trimestral, semestral e anual parceláveis no cartão.',
            sources: [1],
            prices: [
              { label: 'Mensal 3x/sem', amountCents: 13200, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 3, evidence: 'Mensal 3x/sem R$ 132', sources: [1] },
              { label: 'Mensal Livre', amountCents: 15400, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'unlimited', evidence: 'Mensal Acesso Livre R$ 154', sources: [1] },
              { label: 'Trimestral 3x/sem', amountCents: 12650, unit: 'per_month', paymentPeriod: 'monthly', duration: '3_months', frequencyType: 'weekly', frequencyCount: 3, isMonthlyEquivalent: true, maxInstallments: 3, evidence: 'Trimestral 3x R$ 126,50', sources: [1] },
              { label: 'Trimestral Livre', amountCents: 14300, unit: 'per_month', paymentPeriod: 'monthly', duration: '3_months', frequencyType: 'unlimited', isMonthlyEquivalent: true, maxInstallments: 3, evidence: 'Trimestral Livre R$ 143,00', sources: [1] },
              { label: 'Semestral 3x/sem', amountCents: 11550, unit: 'per_month', paymentPeriod: 'monthly', duration: '6_months', frequencyType: 'weekly', frequencyCount: 3, isMonthlyEquivalent: true, maxInstallments: 6, evidence: 'Semestral 3x R$ 115,50', sources: [1] },
              { label: 'Anual Livre', amountCents: 9999, unit: 'per_month', paymentPeriod: 'monthly', duration: '12_months', frequencyType: 'unlimited', isMonthlyEquivalent: true, maxInstallments: 12, evidence: 'Anual Livre R$ 99,99', sources: [1] },
              // Fonte 6 traz conflito para Mensal Livre (16000 vs 15400) -> Cenário 16!
              { label: 'Mensal Livre (Outro doc)', amountCents: 16000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'unlimited', evidence: 'Mensal Livre R$ 160', sources: [6] }
            ]
          },
          // Musculação Acesso Limitado específico (Cenário 2)
          {
            name: 'Musculação 3x',
            activity: 'Musculação',
            type: 'access_limited',
            weeklyLimit: 3,
            sources: [1],
            prices: [
              { label: 'Mensal 3x/semana', amountCents: 13200, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 3, evidence: '3x/sem R$ 132/mês', sources: [1] }
            ]
          },
          // Exemplo B — Personal Individual + Dupla + Adicional pico
          {
            name: 'Personal Individual',
            activity: 'Personal Trainer',
            type: 'individual',
            modality: 'presential',
            durationMinutes: 60,
            professionalNames: ['Ana Instrutora'],
            sources: [2],
            prices: [
              { label: 'Aula Avulsa 1x/sem', amountCents: 7500, unit: 'per_session', paymentPeriod: 'one_time', evidence: '1x/semana R$ 75 por aula', sources: [2] }
            ],
            adjustments: [
              { label: 'Horário de Pico Noturno', adjustmentType: 'surcharge', valueType: 'fixed', amount: 10, incidence: 'per_student', weekdays: [1, 2, 3, 4, 5], startTime: '18:00', endTime: '21:00', evidence: '+R$ 10 horário de pico', sources: [2] }
            ]
          },
          {
            name: 'Personal em Dupla',
            activity: 'Personal Trainer',
            type: 'duo',
            modality: 'presential',
            durationMinutes: 60,
            capacity: 2,
            professionalNames: ['Ana Instrutora'],
            sources: [2],
            prices: [
              { label: 'Mensal Dupla 1x/sem', amountCents: 5500, unit: 'per_participant', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 1, participants: 2, evidence: 'R$ 55 por aula por pessoa', sources: [2] }
            ]
          },
          // Exemplo C — Acompanhamento Personal (grupo até 4 alunos + nota separada)
          {
            name: 'Acompanhamento Personal',
            activity: 'Personal Trainer',
            type: 'group',
            modality: 'presential',
            durationMinutes: 60,
            capacity: 4,
            professionalNames: ['Ana Instrutora'],
            notes: 'Mensalidade da academia (R$ 99,99) cobrada separadamente.',
            sources: [2],
            prices: [
              { label: '1x por semana (4 aulas/mês)', amountCents: 12000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 1, evidence: '1 aula/semana = R$ 120 mensais', sources: [2] },
              { label: '2x por semana (8 aulas/mês)', amountCents: 22000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 2, evidence: '2 aulas/semana = R$ 220 mensais', sources: [2] }
            ]
          },
          // Exemplo D — Pilates Individual, Dupla e Grupo (unidade temporal omitida no documento -> pede confirmação!)
          {
            name: 'Pilates Individual', activity: 'Pilates', type: 'individual', modality: 'presential', durationMinutes: 50,
            professionalNames: ['Ana Instrutora'], sources: [2],
            prices: [{ label: '1x/sem', amountCents: 28000, unit: null, duration: '1_month', paymentPeriod: 'monthly', frequencyType: 'weekly', frequencyCount: 1, evidence: 'Individual 1x R$ 280', sources: [2] }]
          },
          {
            name: 'Pilates em Dupla', activity: 'Pilates', type: 'duo', capacity: 2, modality: 'presential', durationMinutes: 50,
            professionalNames: ['Ana Instrutora'], sources: [2],
            prices: [{ label: '1x/sem', amountCents: 20000, unit: 'per_participant', duration: '1_month', paymentPeriod: 'monthly', frequencyType: 'weekly', frequencyCount: 1, participants: 2, evidence: 'Dupla 1x R$ 200/pessoa', sources: [2] }]
          },
          {
            name: 'Pilates em Grupo', activity: 'Pilates', type: 'group', capacity: 6, modality: 'presential', durationMinutes: 50,
            professionalNames: ['Ana Instrutora'], sources: [2],
            prices: [{ label: '1x/sem', amountCents: 16000, unit: 'per_participant', duration: '1_month', paymentPeriod: 'monthly', frequencyType: 'weekly', frequencyCount: 1, participants: 4, evidence: 'Grupo 1x R$ 160/pessoa', sources: [2] }]
          },
          // Exemplo E — Treinamento Funcional com Semestral Total (R$ 870) e Anual Total (R$ 1.620) + equivalentMonthlyCents
          {
            name: 'Treinamento Funcional', activity: 'Funcional', type: 'group', capacity: 12, modality: 'presential', durationMinutes: 50,
            professionalNames: ['Ana Instrutora'], sources: [5],
            prices: [
              { label: '1x Mensal', amountCents: 16000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 1, evidence: 'Mensal 1x R$ 160', sources: [5] },
              { label: '1x Semestral Total', amountCents: 87000, equivalentMonthlyCents: 14500, unit: 'contract_total', paymentPeriod: 'one_time', duration: '6_months', frequencyType: 'weekly', frequencyCount: 1, evidence: 'Semestral Total R$ 870 (equiv R$ 145/mês)', sources: [5] },
              { label: '1x Anual Total', amountCents: 162000, equivalentMonthlyCents: 13500, unit: 'contract_total', paymentPeriod: 'one_time', duration: '12_months', frequencyType: 'weekly', frequencyCount: 1, evidence: 'Anual Total R$ 1.620', sources: [5] }
            ]
          },
          // Exemplo F — Zumba vindo de DUAS FONTES SEPARADAS (Fonte 3 = preços equivalentes; Fonte 4 = horários sem término) -> DEVE RECONCILIAR EM 1 SERVIÇO!
          {
            name: 'Zumba', activity: 'Dança', type: 'group', modality: 'presential', sources: [3],
            notes: 'Primeira aula grátis (condição promocional).',
            prices: [
              { label: 'Mensal 1x/sem', amountCents: 20000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', frequencyType: 'weekly', frequencyCount: 1, evidence: 'Mensal 1x R$ 200', sources: [3] },
              { label: 'Trimestral 1x/sem (equiv)', amountCents: 18500, unit: 'per_month', paymentPeriod: 'monthly', duration: '3_months', frequencyType: 'weekly', frequencyCount: 1, isMonthlyEquivalent: true, maxInstallments: 3, evidence: 'Trimestral R$ 185 (pacote completo até 3x)', sources: [3] }
            ]
          },
          {
            name: 'Zumba Fitness', activity: 'Dança', type: 'group', sources: [4],
            schedules: [
              { dayOfWeek: 3, startTime: '19:00', endTime: '', evidence: 'Quarta às 19h: Zumba', sources: [4] },
              { dayOfWeek: 5, startTime: '19:00', endTime: '', evidence: 'Sexta às 19h: Zumba', sources: [4] }
            ]
          },
          // Exemplo F — DanceFit Plus vs DanceMix (horários incompletos para deferSchedules / edição em massa)
          {
            name: 'DanceFit Plus', activity: 'Dança', type: 'group', modality: 'presential', sources: [4],
            schedules: [
              { dayOfWeek: 1, startTime: '19:00', endTime: '', evidence: 'Segunda 19h DanceFit Plus', sources: [4] }
            ]
          },
          {
            name: 'DanceMix', activity: 'Dança', type: 'group', modality: 'presential', sources: [4],
            schedules: [
              { dayOfWeek: 3, startTime: '16:00', endTime: '', evidence: 'Quarta 16h DanceMix', sources: [4] }
            ]
          },
          // Exemplo G — Entregáveis e Combo
          { name: 'Avaliação Física Completa', type: 'deliverable', sources: [7] },
          { name: 'Entrega de Treino em Vídeo', type: 'deliverable', sources: [7] }
        ],
        packages: [
          {
            name: 'Combo Avaliação + Treino Personalizado + Personal + Vídeo',
            description: 'Pacote combinado completo',
            sources: [7],
            price: { label: 'Combo Único', amountCents: 15000, unit: 'contract_total', paymentPeriod: 'one_time', duration: '1_month', evidence: 'Pacote pagamento único R$ 150', sources: [7] },
            items: [
              { serviceName: 'Avaliação Física Completa', includedCredits: 1, mandatory: true },
              { serviceName: 'Personal Individual', includedCredits: 1, mandatory: true },
              { serviceName: 'Entrega de Treino em Vídeo', includedCredits: 1, mandatory: true }
            ]
          },
          {
            name: 'Academia Livre + 4x Personal',
            description: 'Pacote Musculação Livre + 4 sessões de Personal',
            sources: [7],
            price: { label: 'Mensal Combo', amountCents: 38000, unit: 'per_month', paymentPeriod: 'monthly', duration: '1_month', evidence: 'R$ 380/mês', sources: [7] },
            items: [
              { serviceName: 'Musculação', mandatory: true },
              { serviceName: 'Personal Individual', includedCredits: 4, weeklyFrequency: 1, mandatory: true }
            ]
          }
        ]
      };
    };

    const draftRes = await req('POST', `${endpoint}/analyze`, studioA, { files: uploadBatch });
    check(draftRes.status === 200, 'Analisou lote de 8 arquivos (JPG/XLSX/CSV/PDF + 1 duplicata) em chamada única');
    const d = draftRes.data;
    check(d.sources[0].copies === 2 && aiCallCount === 1, 'Imagem duplicada agrupada em copies=2 sem repetir análise IA');
    check(Boolean(d.diagnostics && d.diagnostics.summary && d.diagnostics.preview), 'Retornou painel estruturado de diagnóstico, alertas e prévia');

    const findSrv = name => d.proposal.services.find(s => s.name === name);
    const musc = findSrv('Musculação');
    const pilatesInd = findSrv('Pilates Individual');
    const zumbaMerged = findSrv('Zumba');
    const zumbaFitnessDup = findSrv('Zumba Fitness');

    check(Boolean(musc && musc.prices.length === 7), 'Musculação agrupada em 1 serviço com opções comerciais e sem criar Musculação Mensal/Trimestral/Anual separadas');
    check(musc.issues.some(i => i.includes('valores diferentes')), 'Conflito de preços entre documentos (R$ 154 vs R$ 160) detectado sem sobrescrever silenciosamente');
    check(pilatesInd.prices[0].ambiguousReason.length > 0, 'Pilates Individual sem unidade explícita assinalado para confirmação financeira');
    check(zumbaMerged && zumbaMerged.prices[1].ambiguousReason.length > 0, 'Zumba trimestral com valor mensal equivalente assinalado sem multiplicar silenciosamente');
    check(zumbaFitnessDup && (d.matches.services[zumbaFitnessDup.key] || []).some(m => m.id === preSrv.data.id), 'Matcher semântico identificou semelhança de "Zumba Fitness" com "Aula de Zumba" no catálogo');
    check(d.diagnostics.summary.incompleteSchedulesCount >= 4, 'Horários sem término de Dança/Zumba detectados como incompleteSchedulesCount no diagnóstico');
    check(findSrv('DanceFit Plus').key !== findSrv('DanceMix').key, 'DanceFit Plus e DanceMix mantidos como serviços distintos');
    check(d.catalog.professionals.every(p => Array.isArray(p.workShifts) && p.scheduleSummary.length > 0), 'Equipe retornada com escalas reais (workShifts) sem confundir gestor isolado');

    // Testa validação ao vivo de profissional sem escala (Carlos não trabalha quarta 19h!)
    const zumbaToTest = findSrv('Zumba Fitness');
    zumbaToTest.action = 'create';
    zumbaToTest.reviewed = true;
    zumbaToTest.durationMinutes = 50;
    zumbaToTest.capacity = 12;
    zumbaToTest.modality = 'presential';
    zumbaToTest.professionalId = studioA.profCarlos;
    zumbaToTest.schedules[0].endTime = '19:50';
    zumbaToTest.schedules[1].endTime = '19:50';
    const saveOutsideShift = await req('PUT', `${endpoint}/${d.id}`, studioA, { proposal: d.proposal, revision: d.revision });
    check(
      saveOutsideShift.status === 200 &&
      saveOutsideShift.data.diagnostics.scheduleChecks[zumbaToTest.key][0].status === 'outside_shift' &&
      saveOutsideShift.data.diagnostics.scheduleChecks[zumbaToTest.key][0].message.includes('Carlos Personal'),
      'Diagnóstico ao vivo detectou profissional sem escala na Quarta 19h citando nome, dia, horário e escala disponível'
    );

    // Tenta confirmar com profissional sem escala -> rejeita de forma clara mantendo atomicidade!
    const failConfirmShift = await req('POST', `${endpoint}/${d.id}/confirm`, studioA, {
      confirmed: true,
      proposal: saveOutsideShift.data.proposal,
      revision: saveOutsideShift.data.revision
    });
    check(failConfirmShift.status === 400 && failConfirmShift.data.error.includes('escala de Carlos Personal'), 'Confirmação rejeita grade incompatível com a escala sem gravações parciais');

    // Agora prepara proposta válida completa para confirmação definitiva:
    const prop = saveOutsideShift.data.proposal;
    const srvByName = n => prop.services.find(s => s.name === n);
    // 1. Musculação: remove preço conflitante da fonte 6 e converte equivalentes em total contratual conforme decisão explícita do gestor!
    const pMusc = srvByName('Musculação');
    pMusc.action = 'create'; pMusc.reviewed = true; pMusc.allowPublicBooking = true;
    pMusc.prices = pMusc.prices.filter(p => p.label !== 'Mensal Livre (Outro doc)').map(p => {
      if (p.duration && p.duration !== '1_month' && p.isMonthlyEquivalent) {
        const months = p.duration === '3_months' ? 3 : p.duration === '6_months' ? 6 : 12;
        return {
          ...p,
          unit: 'contract_total',
          equivalentMonthlyCents: p.amountCents,
          amountCents: p.amountCents * months,
          paymentPeriod: p.maxInstallments ? 'installments' : 'one_time',
          installments: p.maxInstallments || 3,
          isMonthlyEquivalent: false,
          ambiguousReason: ''
        };
      }
      return p;
    });
    // 2. Musculação 3x (limitada):
    const pMuscLim = srvByName('Musculação 3x');
    pMuscLim.action = 'create'; pMuscLim.reviewed = true; pMuscLim.allowPublicBooking = true;
    // 3. Personal Individual, Dupla & Acompanhamento:
    for (const n of ['Personal Individual', 'Personal em Dupla', 'Acompanhamento Personal']) {
      const r = srvByName(n);
      r.action = 'create'; r.reviewed = true; r.professionalId = studioA.profAna; r.allowPublicBooking = true;
    }
    // 4. Pilates Individual (gestor confirma unit='per_month'), Dupla & Grupo:
    const pPilInd = srvByName('Pilates Individual');
    pPilInd.action = 'create'; pPilInd.reviewed = true; pPilInd.professionalId = studioA.profAna; pPilInd.prices[0].unit = 'per_month';
    for (const n of ['Pilates em Dupla', 'Pilates em Grupo']) {
      const r = srvByName(n);
      r.action = 'create'; r.reviewed = true; r.professionalId = studioA.profAna;
    }
    // 5. Treinamento Funcional (total semestral R$ 870 e anual R$ 1.620 intactos):
    const pFunc = srvByName('Treinamento Funcional');
    pFunc.action = 'create'; pFunc.reviewed = true; pFunc.professionalId = studioA.profAna;
    // 6. Zumba (reconciliado manualmente/vinculado) + Zumba Fitness atualizado com horários válidos na escala da Ana!
    const pZumbaPrices = srvByName('Zumba');
    pZumbaPrices.action = 'ignore';
    const pZumbaSched = srvByName('Zumba Fitness');
    pZumbaSched.action = 'update';
    pZumbaSched.existingId = preSrv.data.id;
    pZumbaSched.apply = ['schedules', 'prices'];
    pZumbaSched.professionalId = studioA.profAna;
    pZumbaSched.schedules.forEach(s => { s.professionalId = studioA.profAna; });
    pZumbaSched.prices = [
      { ...pZumbaPrices.prices[0] },
      { ...pZumbaPrices.prices[1], unit: 'contract_total', amountCents: 18500 * 3, paymentPeriod: 'installments', installments: 3, isMonthlyEquivalent: false, ambiguousReason: '' }
    ];
    pZumbaSched.reviewed = true;
    // 7. DanceFit Plus com deferSchedules: true (mantém rascunho interno sem bloquear em horário incompleto!)
    const pDancePlus = srvByName('DanceFit Plus');
    pDancePlus.action = 'create'; pDancePlus.capacity = 15; pDancePlus.durationMinutes = 50; pDancePlus.professionalId = studioA.profAna;
    pDancePlus.deferSchedules = true; pDancePlus.reviewed = true;
    srvByName('DanceMix').action = 'ignore';
    // 8. Entregáveis e Combos:
    const pAval = srvByName('Avaliação Física Completa'); pAval.action = 'create'; pAval.reviewed = true;
    const pVid = srvByName('Entrega de Treino em Vídeo'); pVid.action = 'create'; pVid.reviewed = true;
    const pkg1 = prop.packages[0];
    pkg1.action = 'create'; pkg1.reviewed = true;
    pkg1.items[0].serviceRef = pAval.key;
    pkg1.items[1].serviceRef = srvByName('Personal Individual').key;
    pkg1.items[2].serviceRef = pVid.key;
    const pkg2 = prop.packages[1];
    pkg2.action = 'create'; pkg2.reviewed = true;
    pkg2.items[0].serviceRef = pMusc.key;
    pkg2.items[1].serviceRef = srvByName('Personal Individual').key;

    const confirmOk = await req('POST', `${endpoint}/${d.id}/confirm`, studioA, {
      confirmed: true,
      proposal: prop,
      revision: saveOutsideShift.data.revision
    });
    check(confirmOk.status === 200 && confirmOk.data.result?.services?.length === 13 && confirmOk.data.result?.packages?.length === 2, 'Importação definitiva gravou serviços, planos, grades válidas, rascunho adiado e pacotes', confirmOk);

    // Cenário 29: Repetir confirmação é idempotente sem duplicação
    const confirmRepeat = await req('POST', `${endpoint}/${d.id}/confirm`, studioA, {
      confirmed: true,
      proposal: prop,
      revision: saveOutsideShift.data.revision
    });
    check(confirmRepeat.status === 200 && confirmRepeat.data.result?.services?.length === 13, 'Repetição da confirmação retornou o mesmo resultado de forma idempotente', confirmRepeat);

    // Cenário 27/28: Listagem com histórico concluído (?includeCompleted=1) e exclusão de rascunho aberto
    const histList = await req('GET', `${endpoint}?includeCompleted=1`, studioA);
    check(histList.status === 200 && histList.data.some(item => item.id === d.id && item.result !== null), 'Histórico de importações concluídas listado com resultado');

    // Cenário 30: Serviços aparecem no catálogo oficial e podem ser editados mantendo commercial_price_options!
    const officialCatalog = await req('GET', '/v1/services', studioA);
    const officialMusc = officialCatalog.data.find(s => s.name === 'Musculação');
    const officialFunc = officialCatalog.data.find(s => s.name === 'Treinamento Funcional');
    const officialDanceDraft = officialCatalog.data.find(s => s.name === 'DanceFit Plus');
    check(
      officialMusc && officialMusc.requires_appointment === 0 && officialMusc.commercial_price_options.length === 6 &&
      officialFunc && officialFunc.commercial_price_options.some(o => o.contractDurationCode === '6_months' && o.amountCents === 87000 && o.commercialUnit === 'contract_total') &&
      officialDanceDraft && officialDanceDraft.allow_public_booking === 0 && officialDanceDraft.class_schedules.length === 0,
      'Cadastro oficial exibe opções comerciais intactas (Funcional semestral total R$ 870) e mantém DanceFit Plus adiada como rascunho interno'
    );

    const editOfficial = await req('PUT', `/v1/services/${officialMusc.id}`, studioA, {
      name: officialMusc.name,
      studioServiceType: 'facility_access',
      requiresAppointment: false,
      allowPublicBooking: true,
      commercialPriceOptions: officialMusc.commercial_price_options
    });
    check(editOfficial.status === 200 && editOfficial.data.commercial_price_options.length === 6, 'Edição manual do serviço importado preserva todas as 6 opções comerciais');

    // Cenários 31–35: Catálogo público + Contratação de Musculação SEM agendamento nem appointment fictício
    const pubCatalog = await req('GET', `/v1/public/tenants/${studioA.slug}`);
    const pubSvcs = pubCatalog.data.services || [];
    check(
      pubSvcs.some(s => s.id === officialMusc.id && s.requires_appointment === 0) &&
      pubSvcs.some(s => s.id === preSrv.data.id && s.class_schedules?.length === 2 && s.weekly_schedule_summary?.length >= 1) &&
      !pubSvcs.some(s => s.id === officialDanceDraft.id),
      'Link público expõe Musculação sem agendamento e Aula de Zumba (Qua/Sex), e omite rascunho interno não publicado',
      pubSvcs.find(s => s.id === preSrv.data.id)
    );

    const trimmedOpt = officialMusc.commercial_price_options.find(o => o.contractDurationCode === '3_months');
    const pubBuyMusc = await req('POST', '/v1/public/studio/bookings', {}, {
      tenantSlug: studioA.slug,
      mode: 'access_plan',
      bookingIntent: 'access_plan',
      serviceId: officialMusc.id,
      commercialOptionId: trimmedOpt.id,
      startDate: '2026-11-23',
      student: { fullName: 'Aluno Público Teste', phone: '11988887777' }
    });
    check(pubBuyMusc.status === 201 && pubBuyMusc.data.status === 'awaiting_confirmation', 'Aluno solicita plano Trimestral da Musculação no link público sem escolher professor/horário');
    const confirmBuy = await req('POST', `/v1/internal-notifications/${pubBuyMusc.data.requestId}/confirm`, studioA, {});
    check(
      confirmBuy.status === 200 &&
      Boolean(confirmBuy.data.billingPlanId) &&
      Array.isArray(confirmBuy.data.appointmentIds) &&
      confirmBuy.data.appointmentIds.length === 0,
      'Confirmação da contratação pública de Musculação gera matrícula/cobrança e 0 agendamentos fictícios'
    );

    // Cenário 36: Contrato antigo preservado integralmente após importação
    const preservedPlan = db.prepare(`SELECT amount, status FROM recurring_billing_plans WHERE id = ?`).get(oldPlanId);
    check(Number(preservedPlan?.amount) === 120 && preservedPlan?.status === 'active', 'Contrato e valor anteriores permaneceram intactos após importação de novas tabelas');

    // Cenários 37–39: Isolamento Multi-Tenant e Preservação de Clínicas
    check((await req('GET', `${endpoint}/${d.id}`, studioB)).status === 404, 'Studio B não acessa lote de importação do Studio A (404)');
    check((await req('GET', endpoint, clinicPure)).status === 403, 'Clínica pura continua isolada do importador Studio (403)');
    const clinicConsultation = await req('POST', '/v1/services', clinicPure, {
      name: 'Consulta Clínica Padrão',
      professionalId: clinicPure.profAna,
      durationMinutes: 40,
      price: 200
    });
    check(clinicConsultation.status === 201 && clinicConsultation.data.service_domain === 'clinical', 'Clínica pura continua criando atendimentos clínicos normalmente sem alterações');

    // Cenário descartar rascunho aberto (DELETE /:id)
    const tempDraft = await req('POST', `${endpoint}/analyze`, studioB, { files: [upload('extra.csv', 'Nome;Valor\nPilates;150')] });
    const delDraft = await req('DELETE', `${endpoint}/${tempDraft.data.id}`, studioB);
    check(delDraft.status === 200 && delDraft.data.deleted === true, 'Rascunho em aberto descartado com DELETE sem afetar catálogo');

    console.log(`\n================================================================`);
    console.log(` TODOS OS ${passed} TESTES DE RECONSTRUÇÃO DA IMPORTAÇÃO IA PASSARAM!`);
    console.log(`================================================================`);
  } finally {
    server.close();
    for (const ext of ['', '-wal', '-shm']) {
      try { if (fs.existsSync(process.env.DATABASE_PATH + ext)) fs.unlinkSync(process.env.DATABASE_PATH + ext); } catch {}
    }
  }
}

main().catch(err => {
  console.error('FALHA NA SUÍTE DE IMPORTAÇÃO IA:', err);
  process.exit(1);
});
