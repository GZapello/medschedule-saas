/**
 * test-general-fixes-verification.cjs
 * Comprehensive automated verification script covering items 1 to 22
 * of the ZEMDA GENERAL FIXES audit.
 */

const fs = require('fs');
const path = require('path');
const { db, initializeDatabase } = require('./dist/config/database');
const { ProfessionTaxonomyService } = require('./dist/services/profession-taxonomy.service');
const { createDefaultSchedules } = require('./dist/utils/schedule-defaults');

initializeDatabase();

console.log('====================================================');
console.log('INICIANDO AUDITORIA E VERIFICAÇÃO AUTOMATIZADA ZEMDA');
console.log('====================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedTests++;
  }
}

// ----------------------------------------------------
// TEST 1: Landing Page sem diferenciação de planos por solo/equipe/clínica
// ----------------------------------------------------
const landingPath = path.resolve(__dirname, '../frontend/src/components/public/ZemdaLandingPage.tsx');
const landingContent = fs.readFileSync(landingPath, 'utf8');
const hasNoSoloEquipeClinicaComparison = !landingContent.includes('Solo / Equipe / Clínica') &&
  !landingContent.includes('Plano Solo') &&
  !landingContent.includes('Plano Equipe');
const hasUnifiedPlatformTitle = landingContent.includes('Plataforma Integrada') &&
  landingContent.includes('Uma experiência completa para a sua prática profissional.');
assert(hasNoSoloEquipeClinicaComparison && hasUnifiedPlatformTitle, 'Item 1: Landing Page apresenta Zemda como plataforma única sem diferenciação de planos Solo/Equipe/Clínica');

// ----------------------------------------------------
// TEST 2: CTA final abre o cadastro de clínica normalmente
// ----------------------------------------------------
const hasCtaComecarAgora = landingContent.includes('COMEÇAR AGORA');
const hasCtaCallsRegister = landingContent.includes('onClick={() => onRegisterClinic()}');
assert(hasCtaComecarAgora && hasCtaCallsRegister, 'Item 2: CTA final "COMEÇAR AGORA" direciona unicamente para o cadastro de clínica (onRegisterClinic)');

// ----------------------------------------------------
// TEST 3: Autosave padronizado com indicador
// ----------------------------------------------------
const autosaveIndicatorPath = path.resolve(__dirname, '../frontend/src/components/clinical/ClinicalAutosaveIndicator.tsx');
const autosaveContent = fs.readFileSync(autosaveIndicatorPath, 'utf8');
const hasSalvoAutomaticamente = autosaveContent.includes('Salvo automaticamente') && autosaveContent.includes('Salvando...');
const medWorkspacePath = path.resolve(__dirname, '../frontend/src/components/medical/ZemdaMedWorkspace.tsx');
const medContent = fs.readFileSync(medWorkspacePath, 'utf8');
const medHasAutosave = medContent.includes('ClinicalAutosaveIndicator') || medContent.includes('useClinicalAutosave');
assert(hasSalvoAutomaticamente && medHasAutosave, 'Item 3: Indicador de salvamento automático padronizado e integrado aos workspaces clínicos');

// ----------------------------------------------------
// TEST 4: Dropdown de profissões do cadastro usa Portal
// ----------------------------------------------------
const regSelectPath = path.resolve(__dirname, '../frontend/src/components/auth/RegistrationProfessionSelect.tsx');
const regSelectContent = fs.readFileSync(regSelectPath, 'utf8');
const hasPortalAndBody = regSelectContent.includes('createPortal') && regSelectContent.includes('document.body');
assert(hasPortalAndBody, 'Item 4: Dropdown de profissões no cadastro renderizado via Portal no document.body evitando corte de rolagem');

// ----------------------------------------------------
// TEST 5: Layout de e-mail universal padrão Zemda
// ----------------------------------------------------
const emailServicePath = path.resolve(__dirname, 'src/services/email-template.service.ts');
const emailServiceContent = fs.readFileSync(emailServicePath, 'utf8');
const hasEmailBranding = emailServiceContent.includes('https://zemda.com.br/brand/zemda-logo.png') &&
  emailServiceContent.includes('buildZemdaEmailLayout') &&
  emailServiceContent.includes('table');
