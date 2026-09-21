const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_universal_autosave.db');
process.env.JWT_SECRET = 'test-secret-autosave-clinical-998877';
process.env.PORT = '3115';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  try {
    fs.unlinkSync(process.env.DATABASE_PATH);
  } catch (e) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.url.startsWith('/v1/')) {
    req.url = `/api${req.url}`;
  }
  next();
});
app.use('/api', require('./dist/routes').default);

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3115,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const server = app.listen(3115);
  console.log('[TEST] Servidor de testes de autosave universal iniciado na porta 3115\n');

  try {
    // 1. SETUP DE TENANTS E PROFISSIONAIS
    const tenant1Id = `tenant-fono-${uuidv4().slice(0, 8)}`;
    db.prepare("INSERT INTO tenants (id, slug, name, cnpj_cpf, email, status, session_version) VALUES (?, ?, 'Clínica Fono Multidisciplinar', '11111111000111', 'fono@teste.com', 'active', 0)").run(tenant1Id, tenant1Id);

    const user1Id = `user-fono-${uuidv4().slice(0, 8)}`;
    const prof1Id = `prof-fono-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_name, zemda_psico_enabled, status)
      VALUES (?, ?, 'Dra. Beatriz Fonoaudióloga', 'beatriz@fono.com', 'hash', 'professional', 'Fonoaudiologia', 0, 'active')
    `).run(user1Id, tenant1Id);

    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, active)
      VALUES (?, ?, ?, 'Dra. Beatriz Fonoaudióloga', 'prof-fonoaudiologo', 'CRFa', '02/12345', 1)
    `).run(prof1Id, user1Id, tenant1Id);

    db.prepare(`
      INSERT INTO clinic_users (id, user_id, tenant_id, role, status)
      VALUES (?, ?, ?, 'professional', 'active')
    `).run(`cu-${uuidv4()}`, user1Id, tenant1Id);

    const patient1Id = `pat-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, cpf, birth_date, active)
      VALUES (?, ?, 'Carlos Eduardo Santos', '11988887777', '12345678901', '2016-08-15', 1)
    `).run(patient1Id, tenant1Id);

    // Tenant 2 (para isolamento)
    const tenant2Id = `tenant-isol-${uuidv4().slice(0, 8)}`;
    db.prepare("INSERT INTO tenants (id, slug, name, cnpj_cpf, email, status, session_version) VALUES (?, ?, 'Outra Clínica', '22222222000122', 'outra@teste.com', 'active', 0)").run(tenant2Id, tenant2Id);

    const user2Id = `user-isol-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_name, status)
      VALUES (?, ?, 'Dr. Estranho', 'estranho@clinica.com', 'hash', 'professional', 'Medicina', 'active')
    `).run(user2Id, tenant2Id);

    db.prepare(`
      INSERT INTO clinic_users (id, user_id, tenant_id, role, status)
      VALUES (?, ?, ?, 'professional', 'active')
    `).run(`cu-${uuidv4()}`, user2Id, tenant2Id);

    const patient2Id = `pat-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, cpf, birth_date, active)
      VALUES (?, ?, 'Ana Paula Ramos', '11977776666', '98765432100', '1990-01-01', 1)
    `).run(patient2Id, tenant2Id);

    const token1 = generateToken({
      userId: user1Id,
      tenantId: tenant1Id,
      role: 'professional',
      permissions: ['clinical:access', 'speech_therapy:access', 'patients:view']
    });

    const token2 = generateToken({
      userId: user2Id,
      tenantId: tenant2Id,
      role: 'professional',
      permissions: ['clinical:access']
    });

    const authHeaders1 = { Authorization: `Bearer ${token1}` };
    const authHeaders2 = { Authorization: `Bearer ${token2}` };

    console.log('=== TESTE 1: Universal Clinical Autosave (Persistência, Concorrência e Multi-tenant) ===');

    // 1.1 Salvar rascunho ZemdaFono
    const draftPayloadFono = {
      patientId: patient1Id,
      moduleType: 'fono',
      appointmentId: 'appt-123',
      clientUpdatedAt: '2026-09-21T14:00:00.000Z',
      draftData: {
        activeTab: 'dysphagia',
        anamnese: 'Paciente relata tosse durante deglutição de líquidos ralos.',
        foisScore: 4
      }
    };

    let res = await makeRequest('POST', '/v1/clinical/draft', authHeaders1, draftPayloadFono);
    assert.strictEqual(res.status, 200, 'Deveria salvar o rascunho com 200');
    assert.strictEqual(res.body.success, true);
    console.log('[PASS] Rascunho ZemdaFono salvo com sucesso (POST /v1/clinical/draft).');

    // 1.2 Recuperar rascunho ZemdaFono
    res = await makeRequest('GET', `/v1/clinical/draft/fono/${patient1Id}?appointment_id=appt-123`, authHeaders1);
    assert.strictEqual(res.status, 200, 'Deveria recuperar o rascunho com 200');
    assert.strictEqual(res.body.draft.patientId, patient1Id);
    assert.strictEqual(res.body.draft.moduleType, 'fono');
    assert.strictEqual(res.body.draft.draftData.foisScore, 4);
    assert.strictEqual(res.body.draft.draftData.anamnese, 'Paciente relata tosse durante deglutição de líquidos ralos.');
    console.log('[PASS] Rascunho ZemdaFono recuperado com integridade total (GET /v1/clinical/draft/fono/:patientId).');

    // 1.3 Proteção contra sobreposição desordenada / timestamp antigo (HTTP 409 Conflict)
    const stalePayload = {
      patientId: patient1Id,
      moduleType: 'fono',
      appointmentId: 'appt-123',
      clientUpdatedAt: '2026-09-21T13:50:00.000Z', // Mais antigo que 14:00:00
      draftData: {
        activeTab: 'dysphagia',
        anamnese: 'Versão antiga desatualizada'
      }
    };
    res = await makeRequest('POST', '/v1/clinical/draft', authHeaders1, stalePayload);
    assert.strictEqual(res.status, 409, 'Deveria retornar 409 Conflict para versão com timestamp mais antigo');
    assert.ok(res.body.error, 'Deveria retornar mensagem de erro de concorrência');
    console.log('[PASS] Detecção de conflito de concorrência validada (HTTP 409 Conflict retornado para pacote desatualizado).');

    // 1.4 Atualização válida mais recente (HTTP 200)
    const freshPayload = {
      patientId: patient1Id,
      moduleType: 'fono',
      appointmentId: 'appt-123',
      clientUpdatedAt: '2026-09-21T14:05:00.000Z', // Mais recente
      draftData: {
        activeTab: 'voice',
        anamnese: 'Paciente relata melhora na deglutição após manobra postural.'
      }
    };
    res = await makeRequest('POST', '/v1/clinical/draft', authHeaders1, freshPayload);
    assert.strictEqual(res.status, 200);
    console.log('[PASS] Atualização válida com timestamp mais recente persistida com sucesso.');

    // 1.5 Multi-tenant Isolation: Usuário da Clínica 2 não pode acessar rascunho da Clínica 1
    res = await makeRequest('GET', `/v1/clinical/draft/fono/${patient1Id}`, authHeaders2);
    assert.strictEqual(res.status, 403, 'Acesso entre tenants diferentes deve ser rejeitado com 403');
    console.log('[PASS] Isolamento multi-tenant garantido: Tenant 2 bloqueado com HTTP 403 ao tentar acessar rascunho do Tenant 1.');

    // 1.6 Isolamento de especialidades: Fonoaudiólogo não pode gravar rascunhos odontológicos (Sigilo Clínico)
    const illegalOdontoPayload = {
      patientId: patient1Id,
      moduleType: 'odonto',
      draftData: { dente: 18 }
    };
    res = await makeRequest('POST', '/v1/clinical/draft', authHeaders1, illegalOdontoPayload);
    assert.strictEqual(res.status, 403, 'Fonoaudiólogo deve ser bloqueado ao tentar gravar rascunho de odontologia');
    console.log('[PASS] Sigilo interprofissional respeitado: Fonoaudiólogo bloqueado com HTTP 403 ao acessar módulo de outra especialidade.');

    // 1.7 Autosave padronizado para os demais módulos clínicos (Odonto, Nutri, Fisio, TO, PP, Personal)
    const moduleProfMap = [
      { mod: 'odonto', profId: 'prof-dentista', name: 'Dr. Paulo Dentista', regType: 'CRO', regNum: '12345' },
      { mod: 'nutri', profId: 'prof-nutricionista', name: 'Dra. Camila Nutricionista', regType: 'CRN', regNum: '54321' },
      { mod: 'fisio', profId: 'prof-fisioterapeuta', name: 'Dr. Rodrigo Fisioterapeuta', regType: 'CREFITO', regNum: '11223' },
      { mod: 'to', profId: 'prof-terapeuta-ocupacional', name: 'Dra. Fernanda T.O.', regType: 'CREFITO', regNum: '33445' },
      { mod: 'pp', profId: 'prof-psicopedagogo', name: 'Dra. Sandra Psicopedagoga', regType: 'ABPp', regNum: '9988' },
      { mod: 'personal', profId: 'prof-personal-trainer', name: 'Marcos Personal', regType: 'CREF', regNum: '012345' }
    ];

    for (const item of moduleProfMap) {
      const uId = `u-${item.mod}-${uuidv4().slice(0, 6)}`;
      const pId = `p-${item.mod}-${uuidv4().slice(0, 6)}`;
      db.prepare(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_name, status)
        VALUES (?, ?, ?, ?, 'hash', 'professional', ?, 'active')
      `).run(uId, tenant1Id, item.name, `${item.mod}@teste.com`, item.name);

      db.prepare(`
        INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(pId, uId, tenant1Id, item.name, item.profId, item.regType, item.regNum);

      db.prepare(`
        INSERT INTO clinic_users (id, user_id, tenant_id, role, status)
        VALUES (?, ?, ?, 'professional', 'active')
      `).run(`cu-${uuidv4()}`, uId, tenant1Id);

      const modToken = generateToken({
        userId: uId,
        tenantId: tenant1Id,
        role: 'professional',
        permissions: ['clinical:access']
      });
      const modHeaders = { Authorization: `Bearer ${modToken}` };

      const p = {
        patientId: patient1Id,
        moduleType: item.mod,
        appointmentId: 'none',
        clientUpdatedAt: new Date().toISOString(),
        draftData: { module: item.mod, testKey: `valor_${item.mod}_123` }
      };
      const saveRes = await makeRequest('POST', '/v1/clinical/draft', modHeaders, p);
      assert.strictEqual(saveRes.status, 200, `Erro ao salvar rascunho do módulo ${item.mod}`);
      const getRes = await makeRequest('GET', `/v1/clinical/draft/${item.mod}/${patient1Id}`, modHeaders);
      assert.strictEqual(getRes.status, 200, `Erro ao recuperar rascunho do módulo ${item.mod}`);
      assert.strictEqual(getRes.body.draft.draftData.testKey, `valor_${item.mod}_123`);

      // Deletar o rascunho
      const delRes = await makeRequest('DELETE', `/v1/clinical/draft/${item.mod}/${patient1Id}`, modHeaders);
      assert.strictEqual(delRes.status, 200, `Erro ao excluir rascunho do módulo ${item.mod}`);
      const verifyDel = await makeRequest('GET', `/v1/clinical/draft/${item.mod}/${patient1Id}`, modHeaders);
      assert.strictEqual(verifyDel.body.draft, null);
    }
    console.log('[PASS] Autosave padronizado e exclusão validados em todos os módulos (Odonto, Nutri, Fisio, TO, PP, Personal).\\n');

    console.log('=== TESTE 2: ZemdaFono - FOIS (Adulto e Pediátrico FOIS-P) ===');
    // 2.1 FOIS Adulto
    const adultFoisPayload = {
      patientId: patient1Id,
      version: 'adult',
      level: 4,
      notes: 'Paciente necessita de pastoso homogêneo e líquidos leves.',
      iddsi_food_level: 4,
      iddsi_fluid_level: 2
    };
    res = await makeRequest('POST', '/v1/speech-therapy/fois', authHeaders1, adultFoisPayload);
    assert.strictEqual(res.status, 201, 'Deveria criar FOIS adulto com 201');

    // 2.2 FOIS Pediátrico (FOIS-P)
    const pedFoisPayload = {
      patientId: patient1Id,
      version: 'pediatric',
      level: 3,
      tube_dependency: 1,
      notes: 'Criança mantém uso de sonda nasogástrica.'
    };
    res = await makeRequest('POST', '/v1/speech-therapy/fois', authHeaders1, pedFoisPayload);
    assert.strictEqual(res.status, 201, 'Deveria criar FOIS pediátrico com 201');

    // 2.3 Listar histórico FOIS do paciente
    res = await makeRequest('GET', `/v1/speech-therapy/fois/${patient1Id}`, authHeaders1);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 2);
    const adultRec = res.body.find(r => r.version === 'adult');
    const pedRec = res.body.find(r => r.version === 'pediatric');
    assert.ok(adultRec, 'Deveria conter registro adulto');
    assert.ok(pedRec, 'Deveria conter registro pediátrico');
    assert.strictEqual(adultRec.level, 4);
    assert.strictEqual(pedRec.level, 3);
    console.log('[PASS] FOIS Adulto e Pediátrico (FOIS-P) persistidos, diferenciados e recuperados com sucesso.\n');

    console.log('=== TESTE 3: ZemdaFono - IDV-10 (Índice de Desvantagem Vocal) ===');
    // 3.1 Salvar IDV-10 com escore > 7 (ponto de corte de risco vocal)
    const idv10Answers = [2, 1, 1, 2, 0, 1, 1, 2, 0, 1]; // Soma = 11 ( > 7 )
    const idv10Payload = {
      patientId: patient1Id,
      answers: idv10Answers,
      notes: 'Paciente relata rouquidão ao final do expediente.'
    };
    res = await makeRequest('POST', '/v1/speech-therapy/idv10', authHeaders1, idv10Payload);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.totalScore, 11);
    assert.strictEqual(res.body.cutoff_exceeded, 1);

    // 3.2 Listar histórico IDV-10
    res = await makeRequest('GET', `/v1/speech-therapy/idv10/${patient1Id}`, authHeaders1);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].totalScore, 11);
    assert.strictEqual(res.body[0].cutoff_exceeded, 1);
    console.log('[PASS] IDV-10 validado com cálculo de escore (11/40), flag de corte > 7 e histórico persistido.\n');

    console.log('=== TESTE 4: ZemdaFono - Rastreio de Leitura, Escrita e Aprendizagem ===');
    const readingPayload = {
      patientId: patient1Id,
      classification: 'medium_risk',
      readingNotes: 'Hesitações frequentes e recusa de leitura em voz alta.',
      professionalConclusion: 'Sinais de risco para transtorno específico da aprendizagem da leitura. Necessária avaliação multidisciplinar.',
      conduct: 'Estimulação de consciência fonológica e monitoramento em 3 meses.'
    };
    res = await makeRequest('POST', '/v1/speech-therapy/reading-screening', authHeaders1, readingPayload);
    assert.strictEqual(res.status, 201);

    res = await makeRequest('GET', `/v1/speech-therapy/reading-screening/${patient1Id}`, authHeaders1);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].classification, 'medium_risk');
    assert.strictEqual(res.body[0].professionalConclusion, 'Sinais de risco para transtorno específico da aprendizagem da leitura. Necessária avaliação multidisciplinar.');
    console.log('[PASS] Rastreio de Leitura e Escrita registrado com conclusão e conduta clínica manual (sem autodiagnóstico).\n');

    console.log('=== TESTE 5: ZemdaFono - ABFW Registro Clínico ===');
    const abfwPayload = {
      patientId: patient1Id,
      domain: 'phonology',
      scoresData: {
        pcc: 72.5,
        processes_observed: ['ensurdecimento_plosivas', 'reducao_encontro']
      },
      conclusion: 'Desvio fonológico moderado; vocabulário e fluência dentro dos padrões de referência.'
    };
    res = await makeRequest('POST', '/v1/speech-therapy/abfw', authHeaders1, abfwPayload);
    assert.strictEqual(res.status, 201);

    res = await makeRequest('GET', `/v1/speech-therapy/abfw/${patient1Id}`, authHeaders1);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].scoresData.pcc, 72.5);
    console.log('[PASS] ABFW registrado com escores inseridos pelo fonoaudiólogo (em conformidade com direitos autorais).\n');

    console.log('=== TESTE 6: ZemdaFono - Triagem do Processamento Auditivo (PAC) ===');
    const pacPayload = {
      patientId: patient1Id,
      classification: 'fail',
      clinicalNotes: 'Criança necessita de pistas visuais para compreensão de ordens em ambiente ruidoso.',
      conduct: 'Encaminhamento para avaliação comportamental e eletrofisiológica formal do PAC.'
    };
    res = await makeRequest('POST', '/v1/speech-therapy/auditory-screening', authHeaders1, pacPayload);
    assert.strictEqual(res.status, 201);

    res = await makeRequest('GET', `/v1/speech-therapy/auditory-screening/${patient1Id}`, authHeaders1);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].classification, 'fail');
    assert.strictEqual(res.body[0].conduct, 'Encaminhamento para avaliação comportamental e eletrofisiológica formal do PAC.');
    console.log('[PASS] Triagem do Processamento Auditivo persistida com indicadores comportamentais e conduta especializada.\n');

    console.log('=== TESTE 7: ZemdaFono - Histórico Longitudinal Fonético-Fonológico ===');
    // Inserir duas avaliações fonológicas no histórico para validar a comparação longitudinal
    db.prepare(`
      INSERT INTO fono_speech_phonology (
        id, tenant_id, patient_id, professional_id, appointment_id,
        phonemes_json, phonological_processes, intelligibility, articulation_notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-30 days'))
    `).run(
      `phon-1-${uuidv4().slice(0, 8)}`, tenant1Id, patient1Id, prof1Id, 'appt-hist-1',
      JSON.stringify([{ phoneme: 'p', status: 'adequate' }, { phoneme: 'b', status: 'substitutes' }]),
      'desvozeamento', 'moderada', 'Avaliação diagnóstica inicial'
    );

    db.prepare(`
      INSERT INTO fono_speech_phonology (
        id, tenant_id, patient_id, professional_id, appointment_id,
        phonemes_json, phonological_processes, intelligibility, articulation_notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      `phon-2-${uuidv4().slice(0, 8)}`, tenant1Id, patient1Id, prof1Id, 'appt-hist-2',
      JSON.stringify([{ phoneme: 'p', status: 'adequate' }, { phoneme: 'b', status: 'adequate' }]),
      'nenhum', 'boa', 'Reavaliação após intervenção fonoterápica'
    );

    res = await makeRequest('GET', `/v1/speech-therapy/phonemes/${patient1Id}/history`, authHeaders1);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 2);
    assert.strictEqual(res.body[0].intelligibility, 'moderada');
    assert.strictEqual(res.body[1].intelligibility, 'boa');
    console.log('[PASS] Comparação longitudinal Fonética-Fonológica (Inicial × Reavaliação) validada com sucesso.\n');

    console.log('=== TESTE 8: Finalização de Atendimento e Limpeza Automática do Rascunho Clínico ===');
    // 8.1 Criar serviço e agendamento real para o paciente
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, duration_minutes, price, active)
      VALUES ('srv-fono', ?, 'Sessão de Fonoaudiologia', 50, 150.0, 1)
    `).run(tenant1Id);

    const appointmentId = `appt-final-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, appointment_number, patient_id, professional_id, service_id,
        start_time, end_time, status, modality
      ) VALUES (?, ?, 101, ?, ?, 'srv-fono', '2026-09-21 15:00', '2026-09-21 15:50', 'in_progress', 'presential')
    `).run(appointmentId, tenant1Id, patient1Id, prof1Id);

    // 8.2 Criar rascunho vinculado a este atendimento
    const draftToClean = {
      patientId: patient1Id,
      moduleType: 'fono',
      appointmentId: appointmentId,
      clientUpdatedAt: new Date().toISOString(),
      draftData: {
        anamnese: 'Rascunho que deve ser destruído após o selamento do prontuário.',
        activeTab: 'summary'
      }
    };
    res = await makeRequest('POST', '/v1/clinical/draft', authHeaders1, draftToClean);
    assert.strictEqual(res.status, 200);

    // Confirmar que o rascunho existe no banco
    const existingDraft = db.prepare('SELECT * FROM clinical_drafts WHERE tenant_id = ? AND patient_id = ? AND appointment_id = ?')
      .get(tenant1Id, patient1Id, appointmentId);
    assert.ok(existingDraft, 'O rascunho clínico deve existir antes da finalização');

    // 8.3 Executar finalização de consulta via SpeechTherapyController.finishConsultation
    const finishPayload = {
      appointmentId: appointmentId,
      clinicalEvolution: 'Sessão concluída com boa resposta aos treinos fonéticos e de voz.',
      isSealed: true
    };
    res = await makeRequest('POST', '/v1/speech-therapy/consultations/finish', authHeaders1, finishPayload);
    assert.strictEqual(res.status, 200, 'Finalização de consulta deve retornar 200');
    assert.strictEqual(res.body.message, 'Consulta finalizada com sucesso!');

    // 8.4 Verificar que o agendamento foi finalizado
    const updatedAppt = db.prepare('SELECT status FROM appointments WHERE id = ?')
      .get(appointmentId);
    assert.strictEqual(updatedAppt.status, 'completed');

    // 8.5 Verificar que o rascunho em clinical_drafts foi DELETADO com sucesso
    const cleanedDraft = db.prepare('SELECT * FROM clinical_drafts WHERE tenant_id = ? AND patient_id = ? AND appointment_id = ?')
      .get(tenant1Id, patient1Id, appointmentId);
    assert.strictEqual(cleanedDraft, undefined, 'O rascunho clínico deve ter sido deletado após o selamento');

    console.log('[PASS] Finalização do atendimento selou o prontuário e deletou automaticamente o rascunho clínico persistido.');

    console.log('\n========================================================');
    console.log('TODOS OS 8 TESTES DA SUÍTE UNIVERSAL CLÍNICA PASSARAM!');
    console.log('========================================================');

  } catch (err) {
    console.error('\n[FAIL] Erro nos testes:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    try {
      if (fs.existsSync(process.env.DATABASE_PATH)) {
        fs.unlinkSync(process.env.DATABASE_PATH);
      }
    } catch (e) {}
    process.exit();
  }
}

runTests();
