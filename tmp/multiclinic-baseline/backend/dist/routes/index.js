"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const consents_routes_1 = require("./consents.routes");
const system_integrity_controller_1 = require("../controllers/system-integrity.controller");
const personal_posture_ai_controller_1 = require("../controllers/personal-posture-ai.controller");
const express_1 = require("express");
const billing_controller_1 = require("../controllers/billing.controller");
const auth_controller_1 = require("../controllers/auth.controller");
const taxonomy_controller_1 = require("../controllers/taxonomy.controller");
const tenant_controller_1 = require("../controllers/tenant.controller");
const professional_controller_1 = require("../controllers/professional.controller");
const service_controller_1 = require("../controllers/service.controller");
const patient_controller_1 = require("../controllers/patient.controller");
const appointment_controller_1 = require("../controllers/appointment.controller");
const slot_controller_1 = require("../controllers/slot.controller");
const clinical_controller_1 = require("../controllers/clinical.controller");
const payment_controller_1 = require("../controllers/payment.controller");
const receipt_controller_1 = require("../controllers/receipt.controller");
const staff_controller_1 = require("../controllers/staff.controller");
const onboarding_controller_1 = require("../controllers/onboarding.controller");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const report_controller_1 = require("../controllers/report.controller");
const ai_controller_1 = require("../controllers/ai.controller");
const audit_controller_1 = require("../controllers/audit.controller");
const patient_clinical_controller_1 = require("../controllers/patient-clinical.controller");
const documents_controller_1 = require("../controllers/documents.controller");
const cash_register_controller_1 = require("../controllers/cash-register.controller");
const insurance_controller_1 = require("../controllers/insurance.controller");
const import_controller_1 = require("../controllers/import.controller");
const notification_controller_1 = require("../controllers/notification.controller");
const referral_controller_1 = require("../controllers/referral.controller");
const support_controller_1 = require("../controllers/support.controller");
const pending_exam_controller_1 = require("../controllers/pending-exam.controller");
const inventory_controller_1 = require("../controllers/inventory.controller");
const clinical_inventory_controller_1 = require("../controllers/clinical-inventory.controller");
const budget_controller_1 = require("../controllers/budget.controller");
const payroll_controller_1 = require("../controllers/payroll.controller");
const physiotherapy_controller_1 = require("../controllers/physiotherapy.controller");
const dentistry_controller_1 = require("../controllers/dentistry.controller");
const nutrition_controller_1 = require("../controllers/nutrition.controller");
const occupational_therapy_controller_1 = require("../controllers/occupational-therapy.controller");
const speech_therapy_controller_1 = require("../controllers/speech-therapy.controller");
const body_assessment_controller_1 = require("../controllers/body-assessment.controller");
const personal_controller_1 = require("../controllers/personal.controller");
const personal_ai_controller_1 = require("../controllers/personal-ai.controller");
const personal_student_link_controller_1 = require("../controllers/personal-student-link.controller");
const integrations_controller_1 = require("../controllers/integrations.controller");
const free_trial_controller_1 = require("../controllers/free-trial.controller");
const file_controller_1 = require("../controllers/file.controller");
const clinical_reassessment_controller_1 = require("../controllers/clinical-reassessment.controller");
const clinical_goals_controller_1 = require("../controllers/clinical-goals.controller");
const digital_certificate_controller_1 = require("../controllers/digital-certificate.controller");
const psychopedagogy_controller_1 = require("../controllers/psychopedagogy.controller");
const psychology_controller_1 = require("../controllers/psychology.controller");
const external_tests_controller_1 = require("../controllers/external-tests.controller");
const email_verification_controller_1 = require("../controllers/email-verification.controller");
const infobip_controller_1 = require("../controllers/infobip.controller");
const clinical_draft_controller_1 = require("../controllers/clinical-draft.controller");
const capability_controller_1 = require("../controllers/capability.controller");
const medical_controller_1 = require("../controllers/medical.controller");
const sandbox_controller_1 = require("../controllers/sandbox.controller");
const estetic_controller_1 = require("../controllers/estetic.controller");
const service_reminder_controller_1 = require("../controllers/service-reminder.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const tenant_middleware_1 = require("../middlewares/tenant.middleware");
const rbac_middleware_1 = require("../middlewares/rbac.middleware");
const api = (0, express_1.Router)();
(0, billing_controller_1.mountBillingRoutes)(api);
// ==========================================
// 1. ROTAS PÚBLICAS
// ==========================================
// Health Check Público da API
api.get('/health', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ status: 'ok', service: 'Zemda-API-Core', version: '1.1.2' });
});
api.get('/v1/health', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ status: 'ok', service: 'Zemda-API-Core', version: '1.1.2' });
});
// Validação de E-mail Obrigatória (OTP de 6 dígitos)
api.post('/v1/public/email/request-code', email_verification_controller_1.EmailVerificationController.requestCode);
api.post('/v1/public/email/verify-code', email_verification_controller_1.EmailVerificationController.verifyCode);
// Autenticação e Registro Público
api.post('/v1/auth/login', auth_controller_1.AuthController.login);
api.post('/v1/auth/google', auth_controller_1.AuthController.googleAuth);
api.post('/v1/auth/register', auth_controller_1.AuthController.register);
api.post('/v1/public/auth/reset-password', auth_controller_1.AuthController.resetPassword);
api.post('/v1/auth/reset-password', auth_controller_1.AuthController.resetPassword);
api.post('/v1/public/tenants/register', tenant_controller_1.TenantController.registerPublic);
api.post('/v1/tenants/register-public', tenant_controller_1.TenantController.registerPublic);
api.get('/v1/public/tenants', tenant_controller_1.TenantController.listPublic);
// Validação e Registro via Convite Único da Clínica (Itens 14 a 23)
api.get('/v1/public/invites/:token', auth_controller_1.AuthController.validateInvite);
api.get('/v1/public/invites/:clinicSlug/:token', auth_controller_1.AuthController.validateInvite);
api.post('/v1/auth/register-invite', auth_controller_1.AuthController.registerWithInvite);
// Validação e Ativação de Teste Grátis
api.get('/v1/public/free-trials/validate/:token', free_trial_controller_1.FreeTrialController.validateToken);
api.post('/v1/public/free-trials/activate/:token', free_trial_controller_1.FreeTrialController.activate);
// Validação Pública de Documentos Clínicos e Assinaturas (PAdES / ICP-Brasil / Eletrônica)
api.get('/v1/public/verify-document/:verificationToken', digital_certificate_controller_1.DigitalCertificateController.publicVerifyDocument);
// Taxonomia pública (para formulários e página pública)
api.get('/v1/taxonomy/categories', taxonomy_controller_1.TaxonomyController.listCategories);
api.get('/v1/taxonomy/professions', taxonomy_controller_1.TaxonomyController.listProfessions);
api.get('/v1/taxonomy/specialties', taxonomy_controller_1.TaxonomyController.listSpecialties);
api.get('/v1/taxonomy/practice-areas', capability_controller_1.CapabilityController.getPracticeAreas);
api.get('/v1/taxonomy/medical-tree', capability_controller_1.CapabilityController.getMedicalTree);
api.get('/v1/capabilities/medical-tree', capability_controller_1.CapabilityController.getMedicalTree);
// Página Pública da Clínica & Agendamento Online (/c/:slug)
api.get('/v1/public/tenants/:slug', tenant_controller_1.TenantController.getPublicProfile);
api.get('/v1/public/slots/available', slot_controller_1.SlotController.getAvailableSlots);
api.post('/v1/public/appointments', appointment_controller_1.AppointmentController.create);
// Página Pública do Profissional & Agendamento Direto (/agendar/:clinicSlug/:professionalSlug ou /agendar/:slug)
api.get('/v1/public/professionals/:clinicSlug/:professionalSlug', professional_controller_1.ProfessionalController.getPublicProfile);
api.get('/v1/public/professionals/:clinicSlug/:professionalSlug/slots', professional_controller_1.ProfessionalController.getPublicSlots);
api.get('/v1/public/professionals/:slug', professional_controller_1.ProfessionalController.getPublicProfile);
api.get('/v1/public/professionals/:slug/slots', professional_controller_1.ProfessionalController.getPublicSlots);
// ZemdaPersonal — Acesso Externo do Aluno aos Treinos Prescritos
api.get('/v1/public/personal/workouts/:token', personal_student_link_controller_1.PersonalStudentLinkController.getPublicWorkout);
api.get('/public/personal/workouts/:token', personal_student_link_controller_1.PersonalStudentLinkController.getPublicWorkout);
api.get('/v1/public/personal/workouts/:token/records', personal_student_link_controller_1.PersonalStudentLinkController.getPublicRecords);
api.get('/public/personal/workouts/:token/records', personal_student_link_controller_1.PersonalStudentLinkController.getPublicRecords);
api.post('/v1/public/personal/workouts/:token/sessions/start', personal_student_link_controller_1.PersonalStudentLinkController.startSession);
api.post('/public/personal/workouts/:token/sessions/start', personal_student_link_controller_1.PersonalStudentLinkController.startSession);
api.post('/v1/public/personal/workouts/:token/sessions/:sessionId/progress', personal_student_link_controller_1.PersonalStudentLinkController.saveProgress);
api.post('/public/personal/workouts/:token/sessions/:sessionId/progress', personal_student_link_controller_1.PersonalStudentLinkController.saveProgress);
api.post('/v1/public/personal/workouts/:token/sessions/:sessionId/finish', personal_student_link_controller_1.PersonalStudentLinkController.finishSession);
api.post('/public/personal/workouts/:token/sessions/:sessionId/finish', personal_student_link_controller_1.PersonalStudentLinkController.finishSession);
// Verificação de Versão da Aplicação (Mecanismo de Auto-Update / Notificação)
api.get('/v1/public/app-version', (req, res) => {
    res.json({
        currentVersion: '1.1.2',
        latestVersion: '1.1.2',
        minRequiredVersion: '1.0.0',
        releaseDate: '2026-09-12',
        appName: 'Zemda',
        releaseNotes: 'Recursos recentes: Reconhecimento de fala aprimorado, IA para evolução clínica e melhorias de estabilidade.',
        downloadWindowsUrl: '/v1/public/download-windows',
        downloadAndroidUrl: '/v1/public/download-android',
        features: [
            'Reconhecimento de fala sem repetições com controles pausar/retomar',
            'Estruturação de evolução clínica e conduta terapêutica com IA Zemda',
            'Compatibilidade e preservação total de dados na atualização'
        ]
    });
});
// Instaladores ficam no GitHub Releases (fora do git); a URL pode ser trocada por variável de ambiente.
const RELEASES_DOWNLOAD_URL = 'https://github.com/GZapello/medschedule-saas/releases/latest/download';
api.get('/v1/public/download-windows', (req, res) => {
    res.redirect(302, process.env.DOWNLOAD_WINDOWS_URL || `${RELEASES_DOWNLOAD_URL}/Zemda-Setup.exe`);
});
api.get('/v1/public/download-android', (req, res) => {
    res.redirect(302, process.env.DOWNLOAD_ANDROID_URL || `${RELEASES_DOWNLOAD_URL}/Zemda.apk`);
});
// ==========================================
// 2. ROTAS AUTENTICADAS (COM JWT + TENANT)
// ==========================================
(0, consents_routes_1.mountPublicConsentRoutes)(api);
api.use(auth_middleware_1.authMiddleware);
api.use(tenant_middleware_1.tenantMiddleware);
// Perfil autenticado & Aceite Legal (Acesso pessoal para qualquer usuário do sistema)
api.get('/v1/auth/me', auth_controller_1.AuthController.me);
api.post('/v1/auth/accept-legal', auth_controller_1.AuthController.acceptLegal);
api.put('/v1/auth/profile/password', auth_controller_1.AuthController.updateProfilePassword);
api.put('/v1/auth/profile/email', auth_controller_1.AuthController.updateProfileEmail);
api.use(auth_middleware_1.onboardingGate);
api.use(billing_controller_1.subscriptionGate);
(0, consents_routes_1.mountConsentRoutes)(api);
// Tenants & Configurações da Clínica
api.get('/v1/tenants/current', tenant_middleware_1.requireTenant, tenant_controller_1.TenantController.getCurrent);
api.get('/v1/clinics/current', tenant_middleware_1.requireTenant, tenant_controller_1.TenantController.getCurrent);
api.put('/v1/tenants/current', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), tenant_controller_1.TenantController.updateCurrent);
api.put('/v1/clinics/current', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), tenant_controller_1.TenantController.updateCurrent);
api.get('/v1/tenants', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.listAll);
// Gestão Global do SaaS (Exclusivo SuperAdmin / ADM do SaaS)
api.get('/v1/admin/integrity', (0, rbac_middleware_1.requireRole)('superadmin'), system_integrity_controller_1.SystemIntegrityController.get);
api.get('/v1/admin/metrics', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminMetrics);
api.get('/v1/admin/integrations/asaas/status', (0, rbac_middleware_1.requireRole)('superadmin'), integrations_controller_1.IntegrationsController.getAsaasStatus);
api.get('/admin/integrations/asaas/status', (0, rbac_middleware_1.requireRole)('superadmin'), integrations_controller_1.IntegrationsController.getAsaasStatus);
api.put('/v1/admin/tenants/:id/approve', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminApprove);
api.put('/v1/admin/tenants/:id/reject', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminReject);
api.put('/v1/admin/tenants/:id/block', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminBlock);
api.put('/v1/admin/tenants/:id/unblock', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminUnblock);
api.put('/v1/admin/tenants/:id/ban', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminBan);
api.put('/v1/admin/tenants/:id/unban', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminUnban);
api.put('/v1/admin/tenants/:id/toggle-registrations', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminToggleRegistrations);
api.post('/v1/admin/tenants/:id/delete-permanently', (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminDeletePermanently);
api.get(['/v1/admin/tenants/:tenantId/summary', '/admin/tenants/:tenantId/summary'], (0, rbac_middleware_1.requireRole)('superadmin'), tenant_controller_1.TenantController.adminTenantSummary);
// Gestão de Testes Grátis (Exclusivo SuperAdmin SaaS)
api.post('/v1/admin/free-trials', (0, rbac_middleware_1.requireRole)('superadmin'), free_trial_controller_1.FreeTrialController.create);
api.get('/v1/admin/free-trials', (0, rbac_middleware_1.requireRole)('superadmin'), free_trial_controller_1.FreeTrialController.listAll);
api.patch(['/v1/admin/free-trials/:id/validity', '/admin/free-trials/:id/validity'], (0, rbac_middleware_1.requireRole)('superadmin'), free_trial_controller_1.FreeTrialController.updateValidity);
api.patch(['/v1/admin/trials/:id/validity', '/admin/trials/:id/validity'], (0, rbac_middleware_1.requireRole)('superadmin'), free_trial_controller_1.FreeTrialController.updateValidity);
api.patch(['/v1/admin/solo-trials/:id/validity', '/admin/solo-trials/:id/validity'], (0, rbac_middleware_1.requireRole)('superadmin'), free_trial_controller_1.FreeTrialController.updateValidity);
api.delete('/v1/admin/free-trials/:id/revoke', (0, rbac_middleware_1.requireRole)('superadmin'), free_trial_controller_1.FreeTrialController.revoke);
api.delete('/v1/admin/free-trials/:id', (0, rbac_middleware_1.requireRole)('superadmin'), free_trial_controller_1.FreeTrialController.deletePermanent);
// Onboarding e Assistente de Configuração da Clínica (Gestor)
api.get('/v1/onboarding/status', tenant_middleware_1.requireTenant, onboarding_controller_1.OnboardingController.getStatus);
api.post('/v1/onboarding/confirm-manager', tenant_middleware_1.requireTenant, onboarding_controller_1.OnboardingController.confirmManager);
api.post('/v1/onboarding/step', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), onboarding_controller_1.OnboardingController.saveStep);
api.post('/v1/onboarding/complete', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), onboarding_controller_1.OnboardingController.complete);
// Recibos da Clínica (Dados do Emitente, Numeração Própria e Emissão)
api.get('/v1/receipts/settings', tenant_middleware_1.requireTenant, receipt_controller_1.ReceiptController.getSettings);
api.put('/v1/receipts/settings', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), receipt_controller_1.ReceiptController.updateSettings);
api.get('/v1/receipts', tenant_middleware_1.requireTenant, receipt_controller_1.ReceiptController.list);
api.get('/v1/receipts/:id', tenant_middleware_1.requireTenant, receipt_controller_1.ReceiptController.getById);
api.post('/v1/receipts', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), receipt_controller_1.ReceiptController.create);
// Gestão de Funcionários e Equipe da Clínica
api.get('/v1/staff', tenant_middleware_1.requireTenant, staff_controller_1.StaffController.listStaff);
api.post('/v1/staff/invite', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.invite);
api.get('/v1/staff/invites', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.listInvites);
api.post('/v1/staff/invites', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.createInvite);
api.delete('/v1/staff/invites/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.cancelInvite);
api.put('/v1/staff/:id/approve', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.approve);
api.put('/v1/staff/:id/reject', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.reject);
api.put('/v1/staff/:id/permissions', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.updatePermissions);
api.put('/v1/staff/:id/toggle-status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.toggleStatus);
api.put('/v1/staff/:id/role-profession', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), staff_controller_1.StaffController.updateRoleProfession);
// Onboarding Obrigatório pós-cadastro
api.get('/v1/onboarding/current-state', onboarding_controller_1.OnboardingController.getCurrentState);
api.post('/v1/onboarding/verify-email', onboarding_controller_1.OnboardingController.verifyEmail);
api.post('/v1/onboarding/resend-otp', onboarding_controller_1.OnboardingController.resendOtp);
api.post('/v1/onboarding/select-plan', onboarding_controller_1.OnboardingController.selectPlan);
api.post('/v1/onboarding/complete-profile', onboarding_controller_1.OnboardingController.completeProfile);
// Onboarding Interativo & Guia Prático por Usuário (Todas as Roles & Módulos)
api.get('/v1/user-onboarding', auth_middleware_1.authMiddleware, onboarding_controller_1.OnboardingController.getUserOnboarding);
api.post('/v1/user-onboarding', auth_middleware_1.authMiddleware, onboarding_controller_1.OnboardingController.saveUserOnboarding);
api.post('/v1/user-onboarding/reset', auth_middleware_1.authMiddleware, onboarding_controller_1.OnboardingController.resetUserOnboarding);
// Taxonomia Global: Profissões e Tipos de Serviço (Exclusivo SuperAdmin SaaS)
api.post('/v1/taxonomy/categories', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.createCategory);
api.put('/v1/taxonomy/categories/:id', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.updateCategory);
api.put('/v1/taxonomy/categories/:id/toggle-status', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.toggleCategoryStatus);
api.post('/v1/taxonomy/professions', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.createProfession);
api.put('/v1/taxonomy/professions/:id', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.updateProfession);
api.put('/v1/taxonomy/professions/:id/toggle-status', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.toggleProfessionStatus);
api.get('/v1/taxonomy/professions/:id/impact', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.getProfessionImpact);
api.delete('/v1/taxonomy/professions/:id', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.deleteProfession);
api.post('/v1/taxonomy/specialties', (0, rbac_middleware_1.requireRole)('superadmin'), taxonomy_controller_1.TaxonomyController.createSpecialty);
// Profissionais
api.get('/v1/professionals', tenant_middleware_1.requireTenant, professional_controller_1.ProfessionalController.list);
api.get('/v1/professionals/:id', tenant_middleware_1.requireTenant, professional_controller_1.ProfessionalController.getById);
api.get('/v1/professionals/:id/modules', tenant_middleware_1.requireTenant, professional_controller_1.ProfessionalController.getModules);
api.get('/v1/professionals/:id/available-modules', tenant_middleware_1.requireTenant, professional_controller_1.ProfessionalController.getModules);
api.post('/v1/professionals', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), professional_controller_1.ProfessionalController.create);
api.put('/v1/professionals/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), professional_controller_1.ProfessionalController.update);
api.put('/v1/professionals/:id/schedules', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), professional_controller_1.ProfessionalController.updateSchedules);
api.post('/v1/professionals/blocks', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), professional_controller_1.ProfessionalController.createBlockedTime);
api.delete('/v1/professionals/blocks/:blockId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), professional_controller_1.ProfessionalController.deleteBlockedTime);
// Serviços e Salas
api.get('/v1/services', tenant_middleware_1.requireTenant, service_controller_1.ServiceController.list);
api.post('/v1/services', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requirePermissionOrRole)('manage_services', 'clinic_admin'), service_controller_1.ServiceController.create);
api.put('/v1/services/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), service_controller_1.ServiceController.update);
api.delete('/v1/services/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), service_controller_1.ServiceController.delete);
api.get('/v1/rooms', tenant_middleware_1.requireTenant, service_controller_1.ServiceController.listRooms);
api.post('/v1/rooms', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requirePermissionOrRole)('manage_services', 'clinic_admin'), service_controller_1.ServiceController.createRoom);
// Lembretes de Contato / Retorno por Serviço
api.get('/v1/service-reminders', tenant_middleware_1.requireTenant, service_reminder_controller_1.ServiceReminderController.list);
api.patch('/v1/service-reminders/:id/complete', tenant_middleware_1.requireTenant, service_reminder_controller_1.ServiceReminderController.complete);
api.patch('/v1/service-reminders/:id/postpone', tenant_middleware_1.requireTenant, service_reminder_controller_1.ServiceReminderController.postpone);
// Pacientes / Clientes
api.get('/v1/patients', tenant_middleware_1.requireTenant, patient_controller_1.PatientController.list);
api.get('/v1/patients/:id', tenant_middleware_1.requireTenant, patient_controller_1.PatientController.getById);
api.post('/v1/patients', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist', 'professional'), patient_controller_1.PatientController.create);
api.put('/v1/patients/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist', 'professional'), patient_controller_1.PatientController.update);
// Agenda & Agendamentos
api.get('/v1/appointments', tenant_middleware_1.requireTenant, appointment_controller_1.AppointmentController.list);
api.get('/v1/appointments/:id', tenant_middleware_1.requireTenant, appointment_controller_1.AppointmentController.getById);
api.post('/v1/appointments', tenant_middleware_1.requireTenant, appointment_controller_1.AppointmentController.create);
api.put('/v1/appointments/:id', tenant_middleware_1.requireTenant, appointment_controller_1.AppointmentController.update);
api.put('/v1/appointments/:id/status', tenant_middleware_1.requireTenant, appointment_controller_1.AppointmentController.updateStatus);
api.put('/v1/appointments/:id/reschedule', tenant_middleware_1.requireTenant, appointment_controller_1.AppointmentController.reschedule);
api.post('/v1/appointments/:id/whatsapp-reminder', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist', 'professional'), appointment_controller_1.AppointmentController.sendWhatsAppReminder);
api.get('/v1/appointments/:id/communications', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist', 'professional'), appointment_controller_1.AppointmentController.getCommunications);
api.get('/v1/whatsapp/status', tenant_middleware_1.requireTenant, infobip_controller_1.InfobipController.getClientStatus);
api.get('/v1/slots/available', tenant_middleware_1.requireTenant, slot_controller_1.SlotController.getAvailableSlots);
// Prontuário & Evolução Clínica (Restrito estritamente a Profissionais e Admins Clínicos - LGPD)
api.get('/v1/clinical-records/patient/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_controller_1.ClinicalController.listByPatient);
api.get('/v1/clinical-records/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_controller_1.ClinicalController.getById);
api.get('/v1/clinical-records/:id/print', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_controller_1.ClinicalController.exportPdfHtml);
api.post('/v1/clinical-records', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_controller_1.ClinicalController.create);
api.put('/v1/clinical-records/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_controller_1.ClinicalController.update);
api.post('/v1/clinical-records/:id/amendments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_controller_1.ClinicalController.addAmendment);
// ==========================================
// REAVALIAÇÕES LONGITUDINAIS & METAS TERAPÊUTICAS
// ==========================================
api.get('/v1/clinical/reassessments/:specialty/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_reassessment_controller_1.ClinicalReassessmentController.getReassessments);
api.post('/v1/clinical/reassessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_reassessment_controller_1.ClinicalReassessmentController.saveReassessment);
api.post('/v1/clinical/reassessments/compare', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_reassessment_controller_1.ClinicalReassessmentController.compare);
api.get('/v1/clinical/goals/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_goals_controller_1.ClinicalGoalsController.listByPatient);
api.post('/v1/clinical/goals', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_goals_controller_1.ClinicalGoalsController.create);
api.put('/v1/clinical/goals/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_goals_controller_1.ClinicalGoalsController.updateProgress);
api.put('/v1/clinical/goals/:id/progress', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_goals_controller_1.ClinicalGoalsController.updateProgress);
api.delete('/v1/clinical/goals/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_goals_controller_1.ClinicalGoalsController.delete);
// ==========================================
// 8.1 ZEMDAFISIO: PRONTUÁRIO & EVOLUÇÃO FISIOTERAPÊUTICA
// ==========================================
api.get('/v1/physiotherapy/assessments/patient/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.listAssessmentsByPatient);
api.get('/v1/physiotherapy/assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.getAssessmentById);
api.post('/v1/physiotherapy/assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.createAssessment);
api.put('/v1/physiotherapy/assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.updateAssessment);
api.get('/v1/physiotherapy/evolutions/patient/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.listEvolutionsByPatient);
api.post('/v1/physiotherapy/evolutions', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.createEvolution);
api.put('/v1/physiotherapy/evolutions/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.updateEvolution);
api.post('/v1/physiotherapy/consultations/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.finishConsultation);
// 8.2 ZEMDAFISIO × ZEMDA360: AVALIAÇÕES REGIONAIS VISUAIS & COMPARAÇÃO LONGITUDINAL
api.get('/v1/physiotherapy/regional-evaluations/patient/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.listRegionalEvaluations);
api.get('/v1/physiotherapy/regional-evaluations/summary/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.getRegionalSummary);
api.get('/v1/physiotherapy/regional-evaluations/compare/:patientId/:regionId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.getRegionalComparison);
api.post('/v1/physiotherapy/regional-evaluations', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.createRegionalEvaluation);
api.put('/v1/physiotherapy/regional-evaluations/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.createRegionalEvaluation);
api.delete('/v1/physiotherapy/regional-evaluations/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), physiotherapy_controller_1.PhysiotherapyController.deleteRegionalEvaluation);
// ==========================================
// MÓDULO CLÍNICO ZEMDAODONTO (ODONTOLOGIA)
// ==========================================
api.get('/v1/dentistry/odontograms/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.getOdontogram);
api.post('/v1/dentistry/odontograms', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveOdontogram);
api.get('/v1/dentistry/teeth/:patientId/history', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.getToothHistory);
api.get('/v1/dentistry/perio/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.getPerioRecords);
api.post('/v1/dentistry/perio', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.savePerioRecord);
api.get('/v1/dentistry/endo/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.getEndoRecords);
api.post('/v1/dentistry/endo', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveEndoRecord);
api.get('/v1/dentistry/anamnesis/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.getAnamnesis);
api.post('/v1/dentistry/anamnesis', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveAnamnesis);
api.get('/v1/dentistry/treatment-plans/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.listTreatmentPlans);
api.post('/v1/dentistry/treatment-plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveTreatmentPlan);
api.put('/v1/dentistry/treatment-plans/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.updateTreatmentPlanStatus);
api.get('/v1/dentistry/prosthetics/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.listProsthetics);
api.post('/v1/dentistry/prosthetics', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveProsthetic);
api.put('/v1/dentistry/prosthetics/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.updateProsthetic);
api.get('/v1/dentistry/orthodontics/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.getOrtho);
api.post('/v1/dentistry/orthodontics', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveOrtho);
api.get('/v1/dentistry/hof/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.listHof);
api.post('/v1/dentistry/hof', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveHof);
// Itens Novos: Dossiê do Dente, Exames Independentes, Implantes, Fotos Clínicas, Prótese Pendente
api.get('/v1/dentistry/teeth/:patientId/:toothNumber/dossier', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.getToothDossier);
api.get('/v1/dentistry/exams/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.listExams);
api.post('/v1/dentistry/exams', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveExam);
api.get('/v1/dentistry/implants/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.listImplants);
api.post('/v1/dentistry/implants', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.saveImplant);
api.get('/v1/dentistry/photos/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.listPhotos);
api.post('/v1/dentistry/photos', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.savePhoto);
api.get('/v1/dentistry/prosthetics-lab/pending', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.listPendingProsthetics);
api.post('/v1/dentistry/consultations/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), dentistry_controller_1.DentistryController.finishConsultation);
// ==========================================
// MÓDULO CLÍNICO ZEMDANUTRI (NUTRIÇÃO)
// ==========================================
api.get('/v1/nutrition/anamnesis/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.getAnamnesis);
api.post('/v1/nutrition/anamnesis', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.saveAnamnesis);
api.get('/v1/nutrition/assessments/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.listAssessments);
api.post('/v1/nutrition/assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.saveAssessment);
api.get('/v1/nutrition/bioimpedance/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.listBioimpedance);
api.post('/v1/nutrition/bioimpedance', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.saveBioimpedance);
api.get('/v1/nutrition/recalls/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.listRecalls);
api.post('/v1/nutrition/recalls', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.saveRecall);
api.get('/v1/nutrition/foods', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.listFoodDatabase);
api.post('/v1/nutrition/foods', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.saveCustomFood);
api.get('/v1/nutrition/meal-plans/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.listMealPlans);
api.post('/v1/nutrition/meal-plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.saveMealPlan);
api.get('/v1/nutrition/goals/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.listGoals);
api.post('/v1/nutrition/goals', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.saveGoal);
api.put('/v1/nutrition/goals/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.updateGoalStatus);
api.post('/v1/nutrition/consultations/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), nutrition_controller_1.NutritionController.finishConsultation);
// ==========================================
// MÓDULO CLÍNICO ZEMDATO (TERAPIA OCUPACIONAL)
// ==========================================
api.get('/v1/occupational-therapy/profile/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.getProfile);
api.post('/v1/occupational-therapy/profile', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveProfile);
api.get('/v1/occupational-therapy/avd/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.listAvd);
api.post('/v1/occupational-therapy/avd', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveAvd);
api.get('/v1/occupational-therapy/sensory/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.getSensory);
api.post('/v1/occupational-therapy/sensory', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveSensory);
api.get('/v1/occupational-therapy/motor-cognitive/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.getMotorCognitive);
api.post('/v1/occupational-therapy/motor-cognitive', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveMotorCognitive);
api.get('/v1/occupational-therapy/treatment-plans/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.listTreatmentPlans);
api.post('/v1/occupational-therapy/treatment-plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveTreatmentPlan);
api.get('/v1/occupational-therapy/assistive-tech/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.listAssistiveTech);
api.post('/v1/occupational-therapy/assistive-tech', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveAssistiveTech);
// Itens Novos: Análise de Tarefas, Mapa de Rotina, Participação, Programa Casa/Escola, Painel Funcional
api.get('/v1/occupational-therapy/task-analyses/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.listTaskAnalyses);
api.post('/v1/occupational-therapy/task-analyses', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveTaskAnalysis);
api.get('/v1/occupational-therapy/routine-map/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.getRoutineMap);
api.post('/v1/occupational-therapy/routine-map', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveRoutineMap);
api.get('/v1/occupational-therapy/participation/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.getParticipation);
api.post('/v1/occupational-therapy/participation', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveParticipation);
api.get('/v1/occupational-therapy/home-programs/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.listHomePrograms);
api.post('/v1/occupational-therapy/home-programs', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.saveHomeProgram);
api.put('/v1/occupational-therapy/home-programs/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.updateHomeProgramStatus);
api.get('/v1/occupational-therapy/dashboard/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.getFunctionalDashboard);
api.post('/v1/occupational-therapy/consultations/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), occupational_therapy_controller_1.OccupationalTherapyController.finishConsultation);
// ==========================================
// MÓDULO CLÍNICO ZEMDAFONO (FONOAUDIOLOGIA)
// ==========================================
api.get('/v1/speech-therapy/anamnesis/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getAnamnesis);
api.post('/v1/speech-therapy/anamnesis', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveAnamnesis);
api.get('/v1/speech-therapy/language/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getLanguage);
api.post('/v1/speech-therapy/language', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveLanguage);
api.get('/v1/speech-therapy/phonemes/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getSpeechPhonology);
api.post('/v1/speech-therapy/phonemes', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveSpeechPhonology);
api.get('/v1/speech-therapy/orofacial/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getOrofacialMotricity);
api.post('/v1/speech-therapy/orofacial', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveOrofacialMotricity);
api.get('/v1/speech-therapy/voice/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getVoice);
api.post('/v1/speech-therapy/voice', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveVoice);
api.get('/v1/speech-therapy/fluency/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getFluency);
api.post('/v1/speech-therapy/fluency', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveFluency);
api.get('/v1/speech-therapy/dysphagia/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getDysphagia);
api.post('/v1/speech-therapy/dysphagia', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveDysphagia);
api.get('/v1/speech-therapy/audiology/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.listAudiology);
api.post('/v1/speech-therapy/audiology', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveAudiology);
api.get('/v1/speech-therapy/treatment-plans/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.listTreatmentPlans);
api.post('/v1/speech-therapy/treatment-plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveTreatmentPlan);
api.get('/v1/speech-therapy/complementary-tests/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.listComplementaryTests);
api.post('/v1/speech-therapy/complementary-tests', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveComplementaryTest);
api.delete('/v1/speech-therapy/complementary-tests/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.deleteComplementaryTest);
// Itens Novos: Matriz de Disfagia, Processos Fonológicos, Amostras de Fluência, Análise de Linguagem
api.get('/v1/speech-therapy/dysphagia-matrix/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getDysphagiaMatrix);
api.post('/v1/speech-therapy/dysphagia-matrix', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveDysphagiaMatrix);
api.get('/v1/speech-therapy/phonological-processes/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getPhonologicalProcesses);
api.post('/v1/speech-therapy/phonological-processes', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.savePhonologicalProcesses);
api.get('/v1/speech-therapy/fluency-samples/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.listFluencySamples);
api.post('/v1/speech-therapy/fluency-samples', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveFluencySample);
api.post('/v1/speech-therapy/analyze-language', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.analyzeLanguageSample);
// Melhorias Clínicas ZemdaFono (FOIS, IDV-10, Rastreio Leitura/Escrita, ABFW, PAC, Fonologia Longitudinal)
api.get('/v1/speech-therapy/fois/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getFoisList);
api.post('/v1/speech-therapy/fois', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveFois);
api.get('/v1/speech-therapy/idv10/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getIdv10List);
api.post('/v1/speech-therapy/idv10', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveIdv10);
api.get('/v1/speech-therapy/reading-screenings/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getReadingScreenings);
api.get('/v1/speech-therapy/reading-screening/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getReadingScreenings);
api.post('/v1/speech-therapy/reading-screenings', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveReadingScreening);
api.post('/v1/speech-therapy/reading-screening', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveReadingScreening);
api.get('/v1/speech-therapy/abfw/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getAbfwRecords);
api.post('/v1/speech-therapy/abfw', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveAbfwRecord);
api.get('/v1/speech-therapy/auditory-screenings/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getAuditoryScreenings);
api.get('/v1/speech-therapy/auditory-screening/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getAuditoryScreenings);
api.post('/v1/speech-therapy/auditory-screenings', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveAuditoryScreening);
api.post('/v1/speech-therapy/auditory-screening', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.saveAuditoryScreening);
api.get('/v1/speech-therapy/phonemes/history/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getPhonemesHistory);
api.get('/v1/speech-therapy/phonemes/:patientId/history', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.getPhonemesHistory);
api.post('/v1/speech-therapy/consultations/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), speech_therapy_controller_1.SpeechTherapyController.finishConsultation);
// ==========================================
// RASCUNHOS CLÍNICOS UNIVERSAIS (AUTOSAVE EM TODOS OS MÓDULOS)
// ==========================================
api.get('/v1/clinical/draft/:moduleType/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_draft_controller_1.ClinicalDraftController.getDraft);
api.post('/v1/clinical/draft', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_draft_controller_1.ClinicalDraftController.saveDraft);
api.delete('/v1/clinical/draft/:moduleType/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_draft_controller_1.ClinicalDraftController.deleteDraft);
// ==========================================
// MÓDULO ZEMDAPP (PSICOPEDAGOGIA CLÍNICA E INSTITUCIONAL - CBO 2394-25)
// ==========================================
api.get('/v1/psychopedagogy/profile/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.getProfile);
api.post('/v1/psychopedagogy/profile', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveProfile);
api.post('/v1/psychopedagogy/profile/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveProfile);
api.get('/v1/psychopedagogy/assessments/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listAssessments);
api.get('/v1/psychopedagogy/assessment/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listAssessments);
api.post('/v1/psychopedagogy/assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveAssessment);
api.post('/v1/psychopedagogy/assessment/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveAssessment);
api.get('/v1/psychopedagogy/domains/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listDomains);
api.get('/v1/psychopedagogy/learning-domains/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listDomains);
api.post('/v1/psychopedagogy/domains', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveDomain);
api.get('/v1/psychopedagogy/sessions/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listSessions);
api.post('/v1/psychopedagogy/sessions', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveSession);
api.post('/v1/psychopedagogy/sessions/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.finishSession);
api.post('/v1/psychopedagogy/sessions/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveSession);
api.post('/v1/psychopedagogy/consultations/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.finishSession);
api.get('/v1/psychopedagogy/plans/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listPlans);
api.get('/v1/psychopedagogy/intervention-plans/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listPlans);
api.post('/v1/psychopedagogy/plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.savePlan);
api.post('/v1/psychopedagogy/goals', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveGoal);
api.get('/v1/psychopedagogy/instruments/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listInstruments);
api.post('/v1/psychopedagogy/instruments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveInstrument);
api.post('/v1/psychopedagogy/instruments/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveInstrument);
api.get('/v1/psychopedagogy/school-contacts/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listSchoolContacts);
api.post('/v1/psychopedagogy/school-contacts', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveSchoolContact);
api.get('/v1/psychopedagogy/institutional-cases', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listInstitutionalCases);
api.post('/v1/psychopedagogy/institutional-cases', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveInstitutionalCase);
api.get('/v1/psychopedagogy/shares/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.listShares);
api.post('/v1/psychopedagogy/shares', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.createShare);
api.delete('/v1/psychopedagogy/shares/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.deleteShare);
api.get('/v1/psychopedagogy/retention-policy', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.getRetentionPolicy);
api.post('/v1/psychopedagogy/retention-policy', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychopedagogy_controller_1.PsychopedagogyController.saveRetentionPolicy);
// ==========================================
// MÓDULO ZEMDAPSICO (Psicologia Clínica - CFP)
// ==========================================
api.get('/v1/psychology/profile/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getProfile);
api.get('/v1/psychology/anamnesis/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getAnamnesis);
api.post('/v1/psychology/anamnesis', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveAnamnesis);
api.get('/v1/psychology/mental-state/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getMentalState);
api.post('/v1/psychology/mental-state', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveMentalState);
api.get('/v1/psychology/risk/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getRisk);
api.post('/v1/psychology/risk', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveRisk);
api.get('/v1/psychology/assessments/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getAssessments);
api.post('/v1/psychology/assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveAssessment);
api.get('/v1/psychology/instruments/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getInstruments);
api.post('/v1/psychology/instruments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveInstrument);
api.delete('/v1/psychology/instruments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.deleteInstrument);
api.get('/v1/psychology/screenings/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getScreenings);
api.post('/v1/psychology/screenings', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveScreening);
api.delete('/v1/psychology/screenings/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.deleteScreening);
api.get('/v1/psychology/sessions/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getSessions);
api.post('/v1/psychology/sessions', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveSession);
api.post('/v1/psychology/sessions/:id/seal', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.sealSession);
api.post('/v1/psychology/sessions/:id/amendments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.addSessionAmendment);
api.post('/v1/psychology/consultations/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.finishConsultation);
api.get('/v1/psychology/goals/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getGoals);
api.post('/v1/psychology/goals', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveGoal);
api.put('/v1/psychology/goals/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.updateGoal);
api.delete('/v1/psychology/goals/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.deleteGoal);
api.get('/v1/psychology/documents/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getDocuments);
api.post('/v1/psychology/documents', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.createDocument);
api.post('/v1/psychology/documents/:id/delivery', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.registerDocumentDelivery);
api.get('/v1/psychology/documents/:id/print', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.printDocumentPdf);
api.post('/v1/psychology/ai-assist', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.aiAssist);
api.get('/v1/psychology/history/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getHistory);
api.get('/v1/psychology/audit-logs/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getAuditLogs);
api.get('/v1/psychology/draft/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.getDraft);
api.post('/v1/psychology/draft', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), psychology_controller_1.PsychologyController.saveDraft);
// ==========================================
// CENTRAL DE CERTIFICADOS DIGITAIS ICP-BRASIL & ASSINATURA PAdES
// ==========================================
api.get('/v1/digital-certificates/status', auth_middleware_1.authMiddleware, digital_certificate_controller_1.DigitalCertificateController.getProviderStatus);
api.get('/v1/digital-certificates/my-certificate', tenant_middleware_1.requireTenant, digital_certificate_controller_1.DigitalCertificateController.getMyCertificate);
api.get('/v1/digital-certificates', tenant_middleware_1.requireTenant, digital_certificate_controller_1.DigitalCertificateController.listCertificates);
api.post('/v1/digital-certificates/connect', tenant_middleware_1.requireTenant, digital_certificate_controller_1.DigitalCertificateController.connectCertificate);
api.post('/v1/digital-certificates/:id/validate', tenant_middleware_1.requireTenant, digital_certificate_controller_1.DigitalCertificateController.validateCertificate);
api.delete('/v1/digital-certificates/:id', tenant_middleware_1.requireTenant, digital_certificate_controller_1.DigitalCertificateController.deleteCertificate);
api.post('/v1/digital-signatures/sign', tenant_middleware_1.requireTenant, digital_certificate_controller_1.DigitalCertificateController.signDocument);
api.post('/v1/digital-signatures/validate', tenant_middleware_1.requireTenant, digital_certificate_controller_1.DigitalCertificateController.validateSignature);
api.get('/v1/digital-signatures/:id', tenant_middleware_1.requireTenant, digital_certificate_controller_1.DigitalCertificateController.getSignature);
// ==========================================
// MÓDULO CLÍNICO ZEMDA360 (MAPA CORPORAL & CANETA CLÍNICA)
// ==========================================
api.get('/v1/body-assessments/patient/:patientId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.listByPatient);
api.get('/v1/body-assessments/appointment/:appointmentId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.getByAppointment);
api.get('/v1/body-assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.getById);
api.post('/v1/body-assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.upsertAssessment);
api.post('/v1/body-assessments/:id/markers', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.saveMarker);
api.delete('/v1/body-assessments/markers/:markerId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.deleteMarker);
api.put('/v1/body-assessments/:id/drawings/:view', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.saveDrawings);
api.delete('/v1/body-assessments/:id/drawings/:view', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.clearViewDrawings);
api.get('/v1/body-assessments/patient/:patientId/anthropometry', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.listAnthropometryByPatient);
api.post('/v1/body-assessments/anthropometry', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.saveAnthropometry);
api.get('/v1/body-assessments/patient/:patientId/therapeutic-plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.listTherapeuticPlansByPatient);
api.post('/v1/body-assessments/therapeutic-plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), body_assessment_controller_1.BodyAssessmentController.saveTherapeuticPlan);
// ==========================================
// MÓDULO ZEMDAPERSONAL (TREINAMENTO & PERSONAL TRAINER)
// ==========================================
// Shared clinical resources reuse the Personal engine; no workout/module access is granted.
api.get('/v1/clinical-assessments/patients/:studentId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listAssessments);
api.get('/v1/clinical-assessments/patients/:studentId/evolution', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getEvolutionData);
api.post('/v1/clinical-assessments/preview', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.previewAssessment);
api.get('/v1/clinical-assessments/:id/report-data', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.assessmentReportData);
api.get('/v1/clinical-assessments/:id/compare/:compareId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.compareAssessments);
api.get('/v1/clinical-assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getAssessment);
api.post('/v1/clinical-assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createAssessment);
api.put('/v1/clinical-assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updateAssessment);
api.delete('/v1/clinical-assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.deleteAssessment);
api.get('/v1/personal/dashboard', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getDashboard);
api.get('/v1/personal/search', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.smartSearch);
// Alunos
api.get('/v1/personal/students', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listStudents);
api.get('/personal/students', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listStudents);
api.get('/v1/personal/students/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getStudent);
api.get('/personal/students/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getStudent);
api.post('/v1/personal/students', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createStudent);
api.post('/personal/students', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createStudent);
api.put('/v1/personal/students/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updateStudent);
api.put('/personal/students/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updateStudent);
api.post('/v1/personal/students/:id/profile', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.upsertProfile);
api.post('/personal/students/:id/profile', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.upsertProfile);
api.get('/v1/personal/students/:studentId/attendance', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getAttendanceStats);
api.get('/v1/personal/students/:studentId/records', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getRecords);
api.get('/v1/personal/students/:studentId/access-link', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_student_link_controller_1.PersonalStudentLinkController.getAccessLink);
api.post('/v1/personal/students/:studentId/access-link', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_student_link_controller_1.PersonalStudentLinkController.generateOrGetAccessLink);
api.post('/v1/personal/students/:studentId/access-link/revoke', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_student_link_controller_1.PersonalStudentLinkController.revokeAccessLink);
// Protocolos de TAV (Tecido Adiposo Visceral) & Classificação
api.get('/v1/personal/tav/protocols', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listTavProtocols);
api.post('/v1/personal/tav/protocols', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createTavProtocol);
api.put('/v1/personal/tav/protocols/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updateTavProtocol);
api.delete('/v1/personal/tav/protocols/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.deleteTavProtocol);
api.post('/v1/personal/tav/classify', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.classifyTav);
// Avaliações Físicas, Comparativo & Fotos
api.get('/v1/personal/students/:studentId/assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listAssessments);
api.post('/v1/personal/assessments/preview', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.previewAssessment);
api.get('/v1/personal/assessments/:id/report-data', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.assessmentReportData);
api.get('/v1/personal/assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getAssessment);
api.get('/v1/personal/posture-ai/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_posture_ai_controller_1.PersonalPostureAIController.status);
api.post('/v1/personal/posture-ai/analyze', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_posture_ai_controller_1.PersonalPostureAIController.analyze);
api.get('/v1/personal/assessments/:id/compare/:compareId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.compareAssessments);
api.post('/v1/personal/assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createAssessment);
api.put('/v1/personal/assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updateAssessment);
api.delete('/v1/personal/assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.deleteAssessment);
api.get('/v1/personal/students/:studentId/evolution', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getEvolutionData);
api.get('/v1/personal/students/:studentId/photos', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listPhotos);
api.post('/v1/personal/photos', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.savePhoto);
api.delete('/v1/personal/photos/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.deletePhoto);
// Exercícios
api.get('/v1/personal/exercises', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listExercises);
api.get('/personal/exercises', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listExercises);
api.post('/v1/personal/exercises', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createExercise);
api.post('/personal/exercises', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createExercise);
api.put('/v1/personal/exercises/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updateExercise);
api.put('/personal/exercises/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updateExercise);
api.delete('/v1/personal/exercises/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.deleteExercise);
api.delete('/personal/exercises/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.deleteExercise);
// Treinos
api.get('/v1/personal/workouts', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listWorkouts);
api.get('/v1/personal/workouts/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.getWorkout);
api.post('/v1/personal/workouts', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createWorkout);
api.put('/v1/personal/workouts/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updateWorkout);
api.delete('/v1/personal/workouts/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.deleteWorkout);
api.post('/v1/personal/workouts/:id/duplicate', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.duplicateWorkout);
// Templates / Modelos
api.get('/v1/personal/templates', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listTemplates);
api.post('/v1/personal/templates', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createTemplate);
api.post('/v1/personal/templates/:id/apply', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.applyTemplate);
api.delete('/v1/personal/templates/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.deleteTemplate);
// Logs & Execução
api.post('/v1/personal/logs', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.executeWorkoutLog);
api.get('/v1/personal/logs', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listLogs);
// Periodização
api.get('/v1/personal/periodizations', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.listPeriodizations);
api.post('/v1/personal/periodizations', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.createPeriodization);
api.put('/v1/personal/periodizations/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_controller_1.PersonalController.updatePeriodization);
// Assistente IA ZemdaPersonal
api.post('/v1/personal/ai/assistant', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), personal_ai_controller_1.PersonalAIController.askAssistant);
// Encaminhamentos entre Profissionais da Clínica (Item 6)
api.post('/v1/referrals', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), referral_controller_1.ReferralController.create);
api.get('/v1/patients/:id/referrals', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), referral_controller_1.ReferralController.listByPatient);
api.get('/v1/referrals/received', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), referral_controller_1.ReferralController.listReceived);
// Central de Lembretes Automáticos & Notificações (Itens 20 a 30)
api.get('/v1/notifications', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), notification_controller_1.NotificationController.list);
api.get('/v1/notifications/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), notification_controller_1.NotificationController.getById);
api.post('/v1/notifications/schedule', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), notification_controller_1.NotificationController.schedule);
api.post('/v1/notifications/:id/cancel', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), notification_controller_1.NotificationController.cancel);
api.post('/v1/notifications/:id/retry', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), notification_controller_1.NotificationController.retry);
// Financeiro & Pagamentos
api.get('/v1/payments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), payment_controller_1.PaymentController.list);
api.post('/v1/payments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), payment_controller_1.PaymentController.create);
api.put('/v1/payments/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), payment_controller_1.PaymentController.updateStatus);
// Dashboard
api.get('/v1/dashboard/metrics', tenant_middleware_1.requireTenant, dashboard_controller_1.DashboardController.getMetrics);
// Relatórios e Exportação CSV e DOCX
api.get('/v1/reports/attendance', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), report_controller_1.ReportController.getAttendanceReport);
api.get('/v1/reports/financial', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), report_controller_1.ReportController.getFinancialReport);
api.get('/v1/reports/export-csv', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), report_controller_1.ReportController.exportCsv);
api.get('/v1/reports/export-docx', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), report_controller_1.ReportController.exportDocx);
api.get('/v1/reports/insurances', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), insurance_controller_1.InsuranceController.getInsuranceReport);
// 360° Linha do Tempo e Prontuário Clínico Integrado
api.get('/v1/patients/:id/timeline', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.getTimeline);
api.get('/v1/patients/:id/allergies', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional', 'receptionist'), patient_clinical_controller_1.PatientClinicalController.listAllergies);
api.put('/v1/patients/:id/allergies-status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.updateAllergyStatus);
api.post('/v1/patients/:id/allergies', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.addAllergy);
api.put('/v1/patients/:id/allergies/:allergyId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.updateAllergy);
api.delete('/v1/patients/:id/allergies/:allergyId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.deleteAllergy);
api.get('/v1/patients/:id/medications', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.listMedications);
api.post('/v1/patients/:id/medications', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.addMedication);
api.put('/v1/patients/:id/medications/:medicationId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.updateMedication);
api.delete('/v1/patients/:id/medications/:medicationId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.deleteMedication);
api.get('/v1/patients/:id/anamnesis', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.listAnamnesis);
api.get('/v1/patients/:id/anamnesis/:anamnesisId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.getAnamnesisById);
api.post('/v1/patients/:id/anamnesis', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.createAnamnesis);
api.get('/v1/patients/:id/exams', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.listExams);
api.post('/v1/patients/:id/exams', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.uploadExam);
api.put('/v1/patients/:id/exams/:examId/review', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.reviewExam);
api.delete('/v1/patients/:id/exams/:examId', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.deleteExam);
api.get('/v1/patients/:id/consents', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional', 'receptionist'), patient_clinical_controller_1.PatientClinicalController.listConsents);
api.post('/v1/patients/:id/consents', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.createConsent);
api.post('/v1/patients/:patientId/consents/:consentId/revoke', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.revokeConsent);
// LGPD art. 18 (acesso e portabilidade) — exportação completa dos dados do paciente
api.get('/v1/patients/:id/export', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), patient_clinical_controller_1.PatientClinicalController.exportPatientData);
// Documentos Clínicos: Atestados, Receituários e Pedidos de Exame
api.post('/v1/clinical/certificates', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), documents_controller_1.DocumentsController.createCertificate);
api.get('/v1/clinical/certificates/:id', tenant_middleware_1.requireTenant, documents_controller_1.DocumentsController.getCertificate);
api.post('/v1/clinical/prescriptions', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), documents_controller_1.DocumentsController.createPrescription);
api.get('/v1/clinical/prescriptions/:id', tenant_middleware_1.requireTenant, documents_controller_1.DocumentsController.getPrescription);
api.post('/v1/clinical/exam-requests', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), documents_controller_1.DocumentsController.createExamRequest);
api.get('/v1/clinical/exam-requests/:id', tenant_middleware_1.requireTenant, documents_controller_1.DocumentsController.getExamRequest);
api.get('/v1/clinics/document-templates', tenant_middleware_1.requireTenant, documents_controller_1.DocumentsController.listTemplates);
api.put('/v1/clinics/document-templates/:documentType', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), documents_controller_1.DocumentsController.upsertTemplate);
api.post('/v1/appointments/:id/finish', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), documents_controller_1.DocumentsController.finishConsultation);
api.get('/v1/appointments/:id/completion', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), documents_controller_1.DocumentsController.consultationStatus);
api.post('/v1/clinical/consultations/start', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_controller_1.ClinicalController.startConsultation);
// Gestão de Convênios
api.get('/v1/insurances/clinic', tenant_middleware_1.requireTenant, insurance_controller_1.InsuranceController.listClinicInsurances);
api.post('/v1/insurances/clinic', tenant_middleware_1.requireTenant, (req, res, next) => {
    if (req.user?.role === 'superadmin' || req.user?.role === 'clinic_admin')
        return next();
    (0, rbac_middleware_1.requirePermissionOrRole)('manage_settings', 'clinic_admin')(req, res, (err) => {
        if (!err)
            return next();
        (0, rbac_middleware_1.requirePermissionOrRole)('manage_services', 'clinic_admin')(req, res, next);
    });
}, insurance_controller_1.InsuranceController.createClinicInsurance);
api.put('/v1/insurances/clinic/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), insurance_controller_1.InsuranceController.updateClinicInsurance);
api.get('/v1/patients/:patientId/insurances', tenant_middleware_1.requireTenant, insurance_controller_1.InsuranceController.listPatientInsurances);
api.post('/v1/patients/:patientId/insurances', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), insurance_controller_1.InsuranceController.addPatientInsurance);
api.delete('/v1/patients/:patientId/insurances/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), insurance_controller_1.InsuranceController.deletePatientInsurance);
// Abertura e Fechamento de Caixa
api.get('/v1/cash-register/current', tenant_middleware_1.requireTenant, cash_register_controller_1.CashRegisterController.getCurrent);
api.post('/v1/cash-register/open', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), cash_register_controller_1.CashRegisterController.openRegister);
api.post('/v1/cash-register/:id/close', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), cash_register_controller_1.CashRegisterController.closeRegister);
api.get('/v1/cash-register/history', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), cash_register_controller_1.CashRegisterController.listHistory);
api.get('/v1/cash-register/:id', tenant_middleware_1.requireTenant, cash_register_controller_1.CashRegisterController.getById);
// Assistente de Inteligência Artificial Integrado (Zemda AI)
api.get('/v1/ai/status', tenant_middleware_1.requireTenant, ai_controller_1.AIController.getStatus);
api.post('/v1/ai/chat', tenant_middleware_1.requireTenant, ai_controller_1.AIController.chat);
api.post('/v1/ai/improve-text', tenant_middleware_1.requireTenant, ai_controller_1.AIController.improveText);
api.post('/v1/ai/organize-evolution', tenant_middleware_1.requireTenant, ai_controller_1.AIController.organizeEvolution);
api.post('/v1/ai/summarize-consultation', tenant_middleware_1.requireTenant, ai_controller_1.AIController.summarizeConsultation);
api.get('/v1/ai/conversations', tenant_middleware_1.requireTenant, ai_controller_1.AIController.listConversations);
api.post('/v1/ai/conversations', tenant_middleware_1.requireTenant, ai_controller_1.AIController.saveConversation);
api.delete('/v1/ai/conversations/:id', tenant_middleware_1.requireTenant, ai_controller_1.AIController.deleteConversation);
api.post('/v1/ai/feedback', tenant_middleware_1.requireTenant, ai_controller_1.AIController.recordFeedback);
api.post('/v1/ai/dental/parse-dictation', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), ai_controller_1.AIController.parseDentalDictation);
api.post('/v1/ai/to/generate-evolution-report', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), ai_controller_1.AIController.generateTOEvolutionReport);
api.post('/v1/ai/fono/generate-evolution-report', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), ai_controller_1.AIController.generateFonoEvolutionReport);
api.post('/v1/ai/psychology/transcript-structure', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), ai_controller_1.AIController.structurePsychologyTranscript);
api.get('/v1/ai/psychology/diarization-status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), ai_controller_1.AIController.getPsychologyDiarizationStatus);
// Importação Inteligente de Dados (Word .docx, Planilhas .xlsx/.csv/.txt, Heurística e Lotes)
api.post('/v1/import/parse-file', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requirePermissionOrRole)('can_import_data', 'clinic_admin'), import_controller_1.ImportController.parseFile);
api.post('/v1/import/execute', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requirePermissionOrRole)('can_import_data', 'clinic_admin'), import_controller_1.ImportController.executeImport);
api.get('/v1/import/batches', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requirePermissionOrRole)('can_import_data', 'clinic_admin'), import_controller_1.ImportController.listBatches);
api.post('/v1/import/batches/:id/rollback', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), import_controller_1.ImportController.rollbackBatch);
api.post('/v1/import/export-custom-docx', tenant_middleware_1.requireTenant, import_controller_1.ImportController.exportCustomDocx);
// Importação de Prontuário por Foto / Documento Efêmero (Sem Armazenar as Fotos)
api.post('/v1/import/medical-record/analyze', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requirePermissionOrRole)('can_import_data', 'clinic_admin'), import_controller_1.ImportController.analyzeMedicalRecord);
api.post('/v1/import/medical-record/execute', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requirePermissionOrRole)('can_import_data', 'clinic_admin'), import_controller_1.ImportController.executeMedicalRecord);
api.get('/v1/import/medical-record/search-patient', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requirePermissionOrRole)('can_import_data', 'clinic_admin'), import_controller_1.ImportController.searchPatientDuplicate);
// Central de Chamados & Suporte
api.get('/v1/support/tickets', support_controller_1.SupportController.list);
api.get('/v1/support/tickets/:id', support_controller_1.SupportController.getById);
api.post('/v1/support/tickets', support_controller_1.SupportController.create);
api.post('/v1/support/tickets/:id/messages', support_controller_1.SupportController.addMessage);
api.put('/v1/support/tickets/:id/status', (0, rbac_middleware_1.requireRole)('superadmin'), support_controller_1.SupportController.updateStatus);
api.patch('/v1/support/tickets/:id/status', (0, rbac_middleware_1.requireRole)('superadmin'), support_controller_1.SupportController.updateStatus);
// Exames a Receber
api.get('/v1/pending-exams', tenant_middleware_1.requireTenant, pending_exam_controller_1.PendingExamController.list);
api.get('/v1/pending-exams/:id/document', tenant_middleware_1.requireTenant, pending_exam_controller_1.PendingExamController.getDocument);
api.post('/v1/pending-exams', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional', 'receptionist'), pending_exam_controller_1.PendingExamController.create);
api.put('/v1/pending-exams/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional', 'receptionist'), pending_exam_controller_1.PendingExamController.update);
api.delete('/v1/pending-exams/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), pending_exam_controller_1.PendingExamController.delete);
// Estoque de Insumos e Produtos (Gerenciador da Clínica e Recepção)
api.get('/v1/inventory', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.list);
api.get('/v1/inventory/items', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.list);
api.post('/v1/inventory', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.createItem);
api.post('/v1/inventory/items', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.createItem);
api.put('/v1/inventory/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.updateItem);
api.put('/v1/inventory/items/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.updateItem);
api.delete('/v1/inventory/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.deleteItem);
api.delete('/v1/inventory/items/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.deleteItem);
api.post('/v1/inventory/movements', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.recordMovement);
api.get('/v1/inventory/movements', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist'), inventory_controller_1.InventoryController.listMovements);
// Estoque Clínico Central Compartilhado (Todos os Módulos Clínicos & Profissionais)
api.get('/v1/clinical-inventory/items', tenant_middleware_1.requireTenant, clinical_inventory_controller_1.ClinicalInventoryController.listItems);
api.post('/v1/clinical-inventory/items/quick-add', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_inventory_controller_1.ClinicalInventoryController.quickAdd);
api.post('/v1/clinical-inventory/usage', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_inventory_controller_1.ClinicalInventoryController.recordUsage);
api.post('/v1/clinical-inventory/usage/refund', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), clinical_inventory_controller_1.ClinicalInventoryController.refundUsage);
api.get('/v1/clinical-inventory/movements', tenant_middleware_1.requireTenant, clinical_inventory_controller_1.ClinicalInventoryController.listMovements);
// Orçamentos (Pacientes e Insumos/Fornecedores)
api.get('/v1/budgets', tenant_middleware_1.requireTenant, budget_controller_1.BudgetController.list);
api.get('/v1/budgets/:id', tenant_middleware_1.requireTenant, budget_controller_1.BudgetController.getById);
api.post('/v1/budgets', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist', 'professional'), budget_controller_1.BudgetController.create);
api.put('/v1/budgets/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist', 'professional'), budget_controller_1.BudgetController.updateStatus);
api.patch('/v1/budgets/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist', 'professional'), budget_controller_1.BudgetController.updateStatus);
api.post('/v1/budgets/:id/convert-to-inventory', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), budget_controller_1.BudgetController.convertToInventory);
api.delete('/v1/budgets/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'receptionist', 'professional'), budget_controller_1.BudgetController.delete);
// Pagamentos, Comissões e Salário dos Profissionais (Exclusivo Gerenciador da Clínica e visualização do próprio profissional)
api.get('/v1/payroll', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), payroll_controller_1.PayrollController.list);
api.get('/v1/payrolls', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), payroll_controller_1.PayrollController.list);
api.post('/v1/payroll/calculate', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.calculate);
api.post('/v1/payrolls/calculate', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.calculate);
api.post('/v1/payroll', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.save);
api.post('/v1/payrolls', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.save);
api.patch('/v1/payroll/:id/pay', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.markPaid);
api.patch('/v1/payrolls/:id/pay', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.markPaid);
api.put('/v1/payroll/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.updateStatus);
api.put('/v1/payrolls/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.updateStatus);
api.patch('/v1/payroll/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.updateStatus);
api.patch('/v1/payrolls/:id/status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.updateStatus);
api.delete('/v1/payroll/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.delete);
api.delete('/v1/payrolls/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin'), payroll_controller_1.PayrollController.delete);
// Trilha de Auditoria (LGPD Compliance) — Exclusivo SuperAdmin do SaaS (Item 20)
api.get('/v1/audit', (0, rbac_middleware_1.requireRole)('superadmin'), audit_controller_1.AuditController.list);
// ==========================================
// ARMAZENAMENTO CLOUDFLARE R2 & ANEXOS
// ==========================================
api.get('/v1/files/diagnostic', file_controller_1.FileController.getDiagnostic);
api.get('/files/diagnostic', file_controller_1.FileController.getDiagnostic);
api.post('/v1/files/upload-ticket', tenant_middleware_1.requireTenant, file_controller_1.FileController.createUploadTicket);
api.post('/files/upload-ticket', tenant_middleware_1.requireTenant, file_controller_1.FileController.createUploadTicket);
api.post('/v1/files/upload-url', tenant_middleware_1.requireTenant, file_controller_1.FileController.getUploadUrl);
api.post('/files/upload-url', tenant_middleware_1.requireTenant, file_controller_1.FileController.getUploadUrl);
api.post('/v1/files/complete', tenant_middleware_1.requireTenant, file_controller_1.FileController.completeUpload);
api.post('/files/complete', tenant_middleware_1.requireTenant, file_controller_1.FileController.completeUpload);
api.get('/v1/files/:id/url', tenant_middleware_1.requireTenant, file_controller_1.FileController.getFileUrl);
api.get('/files/:id/url', tenant_middleware_1.requireTenant, file_controller_1.FileController.getFileUrl);
api.delete('/v1/files/:id', tenant_middleware_1.requireTenant, file_controller_1.FileController.deleteFile);
api.delete('/files/:id', tenant_middleware_1.requireTenant, file_controller_1.FileController.deleteFile);
api.get('/v1/files/patient/:patientId', tenant_middleware_1.requireTenant, file_controller_1.FileController.listPatientFiles);
api.get('/files/patient/:patientId', tenant_middleware_1.requireTenant, file_controller_1.FileController.listPatientFiles);
// Testes Externos e Anexos Universais (ZemdaPsico, ZemdaFono, ZemdaTO, ZemdaNutri, ZemdaFisio, ZemdaOdonto, ZemdaPP, ZemdaPersonal)
api.get('/v1/external-tests', tenant_middleware_1.requireTenant, external_tests_controller_1.ExternalTestsController.list);
api.post('/v1/external-tests', tenant_middleware_1.requireTenant, external_tests_controller_1.ExternalTestsController.save);
api.delete('/v1/external-tests/:id', tenant_middleware_1.requireTenant, external_tests_controller_1.ExternalTestsController.delete);
// WhatsApp Infobip API — Infraestrutura Central Oficial Zemda (Exclusivo SuperAdmin do SaaS)
api.get('/v1/admin/integrations/infobip/status', (0, rbac_middleware_1.requireRole)('superadmin'), infobip_controller_1.InfobipController.getStatus);
api.post('/v1/admin/integrations/infobip/test', (0, rbac_middleware_1.requireRole)('superadmin'), infobip_controller_1.InfobipController.sendTest);
api.post('/api/admin/integrations/infobip/test', (0, rbac_middleware_1.requireRole)('superadmin'), infobip_controller_1.InfobipController.sendTest);
// ==========================================
// CAPABILITIES & RECURSOS PROFISSIONAIS ("Meus Recursos")
// ==========================================
api.get('/v1/capabilities/catalog', capability_controller_1.CapabilityController.getCatalog);
api.get('/v1/capabilities/practice-areas', capability_controller_1.CapabilityController.getPracticeAreas);
api.get('/v1/capabilities/my-resources', tenant_middleware_1.requireTenant, capability_controller_1.CapabilityController.getMyResources);
api.get('/v1/my-resources', tenant_middleware_1.requireTenant, capability_controller_1.CapabilityController.getMyResources);
api.put('/v1/capabilities/my-resources', tenant_middleware_1.requireTenant, capability_controller_1.CapabilityController.updateMyOptionalResources);
api.put('/v1/my-resources', tenant_middleware_1.requireTenant, capability_controller_1.CapabilityController.updateMyOptionalResources);
api.put('/v1/capabilities/my-practice-areas', tenant_middleware_1.requireTenant, capability_controller_1.CapabilityController.updateMyPracticeAreas);
api.put('/v1/my-resources/practice-areas', tenant_middleware_1.requireTenant, capability_controller_1.CapabilityController.updateMyPracticeAreas);
api.put('/v1/capabilities/my-medical-hierarchy', tenant_middleware_1.requireTenant, capability_controller_1.CapabilityController.updateMyMedicalHierarchy);
// ==========================================
// ZEMDAMED — MÓDULO MÉDICO INTEGRADO
// ==========================================
api.get('/v1/medical/consultations/patient/:patientId', tenant_middleware_1.requireTenant, medical_controller_1.MedicalController.listConsultationsByPatient);
api.get('/v1/medical/consultations/:id', tenant_middleware_1.requireTenant, medical_controller_1.MedicalController.getConsultationById);
api.post('/v1/medical/consultations', tenant_middleware_1.requireTenant, medical_controller_1.MedicalController.createConsultation);
api.post('/v1/medical/consultations/:id/finish', tenant_middleware_1.requireTenant, medical_controller_1.MedicalController.finishConsultation);
api.post('/v1/medical/finish-consultation', tenant_middleware_1.requireTenant, medical_controller_1.MedicalController.finishConsultation);
// ==========================================
// LABORATÓRIO ZEMDA (SUPERADMIN SANDBOX)
// ==========================================
api.post('/v1/sandbox/create-session', (0, rbac_middleware_1.requireRole)('superadmin'), sandbox_controller_1.SandboxController.createSession);
api.post('/v1/sandbox/reset', sandbox_controller_1.SandboxController.resetSandbox);
// ==========================================
// ZEMDAESTETIC — ESTÉTICA FACIAL, CORPORAL & CAPILAR
// ==========================================
api.get('/v1/estetic/config', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getConfig);
api.get('/v1/estetic/catalog', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getCatalog);
api.post('/v1/estetic/catalog', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.createCatalogItem);
api.get('/v1/estetic/patient/:patientId/overview', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getPatientOverview);
api.get('/v1/estetic/assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getAssessments);
api.post('/v1/estetic/assessments', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.createAssessment);
api.delete('/v1/estetic/assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.deleteAssessment);
api.get('/v1/estetic/plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getPlans);
api.post('/v1/estetic/plans', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.createPlan);
api.put('/v1/estetic/plans/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.updatePlan);
api.delete('/v1/estetic/plans/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.deletePlan);
api.get('/v1/estetic/procedures', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getProcedures);
api.post('/v1/estetic/procedures', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.createProcedure);
api.delete('/v1/estetic/procedures/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.deleteProcedure);
api.get('/v1/estetic/evolutions', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getEvolutions);
api.post('/v1/estetic/evolutions', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.createEvolution);
api.get('/v1/estetic/returns', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getReturns);
api.post('/v1/estetic/returns', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.createReturn);
api.get('/v1/estetic/photos', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getPhotos);
api.post('/v1/estetic/photos', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.createPhoto);
api.delete('/v1/estetic/photos/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.deletePhoto);
api.get('/v1/estetic/before-after', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getBeforeAfter);
api.get('/v1/estetic/history', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.getHistory);
api.patch('/v1/estetic/plans/:id/item-status', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.updatePlanItem);
api.put('/v1/estetic/assessments/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.updateAssessment);
api.put('/v1/estetic/procedures/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.updateProcedure);
api.put('/v1/estetic/evolutions/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.updateEvolution);
api.delete('/v1/estetic/evolutions/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.deleteEvolution);
api.patch('/v1/estetic/returns/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.updateReturn);
api.put('/v1/estetic/returns/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.updateReturn);
api.delete('/v1/estetic/returns/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.deleteReturn);
api.put('/v1/estetic/photos/:id', tenant_middleware_1.requireTenant, (0, rbac_middleware_1.requireRole)('clinic_admin', 'professional'), estetic_controller_1.EsteticController.updatePhoto);
exports.default = api;