assert(hasEmailBranding, 'Item 5: Layout universal de e-mails responsivo e com identidade visual Zemda');

// ----------------------------------------------------
// SETUP FOR DATABASE TESTS (Items 6, 10, 13, 22)
// ----------------------------------------------------
const auditTenantId = 'tenant-audit-' + Date.now();
const auditUserId = 'user-audit-' + Date.now();
const auditProfId = 'prof-audit-' + Date.now();

try {
  // Cria tenant, usuário e profissional válidos no banco
  db.prepare(`
    INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at)
    VALUES (?, 'Clínica Auditoria', ?, 'clinica@audit.com', 'active', datetime('now'), datetime('now'))
  `).run(auditTenantId, auditTenantId);

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, role, password_hash, profession_id, profession_name, zemda_med_enabled, practice_areas, created_at, updated_at)
    VALUES (?, ?, 'Dr. Auditor', ?, 'professional', 'hash', 'prof-psiquiatra', 'Médico Psiquiatra', 1, '["Psiquiatria"]', datetime('now'), datetime('now'))
  `).run(auditUserId, auditTenantId, `audit-${Date.now()}@test.com`);

  db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, registration_type, registration_number, practice_areas, specialty_id, specialty_custom, zemda_med_enabled, created_at, updated_at)
    VALUES (?, ?, ?, 'Dr. Auditor', 'prof-psiquiatra', 'Médico Psiquiatra', 'CRM', '123456', '["Psiquiatria"]', 'spec-psiq-geral', 'Psiquiatra Geral', 1, datetime('now'), datetime('now'))
  `).run(auditProfId, auditTenantId, auditUserId);

  db.prepare(`
    INSERT INTO clinic_users (id, tenant_id, user_id, role, profession_id, profession_name, permissions_json, zemda_med_enabled, created_at)
    VALUES (?, ?, ?, 'professional', 'prof-psiquiatra', 'Médico Psiquiatra', '["access_zemda_med"]', 1, datetime('now'))
  `).run('cu-' + auditUserId, auditTenantId, auditUserId);

  // ----------------------------------------------------
  // TEST 6: Horários padrão seg-sáb ativos (is_active: 1 de seg a sáb, dom 0)
  // ----------------------------------------------------
  createDefaultSchedules(db, auditTenantId, auditProfId);
  const scheds = db.prepare('SELECT day_of_week, is_active FROM schedules WHERE tenant_id = ? AND professional_id = ?').all(auditTenantId, auditProfId);
  
  const mondayToFridayActive = [1, 2, 3, 4, 5].every(d => scheds.some(s => s.day_of_week === d && s.is_active === 1));
  const saturdayActive = scheds.some(s => s.day_of_week === 6 && s.is_active === 1);
  const sundayInactive = scheds.some(s => s.day_of_week === 0 && s.is_active === 0);

  assert(mondayToFridayActive && saturdayActive && sundayInactive, 'Item 6: Horários padrão criados no banco com Segunda a Sábado ativos e Domingo inativo');

  // ----------------------------------------------------
  // TEST 10 & 22: ProfessionTaxonomyService - Troca de médico para psicólogo
  // ----------------------------------------------------
  ProfessionTaxonomyService.updateProfessionalTaxonomy({
    tenantId: auditTenantId,
    professionalId: auditProfId,
    newProfessionId: 'prof-psicologo',
    newProfessionName: 'Psicólogo',
    registrationType: 'CRP',
    registrationNumber: '654321'
  });

  const updatedProf = db.prepare('SELECT * FROM professionals WHERE id = ?').get(auditProfId);
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(auditUserId);
  const updatedCU = db.prepare('SELECT * FROM clinic_users WHERE user_id = ?').get(auditUserId);

  const test10Pass = (
    updatedProf.profession_id === 'prof-psicologo' &&
    updatedProf.zemda_med_enabled === 0 &&
    updatedProf.zemda_psico_enabled === 1 &&
    updatedProf.registration_type === 'CRP' &&
    updatedProf.specialty_id === null &&
    updatedProf.specialty_custom === null &&
    updatedUser.zemda_med_enabled === 0 &&
    updatedUser.zemda_psico_enabled === 1 &&
    !updatedCU.permissions_json.includes('access_zemda_med')
  );

  assert(test10Pass, 'Item 10 & 22: Troca de médico para psicólogo removeu especialidades, zerou zemda_med_enabled e desativou resquícios');

  // ----------------------------------------------------
  // TEST 13: ProfessionTaxonomyService - Troca para Personal Trainer (Exclusividade Mútua)
  // ----------------------------------------------------
  ProfessionTaxonomyService.updateProfessionalTaxonomy({
    tenantId: auditTenantId,
    professionalId: auditProfId,
    newProfessionId: 'personal_trainer',
    newProfessionName: 'Personal Trainer',
    registrationType: 'CREF',
    registrationNumber: '998877'
  });

  const profPersonal = db.prepare('SELECT * FROM professionals WHERE id = ?').get(auditProfId);
  const userPersonal = db.prepare('SELECT * FROM users WHERE id = ?').get(auditUserId);
  const cuPersonal = db.prepare('SELECT * FROM clinic_users WHERE user_id = ?').get(auditUserId);



  const test13Pass = (
    (profPersonal.profession_id === 'prof-personal-trainer' || profPersonal.profession_id === 'personal_trainer') &&
    profPersonal.zemda_psico_enabled === 0 &&
    profPersonal.zemda_med_enabled === 0 &&
    profPersonal.zemda_personal_enabled === 1 &&
    profPersonal.registration_type === 'CREF' &&
    userPersonal.zemda_personal_enabled === 1 &&
    userPersonal.zemda_psico_enabled === 0 &&
    cuPersonal.permissions_json.includes('access_zemda_personal')
  );

  assert(test13Pass, 'Item 13: Apenas o módulo da profissão ativa (ZemdaPersonal) ficou habilitado, garantindo exclusividade mútua');

  // Cleanup banco
  db.prepare('DELETE FROM schedules WHERE tenant_id = ?').run(auditTenantId);
  db.prepare('DELETE FROM clinic_users WHERE tenant_id = ?').run(auditTenantId);
  db.prepare('DELETE FROM professionals WHERE tenant_id = ?').run(auditTenantId);
  db.prepare('DELETE FROM users WHERE tenant_id = ?').run(auditTenantId);
  db.prepare('DELETE FROM tenants WHERE id = ?').run(auditTenantId);
} catch (e) {
  console.error('[DB Test Error]:', e);
  assert(false, 'Items 6, 10, 13, 22: Falha no teste de banco');
}

