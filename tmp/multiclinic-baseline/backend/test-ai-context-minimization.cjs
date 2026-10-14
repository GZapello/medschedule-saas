// Teste de minimização de dados enviados ao Google Gemini (LGPD).
// Garante que nome, CPF, telefone, e-mail, contato de emergência e observações
// administrativas do paciente/aluno NUNCA aparecem no corpo das requisições ao
// Gemini, que o conteúdo clínico continua sendo enviado e que o nome real é
// reinserido localmente nos relatórios exibidos ao usuário.
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

if (!process.env.DATABASE_PATH) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-ia-min-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.sqlite');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-ia-minimizacao';
// Chave falsa: o SDK é interceptado abaixo, nenhuma chamada real sai da máquina.
process.env.GEMINI_API_KEY = 'fake-gemini-key-for-tests';
delete process.env.GOOGLE_API_KEY;
delete process.env.GEMINI_MODEL;

// ── Intercepta o fetch global usado pelo SDK @google/generative-ai ──────────
const realFetch = global.fetch;
const geminiBodies = [];
global.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (url.includes('generativelanguage.googleapis.com')) {
    const body = typeof init.body === 'string' ? init.body : String(init.body || '');
    geminiBodies.push(body);
    if (process.env.DEBUG_IA_MIN) console.log('[GEMINI BODY]', body);
    const text = body.includes('[NOME DO PACIENTE]')
      ? 'Relatório de [NOME DO PACIENTE]: evolução funcional positiva no período.'
      : 'Resumo gerado pela IA de teste. Paciente com alergia registrada.';
    return new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(input, init);
};

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();
const { generateToken } = require('./dist/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

// ── Dados sensíveis conhecidos ───────────────────────────────────────────────
const PATIENT = {
  id: 'pat-ia-min-1',
  full_name: 'Genoveva Quintanilha Albuquerque',
  cpf: '987.654.321-00',
  phone: '(47) 99123-4567',
  email: 'genoveva.q@pacienteteste.test',
  emergency_contact: 'Heliodoro Tavaresmundo',
  emergency_phone: '(47) 98877-6655',
  notes_admin: 'Solicita desconto especial ADMINNOTE-7788'
};
const STUDENT = {
  id: 'pat-ia-min-aluno',
  full_name: 'Bartolomeu Zanforlin Pereira',
  cpf: '123.456.789-09',
  phone: '(48) 99666-1234',
  email: 'bartolomeu.z@alunoteste.test',
  emergency_contact: 'Clotilde Zanforlin',
  emergency_phone: '(48) 97777-0001',
  notes_admin: 'Pagamento via boleto ADMINNOTE-5511'
};

function forbiddenValues(p) {
  return [
    p.full_name,
    p.full_name.split(' ')[0],
    p.cpf, p.cpf.replace(/\D/g, ''),
    p.phone, p.phone.replace(/\D/g, ''),
    p.email,
    p.emergency_contact,
    p.emergency_phone, p.emergency_phone.replace(/\D/g, ''),
    p.notes_admin
  ];
}

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    failures++;
    console.log(`  ❌ ${msg}`);
  }
}

function assertClean(bodies, person, label) {
  const joined = bodies.join('\n');
  for (const v of forbiddenValues(person)) {
    check(!joined.includes(v), `${label}: "${v}" não foi enviado ao Gemini`);
  }
}

