async function runTests() {
  console.log('=== INICIANDO BATERIA DE TESTES DE INTEGRAÇÃO SAAS ===\n');
  const baseUrl = 'http://localhost:4000/api/v1';

  // 1. Teste de Login com múltiplos perfis
  console.log('1. Testando Autenticação e Perfis RBAC...');
  const roles = [
    { email: 'diretoria@viverbem.com', role: 'clinic_admin', label: 'Gestor da Clínica' },
    { email: 'dra.camila@viverbem.com', role: 'professional', label: 'Médica Psiquiatra' },
    { email: 'recepcao@viverbem.com', role: 'receptionist', label: 'Recepcionista' },
    { email: 'admin@saas.com', role: 'superadmin', label: 'SuperAdmin' }
  ];

  const tokens: Record<string, string> = {};

  for (const r of roles) {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: r.email, password: '123456' })
    });
    if (!res.ok) throw new Error(`Falha no login de ${r.label}: ${res.statusText}`);
    const data = await res.json();
    tokens[r.role] = data.token;
    console.log(`   [OK] Login ${r.label} (${r.role}) - Token gerado, Tenant: ${data.tenant?.trade_name || 'Global'}`);
  }

  // 2. Teste de Taxonomia Dinâmica e Customização
  console.log('\n2. Testando Motor de Taxonomia Dinâmica (Cadastro Customizado)...');
  const catName = 'Terapias Florais ' + Math.floor(Math.random() * 10000);
  const catRes = await fetch(`${baseUrl}/taxonomy/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.clinic_admin}` },
    body: JSON.stringify({
      name: catName,
      defaultTerminology: 'client',
      isClinical: false
    })
  });
  if (!catRes.ok) throw new Error(`Falha ao criar categoria: ${await catRes.text()}`);
  const newCat = await catRes.json();
  console.log(`   [OK] Categoria criada: ${newCat.name} (ID: ${newCat.id})`);

  const profRes = await fetch(`${baseUrl}/taxonomy/professions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.clinic_admin}` },
    body: JSON.stringify({
      categoryId: newCat.id,
      name: 'Terapeuta Floral ' + Math.floor(Math.random() * 10000),
      registrationBoardLabel: 'CRT',
      registrationRequired: false
    })
  });
  if (!profRes.ok) throw new Error(`Falha ao criar profissão: ${await profRes.text()}`);
  const newProf = await profRes.json();
  console.log(`   [OK] Profissão customizada criada: ${newProf.name} (Reg: CRT)`);

  // 3. Teste do Motor de Cálculo de Horários Livres (Slot Engine) e Prevenção de Conflitos
  console.log('\n3. Testando Motor de Slots e Prevenção de Conflito de Concorrência...');
  const testDate = '2026-09-18';
  const slotsRes1 = await fetch(
    `${baseUrl}/public/slots/available?tenantSlug=clinica-viver-bem&professionalId=pro-lucas&serviceId=srv-psi-adulto&date=${testDate}`
  );
  const slotsData1 = await slotsRes1.json();
  const initialCount = slotsData1.slots.length;
  console.log(`   [OK] Slots livres encontrados inicialmente para ${testDate}: ${initialCount}`);
  if (initialCount === 0) throw new Error('Deveria haver horários disponíveis para o dia útil testado.');

  const slotToBook = slotsData1.slots[0];
  console.log(`   [->] Tentando agendar no primeiro slot disponível: ${slotToBook.time} (${slotToBook.startTime} a ${slotToBook.endTime})`);

  // Efetua agendamento
  const bookRes = await fetch(`${baseUrl}/public/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantSlug: 'clinica-viver-bem',
      professionalId: 'pro-lucas',
      serviceId: 'srv-psi-adulto',
      startTime: slotToBook.startTime,
      endTime: slotToBook.endTime,
      newPatientData: {
        fullName: 'Teste Concorrência Silva',
        phone: '(11) 98888-0000',
        email: 'concorrencia@teste.com'
      }
    })
  });
  if (!bookRes.ok) throw new Error(`Falha no agendamento: ${await bookRes.text()}`);
  const bookData = await bookRes.json();
  console.log(`   [OK] Agendamento confirmado com sucesso! Código: ${bookData.appointmentNumber}`);

  // Consulta novamente os slots para o mesmo dia e profissional
  const slotsRes2 = await fetch(
    `${baseUrl}/public/slots/available?tenantSlug=clinica-viver-bem&professionalId=pro-lucas&serviceId=srv-psi-adulto&date=${testDate}`
  );
  const slotsData2 = await slotsRes2.json();
  const hasBookedSlot = slotsData2.slots.some((s: any) => s.time === slotToBook.time);
  if (hasBookedSlot) {
    throw new Error(`FALHA CRÍTICA: O horário ${slotToBook.time} continua disponível após ter sido agendado!`);
  }
  console.log(`   [OK] Verificação de integridade: Horário ${slotToBook.time} foi removido com sucesso dos slots livres (slots restantes: ${slotsData2.slots.length}).`);

  // Tenta agendar exatamente no mesmo horário para verificar bloqueio por conflito
  const doubleBookRes = await fetch(`${baseUrl}/public/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantSlug: 'clinica-viver-bem',
      professionalId: 'pro-lucas',
      serviceId: 'srv-psi-adulto',
      startTime: slotToBook.startTime,
      endTime: slotToBook.endTime,
      newPatientData: {
        fullName: 'Usuário Tentativa Dupla',
        phone: '(11) 91111-2222'
      }
    })
  });
  if (doubleBookRes.status === 409) {
    console.log('   [OK] Concorrência prevenida: API barrou tentativa de sobreposição com status 409 Conflict!');
  } else {
    throw new Error(`Esperado status 409, mas recebeu ${doubleBookRes.status}`);
  }

  // 4. Teste de Sigilo LGPD e Prontuário Clínico
  console.log('\n4. Testando Sigilo LGPD e Bloqueio de Prontuário para Recepção...');
  // Tentativa pela Recepcionista (deve ser PROIBIDA com 403)
  const recForbiddenRes = await fetch(`${baseUrl}/clinical-records/patient/pat-mariana`, {
    headers: { 'Authorization': `Bearer ${tokens.receptionist}` }
  });
  if (recForbiddenRes.status === 403) {
    console.log('   [OK] Sigilo LGPD confirmado: Recepcionista recebeu 403 Forbidden ao tentar ler prontuário clínico.');
  } else {
    throw new Error(`FALHA DE SEGURANÇA: Recepcionista conseguiu status ${recForbiddenRes.status}`);
  }

  // Acesso pelo Profissional (deve ser PERMITIDO)
  const profAllowedRes = await fetch(`${baseUrl}/clinical-records/patient/pat-mariana`, {
    headers: { 'Authorization': `Bearer ${tokens.professional}` }
  });
  if (profAllowedRes.ok) {
    const records = await profAllowedRes.json();
    console.log(`   [OK] Profissional de saúde acessou prontuário com sucesso (${records.length} evoluções encontradas).`);
  } else {
    throw new Error(`Profissional deveria acessar prontuário, mas obteve ${profAllowedRes.status}`);
  }

  // 5. Teste do Assistente de IA Integrado (Comandos em Linguagem Natural)
  console.log('\n5. Testando Assistente de IA...');
  const aiRes = await fetch(`${baseUrl}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.clinic_admin}` },
    body: JSON.stringify({ message: 'Quais horários estão disponíveis para o Dr. Lucas?' })
  });
  const aiData = await aiRes.json();
  console.log(`   [OK] Resposta da IA: "${aiData.reply.split('\n')[0]}..."`);
  console.log(`   [OK] Intenção detectada: ${aiData.intent}`);

  console.log('\n=== TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! ===');
}

runTests().catch(err => {
  console.error('\n❌ Erro durante os testes:', err);
  process.exit(1);
});
