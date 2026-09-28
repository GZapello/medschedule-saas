# Ocorrências legadas preservadas

Auditoria em fontes rastreadas, excluindo NOTICE/LICENSE, lockfiles e este relatório. Cada ocorrência abaixo é classificada por finalidade.

## backend/last_user_prompt.txt

Contrato/taxonomia original ou solicitação histórica preservada.

- Linha 46: `3. ZEMDABODY — ACESSO UNIVERSAL`
- Linha 49: `ZemdaBody deve estar disponível para TODAS as áreas profissionais, mediante permissão/liberação do gerente da clínica.`
- Linha 64: `- ZemdaBody NÃO é profissão.`
- Linha 65: `- ZemdaBody é um módulo complementar universal.`
- Linha 66: `- Não associar ZemdaBody somente à Medicina.`
- Linha 67: `- Não restringir ZemdaBody por profissão.`
- Linha 68: `- O gerente/admin da clínica deve poder liberar ou bloquear ZemdaBody por usuário/profissional.`
- Linha 69: `- Usuário autorizado deve visualizar botão/acesso ao ZemdaBody dentro do atendimento, independentemente da profissão.`
- Linha 205: `NÃO colocar “→ ZemdaBody” apenas ao lado de Medicina.`
- Linha 209: `“ZemdaBody está disponível para todas as áreas profissionais, conforme liberação do gerenciador da clínica.”`
- Linha 213: `[ ] Liberar ZemdaBody para este profissional`
- Linha 226: `→ botão ZemdaBody quando autorizado`
- Linha 238: `- Abrir ZemdaBody quando autorizado`
- Linha 256: `11. ZemdaBody pode ser liberado para qualquer profissão.`
- Linha 257: `12. Profissional autorizado visualiza ZemdaBody independentemente da área.`
- Linha 258: `13. Profissional sem permissão NÃO visualiza ZemdaBody.`

## backend/run-tests.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 26: `'test-atualizacao-zemda.cjs': 'TESTE 13: cadastro de clínica com ZemdaBody retorna undefined em vez da clínica criada',`

## backend/src/config/database.ts

Schema legado ou atualização de rótulo, mantendo IDs.

- Linha 317: `addColIfMissing('clinic_users', 'zemda_body_enabled', 'INTEGER DEFAULT 0');`

## backend/src/config/modular-architecture.migration.ts

Schema legado ou atualização de rótulo, mantendo IDs.

- Linha 575: `rawDb.prepare("UPDATE capabilities SET name = 'Zemda360 (Mapa Anatômico)' WHERE id = 'BODY_MAP' AND name LIKE 'ZemdaBody%'").run();`

## backend/src/controllers/appointment.controller.ts

Leitura/normalização de identificador clínico legado.

- Linha 572: `const existingRec = db.prepare("SELECT module_type FROM records WHERE appointment_id = ? AND tenant_id = ? AND module_type IS NOT NULL AND module_type NOT IN ('ZemdaBody', 'Zemda360') LIMIT 1").get(id, tenantId) as { module_type: string } | undefined;`
- Linha 604: `clinical_module = COALESCE(NULLIF(NULLIF(clinical_module, 'ZemdaBody'), 'Zemda360'), ?),`

## backend/src/controllers/auth.controller.ts

Alias de API, permissão ou coluna persistida.

- Linha 223: `cuRow = db.prepare('SELECT permissions_json, zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled, zemda_body_enabled, zemda_estetic_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(user.id, user.tenant_id) as any;`
- Linha 319: `zemdaBodyEnabled: zemda360Enabled, // Legacy API clients retain access.`
- Linha 435: `cuRow = db.prepare('SELECT permissions_json, zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled, zemda_body_enabled, zemda_estetic_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(user.id, user.tenant_id) as any;`
- Linha 531: `zemdaBodyEnabled: zemda360Enabled, // Legacy API clients retain access.`

## backend/src/controllers/body-assessment.controller.ts

Alias de API, permissão ou coluna persistida.

- Linha 927: `export const hasZemdaBodyAccess = hasZemda360Access;`

## backend/src/controllers/clinical.controller.ts

Leitura/normalização de identificador clínico legado.

- Linha 234: `const existingRec = db.prepare("SELECT module_type FROM records WHERE appointment_id = ? AND tenant_id = ? AND module_type IS NOT NULL AND module_type NOT IN ('ZemdaBody', 'Zemda360') LIMIT 1").get(appointmentId, tenantId) as { module_type: string } | undefined;`

## backend/src/controllers/documents.controller.ts

Leitura/normalização de identificador clínico legado.