async function run() {
  const T = 'tenant-ia-min';
  const U = 'user-ia-min';
  db.prepare(`INSERT INTO tenants (id, slug, name, email, status) VALUES (?, 'clinica-ia-teste', 'Clínica IA', 'c@ia.test', 'active')`).run(T);
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Dra', 'dra@ia.test', 'x', 'professional', 'active')`).run(U, T);
  db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager) VALUES ('cu-1', ?, ?, 'professional', 'active', 0)`).run(T, U);
  // Acesso ao ZemdaPersonal via flag explícita do vínculo
  db.prepare(`UPDATE clinic_users SET zemda_personal_enabled = 1 WHERE id = 'cu-1'`).run();
  db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, active) VALUES ('prof-ia-min', ?, ?, 'Dra', 1)`).run(T, U);

  for (const p of [PATIENT, STUDENT]) {
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, birth_date, cpf, email, phone, whatsapp, emergency_contact, emergency_phone, notes_admin)
      VALUES (?, ?, ?, '1980-05-10', ?, ?, ?, ?, ?, ?, ?)
    `).run(p.id, T, p.full_name, p.cpf, p.email, p.phone, p.phone, p.emergency_contact, p.emergency_phone, p.notes_admin);
  }

  db.prepare(`INSERT INTO patient_allergies (id, tenant_id, patient_id, agent, reaction, severity, status) VALUES ('alg-1', ?, ?, 'Dipirona', 'Urticária gigante', 'severe', 'active')`).run(T, PATIENT.id);
  db.prepare(`
    INSERT INTO records (id, tenant_id, patient_id, professional_id, session_date, title, clinical_evolution)
    VALUES ('rec-1', ?, ?, 'prof-ia-min', '2026-09-01', 'Consulta', ?)
  `).run(T, PATIENT.id, `Genoveva relata melhora da lombalgia crônica. Contato: ${PATIENT.phone}.`);

  // Histórico salvo de uma conversa anterior: resposta do motor local contém nome, CPF, telefone e e-mail
  const priorLocalReply = `### 👤 Informações do Paciente: **${PATIENT.full_name}**\n- **Telefone / WhatsApp:** ${PATIENT.phone}\n- **E-mail:** ${PATIENT.email}\n- **CPF:** ${PATIENT.cpf}`;
  db.prepare(`
    INSERT INTO ai_conversations (id, tenant_id, user_id, patient_id, title, context_scope, messages_json)
    VALUES ('conv-ia-min', ?, ?, ?, 'Conversa', 'general', ?)
  `).run(T, U, PATIENT.id, JSON.stringify([
    { sender: 'user', text: 'Mostre os dados cadastrais' },
    { sender: 'assistant', text: priorLocalReply }
  ]));

  // Perfil de aluno (ZemdaPersonal)
  db.prepare(`INSERT INTO personal_student_profiles (id, tenant_id, patient_id, goal, restrictions) VALUES ('psp-1', ?, ?, 'Hipertrofia', 'Condromalacia patelar grau II')`).run(T, STUDENT.id);

  const token = generateToken({ userId: U, tenantId: T, role: 'professional', email: 'dra@ia.test', name: 'Dra' });

  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function post(p, body) {
    const res = await realFetch(`${base}${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Connection: 'close' },
      body: JSON.stringify(body)
    });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  }

  try {
    // 1. Chat contextual com paciente + histórico salvo
    console.log('\n[1] /v1/ai/chat (contexto do paciente + histórico reenviado)');
    let start = geminiBodies.length;
    const chat = await post('/v1/ai/chat', {
      message: 'Resuma o histórico clínico deste paciente',
      context: { patientId: PATIENT.id, scope: 'all' },
      conversationId: 'conv-ia-min'
    });
    check(chat.status === 200, `chat respondeu 200 (recebido ${chat.status})`);
    check(chat.body && chat.body.engine === 'gemini', 'chat foi atendido pelo Gemini (mock)');
    let sent = geminiBodies.slice(start);
    check(sent.length >= 1, `chat gerou requisição ao Gemini (${sent.length})`);
    assertClean(sent, PATIENT, 'chat');
    check(sent.join('\n').includes('Dipirona'), 'chat: alergia (conteúdo clínico) continua sendo enviada');
    check(sent.join('\n').includes('lombalgia'), 'chat: evolução clínica continua sendo enviada');

    // 2. Síntese de consulta
    console.log('\n[2] /v1/ai/summarize-consultation');
    start = geminiBodies.length;
    const sum = await post('/v1/ai/summarize-consultation', {
      patientId: PATIENT.id,
      transcript: 'Paciente refere dor lombar há três semanas, piora ao sentar. Orientado repouso relativo e retorno.'
    });
    check(sum.status === 200, `summarize-consultation respondeu 200 (recebido ${sum.status})`);
    sent = geminiBodies.slice(start);
    check(sent.length >= 1, `summarize-consultation gerou requisição ao Gemini (${sent.length})`);
    assertClean(sent, PATIENT, 'summarize-consultation');
    check(sent.join('\n').includes('dor lombar'), 'summarize-consultation: transcrição clínica continua sendo enviada');
    check(sent.join('\n').includes('anos'), 'summarize-consultation: idade continua sendo enviada');

    // 3. Organização de evolução
    console.log('\n[3] /v1/ai/organize-evolution');
    start = geminiBodies.length;
    const org = await post('/v1/ai/organize-evolution', {
      patientId: PATIENT.id,
      transcript: 'paciente veio hoje, fizemos alongamento e fortalecimento de core'
    });
    check(org.status === 200, `organize-evolution respondeu 200 (recebido ${org.status})`);
    sent = geminiBodies.slice(start);
    check(sent.length >= 1, `organize-evolution gerou requisição ao Gemini (${sent.length})`);
    assertClean(sent, PATIENT, 'organize-evolution');

    // 4. Relatórios TO e Fono: nome reinserido localmente
    for (const [route, label] of [['/v1/ai/to/generate-evolution-report', 'relatório TO'], ['/v1/ai/fono/generate-evolution-report', 'relatório Fono']]) {
      console.log(`\n[4] ${route}`);
      start = geminiBodies.length;
      const rep = await post(route, {
        patientId: PATIENT.id,
        period: 'Julho a Setembro/2026',
        currentSummary: 'Melhora da coordenação motora fina',
        notes: `Genoveva evoluiu bem; mãe no telefone ${PATIENT.phone}`
      });
      check(rep.status === 200, `${label} respondeu 200 (recebido ${rep.status})`);
      sent = geminiBodies.slice(start);
      check(sent.length >= 1, `${label} gerou requisição ao Gemini (${sent.length})`);
      assertClean(sent, PATIENT, label);
      check(sent.join('\n').includes('coordenação motora fina'), `${label}: conteúdo clínico continua sendo enviado`);
      const report = rep.body && rep.body.report || '';
      check(report.includes(PATIENT.full_name), `${label}: nome real reinserido localmente na resposta`);
      check(!report.includes('[NOME DO PACIENTE]'), `${label}: marcador não vaza para o usuário`);
    }

    // 5. ZemdaPersonal
    console.log('\n[5] /v1/personal/ai/assistant');
    start = geminiBodies.length;
    const pers = await post('/v1/personal/ai/assistant', {
      studentId: STUDENT.id,
      message: 'Sugira uma divisão de treino para esta semana',
      conversationHistory: [
        { sender: 'user', text: 'Oi' },
        { sender: 'assistant', text: `### 💡 Análise do Assistente ZemdaPersonal para ${STUDENT.full_name}: tel ${STUDENT.phone}` }
      ]
    });
    check(pers.status === 200, `personal assistant respondeu 200 (recebido ${pers.status})`);
    sent = geminiBodies.slice(start);
    check(sent.length >= 1, `personal assistant gerou requisição ao Gemini (${sent.length})`);
    assertClean(sent, STUDENT, 'personal');
    check(sent.join('\n').includes('Condromalacia patelar'), 'personal: restrição (conteúdo clínico) continua sendo enviada');
    check(sent.join('\n').includes('anos'), 'personal: idade continua sendo enviada');

    check(geminiBodies.length >= 6, `total de requisições capturadas ao Gemini: ${geminiBodies.length}`);
  } catch (err) {
    failures++;
    console.error('❌ Erro inesperado no teste:', err);
  } finally {
    server.closeAllConnections();
    server.close();
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} verificação(ões) falharam.`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ Minimização de dados enviados à IA verificada com sucesso.');
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
