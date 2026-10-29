import { requireSharedPatientScope } from '../middlewares/shared-patient.middleware';
import { SharedHistoryController } from '../controllers/shared-history.controller';
import { PatientSharingController } from '../controllers/patient-sharing.controller';
import { MembershipController } from '../controllers/membership.controller';
import { mountConsentRoutes, mountPublicConsentRoutes } from './consents.routes';
import { SystemIntegrityController } from '../controllers/system-integrity.controller';
import { PersonalPostureAIController } from '../controllers/personal-posture-ai.controller';
import { Router } from 'express';
import { mountBillingRoutes, subscriptionGate } from '../controllers/billing.controller';
import { AuthController } from '../controllers/auth.controller';
import { TaxonomyController } from '../controllers/taxonomy.controller';
import { TenantController } from '../controllers/tenant.controller';
import { ProfessionalController } from '../controllers/professional.controller';
import { ServiceController } from '../controllers/service.controller';
import { PatientController } from '../controllers/patient.controller';
import { AppointmentController } from '../controllers/appointment.controller';
import { SlotController } from '../controllers/slot.controller';
import { ClinicalController } from '../controllers/clinical.controller';
import { PaymentController } from '../controllers/payment.controller';
import { ReceiptController } from '../controllers/receipt.controller';
import { StaffController } from '../controllers/staff.controller';
import { OnboardingController } from '../controllers/onboarding.controller';
import { DashboardController } from '../controllers/dashboard.controller';
import { ReportController } from '../controllers/report.controller';
import { AIController } from '../controllers/ai.controller';
import { AuditController } from '../controllers/audit.controller';
import { PatientClinicalController } from '../controllers/patient-clinical.controller';
import { DocumentsController } from '../controllers/documents.controller';
import { CashRegisterController } from '../controllers/cash-register.controller';
import { InsuranceController } from '../controllers/insurance.controller';
import { ImportController } from '../controllers/import.controller';
import { NotificationController } from '../controllers/notification.controller';
import { ReferralController } from '../controllers/referral.controller';
import { SupportController } from '../controllers/support.controller';
import { PendingExamController } from '../controllers/pending-exam.controller';
import { InventoryController } from '../controllers/inventory.controller';
import { ClinicalInventoryController } from '../controllers/clinical-inventory.controller';
import { BudgetController } from '../controllers/budget.controller';
import { PayrollController } from '../controllers/payroll.controller';
import { PhysiotherapyController } from '../controllers/physiotherapy.controller';
import { DentistryController } from '../controllers/dentistry.controller';
import { NutritionController } from '../controllers/nutrition.controller';
import { OccupationalTherapyController } from '../controllers/occupational-therapy.controller';
import { SpeechTherapyController } from '../controllers/speech-therapy.controller';
import { BodyAssessmentController } from '../controllers/body-assessment.controller';
import { PersonalController } from '../controllers/personal.controller';
import { PersonalAIController } from '../controllers/personal-ai.controller';
import { PersonalStudentLinkController } from '../controllers/personal-student-link.controller';
import { IntegrationsController } from '../controllers/integrations.controller';
import { GoogleCalendarController } from '../controllers/google-calendar.controller';
import { AdminVisitsController } from '../controllers/admin-visits.controller';
import { FreeTrialController } from '../controllers/free-trial.controller';
import { FileController } from '../controllers/file.controller';
import { ClinicalReassessmentController } from '../controllers/clinical-reassessment.controller';
import { ClinicalGoalsController } from '../controllers/clinical-goals.controller';
import { DigitalCertificateController } from '../controllers/digital-certificate.controller';
import { PsychopedagogyController } from '../controllers/psychopedagogy.controller';
import { PsychologyController } from '../controllers/psychology.controller';
import { ExternalTestsController } from '../controllers/external-tests.controller';
import { EmailVerificationController } from '../controllers/email-verification.controller';
import { InfobipController } from '../controllers/infobip.controller';
import { ClinicalDraftController } from '../controllers/clinical-draft.controller';
import { CapabilityController } from '../controllers/capability.controller';
import { MedicalController } from '../controllers/medical.controller';
import { SandboxController } from '../controllers/sandbox.controller';
import { EsteticController } from '../controllers/estetic.controller';
import { ServiceReminderController } from '../controllers/service-reminder.controller';

import { authMiddleware, onboardingGate } from '../middlewares/auth.middleware';
import { tenantMiddleware, requireTenant } from '../middlewares/tenant.middleware';
import { requireRole, requirePermissionOrRole } from '../middlewares/rbac.middleware';
import { requireCapability } from '../middlewares/capability.middleware';

const api = Router();
mountBillingRoutes(api);

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
api.post('/v1/public/email/request-code', EmailVerificationController.requestCode);
api.post('/v1/public/email/verify-code', EmailVerificationController.verifyCode);

// Autenticação e Registro Público
api.post('/v1/auth/login', AuthController.login);
api.post('/v1/auth/google', AuthController.googleAuth);
api.post('/v1/auth/register', AuthController.register);
api.post('/v1/public/auth/reset-password', AuthController.resetPassword);
api.post('/v1/auth/reset-password', AuthController.resetPassword);
api.post('/v1/public/tenants/register', TenantController.registerPublic);
api.post('/v1/tenants/register-public', TenantController.registerPublic);
api.get('/v1/public/tenants', TenantController.listPublic);

// Validação e Registro via Convite Único da Clínica (Itens 14 a 23)
api.get('/v1/public/invites/:token', AuthController.validateInvite);
api.get('/v1/public/invites/:clinicSlug/:token', AuthController.validateInvite);
api.post('/v1/auth/register-invite', AuthController.registerWithInvite);

// Validação e Ativação de Teste Grátis
api.get('/v1/public/free-trials/validate/:token', FreeTrialController.validateToken);
api.post('/v1/public/free-trials/activate/:token', FreeTrialController.activate);

// Validação Pública de Documentos Clínicos e Assinaturas (PAdES / ICP-Brasil / Eletrônica)
api.get('/v1/public/verify-document/:verificationToken', DigitalCertificateController.publicVerifyDocument);

// Taxonomia pública (para formulários e página pública)
api.get('/v1/taxonomy/categories', TaxonomyController.listCategories);
api.get('/v1/taxonomy/professions', TaxonomyController.listProfessions);
api.get('/v1/taxonomy/specialties', TaxonomyController.listSpecialties);
api.get('/v1/taxonomy/practice-areas', CapabilityController.getPracticeAreas);
api.get('/v1/taxonomy/medical-tree', CapabilityController.getMedicalTree);
api.get('/v1/capabilities/medical-tree', CapabilityController.getMedicalTree);

// Página Pública da Clínica & Agendamento Online (/c/:slug)
api.get('/v1/public/tenants/:slug', TenantController.getPublicProfile);
api.get('/v1/public/slots/available', SlotController.getAvailableSlots);
api.post('/v1/public/appointments', AppointmentController.create);

// Página Pública do Profissional & Agendamento Direto (/agendar/:clinicSlug/:professionalSlug ou /agendar/:slug)
api.get('/v1/public/professionals/:clinicSlug/:professionalSlug', ProfessionalController.getPublicProfile);
api.get('/v1/public/professionals/:clinicSlug/:professionalSlug/slots', ProfessionalController.getPublicSlots);
api.get('/v1/public/professionals/:slug', ProfessionalController.getPublicProfile);
api.get('/v1/public/professionals/:slug/slots', ProfessionalController.getPublicSlots);

// ZemdaPersonal — Acesso Externo do Aluno aos Treinos Prescritos
api.get('/v1/public/personal/workouts/:token', PersonalStudentLinkController.getPublicWorkout);
api.get('/public/personal/workouts/:token', PersonalStudentLinkController.getPublicWorkout);
api.get('/v1/public/personal/workouts/:token/records', PersonalStudentLinkController.getPublicRecords);
api.get('/public/personal/workouts/:token/records', PersonalStudentLinkController.getPublicRecords);
api.post('/v1/public/personal/workouts/:token/sessions/start', PersonalStudentLinkController.startSession);
api.post('/public/personal/workouts/:token/sessions/start', PersonalStudentLinkController.startSession);

api.post('/v1/public/personal/workouts/:token/sessions/:sessionId/progress', PersonalStudentLinkController.saveProgress);
api.post('/public/personal/workouts/:token/sessions/:sessionId/progress', PersonalStudentLinkController.saveProgress);
api.post('/v1/public/personal/workouts/:token/sessions/:sessionId/finish', PersonalStudentLinkController.finishSession);
api.post('/public/personal/workouts/:token/sessions/:sessionId/finish', PersonalStudentLinkController.finishSession);

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
mountPublicConsentRoutes(api);

// Google Calendar OAuth 2.0 Callback e Webhook público de push
api.get('/v1/integrations/google-calendar/callback', GoogleCalendarController.callback);
api.get('/api/v1/integrations/google-calendar/callback', GoogleCalendarController.callback);
api.post('/v1/integrations/google-calendar/webhook', GoogleCalendarController.webhook);
api.post('/api/v1/integrations/google-calendar/webhook', GoogleCalendarController.webhook);