- Linha 40: `const existingRec = db.prepare("SELECT module_type FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type NOT IN ('ZemdaBody', 'Zemda360') AND module_type != 'general' LIMIT 1").get(appt.id, req.tenantId) as { module_type?: string } | undefined;`
- Linha 544: `const existingRec = db.prepare("SELECT module_type FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type NOT IN ('ZemdaBody', 'Zemda360') LIMIT 1").get(appointmentId, tenantId) as { module_type?: string } | undefined;`
- Linha 656: `db.prepare("UPDATE appointments SET clinical_module = COALESCE(NULLIF(NULLIF(clinical_module, 'ZemdaBody'), 'Zemda360'), ?) WHERE id=? AND tenant_id=?")`

## backend/src/controllers/staff.controller.ts

Alias de API, permissão ou coluna persistida.

- Linha 71: `cu.zemda_body_enabled, cu.zemda_personal_enabled,`
- Linha 316: `const sanitizedPermissions = permissions.filter((p: string) => p !== 'access_zemda_personal' && p !== 'access_zemda_body' && p !== 'access_zemda360');`
- Linha 333: `INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled, zemda_personal_enabled)`
- Linha 337: `zemda_body_enabled = excluded.zemda_body_enabled,`

## backend/src/controllers/tenant.controller.ts

Alias de API, permissão ou coluna persistida.

- Linha 80: `const zemda360Enabled = req.body.zemda360Enabled ?? req.body.zemdaBodyEnabled;`
- Linha 318: `zemda_body_enabled, zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,`
- Linha 525: `zemdaBodyEnabled: true, // Legacy API alias.`

## backend/src/services/sandbox.service.ts

Alias de API, permissão ou coluna persistida.

- Linha 109: `zemda_body_enabled, created_at`
- Linha 278: `zemdaBodyEnabled: true, // Legacy API alias.`

## backend/src/utils/clinical-module.ts

Leitura/normalização de identificador clínico legado.

- Linha 36: `const record = db.prepare("SELECT module_type FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type NOT IN ('ZemdaBody', 'Zemda360') ORDER BY created_at LIMIT 1")`
- Linha 62: `if (['ZemdaBody', 'Zemda360'].includes(appointment.clinical_module)) return 'general';`
- Linha 64: `return ['ZemdaBody', 'Zemda360'].includes(appointment.clinical_module) ? 'general' : null;`

