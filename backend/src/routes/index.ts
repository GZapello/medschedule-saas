import { Router } from 'express';
import path from 'path';
import fs from 'fs';
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

import { authMiddleware } from '../middlewares/auth.middleware';
import { tenantMiddleware, requireTenant } from '../middlewares/tenant.middleware';
import { requireRole } from '../middlewares/rbac.middleware';

const api = Router();

// ==========================================
// 1. ROTAS PÚBLICAS
// ==========================================

// Autenticação e Registro Público
api.post('/v1/auth/login', AuthController.login);
api.post('/v1/auth/register', AuthController.register);
api.post('/v1/public/tenants/register', TenantController.registerPublic);
api.get('/v1/public/tenants', TenantController.listPublic);

// Taxonomia pública (para formulários e página pública)
api.get('/v1/taxonomy/categories', TaxonomyController.listCategories);
api.get('/v1/taxonomy/professions', TaxonomyController.listProfessions);
api.get('/v1/taxonomy/specialties', TaxonomyController.listSpecialties);

// Página Pública da Clínica & Agendamento Online (/c/:slug)
api.get('/v1/public/tenants/:slug', TenantController.getPublicProfile);
api.get('/v1/public/slots/available', SlotController.getAvailableSlots);
api.post('/v1/public/appointments', AppointmentController.create);

// Download do Instalador Desktop para Windows (.exe)
api.get('/v1/public/download-windows', (req, res) => {
  const possiblePaths = [
    path.resolve(__dirname, '../../../desktop/dist'),
    path.resolve(__dirname, '../../desktop/dist'),
    path.resolve(process.cwd(), 'desktop/dist'),
    path.resolve(process.cwd(), '../desktop/dist'),
    path.resolve(process.cwd(), 'public/downloads'),
    path.resolve(__dirname, '../public/downloads'),
    path.resolve(__dirname, '../../public/downloads')
  ];

  let foundFile: string | null = null;
  for (const dir of possiblePaths) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      // Procura primeiro pelo instalador Setup
      const setupExe = files.find(f => f.toLowerCase().endsWith('.exe') && f.toLowerCase().includes('setup'));
      if (setupExe) {
        foundFile = path.join(dir, setupExe);
        break;
      }
      // Ou qualquer outro .exe
      const anyExe = files.find(f => f.toLowerCase().endsWith('.exe'));
      if (anyExe) {
        foundFile = path.join(dir, anyExe);
        break;
      }
    }
  }

  if (foundFile && fs.existsSync(foundFile)) {
    const filename = path.basename(foundFile);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
    return res.sendFile(foundFile);
  }

  res.status(404).json({
    error: 'Instalador Windows (.exe) não encontrado no servidor no momento.',
    message: 'O aplicativo desktop para Windows está pronto para ser compilado.',
    hint: 'Execute o comando de geração do instalador no diretório desktop.'
  });
});

// Download do Aplicativo Android (.apk)
api.get('/v1/public/download-android', (req, res) => {
  const possiblePaths = [
    path.resolve(__dirname, '../../../android/app/build/outputs/apk/debug'),
    path.resolve(__dirname, '../../../android/app/build/outputs/apk/release'),
    path.resolve(__dirname, '../../android/app/build/outputs/apk/debug'),
    path.resolve(process.cwd(), 'android/app/build/outputs/apk/debug'),
    path.resolve(process.cwd(), 'android/MedSchedule.apk'),
    path.resolve(process.cwd(), '../android/MedSchedule.apk'),
    path.resolve(process.cwd(), 'public/downloads'),
    path.resolve(__dirname, '../public/downloads'),
    path.resolve(__dirname, '../../public/downloads')
  ];

  let foundFile: string | null = null;
  for (const dirOrFile of possiblePaths) {
    if (fs.existsSync(dirOrFile)) {
      const stat = fs.statSync(dirOrFile);
      if (stat.isFile() && dirOrFile.toLowerCase().endsWith('.apk')) {
        foundFile = dirOrFile;
        break;
      } else if (stat.isDirectory()) {
        const files = fs.readdirSync(dirOrFile);
        const apkFile = files.find(f => f.toLowerCase().endsWith('.apk'));
        if (apkFile) {
          foundFile = path.join(dirOrFile, apkFile);
          break;
        }
      }
    }
  }

  if (foundFile && fs.existsSync(foundFile)) {
    const filename = 'MedSchedule.apk';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    return res.sendFile(foundFile);
  }

  res.status(404).json({
    error: 'Aplicativo Android (.apk) ainda não foi gerado no servidor.',
    message: 'O projeto Android está pronto para compilação com Gradle.',
    hint: 'Execute a compilação do APK no diretório android.'
  });
});