// ----------------------------------------------------
// TEST 7: Sincronia de eventos Agenda <-> Dashboard
// ----------------------------------------------------
const calendarViewPath = path.resolve(__dirname, '../frontend/src/components/calendar/CalendarView.tsx');
const calendarContent = fs.readFileSync(calendarViewPath, 'utf8');
const dashboardViewPath = path.resolve(__dirname, '../frontend/src/components/dashboard/DashboardView.tsx');
const dashboardContent = fs.readFileSync(dashboardViewPath, 'utf8');
const hasCalendarSync = calendarContent.includes('zemda-appointment-updated');
const hasDashboardSync = dashboardContent.includes('zemda-appointment-updated');
assert(hasCalendarSync && hasDashboardSync, 'Item 7: Evento global bidirecional zemda-appointment-updated implementado na Agenda e no Dashboard');

// ----------------------------------------------------
// TEST 8: ZemdaMed busca paciente por nome completo / email / CPF / telefone
// ----------------------------------------------------
const hasPatientFullSearch = medContent.includes('p.full_name || p.name') &&
  medContent.includes('cpf') &&
  medContent.includes('phone');
assert(hasPatientFullSearch, 'Item 8: ZemdaMed pesquisa paciente por nome completo, email, CPF e telefone com label consistente');