api.use(authMiddleware);
api.use(tenantMiddleware);
// Enforce billing before every authenticated operational route, including shared-patient APIs.
api.use(subscriptionGate);

// Perfil autenticado & Aceite Legal (Acesso pessoal para qualquer usuário do sistema)
api.get('/v1/auth/me', AuthController.me);
api.get('/v1/auth/memberships', MembershipController.list);
api.post('/v1/auth/active-clinic', MembershipController.remember);
api.get('/v1/auth/invites/:token', AuthController.validateInvite);
api.post('/v1/auth/invites/:token/accept', MembershipController.accept);
api.get('/v1/patient-sharing/sources', PatientSharingController.sources);
api.get('/v1/patient-sharing/sources/:sourceId/patients', PatientSharingController.patients);
api.get('/v1/patient-sharing', PatientSharingController.list);
api.post('/v1/patient-sharing', PatientSharingController.create);
api.post('/v1/patient-sharing/:id/revoke', PatientSharingController.revoke);

api.post('/v1/auth/accept-legal', AuthController.acceptLegal);
api.put('/v1/auth/profile/password', AuthController.updateProfilePassword);
api.put('/v1/auth/profile/email', AuthController.updateProfileEmail);

api.use(onboardingGate);
mountConsentRoutes(api);

// Tenants & Configurações da Clínica
api.get('/v1/tenants/current', requireTenant, TenantController.getCurrent);
api.get('/v1/clinics/current', requireTenant, TenantController.getCurrent);
api.put('/v1/tenants/current', requireTenant, requireRole('clinic_admin'), TenantController.updateCurrent);
api.put('/v1/clinics/current', requireTenant, requireRole('clinic_admin'), TenantController.updateCurrent);
api.get('/v1/tenants', requireRole('superadmin'), TenantController.listAll);

// Gestão Global do SaaS (Exclusivo SuperAdmin / ADM do SaaS)
api.get('/v1/admin/integrity', requireRole('superadmin'), SystemIntegrityController.get);
api.get('/v1/admin/metrics', requireRole('superadmin'), TenantController.adminMetrics);
api.get('/v1/admin/integrations/asaas/status', requireRole('superadmin'), IntegrationsController.getAsaasStatus);
api.get('/admin/integrations/asaas/status', requireRole('superadmin'), IntegrationsController.getAsaasStatus);
api.put('/v1/admin/tenants/:id/approve', requireRole('superadmin'), TenantController.adminApprove);
api.put('/v1/admin/tenants/:id/reject', requireRole('superadmin'), TenantController.adminReject);
api.put('/v1/admin/tenants/:id/block', requireRole('superadmin'), TenantController.adminBlock);
api.put('/v1/admin/tenants/:id/unblock', requireRole('superadmin'), TenantController.adminUnblock);
api.put('/v1/admin/tenants/:id/ban', requireRole('superadmin'), TenantController.adminBan);
api.put('/v1/admin/tenants/:id/unban', requireRole('superadmin'), TenantController.adminUnban);
api.put('/v1/admin/tenants/:id/toggle-registrations', requireRole('superadmin'), TenantController.adminToggleRegistrations);
api.post('/v1/admin/tenants/:id/delete-permanently', requireRole('superadmin'), TenantController.adminDeletePermanently);
api.get(['/v1/admin/tenants/:tenantId/summary', '/admin/tenants/:tenantId/summary'], requireRole('superadmin'), TenantController.adminTenantSummary);

// Gestão de Testes Grátis (Exclusivo SuperAdmin SaaS)
api.post('/v1/admin/free-trials', requireRole('superadmin'), FreeTrialController.create);
api.get('/v1/admin/free-trials', requireRole('superadmin'), FreeTrialController.listAll);
api.patch(['/v1/admin/free-trials/:id/validity', '/admin/free-trials/:id/validity'], requireRole('superadmin'), FreeTrialController.updateValidity);
api.patch(['/v1/admin/trials/:id/validity', '/admin/trials/:id/validity'], requireRole('superadmin'), FreeTrialController.updateValidity);
api.patch(['/v1/admin/solo-trials/:id/validity', '/admin/solo-trials/:id/validity'], requireRole('superadmin'), FreeTrialController.updateValidity);
api.delete('/v1/admin/free-trials/:id/revoke', requireRole('superadmin'), FreeTrialController.revoke);
api.delete('/v1/admin/free-trials/:id', requireRole('superadmin'), FreeTrialController.deletePermanent);

// ==========================================
// REGISTRO DE VISITAS E CRM COMERCIAL (Exclusivo SuperAdmin)
// ==========================================
api.get('/v1/admin/visits/metrics', requireRole('superadmin'), AdminVisitsController.getMetrics);
api.get('/v1/admin/visits/reports', requireRole('superadmin'), AdminVisitsController.getReports);
api.get('/v1/admin/visits/export-csv', requireRole('superadmin'), AdminVisitsController.exportCsv);
api.get('/v1/admin/visits/search-tenants', requireRole('superadmin'), AdminVisitsController.searchTenantsForLink);
api.get('/v1/admin/visits/tasks', requireRole('superadmin'), AdminVisitsController.listTasks);
api.post('/v1/admin/visits/tasks', requireRole('superadmin'), AdminVisitsController.createTask);
api.patch('/v1/admin/visits/tasks/:id/toggle', requireRole('superadmin'), AdminVisitsController.toggleTask);
api.get('/v1/admin/visits/establishments', requireRole('superadmin'), AdminVisitsController.listEstablishments);
api.post('/v1/admin/visits/establishments', requireRole('superadmin'), AdminVisitsController.createEstablishment);
api.get('/v1/admin/visits/establishments/:id', requireRole('superadmin'), AdminVisitsController.getEstablishmentDetails);
api.put('/v1/admin/visits/establishments/:id', requireRole('superadmin'), AdminVisitsController.updateEstablishment);
api.delete('/v1/admin/visits/establishments/:id', requireRole('superadmin'), AdminVisitsController.archiveEstablishment);
api.post('/v1/admin/visits/establishments/:id/visits', requireRole('superadmin'), AdminVisitsController.addVisit);
api.patch('/v1/admin/visits/establishments/:id/status', requireRole('superadmin'), AdminVisitsController.updateStatus);
api.post('/v1/admin/visits/establishments/:id/link-tenant', requireRole('superadmin'), AdminVisitsController.linkTenant);

// Onboarding e Assistente de Configuração da Clínica (Gestor)
api.get('/v1/onboarding/status', requireTenant, OnboardingController.getStatus);
api.post('/v1/onboarding/confirm-manager', requireTenant, OnboardingController.confirmManager);
api.post('/v1/onboarding/step', requireTenant, requireRole('clinic_admin'), OnboardingController.saveStep);
api.post('/v1/onboarding/complete', requireTenant, requireRole('clinic_admin'), OnboardingController.complete);

// Recibos da Clínica (Dados do Emitente, Numeração Própria e Emissão)
api.get('/v1/receipts/settings', requireTenant, ReceiptController.getSettings);
api.put('/v1/receipts/settings', requireTenant, requireRole('clinic_admin'), ReceiptController.updateSettings);
api.get('/v1/receipts', requireTenant, ReceiptController.list);
api.get('/v1/receipts/:id', requireTenant, ReceiptController.getById);
api.post('/v1/receipts', requireTenant, requireRole('clinic_admin', 'receptionist'), ReceiptController.create);

// Gestão de Funcionários e Equipe da Clínica
api.get('/v1/staff', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.listStaff);
api.post('/v1/staff/invite', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.invite);
api.get('/v1/staff/invites', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.listInvites);
api.post('/v1/staff/invites', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.createInvite);
api.delete('/v1/staff/invites/:id', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.cancelInvite);
api.put('/v1/staff/:id/approve', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.approve);
api.put('/v1/staff/:id/reject', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.reject);
api.put('/v1/staff/:id/permissions', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.updatePermissions);
api.put('/v1/staff/:id/toggle-status', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.toggleStatus);
api.put('/v1/staff/:id/role-profession', requireTenant, requirePermissionOrRole('manage_staff', 'clinic_admin'), StaffController.updateRoleProfession);

// Onboarding Obrigatório pós-cadastro
api.get('/v1/onboarding/current-state', OnboardingController.getCurrentState);
api.post('/v1/onboarding/verify-email', OnboardingController.verifyEmail);
api.post('/v1/onboarding/resend-otp', OnboardingController.resendOtp);
api.post('/v1/onboarding/select-plan', OnboardingController.selectPlan);
api.post('/v1/onboarding/complete-profile', OnboardingController.completeProfile);