// ==========================================
// 2. ROTAS AUTENTICADAS (COM JWT + TENANT)
// ==========================================
api.use(authMiddleware);
api.use(tenantMiddleware);

// Perfil autenticado (Acesso pessoal para qualquer usuário do sistema)
api.get('/v1/auth/me', AuthController.me);
api.put('/v1/auth/profile/password', AuthController.updateProfilePassword);
api.put('/v1/auth/profile/email', AuthController.updateProfileEmail);

// Tenants & Configurações da Clínica
api.get('/v1/tenants/current', requireTenant, TenantController.getCurrent);
api.put('/v1/tenants/current', requireTenant, requireRole('clinic_admin'), TenantController.updateCurrent);
api.get('/v1/tenants', requireRole('superadmin'), TenantController.listAll);

// Gestão Global do SaaS (Exclusivo SuperAdmin / ADM do SaaS)
api.get('/v1/admin/metrics', requireRole('superadmin'), TenantController.adminMetrics);
api.put('/v1/admin/tenants/:id/approve', requireRole('superadmin'), TenantController.adminApprove);
api.put('/v1/admin/tenants/:id/reject', requireRole('superadmin'), TenantController.adminReject);
api.put('/v1/admin/tenants/:id/block', requireRole('superadmin'), TenantController.adminBlock);
api.put('/v1/admin/tenants/:id/unblock', requireRole('superadmin'), TenantController.adminUnblock);

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
api.get('/v1/staff', requireTenant, StaffController.listStaff);
api.post('/v1/staff/invite', requireTenant, requireRole('clinic_admin'), StaffController.invite);
api.put('/v1/staff/:id/approve', requireTenant, requireRole('clinic_admin'), StaffController.approve);
api.put('/v1/staff/:id/reject', requireTenant, requireRole('clinic_admin'), StaffController.reject);
api.put('/v1/staff/:id/permissions', requireTenant, requireRole('clinic_admin'), StaffController.updatePermissions);
api.put('/v1/staff/:id/toggle-status', requireTenant, requireRole('clinic_admin'), StaffController.toggleStatus);
api.put('/v1/staff/:id/role-profession', requireTenant, requireRole('clinic_admin'), StaffController.updateRoleProfession);

// Taxonomia Global: Profissões e Tipos de Serviço (Exclusivo SuperAdmin SaaS)
api.post('/v1/taxonomy/categories', requireRole('superadmin'), TaxonomyController.createCategory);
api.put('/v1/taxonomy/categories/:id', requireRole('superadmin'), TaxonomyController.updateCategory);
api.put('/v1/taxonomy/categories/:id/toggle-status', requireRole('superadmin'), TaxonomyController.toggleCategoryStatus);
api.post('/v1/taxonomy/professions', requireRole('superadmin'), TaxonomyController.createProfession);
api.put('/v1/taxonomy/professions/:id', requireRole('superadmin'), TaxonomyController.updateProfession);
api.put('/v1/taxonomy/professions/:id/toggle-status', requireRole('superadmin'), TaxonomyController.toggleProfessionStatus);
api.post('/v1/taxonomy/specialties', requireRole('superadmin'), TaxonomyController.createSpecialty);

// Profissionais
api.get('/v1/professionals', requireTenant, ProfessionalController.list);
api.get('/v1/professionals/:id', requireTenant, ProfessionalController.getById);
api.post('/v1/professionals', requireTenant, requireRole('clinic_admin'), ProfessionalController.create);
api.put('/v1/professionals/:id', requireTenant, requireRole('clinic_admin', 'professional'), ProfessionalController.update);
api.put('/v1/professionals/:id/schedules', requireTenant, requireRole('clinic_admin', 'professional'), ProfessionalController.updateSchedules);
api.post('/v1/professionals/blocks', requireTenant, requireRole('clinic_admin', 'professional'), ProfessionalController.createBlockedTime);
api.delete('/v1/professionals/blocks/:blockId', requireTenant, requireRole('clinic_admin', 'professional'), ProfessionalController.deleteBlockedTime);