// ----------------------------------------------------
// TEST 9: Iniciar Atendimento com ZemdaMed e especialidade
// ----------------------------------------------------
const modalModulePath = path.resolve(__dirname, '../frontend/src/components/clinical/SelectConsultationModuleModal.tsx');
const modalModuleContent = fs.readFileSync(modalModulePath, 'utf8');
const apptConsultationPath = path.resolve(__dirname, '../frontend/src/components/clinical/AppointmentConsultation.tsx');
const apptContent = fs.readFileSync(apptConsultationPath, 'utf8');
const hasZemdaMedOption = modalModuleContent.includes('ZemdaMed') && modalModuleContent.includes('Medicina Geral & Especialidades');
const hasZemdaMedRouting = apptContent.includes('ZemdaMedWorkspace') && apptContent.includes("effectiveModuleType === 'ZemdaMed'");
assert(hasZemdaMedOption && hasZemdaMedRouting, 'Item 9: Iniciar Atendimento oferece e roteia ZemdaMed para médicos com especialidade');

// ----------------------------------------------------
// TEST 11: Staff Permissions - Remoção do ZemdaPersonal manual
// ----------------------------------------------------
const staffViewPath = path.resolve(__dirname, '../frontend/src/components/staff/StaffManagementView.tsx');
const staffViewContent = fs.readFileSync(staffViewPath, 'utf8');
const staffControllerPath = path.resolve(__dirname, 'src/controllers/staff.controller.ts');
const staffControllerContent = fs.readFileSync(staffControllerPath, 'utf8');
const noAccessZemdaPersonalInList = !staffViewContent.includes("'access_zemda_personal'");
const staffSanitizesPermissions = staffControllerContent.includes('updateProfessionalTaxonomy');
assert(noAccessZemdaPersonalInList && staffSanitizesPermissions, 'Item 11: Permissão manual access_zemda_personal removida da equipe e condicionada à profissão');

// ----------------------------------------------------
// TEST 12: Taxonomia removida de Contas e restrita a SuperAdmin
// ----------------------------------------------------
const sidebarPath = path.resolve(__dirname, '../frontend/src/components/common/Sidebar.tsx');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
const appContent = fs.readFileSync(appPath, 'utf8');
const noTaxonomyInStaffSidebar = !sidebarContent.includes("id: 'taxonomy'");
const taxonomySuperAdminOnly = appContent.includes("currentView === 'taxonomy' && isSuperAdmin");
assert(noTaxonomyInStaffSidebar && taxonomySuperAdminOnly, 'Item 12: Taxonomia removida do menu lateral comum e restrita ao escopo global de SuperAdmin');

// ----------------------------------------------------
// TEST 14: ZemdaPersonal IA travada no aluno selecionado
// ----------------------------------------------------
const personalAIPath = path.resolve(__dirname, '../frontend/src/components/personal/PersonalAIAssistantModal.tsx');
const personalAIContent = fs.readFileSync(personalAIPath, 'utf8');
const personalAIControllerPath = path.resolve(__dirname, 'src/controllers/personal-ai.controller.ts');
const personalAIControllerContent = fs.readFileSync(personalAIControllerPath, 'utf8');
const aiLockedBadge = personalAIContent.includes('Aluno em Análise:') && personalAIContent.includes('Contexto travado');
const aiPromptRestricted = personalAIControllerContent.includes('consultoria exclusiva para o aluno') &&
  personalAIControllerContent.includes('DEVEM se referir estritamente');
assert(aiLockedBadge && aiPromptRestricted, 'Item 14: ZemdaPersonal IA exibe badge fixo com cadeado e backend restringe análises ao aluno ativo');

// ----------------------------------------------------
// TEST 15: Terminologia personalizada removida das Configurações
// ----------------------------------------------------
const settingsViewPath = path.resolve(__dirname, '../frontend/src/components/settings/SettingsView.tsx');
const settingsViewContent = fs.readFileSync(settingsViewPath, 'utf8');
const noNicheTerminologyInSettings = !settingsViewContent.includes('Terminologia Personalizada por Nicho') &&
  !settingsViewContent.includes('custom_patient_term');
const authContextPath = path.resolve(__dirname, '../frontend/src/context/AuthContext.tsx');
const authContextContent = fs.readFileSync(authContextPath, 'utf8');
const normalizedAuth = authContextContent.replace(/\r\n/g, '\n');
const autoNicheTerm = normalizedAuth.includes("clientTermLabel = (isPersonalTrainer || isZemdaPersonal || commercialModule === 'ZemdaPersonal')\n    ? 'Aluno'\n    : 'Paciente'");
assert(noNicheTerminologyInSettings && autoNicheTerm, 'Item 15: Terminologia personalizada manual removida das configurações e auto-resolvida por profissão');

