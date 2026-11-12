// Teste de Validação da Fase 4 (Seção 4): Pré-consulta Digital, Versionamento Imutável, Privacidade da Recepção e Zemda360
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-phase4-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'phase4-test-secret-2026';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();
const { generateToken } = require('./dist/utils/jwt');

const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

db.prepare(`
  INSERT INTO tenants (id, slug, name, email, status)
  VALUES ('clinic-p4', 'clinica-p4', 'Clínica Fase 4', 'p4@zemda.test', 'active')
`).run();

db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
  VALUES
    ('usr-fisio', 'clinic-p4', 'Dr. Rafael Fisio', 'rafael@p4.test', 'hash', 'professional', 'active'),
    ('usr-psicoped', 'clinic-p4', 'Dra. Laura Psicoped', 'laura@p4.test', 'hash', 'professional', 'active'),
    ('usr-recep-p4', 'clinic-p4', 'Recepção P4', 'recep@p4.test', 'hash', 'receptionist', 'active')
`).run();

db.prepare(`
  INSERT INTO clinic_users (id, tenant_id, user_id, role, status)
  VALUES
    ('cu-fisio', 'clinic-p4', 'usr-fisio', 'professional', 'active'),
    ('cu-psicoped', 'clinic-p4', 'usr-psicoped', 'professional', 'active'),
    ('cu-recep', 'clinic-p4', 'usr-recep-p4', 'receptionist', 'active')
`).run();

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, active)
  VALUES
    ('pro-fisio', 'clinic-p4', 'usr-fisio', 'Dr. Rafael Fisio', 'prof-fisioterapia', 1),
    ('pro-psicoped', 'clinic-p4', 'usr-psicoped', 'Dra. Laura Psicoped', 'prof-psicopedagogia', 1)
`).run();

db.prepare(`
  INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, active)
  VALUES ('srv-fisio', 'clinic-p4', 'pro-fisio', 'Avaliação Fisioterapêutica', 60, 220, 1)
`).run();

db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, phone, is_child, active)
  VALUES
    ('pat-adulto', 'clinic-p4', 'Mariana Costa', '11999998888', 0, 1),
    ('pat-menor', 'clinic-p4', 'Pedro Costa', '11999997777', 1, 1)
`).run();

db.prepare(`
  INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, modality)
  VALUES
    ('apt-p4-1', 'clinic-p4', 'AG-P4-1', 'pat-adulto', 'pro-fisio', 'srv-fisio', '2026-11-15T10:00:00', '2026-11-15T11:00:00', 'scheduled', 'presential'),
    ('apt-p4-2', 'clinic-p4', 'AG-P4-2', 'pat-menor', 'pro-fisio', 'srv-fisio', '2026-11-15T11:00:00', '2026-11-15T12:00:00', 'scheduled', 'presential')