// Onboarding Interativo & Guia Prático por Usuário (Todas as Roles & Módulos)
api.get('/v1/user-onboarding', authMiddleware, OnboardingController.getUserOnboarding);
api.post('/v1/user-onboarding', authMiddleware, OnboardingController.saveUserOnboarding);
api.post('/v1/user-onboarding/reset', authMiddleware, OnboardingController.resetUserOnboarding);

// Taxonomia Global: Profissões e Tipos de Serviço (Exclusivo SuperAdmin SaaS)
api.post('/v1/taxonomy/categories', requireRole('superadmin'), TaxonomyController.createCategory);
api.put('/v1/taxonomy/categories/:id', requireRole('superadmin'), TaxonomyController.updateCategory);
api.put('/v1/taxonomy/categories/:id/toggle-status', requireRole('superadmin'), TaxonomyController.toggleCategoryStatus);
api.post('/v1/taxonomy/professions', requireRole('superadmin'), TaxonomyController.createProfession);
api.put('/v1/taxonomy/professions/:id', requireRole('superadmin'), TaxonomyController.updateProfession);
api.put('/v1/taxonomy/professions/:id/toggle-status', requireRole('superadmin'), TaxonomyController.toggleProfessionStatus);
api.get('/v1/taxonomy/professions/:id/impact', requireRole('superadmin'), TaxonomyController.getProfessionImpact);
api.delete('/v1/taxonomy/professions/:id', requireRole('superadmin'), TaxonomyController.deleteProfession);
api.post('/v1/taxonomy/specialties', requireRole('superadmin'), TaxonomyController.createSpecialty);

// Profissionais
api.get('/v1/professionals', requireTenant, ProfessionalController.list);
api.get('/v1/professionals/:id', requireTenant, ProfessionalController.getById);
api.get('/v1/professionals/:id/modules', requireTenant, ProfessionalController.getModules);
api.get('/v1/professionals/:id/available-modules', requireTenant, ProfessionalController.getModules);
api.post('/v1/professionals', requireTenant, requireRole('clinic_admin'), ProfessionalController.create);
api.put('/v1/professionals/:id', requireTenant, requireRole('clinic_admin', 'professional'), ProfessionalController.update);
api.put('/v1/professionals/:id/schedules', requireTenant, requireRole('clinic_admin'), ProfessionalController.updateSchedules);
api.post('/v1/professionals/blocks', requireTenant, requireRole('clinic_admin'), ProfessionalController.createBlockedTime);
api.delete('/v1/professionals/blocks/:blockId', requireTenant, requireRole('clinic_admin'), ProfessionalController.deleteBlockedTime);

// Serviços e Salas
api.get('/v1/services', requireTenant, ServiceController.list);
api.post('/v1/services', requireTenant, requirePermissionOrRole('manage_services', 'clinic_admin'), ServiceController.create);
api.put('/v1/services/:id', requireTenant, requireRole('clinic_admin'), ServiceController.update);
api.delete('/v1/services/:id', requireTenant, requireRole('clinic_admin'), ServiceController.delete);
api.get('/v1/rooms', requireTenant, ServiceController.listRooms);
api.post('/v1/rooms', requireTenant, requirePermissionOrRole('manage_services', 'clinic_admin'), ServiceController.createRoom);

// Lembretes de Contato / Retorno por Serviço
api.get('/v1/service-reminders', requireTenant, ServiceReminderController.list);
api.patch('/v1/service-reminders/:id/complete', requireTenant, ServiceReminderController.complete);
api.patch('/v1/service-reminders/:id/postpone', requireTenant, ServiceReminderController.postpone);

// Pacientes / Clientes
api.get('/v1/patients', requireTenant, PatientController.list);
api.get('/v1/patients/:id', requireTenant, PatientController.getById);
api.post('/v1/patients', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), PatientController.create);
api.put('/v1/patients/:id', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), PatientController.update);

// Agenda & Agendamentos
api.get('/v1/appointments', requireTenant, AppointmentController.list);
api.get('/v1/appointments/:id', requireTenant, AppointmentController.getById);
api.post('/v1/appointments', requireTenant, AppointmentController.create);
api.put('/v1/appointments/:id', requireTenant, AppointmentController.update);
api.put('/v1/appointments/:id/status', requireTenant, AppointmentController.updateStatus);
api.put('/v1/appointments/:id/attendance-time', requireTenant, AppointmentController.updateAttendanceTime);
api.put('/v1/appointments/:id/reschedule', requireTenant, AppointmentController.reschedule);
api.post('/v1/appointments/:id/whatsapp-reminder', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), AppointmentController.sendWhatsAppReminder);
api.get('/v1/appointments/:id/communications', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), AppointmentController.getCommunications);
api.get('/v1/whatsapp/status', requireTenant, InfobipController.getClientStatus);

// ==========================================
// INTEGRAÇÃO GOOGLE CALENDAR ↔ AGENDA ZEMDA
// ==========================================
api.get('/v1/integrations/google-calendar/connect', requireTenant, GoogleCalendarController.connect);
api.get('/v1/integrations/google-calendar/status', requireTenant, GoogleCalendarController.getStatus);
api.get('/v1/integrations/google-calendar/calendars', requireTenant, GoogleCalendarController.getCalendars);
api.put('/v1/integrations/google-calendar/settings', requireTenant, GoogleCalendarController.updateSettings);
api.post('/v1/integrations/google-calendar/sync', requireTenant, GoogleCalendarController.sync);
api.delete('/v1/integrations/google-calendar/disconnect', requireTenant, GoogleCalendarController.disconnect);
api.post('/v1/integrations/google-calendar/divergence/:appointmentId/resolve', requireTenant, GoogleCalendarController.resolveDivergence);
api.get('/v1/slots/available', requireTenant, SlotController.getAvailableSlots);