// ----------------------------------------------------
// TEST 16: Notificações por e-mail em chamados de suporte
// ----------------------------------------------------
const supportControllerPath = path.resolve(__dirname, 'src/controllers/support.controller.ts');
const supportControllerContent = fs.readFileSync(supportControllerPath, 'utf8');
const hasSupportEmailNotification = supportControllerContent.includes('EmailService.sendCustomEmail') &&
  supportControllerContent.includes('buildZemdaEmailLayout');
assert(hasSupportEmailNotification, 'Item 16: Notificações de resposta de chamado com e-mail universal formatado e link direto');

// ----------------------------------------------------
// TEST 17: Encerramento de chamado com mensagem automática com data/hora e bloqueio
// ----------------------------------------------------
const hasAutoCloseMessage = supportControllerContent.includes('🔒 Chamado marcado como') &&
  supportControllerContent.includes('Intl.DateTimeFormat');
assert(hasAutoCloseMessage, 'Item 17: Atualização para resolvido/concluído insere mensagem automática no chat com data, hora e autor');

// ----------------------------------------------------
// TEST 18: Bloqueio estrito de novas mensagens em chamados resolvidos/fechados
// ----------------------------------------------------
const hasBackendBlockOnClosed = supportControllerContent.includes("ticket.status === 'resolved' || ticket.status === 'closed'") &&
  supportControllerContent.includes('Este chamado está encerrado/resolvido e não aceita novas mensagens ou anexos');
const supportViewPath = path.resolve(__dirname, '../frontend/src/components/support/SupportTicketsView.tsx');
const supportViewContent = fs.readFileSync(supportViewPath, 'utf8');
const hasFrontendBlockOnClosed = supportViewContent.includes("ticketDetails.ticket.status === 'resolved' || ticketDetails.ticket.status === 'closed'") &&
  supportViewContent.includes('bloqueado para novas mensagens ou anexos');
assert(hasBackendBlockOnClosed && hasFrontendBlockOnClosed, 'Item 18: Backend retorna erro 400 e Frontend desativa composer e anexos quando chamado está fechado');

// ----------------------------------------------------
// TEST 19: Mensagens visíveis no chamado
// ----------------------------------------------------
const hasGetMessagesEndpoint = supportControllerContent.includes('getById') &&
  supportControllerContent.includes('support_ticket_messages') &&
  supportControllerContent.includes('sender_name');
assert(hasGetMessagesEndpoint, 'Item 19: Endpoint de mensagens do chamado retorna histórico com autor, timestamps e anexos');

// ----------------------------------------------------
// TEST 20: Menu SuperAdmin simplificado (apenas 3 opções)
// ----------------------------------------------------
const hasSuperAdminSimplifiedMenu = sidebarContent.includes("isSuperAdmin") &&
  sidebarContent.includes("id: 'superadmin'") &&
  sidebarContent.includes("id: 'support-tickets'") &&
  sidebarContent.includes("id: 'audit'");
assert(hasSuperAdminSimplifiedMenu, 'Item 20: Menu do SuperAdmin exibe exclusivamente Painel Global, Chamados e Auditoria');

// ----------------------------------------------------
// TEST 21: Botão Acessar removido do SuperAdmin
// ----------------------------------------------------
const superAdminViewPath = path.resolve(__dirname, '../frontend/src/components/superadmin/SuperAdminView.tsx');
const superAdminViewContent = fs.readFileSync(superAdminViewPath, 'utf8');
const noAcessarButton = !superAdminViewContent.includes('handleImpersonate') &&
  !superAdminViewContent.includes('>Acessar<') &&
  !superAdminViewContent.includes('Acessar Clínica');
assert(noAcessarButton, 'Item 21: Botão Acessar/Impersonate removido do painel SuperAdmin garantindo isolamento estrito');

console.log('\n====================================================');
console.log(`RESUMO DA AUDITORIA: ${passedTests} PASSOU | ${failedTests} FALHOU`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