`).run();

const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const callAs = async (user, method, url, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      const token = generateToken({
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        email: `${user.userId}@p4.test`,
        name: user.name || user.userId
      });
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Tenant-Id'] = user.tenantId;
    }
    const res = await fetch(base + url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = text;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, body: json };
  };

  const fisio = { userId: 'usr-fisio', tenantId: 'clinic-p4', role: 'professional', name: 'Dr. Rafael Fisio' };
  const psicoped = { userId: 'usr-psicoped', tenantId: 'clinic-p4', role: 'professional', name: 'Dra. Laura Psicoped' };
  const recep = { userId: 'usr-recep-p4', tenantId: 'clinic-p4', role: 'receptionist', name: 'Recepção P4' };

  try {
    // 1. Criar modelo com Mapa Corporal Zemda360 (permitido para Fisioterapia, bloqueado para Psicopedagogia)
    const blockBodyMapRes = await callAs(psicoped, 'POST', '/v1/pre-consultation/forms', {
      title: 'Pré-consulta Psicopedagógica',
      includeZemda360BodyMap: true,
      fields: []
    });
    assert.equal(blockBodyMapRes.status, 403);
    assert.equal(blockBodyMapRes.body.code, 'ZEMDA360_NOT_AVAILABLE_FOR_PROFESSION');

    const createRes = await callAs(fisio, 'POST', '/v1/pre-consultation/forms', {
      title: 'Pré-consulta Fisioterapia Ortopédica',
      description: 'Avaliação prévia de dor e mobilidade',
      instructions: 'Preencha antes da sua sessão.',
      purpose: 'Primeira Consulta',
      visibility: 'clinic',
      includeZemda360BodyMap: true,
      fields: [
        { id: 'queixa_dor', type: 'short_text', label: 'Qual o local principal da dor?', required: true, order: 1 },
        { id: 'escala_eva', type: 'scale', label: 'Intensidade da dor (0 a 10)', required: true, order: 2, scaleMin: 0, scaleMax: 10 }
      ]
    });
    assert.equal(createRes.status, 201);
    const formId = createRes.body.id;
    assert.equal(createRes.body.version, 1);
    assert.equal(createRes.body.include_zemda360_body_map, true);
    console.log('✓ [1] Criação de formulário e regra de elegibilidade do Mapa Corporal Zemda360 validadas');

    // 2. Preparar envio do formulário para o agendamento apt-p4-1 (versão 1)
    const prepRes = await callAs(fisio, 'POST', '/v1/pre-consultation/appointments/apt-p4-1/prepare-send', {
      formId
    });
    assert.equal(prepRes.status, 201);
    const token1 = prepRes.body.token;
    assert.ok(token1 && token1.length >= 32, 'Token público deve ser longo e imprevisível');
    assert.ok(!prepRes.body.publicUrl.includes('Mariana'), 'Não deve expor dados sensíveis na URL');

    // 3. Editar o modelo para versão 2 ANTES da resposta do paciente e comprovar que o link enviado preserva a versão 1!
    const updateRes = await callAs(fisio, 'PUT', `/v1/pre-consultation/forms/${formId}`, {
      title: 'Pré-consulta Fisioterapia v2 (Editado)',
      fields: [
        { id: 'campo_novo_v2', type: 'long_text', label: 'Pergunta Nova da Versão 2', required: true, order: 1 }
      ]
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.version, 2);

    // Duplicar e arquivar a cópia
    const dupRes = await callAs(fisio, 'POST', `/v1/pre-consultation/forms/${formId}/duplicate`);
    assert.equal(dupRes.status, 201);
    const archRes = await callAs(fisio, 'PATCH', `/v1/pre-consultation/forms/${dupRes.body.id}/archive`, {});
    assert.equal(archRes.status, 200);
    assert.equal(archRes.body.status, 'archived');
    console.log('✓ [2] Versionamento imutável, duplicação e arquivamento da biblioteca validados');

    // 4. Página pública carrega exatamente a versão 1 enviada ao paciente
    const pubGet = await callAs(null, 'GET', `/v1/public/pre-consultation/${token1}`);
    assert.equal(pubGet.status, 200);
    assert.equal(pubGet.body.form.version, 1, 'Deve carregar o snapshot v1 vinculado ao envio');
    assert.equal(pubGet.body.form.title, 'Pré-consulta Fisioterapia Ortopédica');

    // 5. Paciente responde o formulário público incluindo marcação no Mapa Corporal Zemda360
    const pubSubmit = await callAs(null, 'POST', `/v1/public/pre-consultation/${token1}/submit`, {
      respondentName: 'Mariana Costa',
      respondentRelationship: 'self',
      answers: {
        queixa_dor: 'Ombro direito e coluna lombar',
        escala_eva: 7
      },
      bodyMap: {
        regions: [
          {
            regionId: 'shoulder_right',
            regionLabel: 'Ombro Direito',
            view: 'front',
            complaintType: 'dor',
            intensity: 7,
            notes: 'Dor ao elevar o braço'
          }
        ]
      }
    });
    assert.equal(pubSubmit.status, 200);
    assert.equal(pubSubmit.body.status, 'submitted');

    // Tentar enviar novamente pelo mesmo token deve ser bloqueado (prevenção de duplicidade)
    const dupSubmit = await callAs(null, 'POST', `/v1/public/pre-consultation/${token1}/submit`, {
      respondentName: 'Mariana Costa',
      answers: { queixa_dor: 'Teste duplicado', escala_eva: 5 }
    });
    assert.equal(dupSubmit.status, 409);
    assert.equal(dupSubmit.body.code, 'DUPLICATE_SUBMISSION');
    console.log('✓ [3] Submissão pública, bloqueio de duplicidade e preservação da versão v1 validados');

    // 6. Regra 4.5: Recepção vê APENAS o status administrativo ('submitted' / 'Respondido'), SEM acesso às respostas clínicas
    const recepView = await callAs(recep, 'GET', '/v1/pre-consultation/appointments/apt-p4-1');
    assert.equal(recepView.status, 200);
    assert.equal(recepView.body.status, 'submitted');
    assert.equal(recepView.body.statusLabel, 'Respondido');
    assert.equal(recepView.body.clinicalRestricted, true);
    assert.equal(recepView.body.submission.answers, null, 'Recepção NUNCA deve acessar respostas clínicas');
    assert.equal(recepView.body.submission.bodyMap, null, 'Recepção NUNCA deve acessar o mapa corporal');

    // Profissional responsável acessa normalmente as respostas clínicas e o mapa corporal
    const profView = await callAs(fisio, 'GET', '/v1/pre-consultation/appointments/apt-p4-1');
    assert.equal(profView.status, 200);
    assert.equal(profView.body.clinicalRestricted, false);
    assert.equal(profView.body.submission.answers.queixa_dor, 'Ombro direito e coluna lombar');
    assert.equal(profView.body.submission.bodyMap.regions.length, 1);
    assert.equal(profView.body.submission.bodyMap.regions[0].source, 'patient_pre_consultation');
    console.log('✓ [4] Sigilo clínico: recepção vê apenas status administrativo; profissional vê respostas e mapa corporal');

    // 7. Regra 4.4: Importação explícita pelo profissional das regiões do Mapa Corporal para a avaliação clínica Zemda360
    const submissionId = profView.body.submission.id;
    const importRes = await callAs(fisio, 'POST', `/v1/pre-consultation/submissions/${submissionId}/import-body-map`, {});
    assert.equal(importRes.status, 200);
    assert.equal(importRes.body.importedCount, 1);
    assert.ok(importRes.body.assessmentId);

    const markersInDb = db.prepare('SELECT * FROM body_markers WHERE assessment_id = ?').all(importRes.body.assessmentId);
    assert.equal(markersInDb.length, 1);
    assert.ok(markersInDb[0].notes.includes('Informado pelo paciente na Pré-consulta'));
    console.log('✓ [5] Importação explícita do Mapa Corporal Zemda360 para o prontuário validada');

    // 8. Teste de revogação de link (apt-p4-2)
    const prep2 = await callAs(recep, 'POST', '/v1/pre-consultation/appointments/apt-p4-2/prepare-send', { formId });
    assert.equal(prep2.status, 201);
    const revokeRes = await callAs(recep, 'POST', `/v1/pre-consultation/submissions/${prep2.body.submissionId}/revoke`);
    assert.equal(revokeRes.status, 200);

    const revokedPubGet = await callAs(null, 'GET', `/v1/public/pre-consultation/${prep2.body.token}`);
    assert.equal(revokedPubGet.status, 410);
    assert.equal(revokedPubGet.body.code, 'LINK_REVOKED');
    console.log('✓ [6] Revogação de link público validada');

    console.log('\n✅ TODOS OS TESTES DA FASE 4 PASSARAM COM SUCESSO!');
  } catch (err) {
    console.error('❌ Falha nos testes da Fase 4:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