// Serviços e Salas
api.get('/v1/services', requireTenant, ServiceController.list);
api.post('/v1/services', requireTenant, requireRole('clinic_admin'), ServiceController.create);
api.put('/v1/services/:id', requireTenant, requireRole('clinic_admin'), ServiceController.update);
api.get('/v1/rooms', requireTenant, ServiceController.listRooms);
api.post('/v1/rooms', requireTenant, requireRole('clinic_admin'), ServiceController.createRoom);

// Pacientes / Clientes
api.get('/v1/patients', requireTenant, PatientController.list);
api.get('/v1/patients/:id', requireTenant, PatientController.getById);
api.post('/v1/patients', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), PatientController.create);
api.put('/v1/patients/:id', requireTenant, requireRole('clinic_admin', 'receptionist', 'professional'), PatientController.update);

// Agenda & Agendamentos
api.get('/v1/appointments', requireTenant, AppointmentController.list);
api.get('/v1/appointments/:id', requireTenant, AppointmentController.getById);
api.post('/v1/appointments', requireTenant, AppointmentController.create);
api.put('/v1/appointments/:id/status', requireTenant, AppointmentController.updateStatus);
api.put('/v1/appointments/:id/reschedule', requireTenant, AppointmentController.reschedule);
api.get('/v1/slots/available', requireTenant, SlotController.getAvailableSlots);

// Prontuário & Evolução Clínica (Restrito estritamente a Profissionais e Admins Clínicos - LGPD)
api.get('/v1/clinical-records/patient/:patientId', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.listByPatient);
api.get('/v1/clinical-records/:id', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.getById);
api.get('/v1/clinical-records/:id/print', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.exportPdfHtml);
api.post('/v1/clinical-records', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.create);
api.put('/v1/clinical-records/:id', requireTenant, requireRole('clinic_admin', 'professional'), ClinicalController.update);

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

api.get('/v1/patients/:id/consents', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.listConsents);
api.post('/v1/patients/:id/consents', requireTenant, requireRole('clinic_admin', 'professional'), PatientClinicalController.createConsent);

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

// Gestão de Convênios
api.get('/v1/insurances/clinic', requireTenant, InsuranceController.listClinicInsurances);
api.post('/v1/insurances/clinic', requireTenant, requireRole('clinic_admin'), InsuranceController.createClinicInsurance);
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
api.post('/v1/ai/chat', requireTenant, AIController.chat);
api.post('/v1/ai/improve-text', requireTenant, AIController.improveText);
api.post('/v1/ai/summarize-consultation', requireTenant, AIController.summarizeConsultation);
api.get('/v1/ai/conversations', requireTenant, AIController.listConversations);
api.post('/v1/ai/conversations', requireTenant, AIController.saveConversation);
api.delete('/v1/ai/conversations/:id', requireTenant, AIController.deleteConversation);
api.post('/v1/ai/feedback', requireTenant, AIController.recordFeedback);

// Importação Inteligente de Dados (Word .docx, Planilhas .xlsx/.csv/.txt, Heurística e Lotes)
api.post('/v1/import/parse-file', requireTenant, requireRole('clinic_admin', 'professional', 'receptionist'), ImportController.parseFile);
api.post('/v1/import/execute', requireTenant, requireRole('clinic_admin'), ImportController.executeImport);
api.get('/v1/import/batches', requireTenant, requireRole('clinic_admin'), ImportController.listBatches);
api.post('/v1/import/batches/:id/rollback', requireTenant, requireRole('clinic_admin'), ImportController.rollbackBatch);
api.post('/v1/import/export-custom-docx', requireTenant, ImportController.exportCustomDocx);

// Trilha de Auditoria (LGPD Compliance) — Exclusivo SuperAdmin do SaaS (Item 20)
api.get('/v1/audit', requireRole('superadmin'), AuditController.list);

export default api;