// Prontuário & Evolução Clínica (Restrito estritamente a Profissionais e Admins Clínicos - LGPD)
api.get('/v1/shared-history/patient/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), SharedHistoryController.list);
api.get('/v1/shared-history/files/:id', requireTenant, requireRole('clinic_admin', 'professional'), SharedHistoryController.file);
api.get('/v1/clinical-records/patient/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.listByPatient);
api.get('/v1/clinical-records/:id', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.getById);
api.get('/v1/clinical-records/:id/print', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.exportPdfHtml);
api.post('/v1/clinical-records', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.create);
api.put('/v1/clinical-records/:id', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.update);
api.post('/v1/clinical-records/:id/amendments', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.addAmendment);

// ==========================================
// REAVALIAÇÕES LONGITUDINAIS & METAS TERAPÊUTICAS
// ==========================================
api.get('/v1/clinical/reassessments/:specialty/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalReassessmentController.getReassessments);
api.post('/v1/clinical/reassessments', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalReassessmentController.saveReassessment);
api.post('/v1/clinical/reassessments/compare', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalReassessmentController.compare);

api.get('/v1/clinical/goals/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalGoalsController.listByPatient);
api.post('/v1/clinical/goals', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalGoalsController.create);
api.put('/v1/clinical/goals/:id', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalGoalsController.updateProgress);
api.put('/v1/clinical/goals/:id/progress', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalGoalsController.updateProgress);
api.delete('/v1/clinical/goals/:id', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalGoalsController.delete);

// ==========================================
// 8.1 ZEMDAFISIO: PRONTUÁRIO & EVOLUÇÃO FISIOTERAPÊUTICA
// ==========================================
api.get('/v1/physiotherapy/assessments/patient/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.listAssessmentsByPatient);
api.get('/v1/physiotherapy/assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.getAssessmentById);
api.post('/v1/physiotherapy/assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.createAssessment);
api.put('/v1/physiotherapy/assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.updateAssessment);

api.get('/v1/physiotherapy/evolutions/patient/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.listEvolutionsByPatient);
api.post('/v1/physiotherapy/evolutions', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.createEvolution);
api.put('/v1/physiotherapy/evolutions/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.updateEvolution);
api.post('/v1/physiotherapy/consultations/finish', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.finishConsultation);

// 8.2 ZEMDAFISIO × ZEMDA360: AVALIAÇÕES REGIONAIS VISUAIS & COMPARAÇÃO LONGITUDINAL
api.get('/v1/physiotherapy/regional-evaluations/patient/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.listRegionalEvaluations);
api.get('/v1/physiotherapy/regional-evaluations/summary/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.getRegionalSummary);
api.get('/v1/physiotherapy/regional-evaluations/compare/:patientId/:regionId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.getRegionalComparison);
api.post('/v1/physiotherapy/regional-evaluations', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.createRegionalEvaluation);
api.put('/v1/physiotherapy/regional-evaluations/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.createRegionalEvaluation);
api.delete('/v1/physiotherapy/regional-evaluations/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFisio'), PhysiotherapyController.deleteRegionalEvaluation);

// ==========================================
// MÓDULO CLÍNICO ZEMDAODONTO (ODONTOLOGIA)
// ==========================================
api.get('/v1/dentistry/odontograms/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.getOdontogram);
api.post('/v1/dentistry/odontograms', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveOdontogram);
api.get('/v1/dentistry/teeth/:patientId/history', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.getToothHistory);

api.get('/v1/dentistry/perio/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.getPerioRecords);
api.post('/v1/dentistry/perio', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.savePerioRecord);

api.get('/v1/dentistry/endo/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.getEndoRecords);
api.post('/v1/dentistry/endo', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveEndoRecord);

api.get('/v1/dentistry/anamnesis/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.getAnamnesis);
api.post('/v1/dentistry/anamnesis', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveAnamnesis);

api.get('/v1/dentistry/treatment-plans/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.listTreatmentPlans);
api.post('/v1/dentistry/treatment-plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveTreatmentPlan);
api.put('/v1/dentistry/treatment-plans/:id/status', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.updateTreatmentPlanStatus);

api.get('/v1/dentistry/prosthetics/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.listProsthetics);
api.post('/v1/dentistry/prosthetics', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveProsthetic);
api.put('/v1/dentistry/prosthetics/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.updateProsthetic);

api.get('/v1/dentistry/orthodontics/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.getOrtho);
api.post('/v1/dentistry/orthodontics', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveOrtho);

api.get('/v1/dentistry/hof/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.listHof);
api.post('/v1/dentistry/hof', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveHof);

// Itens Novos: Dossiê do Dente, Exames Independentes, Implantes, Fotos Clínicas, Prótese Pendente
api.get('/v1/dentistry/teeth/:patientId/:toothNumber/dossier', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.getToothDossier);
api.get('/v1/dentistry/exams/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.listExams);
api.post('/v1/dentistry/exams', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveExam);
api.get('/v1/dentistry/implants/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.listImplants);
api.post('/v1/dentistry/implants', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.saveImplant);
api.get('/v1/dentistry/photos/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.listPhotos);
api.post('/v1/dentistry/photos', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.savePhoto);
api.get('/v1/dentistry/prosthetics-lab/pending', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.listPendingProsthetics);

api.post('/v1/dentistry/consultations/finish', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaOdonto'), DentistryController.finishConsultation);

// ==========================================
// MÓDULO CLÍNICO ZEMDANUTRI (NUTRIÇÃO)
// ==========================================
api.get('/v1/nutrition/anamnesis/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.getAnamnesis);
api.post('/v1/nutrition/anamnesis', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.saveAnamnesis);

api.get('/v1/nutrition/assessments/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.listAssessments);
api.post('/v1/nutrition/assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.saveAssessment);

api.get('/v1/nutrition/bioimpedance/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.listBioimpedance);
api.post('/v1/nutrition/bioimpedance', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.saveBioimpedance);

api.get('/v1/nutrition/recalls/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.listRecalls);
api.post('/v1/nutrition/recalls', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.saveRecall);

api.get('/v1/nutrition/foods', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.listFoodDatabase);
api.post('/v1/nutrition/foods', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.saveCustomFood);

api.get('/v1/nutrition/meal-plans/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.listMealPlans);
api.post('/v1/nutrition/meal-plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.saveMealPlan);

api.get('/v1/nutrition/goals/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.listGoals);
api.post('/v1/nutrition/goals', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.saveGoal);
api.put('/v1/nutrition/goals/:id/status', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.updateGoalStatus);

api.post('/v1/nutrition/consultations/finish', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaNutri'), NutritionController.finishConsultation);

// ==========================================
// MÓDULO CLÍNICO ZEMDATO (TERAPIA OCUPACIONAL)
// ==========================================
api.get('/v1/occupational-therapy/profile/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.getProfile);
api.post('/v1/occupational-therapy/profile', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveProfile);

api.get('/v1/occupational-therapy/avd/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.listAvd);
api.post('/v1/occupational-therapy/avd', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveAvd);

api.get('/v1/occupational-therapy/sensory/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.getSensory);
api.post('/v1/occupational-therapy/sensory', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveSensory);

api.get('/v1/occupational-therapy/motor-cognitive/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.getMotorCognitive);
api.post('/v1/occupational-therapy/motor-cognitive', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveMotorCognitive);

api.get('/v1/occupational-therapy/treatment-plans/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.listTreatmentPlans);
api.post('/v1/occupational-therapy/treatment-plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveTreatmentPlan);

api.get('/v1/occupational-therapy/assistive-tech/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.listAssistiveTech);
api.post('/v1/occupational-therapy/assistive-tech', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveAssistiveTech);

// Itens Novos: Análise de Tarefas, Mapa de Rotina, Participação, Programa Casa/Escola, Painel Funcional
api.get('/v1/occupational-therapy/task-analyses/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.listTaskAnalyses);
api.post('/v1/occupational-therapy/task-analyses', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveTaskAnalysis);
api.get('/v1/occupational-therapy/routine-map/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.getRoutineMap);
api.post('/v1/occupational-therapy/routine-map', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveRoutineMap);
api.get('/v1/occupational-therapy/participation/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.getParticipation);
api.post('/v1/occupational-therapy/participation', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveParticipation);
api.get('/v1/occupational-therapy/home-programs/:id/pdf', requireTenant, requireRole('clinic_admin', 'professional'), OccupationalTherapyController.downloadHomeProgramPdf);
api.get('/v1/occupational-therapy/home-programs/consolidated-pdf/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.downloadConsolidatedHomeProgramsPdf);
api.get('/v1/occupational-therapy/home-programs/patient/:patientId/consolidated-pdf', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.downloadConsolidatedHomeProgramsPdf);
api.get('/v1/occupational-therapy/home-programs/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.listHomePrograms);
api.post('/v1/occupational-therapy/home-programs', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.saveHomeProgram);
api.put('/v1/occupational-therapy/home-programs/:id/status', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.updateHomeProgramStatus);
api.get('/v1/occupational-therapy/dashboard/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.getFunctionalDashboard);

api.post('/v1/occupational-therapy/consultations/finish', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaTO'), OccupationalTherapyController.finishConsultation);

// ==========================================
// MÓDULO CLÍNICO ZEMDAFONO (FONOAUDIOLOGIA)
// ==========================================
api.get('/v1/speech-therapy/anamnesis/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getAnamnesis);
api.post('/v1/speech-therapy/anamnesis', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveAnamnesis);

api.get('/v1/speech-therapy/language/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getLanguage);
api.post('/v1/speech-therapy/language', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveLanguage);

api.get('/v1/speech-therapy/phonemes/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getSpeechPhonology);
api.post('/v1/speech-therapy/phonemes', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveSpeechPhonology);

api.get('/v1/speech-therapy/orofacial/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getOrofacialMotricity);
api.post('/v1/speech-therapy/orofacial', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveOrofacialMotricity);

api.get('/v1/speech-therapy/voice/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getVoice);
api.post('/v1/speech-therapy/voice', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveVoice);

api.get('/v1/speech-therapy/fluency/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getFluency);
api.post('/v1/speech-therapy/fluency', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveFluency);

api.get('/v1/speech-therapy/dysphagia/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getDysphagia);
api.post('/v1/speech-therapy/dysphagia', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveDysphagia);

api.get('/v1/speech-therapy/audiology/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.listAudiology);
api.post('/v1/speech-therapy/audiology', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveAudiology);

api.get('/v1/speech-therapy/treatment-plans/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.listTreatmentPlans);
api.post('/v1/speech-therapy/treatment-plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveTreatmentPlan);

api.get('/v1/speech-therapy/complementary-tests/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.listComplementaryTests);
api.post('/v1/speech-therapy/complementary-tests', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveComplementaryTest);
api.delete('/v1/speech-therapy/complementary-tests/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.deleteComplementaryTest);

// Itens Novos: Matriz de Disfagia, Processos Fonológicos, Amostras de Fluência, Análise de Linguagem
api.get('/v1/speech-therapy/dysphagia-matrix/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getDysphagiaMatrix);
api.post('/v1/speech-therapy/dysphagia-matrix', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveDysphagiaMatrix);
api.get('/v1/speech-therapy/phonological-processes/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getPhonologicalProcesses);
api.post('/v1/speech-therapy/phonological-processes', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.savePhonologicalProcesses);
api.get('/v1/speech-therapy/fluency-samples/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.listFluencySamples);
api.post('/v1/speech-therapy/fluency-samples', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveFluencySample);
api.post('/v1/speech-therapy/analyze-language', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.analyzeLanguageSample);

// Melhorias Clínicas ZemdaFono (FOIS, IDV-10, Rastreio Leitura/Escrita, ABFW, PAC, Fonologia Longitudinal)
api.get('/v1/speech-therapy/fois/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getFoisList);
api.post('/v1/speech-therapy/fois', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveFois);

api.get('/v1/speech-therapy/idv10/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getIdv10List);
api.post('/v1/speech-therapy/idv10', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveIdv10);

api.get('/v1/speech-therapy/reading-screenings/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getReadingScreenings);
api.get('/v1/speech-therapy/reading-screening/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getReadingScreenings);
api.post('/v1/speech-therapy/reading-screenings', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveReadingScreening);
api.post('/v1/speech-therapy/reading-screening', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveReadingScreening);

api.get('/v1/speech-therapy/abfw/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getAbfwRecords);
api.post('/v1/speech-therapy/abfw', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveAbfwRecord);

api.get('/v1/speech-therapy/auditory-screenings/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getAuditoryScreenings);
api.get('/v1/speech-therapy/auditory-screening/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getAuditoryScreenings);
api.post('/v1/speech-therapy/auditory-screenings', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveAuditoryScreening);
api.post('/v1/speech-therapy/auditory-screening', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.saveAuditoryScreening);

api.get('/v1/speech-therapy/phonemes/history/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getPhonemesHistory);
api.get('/v1/speech-therapy/phonemes/:patientId/history', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.getPhonemesHistory);

api.post('/v1/speech-therapy/consultations/finish', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaFono'), SpeechTherapyController.finishConsultation);

// ==========================================
// RASCUNHOS CLÍNICOS UNIVERSAIS (AUTOSAVE EM TODOS OS MÓDULOS)
// ==========================================
api.get('/v1/clinical/draft/:moduleType/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalDraftController.getDraft);
api.post('/v1/clinical/draft', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalDraftController.saveDraft);
api.delete('/v1/clinical/draft/:moduleType/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalDraftController.deleteDraft);

// ==========================================
// MÓDULO ZEMDAPP (PSICOPEDAGOGIA CLÍNICA E INSTITUCIONAL - CBO 2394-25)
// ==========================================
api.get('/v1/psychopedagogy/profile/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.getProfile);
api.post('/v1/psychopedagogy/profile', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveProfile);
api.post('/v1/psychopedagogy/profile/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveProfile);
api.get('/v1/psychopedagogy/assessments/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listAssessments);
api.get('/v1/psychopedagogy/assessment/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listAssessments);
api.post('/v1/psychopedagogy/assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveAssessment);
api.post('/v1/psychopedagogy/assessment/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveAssessment);
api.get('/v1/psychopedagogy/domains/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listDomains);
api.get('/v1/psychopedagogy/learning-domains/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listDomains);
api.post('/v1/psychopedagogy/domains', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveDomain);
api.get('/v1/psychopedagogy/sessions/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listSessions);
api.post('/v1/psychopedagogy/sessions', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveSession);
api.post('/v1/psychopedagogy/sessions/finish', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.finishSession);
api.post('/v1/psychopedagogy/sessions/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveSession);
api.post('/v1/psychopedagogy/consultations/finish', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.finishSession);
api.get('/v1/psychopedagogy/plans/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listPlans);
api.get('/v1/psychopedagogy/intervention-plans/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listPlans);
api.post('/v1/psychopedagogy/plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.savePlan);
api.post('/v1/psychopedagogy/goals', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveGoal);
api.get('/v1/psychopedagogy/instruments/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listInstruments);
api.post('/v1/psychopedagogy/instruments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveInstrument);
api.post('/v1/psychopedagogy/instruments/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveInstrument);
api.get('/v1/psychopedagogy/school-contacts/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listSchoolContacts);
api.post('/v1/psychopedagogy/school-contacts', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveSchoolContact);
api.get('/v1/psychopedagogy/institutional-cases', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listInstitutionalCases);
api.post('/v1/psychopedagogy/institutional-cases', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveInstitutionalCase);
api.get('/v1/psychopedagogy/shares/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.listShares);
api.post('/v1/psychopedagogy/shares', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.createShare);
api.delete('/v1/psychopedagogy/shares/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.deleteShare);
api.get('/v1/psychopedagogy/retention-policy', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.getRetentionPolicy);
api.post('/v1/psychopedagogy/retention-policy', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPP'), PsychopedagogyController.saveRetentionPolicy);

// ==========================================
// MÓDULO ZEMDAPSICO (Psicologia Clínica - CFP)
// ==========================================
api.get('/v1/psychology/profile/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getProfile);
api.get('/v1/psychology/anamnesis/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getAnamnesis);
api.post('/v1/psychology/anamnesis', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveAnamnesis);
api.get('/v1/psychology/mental-state/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getMentalState);
api.post('/v1/psychology/mental-state', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveMentalState);
api.get('/v1/psychology/risk/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getRisk);
api.post('/v1/psychology/risk', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveRisk);
api.get('/v1/psychology/assessments/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getAssessments);
api.post('/v1/psychology/assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveAssessment);
api.get('/v1/psychology/instruments/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getInstruments);
api.post('/v1/psychology/instruments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveInstrument);
api.delete('/v1/psychology/instruments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.deleteInstrument);
api.get('/v1/psychology/screenings/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getScreenings);
api.post('/v1/psychology/screenings', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveScreening);
api.delete('/v1/psychology/screenings/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.deleteScreening);
api.get('/v1/psychology/sessions/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getSessions);
api.post('/v1/psychology/sessions', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveSession);
api.post('/v1/psychology/sessions/:id/seal', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.sealSession);
api.post('/v1/psychology/sessions/:id/amendments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.addSessionAmendment);
api.post('/v1/psychology/consultations/finish', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.finishConsultation);
api.get('/v1/psychology/goals/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getGoals);
api.post('/v1/psychology/goals', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveGoal);
api.put('/v1/psychology/goals/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.updateGoal);
api.delete('/v1/psychology/goals/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.deleteGoal);
api.get('/v1/psychology/documents/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getDocuments);
api.post('/v1/psychology/documents', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.createDocument);
api.post('/v1/psychology/documents/:id/delivery', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.registerDocumentDelivery);
api.get('/v1/psychology/documents/:id/print', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.printDocumentPdf);
api.post('/v1/psychology/ai-assist', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.aiAssist);
api.get('/v1/psychology/history/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getHistory);
api.get('/v1/psychology/audit-logs/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getAuditLogs);
api.get('/v1/psychology/draft/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.getDraft);
api.post('/v1/psychology/draft', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPsico'), PsychologyController.saveDraft);

// ==========================================
// CENTRAL DE CERTIFICADOS DIGITAIS ICP-BRASIL & ASSINATURA PAdES
// ==========================================
api.get('/v1/digital-certificates/status', authMiddleware, DigitalCertificateController.getProviderStatus);
api.get('/v1/digital-certificates/my-certificate', requireTenant, DigitalCertificateController.getMyCertificate);
api.get('/v1/digital-certificates', requireTenant, DigitalCertificateController.listCertificates);
api.post('/v1/digital-certificates/connect', requireTenant, DigitalCertificateController.connectCertificate);
api.post('/v1/digital-certificates/:id/validate', requireTenant, DigitalCertificateController.validateCertificate);
api.delete('/v1/digital-certificates/:id', requireTenant, DigitalCertificateController.deleteCertificate);
api.post('/v1/digital-signatures/sign', requireTenant, DigitalCertificateController.signDocument);
api.post('/v1/digital-signatures/validate', requireTenant, DigitalCertificateController.validateSignature);
api.get('/v1/digital-signatures/:id', requireTenant, DigitalCertificateController.getSignature);

// ==========================================
// MÓDULO CLÍNICO ZEMDA360 (MAPA CORPORAL & CANETA CLÍNICA)
// ==========================================
api.get('/v1/body-assessments/patient/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.listByPatient);
api.get('/v1/body-assessments/appointment/:appointmentId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.getByAppointment);
api.get('/v1/body-assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.getById);
api.post('/v1/body-assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.upsertAssessment);
api.post('/v1/body-assessments/:id/markers', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.saveMarker);
api.delete('/v1/body-assessments/markers/:markerId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.deleteMarker);
api.put('/v1/body-assessments/:id/drawings/:view', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.saveDrawings);
api.delete('/v1/body-assessments/:id/drawings/:view', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.clearViewDrawings);
api.get('/v1/body-assessments/patient/:patientId/anthropometry', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.listAnthropometryByPatient);
api.post('/v1/body-assessments/anthropometry', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.saveAnthropometry);
api.get('/v1/body-assessments/patient/:patientId/therapeutic-plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.listTherapeuticPlansByPatient);
api.post('/v1/body-assessments/therapeutic-plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('Zemda360'), BodyAssessmentController.saveTherapeuticPlan);

// ==========================================
// MÓDULO ZEMDAPERSONAL (TREINAMENTO & PERSONAL TRAINER)
// ==========================================
// Shared clinical resources reuse the Personal engine; no workout/module access is granted.
api.get('/v1/clinical-assessments/patients/:studentId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listAssessments);
api.get('/v1/clinical-assessments/patients/:studentId/evolution', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getEvolutionData);
api.post('/v1/clinical-assessments/preview', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.previewAssessment);
api.get('/v1/clinical-assessments/:id/report-data', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.assessmentReportData);
api.get('/v1/clinical-assessments/:id/compare/:compareId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.compareAssessments);
api.get('/v1/clinical-assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getAssessment);
api.post('/v1/clinical-assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createAssessment);
api.put('/v1/clinical-assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updateAssessment);
api.delete('/v1/clinical-assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.deleteAssessment);

api.get('/v1/personal/dashboard', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getDashboard);
api.get('/v1/personal/search', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.smartSearch);

// Alunos
api.get('/v1/personal/students', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listStudents);
api.get('/personal/students', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listStudents);
api.get('/v1/personal/students/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getStudent);
api.get('/personal/students/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getStudent);
api.post('/v1/personal/students', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createStudent);
api.post('/personal/students', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createStudent);
api.put('/v1/personal/students/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updateStudent);
api.put('/personal/students/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updateStudent);
api.post('/v1/personal/students/:id/profile', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.upsertProfile);
api.post('/personal/students/:id/profile', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.upsertProfile);
api.get('/v1/personal/students/:studentId/attendance', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getAttendanceStats);
api.get('/v1/personal/students/:studentId/records', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getRecords);
api.get('/v1/personal/students/:studentId/access-link', requireTenant, requireRole('clinic_admin', 'professional'), PersonalStudentLinkController.getAccessLink);
api.post('/v1/personal/students/:studentId/access-link', requireTenant, requireRole('clinic_admin', 'professional'), PersonalStudentLinkController.generateOrGetAccessLink);
api.post('/v1/personal/students/:studentId/access-link/revoke', requireTenant, requireRole('clinic_admin', 'professional'), PersonalStudentLinkController.revokeAccessLink);

// Protocolos de TAV (Tecido Adiposo Visceral) & Classificação
api.get('/v1/personal/tav/protocols', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listTavProtocols);
api.post('/v1/personal/tav/protocols', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createTavProtocol);
api.put('/v1/personal/tav/protocols/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updateTavProtocol);
api.delete('/v1/personal/tav/protocols/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.deleteTavProtocol);
api.post('/v1/personal/tav/classify', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.classifyTav);

// Avaliações Físicas, Comparativo & Fotos
api.get('/v1/personal/students/:studentId/assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listAssessments);
api.post('/v1/personal/assessments/preview', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.previewAssessment);
api.get('/v1/personal/assessments/:id/report-data', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.assessmentReportData);
api.get('/v1/personal/assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getAssessment);
api.get('/v1/personal/posture-ai/status', requireTenant, requireRole('clinic_admin', 'professional'), PersonalPostureAIController.status);
api.post('/v1/personal/posture-ai/analyze', requireTenant, requireRole('clinic_admin', 'professional'), PersonalPostureAIController.analyze);
api.get('/v1/personal/assessments/:id/compare/:compareId', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.compareAssessments);
api.post('/v1/personal/assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createAssessment);
api.put('/v1/personal/assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updateAssessment);
api.delete('/v1/personal/assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.deleteAssessment);
api.get('/v1/personal/students/:studentId/evolution', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getEvolutionData);
api.get('/v1/personal/students/:studentId/photos', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listPhotos);
api.post('/v1/personal/photos', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.savePhoto);
api.delete('/v1/personal/photos/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.deletePhoto);

// Exercícios
api.get('/v1/personal/exercises', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listExercises);
api.get('/personal/exercises', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listExercises);
api.post('/v1/personal/exercises', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createExercise);
api.post('/personal/exercises', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createExercise);
api.put('/v1/personal/exercises/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updateExercise);
api.put('/personal/exercises/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updateExercise);
api.delete('/v1/personal/exercises/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.deleteExercise);
api.delete('/personal/exercises/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.deleteExercise);

// Treinos
api.get('/v1/personal/workouts', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listWorkouts);
api.get('/v1/personal/workouts/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.getWorkout);
api.post('/v1/personal/workouts', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createWorkout);
api.put('/v1/personal/workouts/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updateWorkout);
api.delete('/v1/personal/workouts/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.deleteWorkout);
api.post('/v1/personal/workouts/:id/duplicate', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.duplicateWorkout);

// Templates / Modelos
api.get('/v1/personal/templates', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listTemplates);
api.post('/v1/personal/templates', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createTemplate);
api.post('/v1/personal/templates/:id/apply', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.applyTemplate);
api.delete('/v1/personal/templates/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.deleteTemplate);

// Logs & Execução
api.post('/v1/personal/logs', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.executeWorkoutLog);
api.get('/v1/personal/logs', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listLogs);

// Periodização
api.get('/v1/personal/periodizations', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.listPeriodizations);
api.post('/v1/personal/periodizations', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.createPeriodization);
api.put('/v1/personal/periodizations/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaPersonal'), PersonalController.updatePeriodization);

// Assistente IA ZemdaPersonal
api.post('/v1/personal/ai/assistant', requireTenant, requireRole('clinic_admin', 'professional'), PersonalAIController.askAssistant);

// Encaminhamentos entre Profissionais da Clínica (Item 6)
api.post('/v1/referrals', requireTenant, requireRole('clinic_admin', 'professional'), ReferralController.create);
api.get('/v1/patients/:id/referrals', requireTenant, requireRole('clinic_admin', 'professional'), ReferralController.listByPatient);
api.get('/v1/referrals/received', requireTenant, requireRole('clinic_admin', 'professional'), ReferralController.listReceived);

// Central de Lembretes Automáticos & Notificações (Itens 20 a 30)
api.get('/v1/notifications', requireTenant, requireRole('clinic_admin', 'receptionist'), NotificationController.list);
api.get('/v1/notifications/:id', requireTenant, requireRole('clinic_admin', 'receptionist'), NotificationController.getById);
api.post('/v1/notifications/schedule', requireTenant, requireRole('clinic_admin', 'receptionist'), NotificationController.schedule);
api.post('/v1/notifications/:id/cancel', requireTenant, requireRole('clinic_admin', 'receptionist'), NotificationController.cancel);
api.post('/v1/notifications/:id/retry', requireTenant, requireRole('clinic_admin', 'receptionist'), NotificationController.retry);

// Financeiro & Pagamentos
api.get('/v1/payments', requireTenant, requireRole('clinic_admin', 'receptionist'), PaymentController.list);
api.post('/v1/payments', requireTenant, requireRole('clinic_admin', 'receptionist'), PaymentController.create);
api.put('/v1/payments/:id/status', requireTenant, requireRole('clinic_admin', 'receptionist'), PaymentController.updateStatus);

// Dashboard
api.get('/v1/dashboard/metrics', requireTenant, DashboardController.getMetrics);

// Relatórios e Exportação CSV e DOCX
api.get('/v1/reports/attendance', requireTenant, requireRole('clinic_admin'), ReportController.getAttendanceReport);
api.get('/v1/reports/financial', requireTenant, requireRole('clinic_admin'), ReportController.getFinancialReport);
api.get('/v1/reports/export-csv', requireTenant, requireRole('clinic_admin'), ReportController.exportCsv);
api.get('/v1/reports/export-docx', requireTenant, requireRole('clinic_admin', 'professional'), ReportController.exportDocx);
api.get('/v1/reports/insurances', requireTenant, requireRole('clinic_admin'), InsuranceController.getInsuranceReport);

// 360° Linha do Tempo e Prontuário Clínico Integrado
api.get('/v1/patients/:id/timeline', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.getTimeline);
api.get('/v1/patients/:id/allergies', requireTenant, requireRole('clinic_admin', 'professional', 'receptionist'), PatientClinicalController.listAllergies);
api.put('/v1/patients/:id/allergies-status', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.updateAllergyStatus);
api.post('/v1/patients/:id/allergies', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.addAllergy);
api.put('/v1/patients/:id/allergies/:allergyId', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.updateAllergy);
api.delete('/v1/patients/:id/allergies/:allergyId', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.deleteAllergy);

api.get('/v1/patients/:id/medications', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.listMedications);
api.post('/v1/patients/:id/medications', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.addMedication);
api.put('/v1/patients/:id/medications/:medicationId', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.updateMedication);
api.delete('/v1/patients/:id/medications/:medicationId', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.deleteMedication);

api.get('/v1/patients/:id/anamnesis', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.listAnamnesis);
api.get('/v1/patients/:id/anamnesis/:anamnesisId', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.getAnamnesisById);
api.post('/v1/patients/:id/anamnesis', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.createAnamnesis);

api.get('/v1/patients/:id/exams', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.listExams);
api.post('/v1/patients/:id/exams', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.uploadExam);
api.put('/v1/patients/:id/exams/:examId/review', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.reviewExam);
api.delete('/v1/patients/:id/exams/:examId', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.deleteExam);

api.get('/v1/patients/:id/consents', requireTenant, requireRole('clinic_admin', 'professional', 'receptionist'), PatientClinicalController.listConsents);
api.post('/v1/patients/:id/consents', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.createConsent);
api.post('/v1/patients/:patientId/consents/:consentId/revoke', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.revokeConsent);

// LGPD art. 18 (acesso e portabilidade) — exportação completa dos dados do paciente
api.get('/v1/patients/:id/export', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.exportPatientData);

// Documentos Clínicos: Atestados, Receituários e Pedidos de Exame
api.post('/v1/clinical/certificates', requireTenant, requireRole('clinic_admin', 'professional'), DocumentsController.createCertificate);
api.get('/v1/clinical/certificates/:id', requireTenant, DocumentsController.getCertificate);
api.post('/v1/clinical/prescriptions', requireTenant, requireRole('clinic_admin', 'professional'), DocumentsController.createPrescription);
api.get('/v1/clinical/prescriptions/:id', requireTenant, DocumentsController.getPrescription);
api.post('/v1/clinical/exam-requests', requireTenant, requireRole('clinic_admin', 'professional'), DocumentsController.createExamRequest);
api.get('/v1/clinical/exam-requests/:id', requireTenant, DocumentsController.getExamRequest);
api.get('/v1/clinics/document-templates', requireTenant, DocumentsController.listTemplates);
api.put('/v1/clinics/document-templates/:documentType', requireTenant, requireRole('clinic_admin'), DocumentsController.upsertTemplate);
api.post('/v1/appointments/:id/finish', requireTenant, requireRole('clinic_admin', 'professional'), DocumentsController.finishConsultation);
api.get('/v1/appointments/:id/completion', requireTenant, requireRole('clinic_admin', 'professional'), DocumentsController.consultationStatus);
api.post('/v1/clinical/consultations/start', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.startConsultation);

// Gestão de Convênios
api.get('/v1/insurances/clinic', requireTenant, InsuranceController.listClinicInsurances);
api.post('/v1/insurances/clinic', requireTenant, (req, res, next) => {
  if (req.user?.role === 'superadmin' || req.user?.role === 'clinic_admin') return next();
  requirePermissionOrRole('manage_settings', 'clinic_admin')(req, res, (err) => {
    if (!err) return next();
    requirePermissionOrRole('manage_services', 'clinic_admin')(req, res, next);
  });
}, InsuranceController.createClinicInsurance);
api.put('/v1/insurances/clinic/:id', requireTenant, requireRole('clinic_admin'), InsuranceController.updateClinicInsurance);
api.get('/v1/patients/:patientId/insurances', requireTenant, InsuranceController.listPatientInsurances);
api.post('/v1/patients/:patientId/insurances', requireTenant, requireRole('clinic_admin', 'receptionist'), InsuranceController.addPatientInsurance);
api.delete('/v1/patients/:patientId/insurances/:id', requireTenant, requireRole('clinic_admin', 'receptionist'), InsuranceController.deletePatientInsurance);

// Abertura e Fechamento de Caixa
api.get('/v1/cash-register/current', requireTenant, CashRegisterController.getCurrent);
api.post('/v1/cash-register/open', requireTenant, requireRole('clinic_admin', 'receptionist'), CashRegisterController.openRegister);
api.post('/v1/cash-register/:id/close', requireTenant, requireRole('clinic_admin', 'receptionist'), CashRegisterController.closeRegister);
api.get('/v1/cash-register/history', requireTenant, requireRole('clinic_admin', 'receptionist'), CashRegisterController.listHistory);
api.get('/v1/cash-register/:id', requireTenant, CashRegisterController.getById);

// Assistente de Inteligência Artificial Integrado (Zemda AI)
api.get('/v1/ai/status', requireTenant, AIController.getStatus);
api.post('/v1/ai/chat', requireTenant, AIController.chat);
api.post('/v1/ai/improve-text', requireTenant, AIController.improveText);
api.post('/v1/ai/organize-evolution', requireTenant, AIController.organizeEvolution);
api.post('/v1/ai/summarize-consultation', requireTenant, AIController.summarizeConsultation);
api.get('/v1/ai/conversations', requireTenant, AIController.listConversations);
api.post('/v1/ai/conversations', requireTenant, AIController.saveConversation);
api.delete('/v1/ai/conversations/:id', requireTenant, AIController.deleteConversation);
api.post('/v1/ai/feedback', requireTenant, AIController.recordFeedback);
api.post('/v1/ai/dental/parse-dictation', requireTenant, requireRole('clinic_admin', 'professional'), AIController.parseDentalDictation);
api.post('/v1/ai/to/generate-evolution-report', requireTenant, requireRole('clinic_admin', 'professional'), AIController.generateTOEvolutionReport);
api.post('/v1/ai/fono/generate-evolution-report', requireTenant, requireRole('clinic_admin', 'professional'), AIController.generateFonoEvolutionReport);
api.post('/v1/ai/psychology/transcript-structure', requireTenant, requireRole('clinic_admin', 'professional'), AIController.structurePsychologyTranscript);
api.get('/v1/ai/psychology/diarization-status', requireTenant, requireRole('clinic_admin', 'professional'), AIController.getPsychologyDiarizationStatus);

// Importação Inteligente de Dados (Word .docx, Planilhas .xlsx/.csv/.txt, Heurística e Lotes)
api.post('/v1/import/parse-file', requireTenant, requirePermissionOrRole('can_import_data', 'clinic_admin'), ImportController.parseFile);
api.post('/v1/import/execute', requireTenant, requirePermissionOrRole('can_import_data', 'clinic_admin'), ImportController.executeImport);
api.get('/v1/import/batches', requireTenant, requirePermissionOrRole('can_import_data', 'clinic_admin'), ImportController.listBatches);
api.post('/v1/import/batches/:id/rollback', requireTenant, requireRole('clinic_admin'), ImportController.rollbackBatch);
api.post('/v1/import/export-custom-docx', requireTenant, ImportController.exportCustomDocx);

// Importação de Prontuário por Foto / Documento Efêmero (Sem Armazenar as Fotos)
api.post('/v1/import/medical-record/analyze', requireTenant, requirePermissionOrRole('can_import_data', 'clinic_admin'), ImportController.analyzeMedicalRecord);
api.post('/v1/import/medical-record/execute', requireTenant, requirePermissionOrRole('can_import_data', 'clinic_admin'), ImportController.executeMedicalRecord);
api.get('/v1/import/medical-record/search-patient', requireTenant, requirePermissionOrRole('can_import_data', 'clinic_admin'), ImportController.searchPatientDuplicate);

// Central de Chamados & Suporte
api.get('/v1/support/tickets', SupportController.list);
api.get('/v1/support/tickets/:id', SupportController.getById);
api.post('/v1/support/tickets', SupportController.create);
api.post('/v1/support/tickets/:id/messages', SupportController.addMessage);
api.put('/v1/support/tickets/:id/status', requireRole('superadmin'), SupportController.updateStatus);
api.patch('/v1/support/tickets/:id/status', requireRole('superadmin'), SupportController.updateStatus);

// Exames a Receber
api.get('/v1/pending-exams', requireTenant, PendingExamController.list);
api.get('/v1/pending-exams/:id/document', requireTenant, PendingExamController.getDocument);
api.post('/v1/pending-exams', requireTenant, requireRole('clinic_admin', 'professional', 'receptionist'), PendingExamController.create);
api.put('/v1/pending-exams/:id', requireTenant, requireRole('clinic_admin', 'professional', 'receptionist'), PendingExamController.update);
api.delete('/v1/pending-exams/:id', requireTenant, requireRole('clinic_admin'), PendingExamController.delete);

// Estoque de Insumos e Produtos (Gerenciador da Clínica e Recepção)
api.get('/v1/inventory', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.list);
api.get('/v1/inventory/items', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.list);
api.post('/v1/inventory', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.createItem);
api.post('/v1/inventory/items', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.createItem);
api.put('/v1/inventory/:id', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.updateItem);
api.put('/v1/inventory/items/:id', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.updateItem);
api.delete('/v1/inventory/:id', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.deleteItem);
api.delete('/v1/inventory/items/:id', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.deleteItem);
api.post('/v1/inventory/movements', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.recordMovement);
api.get('/v1/inventory/movements', requireTenant, requireRole('clinic_admin', 'receptionist'), InventoryController.listMovements);

// Estoque Clínico Central Compartilhado (Todos os Módulos Clínicos & Profissionais)
api.get('/v1/clinical-inventory/items', requireTenant, ClinicalInventoryController.listItems);
api.post('/v1/clinical-inventory/items/quick-add', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalInventoryController.quickAdd);
api.post('/v1/clinical-inventory/usage', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalInventoryController.recordUsage);
api.post('/v1/clinical-inventory/usage/refund', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalInventoryController.refundUsage);
api.get('/v1/clinical-inventory/movements', requireTenant, ClinicalInventoryController.listMovements);

// Orçamentos (Pacientes e Insumos/Fornecedores)
api.get('/v1/budgets', requireTenant, BudgetController.list);
api.get('/v1/budgets/:id', requireTenant, BudgetController.getById);
api.post('/v1/budgets', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), BudgetController.create);
api.put('/v1/budgets/:id/status', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), BudgetController.updateStatus);
api.patch('/v1/budgets/:id/status', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), BudgetController.updateStatus);
api.post('/v1/budgets/:id/convert-to-inventory', requireTenant, requireRole('clinic_admin', 'receptionist'), BudgetController.convertToInventory);
api.delete(
  '/v1/budgets/:id',
  requireTenant,
  requireRole('clinic_admin', 'receptionist', 'professional'),
  BudgetController.delete
);

// Pagamentos, Comissões e Salário dos Profissionais (Exclusivo Gerenciador da Clínica e visualização do próprio profissional)
api.get('/v1/payroll', requireTenant, requireRole('clinic_admin', 'professional'), PayrollController.list);
api.get('/v1/payrolls', requireTenant, requireRole('clinic_admin', 'professional'), PayrollController.list);
api.post('/v1/payroll/calculate', requireTenant, requireRole('clinic_admin'), PayrollController.calculate);
api.post('/v1/payrolls/calculate', requireTenant, requireRole('clinic_admin'), PayrollController.calculate);
api.post('/v1/payroll', requireTenant, requireRole('clinic_admin'), PayrollController.save);
api.post('/v1/payrolls', requireTenant, requireRole('clinic_admin'), PayrollController.save);
api.patch('/v1/payroll/:id/pay', requireTenant, requireRole('clinic_admin'), PayrollController.markPaid);
api.patch('/v1/payrolls/:id/pay', requireTenant, requireRole('clinic_admin'), PayrollController.markPaid);
api.put('/v1/payroll/:id/status', requireTenant, requireRole('clinic_admin'), PayrollController.updateStatus);
api.put('/v1/payrolls/:id/status', requireTenant, requireRole('clinic_admin'), PayrollController.updateStatus);
api.patch('/v1/payroll/:id/status', requireTenant, requireRole('clinic_admin'), PayrollController.updateStatus);
api.patch('/v1/payrolls/:id/status', requireTenant, requireRole('clinic_admin'), PayrollController.updateStatus);
api.delete('/v1/payroll/:id', requireTenant, requireRole('clinic_admin'), PayrollController.delete);
api.delete('/v1/payrolls/:id', requireTenant, requireRole('clinic_admin'), PayrollController.delete);

// Trilha de Auditoria (LGPD Compliance) — Exclusivo SuperAdmin do SaaS (Item 20)
api.get('/v1/audit', requireRole('superadmin'), AuditController.list);

// ==========================================
// ARMAZENAMENTO CLOUDFLARE R2 & ANEXOS
// ==========================================
api.get('/v1/files/diagnostic', FileController.getDiagnostic);
api.get('/files/diagnostic', FileController.getDiagnostic);
api.post('/v1/files/upload-ticket', requireTenant, FileController.createUploadTicket);
api.post('/files/upload-ticket', requireTenant, FileController.createUploadTicket);
api.post('/v1/files/upload-url', requireTenant, FileController.getUploadUrl);
api.post('/files/upload-url', requireTenant, FileController.getUploadUrl);
api.post('/v1/files/complete', requireTenant, FileController.completeUpload);
api.post('/files/complete', requireTenant, FileController.completeUpload);
api.get('/v1/files/:id/url', requireTenant, FileController.getFileUrl);
api.get('/files/:id/url', requireTenant, FileController.getFileUrl);
api.delete('/v1/files/:id', requireTenant, FileController.deleteFile);
api.delete('/files/:id', requireTenant, FileController.deleteFile);
api.get('/v1/files/patient/:patientId', requireTenant, FileController.listPatientFiles);
api.get('/files/patient/:patientId', requireTenant, FileController.listPatientFiles);

// Testes Externos e Anexos Universais (ZemdaPsico, ZemdaFono, ZemdaTO, ZemdaNutri, ZemdaFisio, ZemdaOdonto, ZemdaPP, ZemdaPersonal)
api.get('/v1/external-tests', requireTenant, ExternalTestsController.list);
api.post('/v1/external-tests', requireTenant, ExternalTestsController.save);
api.delete('/v1/external-tests/:id', requireTenant, ExternalTestsController.delete);

// WhatsApp Infobip API — Infraestrutura Central Oficial Zemda (Exclusivo SuperAdmin do SaaS)
api.get('/v1/admin/integrations/infobip/status', requireRole('superadmin'), InfobipController.getStatus);
api.post('/v1/admin/integrations/infobip/test', requireRole('superadmin'), InfobipController.sendTest);
api.post('/api/admin/integrations/infobip/test', requireRole('superadmin'), InfobipController.sendTest);

// ==========================================
// CAPABILITIES & RECURSOS PROFISSIONAIS ("Meus Recursos")
// ==========================================
api.get('/v1/capabilities/catalog', CapabilityController.getCatalog);
api.get('/v1/capabilities/practice-areas', CapabilityController.getPracticeAreas);
api.get('/v1/capabilities/my-resources', requireTenant, CapabilityController.getMyResources);
api.get('/v1/my-resources', requireTenant, CapabilityController.getMyResources);
api.put('/v1/capabilities/my-resources', requireTenant, CapabilityController.updateMyOptionalResources);
api.put('/v1/my-resources', requireTenant, CapabilityController.updateMyOptionalResources);
api.put('/v1/capabilities/my-practice-areas', requireTenant, CapabilityController.updateMyPracticeAreas);
api.put('/v1/my-resources/practice-areas', requireTenant, CapabilityController.updateMyPracticeAreas);
api.put('/v1/capabilities/my-medical-hierarchy', requireTenant, CapabilityController.updateMyMedicalHierarchy);

// ==========================================
// ZEMDAMED — MÓDULO MÉDICO INTEGRADO
// ==========================================
api.get('/v1/medical/consultations/patient/:patientId', requireTenant, requireSharedPatientScope('ZemdaMed'), MedicalController.listConsultationsByPatient);
api.get('/v1/medical/consultations/:id', requireTenant, requireSharedPatientScope('ZemdaMed'), MedicalController.getConsultationById);
api.post('/v1/medical/consultations', requireTenant, requireSharedPatientScope('ZemdaMed'), MedicalController.createConsultation);
api.post('/v1/medical/consultations/:id/finish', requireTenant, requireSharedPatientScope('ZemdaMed'), MedicalController.finishConsultation);
api.post('/v1/medical/finish-consultation', requireTenant, requireSharedPatientScope('ZemdaMed'), MedicalController.finishConsultation);

// ==========================================
// LABORATÓRIO ZEMDA (SUPERADMIN SANDBOX)
// ==========================================
api.post('/v1/sandbox/create-session', requireRole('superadmin'), SandboxController.createSession);
api.post('/v1/sandbox/reset', SandboxController.resetSandbox);
// ==========================================
// ZEMDAESTETIC — ESTÉTICA FACIAL, CORPORAL & CAPILAR
// ==========================================
api.get('/v1/estetic/config', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getConfig);
api.get('/v1/estetic/catalog', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getCatalog);
api.post('/v1/estetic/catalog', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.createCatalogItem);
api.get('/v1/estetic/patient/:patientId/overview', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getPatientOverview);
api.get('/v1/estetic/assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getAssessments);
api.post('/v1/estetic/assessments', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.createAssessment);
api.delete('/v1/estetic/assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.deleteAssessment);
api.get('/v1/estetic/plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getPlans);
api.post('/v1/estetic/plans', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.createPlan);
api.put('/v1/estetic/plans/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.updatePlan);
api.delete('/v1/estetic/plans/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.deletePlan);
api.get('/v1/estetic/procedures', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getProcedures);
api.post('/v1/estetic/procedures', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.createProcedure);
api.delete('/v1/estetic/procedures/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.deleteProcedure);
api.get('/v1/estetic/evolutions', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getEvolutions);
api.post('/v1/estetic/evolutions', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.createEvolution);
api.get('/v1/estetic/returns', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getReturns);
api.post('/v1/estetic/returns', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.createReturn);
api.get('/v1/estetic/photos', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getPhotos);
api.post('/v1/estetic/photos', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.createPhoto);
api.delete('/v1/estetic/photos/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.deletePhoto);
api.get('/v1/estetic/before-after', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getBeforeAfter);
api.get('/v1/estetic/history', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.getHistory);

api.patch('/v1/estetic/plans/:id/item-status', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.updatePlanItem);
api.put('/v1/estetic/assessments/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.updateAssessment);
api.put('/v1/estetic/procedures/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.updateProcedure);
api.put('/v1/estetic/evolutions/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.updateEvolution);
api.delete('/v1/estetic/evolutions/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.deleteEvolution);
api.patch('/v1/estetic/returns/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.updateReturn);
api.put('/v1/estetic/returns/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.updateReturn);
api.delete('/v1/estetic/returns/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.deleteReturn);
api.put('/v1/estetic/photos/:id', requireTenant, requireRole('clinic_admin', 'professional'), requireSharedPatientScope('ZemdaEstetic'), EsteticController.updatePhoto);

export default api;