## backend/test-atualizacao-zemda.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 11: `* 7. Profissional sem permissão do ZemdaBody -> ZemdaBody não aparece e rotas bloqueadas (403).`
- Linha 12: `* 8. Profissional com permissão do ZemdaBody -> acessa ZemdaBody normalmente dentro do atendimento.`
- Linha 17: `* 13. Cadastrar nova clínica com checkbox [X] Liberar ZemdaBody marcado -> profissional criado com acesso ao ZemdaBody.`
- Linha 18: `* 14. Cadastrar nova clínica com checkbox [ ] desmarcado -> profissional criado sem acesso ao ZemdaBody.`
- Linha 131: `INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_body_enabled, permissions_json, created_at)`
- Linha 132: `VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["access_zemda_body"]', datetime('now'))`
- Linha 297: `assert(isPrimaryClinicalModule('ZemdaBody') === false, 'isPrimaryClinicalModule estritamente exclui ZemdaBody');`
- Linha 393: `// TESTE 7: SuperAdmin ou usuário não-clínico bloqueado do ZemdaBody (403)`
- Linha 395: `console.log('\n[TESTE 7] SuperAdmin ou usuário não-clínico bloqueado do ZemdaBody (HTTP 403)');`
- Linha 413: `assert(superAccessBlockedRes.status === 403, 'Acesso ao ZemdaBody bloqueado com HTTP 403 para superadmin (dados clínicos restritos à clínica)');`
- Linha 416: `// TESTE 8: Profissional clínico com acesso universal ao ZemdaBody (HTTP 200)`
- Linha 418: `console.log('\n[TESTE 8] Profissional clínico acessa ZemdaBody universalmente sem travas manuais');`
- Linha 422: `VALUES (?, ?, 'Dra. Com ZemdaBody', 'com.body@zemda.com', 'hash_test', 'professional', 'active', datetime('now'))`
- Linha 426: `INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_body_enabled, permissions_json, created_at)`
- Linha 441: `assert(bodyAccessAllowedRes.status === 200, 'Acesso liberado universalmente ao ZemdaBody com HTTP 200');`
- Linha 647: `// TESTE 13: Cadastro de nova clínica com [X] Liberar ZemdaBody marcado`
- Linha 649: `console.log('\n[TESTE 13] Cadastro de clínica com ZemdaBody marcado inicializa com acesso');`
- Linha 650: `const regZemdaBodyTrue = await makeRequest('POST', '/api/v1/tenants/register-public', {}, {`
- Linha 660: `zemdaBodyEnabled: true,`
- Linha 665: `assert(regZemdaBodyTrue.status === 201, 'Clínica cadastrada com sucesso (HTTP 201)');`
- Linha 666: `const userTrueId = regZemdaBodyTrue.body.user.id;`
- Linha 667: `const clinicTrue = db.prepare('SELECT zemda_body_enabled, permissions_json FROM clinic_users WHERE user_id = ?').get(userTrueId);`
- Linha 668: `assert(clinicTrue && clinicTrue.zemda_body_enabled === 1, 'zemda_body_enabled = 1 persistido no banco');`
- Linha 669: `assert(clinicTrue && clinicTrue.permissions_json.includes('access_zemda_body'), 'Permissão access_zemda_body concedida');`
- Linha 670: `assert(regZemdaBodyTrue.body.user.zemdaBodyEnabled === true, 'user.zemdaBodyEnabled === true retornado no payload');`
- Linha 673: `// TESTE 14: Cadastro de nova clínica com [ ] Liberar ZemdaBody desmarcado`
- Linha 675: `console.log('\n[TESTE 14] Cadastro de clínica com ZemdaBody desmarcado não concede acesso');`
- Linha 676: `const regZemdaBodyFalse = await makeRequest('POST', '/api/v1/tenants/register-public', {}, {`
- Linha 686: `zemdaBodyEnabled: false,`
- Linha 691: `assert(regZemdaBodyFalse.status === 201, 'Clínica cadastrada com sucesso (HTTP 201)');`
- Linha 692: `const userFalseId = regZemdaBodyFalse.body.user.id;`
- Linha 693: `const clinicFalse = db.prepare('SELECT zemda_body_enabled FROM clinic_users WHERE user_id = ?').get(userFalseId);`
- Linha 694: `assert(clinicFalse && clinicFalse.zemda_body_enabled === 0, 'zemda_body_enabled = 0 persistido no banco');`
- Linha 695: `assert(regZemdaBodyFalse.body.user.zemdaBodyEnabled === false, 'user.zemdaBodyEnabled === false retornado no payload de cadastro');`
- Linha 699: `email: regZemdaBodyFalse.body.user.email,`
- Linha 703: `assert(loginFalseRes.body.user.zemdaBodyEnabled === true, 'No login, usuário clínico possui ZemdaBody universalmente disponível');`

## backend/test-consultations.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 35: `db.prepare("UPDATE clinic_users SET permissions_json='[\"access_zemda_body\"]' WHERE tenant_id='test-clinic' AND role='professional'").run();`
- Linha 57: `if (key === 'fono') db.prepare("UPDATE appointments SET clinical_module='ZemdaBody' WHERE id=?").run('apt-'+key);`
- Linha 66: `assert.equal((await call('/v1/appointments/apt-'+key+'/status',{status:'in_progress',clinicalModule:'ZemdaBody'},token,'PUT')).status,200);`
- Linha 70: `if (key === 'fono') db.prepare("UPDATE appointments SET clinical_module='ZemdaBody' WHERE id=?").run('apt-'+key);`

## backend/test-personal-expansion-and-students.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 94: `INSERT OR IGNORE INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled, zemda_personal_enabled, profession_custom, practice_areas)`

## backend/test-profession-module-transition.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 99: `uuidv4(), tenantId, testUserId, JSON.stringify(['access_zemda_personal', 'access_zemda_body']), nowIso`
- Linha 307: `// 5. Verificar que ZemdaBody Universal permanece ativo para todos os profissionais clínicos`
- Linha 308: `if (meUser.zemdaBodyEnabled !== true) {`
- Linha 309: `throw new Error('[/auth/me] zemdaBodyEnabled deveria ser true para profissional clínico! Obteve: ${meUser.zemdaBodyEnabled}');`
- Linha 311: `console.log('  ✅ [/auth/me] ZemdaBody Universal: zemdaBodyEnabled = true garantido');`

## backend/test-r2-files.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 202: `category: 'zemdabody',`
- Linha 214: `category: 'zemdabody',`
- Linha 221: `assert(webpComplete.data.file.category === 'zemdabody', 'Categoria zemdabody persistida');`

## backend/test-registration-professions.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 29: `assert.equal(payload.isTrial,true);assert.equal(payload.user.zemdaBodyEnabled,false,'Preserve default flag; Body comes from existing administrative access');`
- Linha 30: `const membership=db.prepare('SELECT * FROM clinic_users WHERE user_id=?').get(user.id);assert.equal(membership.zemda_body_enabled,0);assert.equal(membership.role,'clinic_admin');assert.equal(membership.is_manager,1);`

## backend/test-start-permissions.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 99: `db.prepare("INSERT INTO clinic_users (id,tenant_id,user_id,role,status,permissions_json) VALUES ('cu-reception','test-clinic','reception','receptionist','active','[\"access_zemda_body\"]')").run();`

## backend/test-targeted-personal-and-default-service.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 76: `INSERT OR IGNORE INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled, zemda_personal_enabled, profession_custom, practice_areas)`

## backend/test-trial-and-modules.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 7: `* 5. Remoção de permissões de módulos de profissão na equipe e controle exclusivo do ZemdaBody`
- Linha 227: `// 3. EQUIPE E PERMISSÕES: SEM MÓDULOS DE PROFISSÃO, APENAS ZEMDABODY`
- Linha 229: `console.log('\n--- 3. PERMISSÕES DE EQUIPE & ZEMDABODY ---');`
- Linha 231: `// 3.1 Atualizar permissões de equipe com access_zemda_body`
- Linha 242: `permissions: ['view_schedule', 'create_appointment', 'access_zemda_body']`
- Linha 245: `assert(updatePermsRes.status === 200, 'Atualização de permissões com remoção automática de access_zemda_body retorna HTTP 200');`
- Linha 247: `const cuStaff = db.prepare('SELECT permissions_json, zemda_body_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(staffUserId, createdTenantId);`
- Linha 248: `assert(cuStaff && cuStaff.zemda_body_enabled === 1, 'Flag zemda_body_enabled permanece ativa');`
- Linha 249: `assert(!cuStaff?.permissions_json?.includes('access_zemda_body'), 'permissions_json NÃO contém access_zemda_body (sanitizado)');`
- Linha 255: `assert(!staffSource.includes('access_zemda_body'), 'Frontend StaffManagementView NÃO contém access_zemda_body (permissão manual removida)');`
- Linha 260: `assert(!authContextSource.includes("userPermissions.includes('access_zemda_body')"), 'AuthContext não utiliza mais permissão manual access_zemda_body');`
- Linha 267: `assert(sidebarSource.includes('visible: isClinicAdmin || isZemdaBody'), 'Sidebar controla ZemdaBody via isZemdaBody');`

## backend/test-zemda-personal-and-body.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 73: `console.log('INICIANDO TESTES: ZEMDABODY & ZEMDAPERSONAL (E2E)');`
- Linha 108: `INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled, zemda_personal_enabled)`
- Linha 164: `// 1. ZEMDABODY — LIBERAÇÃO AUTOMÁTICA UNIVERSAL`
- Linha 166: `console.log('--- 1. ZEMDABODY: LIBERAÇÃO AUTOMÁTICA PARA PROFISSIONAIS E GESTORES ---');`
- Linha 168: `// 1.1 Gestor da clínica acessa ZemdaBody diretamente`
- Linha 173: `assert(mgrBodyRes.status === 200, 'Gerenciador da clínica possui acesso total imediato ao ZemdaBody (HTTP 200)');`
- Linha 174: `assert(Array.isArray(mgrBodyRes.data), 'Retorna lista de avaliações do ZemdaBody sem barreira funcional');`
- Linha 181: `assert(staffBodyRes.status === 200, 'Profissional ativo vinculado à clínica acessa ZemdaBody automaticamente sem necessitar autorização do gestor (HTTP 200)');`
- Linha 182: `assert(Array.isArray(staffBodyRes.data), 'Profissional recebe dados do ZemdaBody sem bloqueio');`
- Linha 184: `// 1.3 Usuário administrativo/recepcionista NÃO recebe acesso clínico ao ZemdaBody (HTTP 403)`
- Linha 189: `assert(recepBodyRes.status === 403, 'Usuário administrativo/recepcionista recebe HTTP 403 no ZemdaBody');`
- Linha 196: `assert(superBodyRes.status === 403, 'SuperAdmin não tem acesso aos dados clínicos do ZemdaBody (HTTP 403)');`
- Linha 242: `INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled, zemda_personal_enabled)`

## backend/test-zemda360-naming.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 6: `const {hasZemda360Access,hasZemdaBodyAccess}=require('./dist/controllers/body-assessment.controller');`
- Linha 12: `assert.equal(hasZemda360Access,hasZemdaBodyAccess);`
- Linha 13: `db.prepare("UPDATE capabilities SET name='ZemdaBody (Mapa Corporal)' WHERE id='BODY_MAP'").run();`
- Linha 18: `db.prepare("INSERT INTO clinic_users (id,tenant_id,user_id,role,status,zemda_body_enabled,permissions_json) VALUES ('cu','n','u','professional','active',1,'[\"access_zemda_body\"]')").run();`
- Linha 22: `for(const clinical_module of ['ZemdaBody','Zemda360'])assert.equal(resolveClinicalModule({id:'none',clinical_module},'n'),'general');`
- Linha 25: `assert.equal(res.code,200);assert.equal(res.body.user.zemda360Enabled,true);assert.equal(res.body.user.zemdaBodyEnabled,true);`
- Linha 27: `assert.ok(html.includes('ZemdaEstetic'));assert.ok(html.includes('Zemda360'));assert.ok(!html.includes('ZemdaBody'));`

## docs/zemda360/supplied-data-contract.json

Contrato/taxonomia original ou solicitação histórica preservada.

- Linha 16: `"keep_existing_zemdabody_routes": true,`
- Linha 19: `"migration_strategy": "rename UI first; preserve internal zemdaBody identifiers until dedicated migration"`

## frontend/src/App.tsx

Alias de rota/navegação salva.

- Linha 159: `'/zemda-body': 'zemda360',`
- Linha 259: `const saved = stored === 'zemda-body' ? 'zemda360' : stored;`
- Linha 271: `if (['/zemda-body','/mapa-corporal'].includes(window.location.pathname.replace(/\/+$/, ''))) {`
- Linha 277: `if (view === 'zemda-body') view = 'zemda360';`

## frontend/src/components/clinical/AppointmentConsultation.tsx

Leitura/normalização de identificador clínico legado.

- Linha 70: `(appointment.clinical_module && !['ZemdaBody','Zemda360'].includes(appointment.clinical_module) && appointment.clinical_module !== 'general' ? appointment.clinical_module : undefined) ||`
- Linha 71: `(initialModuleType && !['ZemdaBody','Zemda360'].includes(initialModuleType) && initialModuleType !== 'general' ? initialModuleType : undefined) ||`

## frontend/src/components/clinical/QuickConsultationModal.tsx

Leitura/normalização de identificador clínico legado.

- Linha 105: `(appointment.clinical_module && appointment.clinical_module !== 'general' && !['ZemdaBody','Zemda360'].includes(appointment.clinical_module) ? appointment.clinical_module : undefined);`

## frontend/src/components/clinical/SelectConsultationModuleModal.tsx

Leitura/normalização de identificador clínico legado.

- Linha 263: `const commModule = legacyModule === 'ZemdaBody' ? 'Zemda360' : legacyModule;`

## frontend/src/components/onboarding/OnboardingHelpModal.tsx

Chave de progresso persistido do tour.

- Linha 218: `startModuleTour('zemda_body');`

## frontend/src/components/onboarding/tourRegistry.ts

Chave de progresso persistido do tour.

- Linha 847: `zemda_body: {`
- Linha 848: `id: 'zemda_body',`

## frontend/src/components/public/ZemdaLandingPage.tsx

Compatibilidade de âncora pública antiga.

- Linha 38: `const id = hash === 'zemdabody' ? 'zemda360' : hash;`

## frontend/src/components/zemda360/data/region-taxonomy.json

Contrato/taxonomia original ou solicitação histórica preservada.

- Linha 4: `"legacy_module": "ZemdaBody",`
- Linha 26: `"geometry_must_be_aligned_to_current_zemdabody_assets": true,`

## frontend/src/types/index.ts

Alias de API, permissão ou coluna persistida.

- Linha 43: `zemdaBodyEnabled?: boolean;`

## frontend/src/utils/metaPixel.ts

Compatibilidade de âncora pública antiga.

- Linha 22: `const anchors = new Set(['', '#conteudo', '#inicio', '#como-funciona', '#profissoes', '#zemdabody', '#zemda360',`

## frontend/tests/landing-browser.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 102: `assert.ok(!/ZemdaBody/i.test(text));`
- Linha 103: `await page.goto(base+'/#zemdabody');`

## frontend/tests/zemda360-naming-browser.cjs

Teste/fixture de compatibilidade legada ou registro de falha conhecida.

- Linha 16: `if(p.endsWith('/auth/me'))data={user:{id:'user-a',role:'professional',name:'Teste legado',status:'active',zemdaBodyEnabled:true},tenant:{id:'a',name:'Clínica teste'}};`
- Linha 22: `for(const route of ['/zemda360','/zemda-body','/mapa-corporal']){`
- Linha 30: `assert.ok(!/ZemdaBody/.test(await page.locator('body').innerText()));`
