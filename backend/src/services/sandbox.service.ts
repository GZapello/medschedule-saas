import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db, CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/database';
import { ensureConsentTriggers } from '../config/consents.migration';
import { generateToken } from '../utils/jwt';
import { resolveCanonicalProfession } from '../utils/profession-module';
import { CapabilityService } from './capability.service';
import { MedicalTreeService } from './medical-tree.service';
import { r2StorageService } from './r2-storage.service';

export type SandboxAccountMode = 'manager' | 'professional';
export type SandboxEstablishmentProfile = 'clinic' | 'studio' | 'mixed';
export type SandboxPlanCode = 'ALL' | 'SOLO' | 'TEAM' | 'CLINIC';
export type SandboxEnvironmentStatus = 'ready' | 'in_use' | 'resetting' | 'error';

export class SandboxError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, message: string, code: string = 'SANDBOX_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'SandboxError';
  }
}

const VALID_MODES = new Set<SandboxAccountMode>(['manager', 'professional']);
const VALID_PROFILES = new Set<SandboxEstablishmentProfile>(['clinic', 'studio', 'mixed']);
const VALID_PLANS = new Set<SandboxPlanCode>(['ALL', 'SOLO', 'TEAM', 'CLINIC']);

const PRESERVED_GLOBAL_TABLES = new Set<string>([
  'categories',
  'professions',
  'specialties',
  'practice_areas',
  'capabilities',
  'profession_capabilities',
  'practice_area_capabilities',
  'medical_specialties',
  'medical_practice_areas',
  'medical_specialty_capabilities',
  'medical_practice_area_capabilities',
  'plans',
  'plan_capabilities',
  'billing_plans',
  'nutrition_foods',
  'schema_migrations',
  'deleted_global_professions',
  'whatsapp_cloud_system_integrations',
  'superadmin_visit_establishments',
  'superadmin_visits',
  'superadmin_visit_tasks',
  'free_trials',
  'free_trial_links',
  // Biblioteca oficial protegida e prescrições tratadas apenas por cascata/inativação
  'personal_exercises',
  'personal_workout_exercises',
  // Auditoria e controle do laboratório preservados
  'audit_logs',
  'global_clinic_audit',
  'sandbox_environments',
  'sandbox_test_sessions',
  'clinic_deletion_jobs',
  'technical_events',
  // Entidades principais tratadas de forma seletiva para preservar Gestor e Profissional
  'tenants',
  'users',
  'clinic_users',
  'professionals'
]);

const DEFAULT_MANAGER_PERMISSIONS = [
  'view_dashboard',
  'view_schedule',
  'create_appointment',
  'edit_appointment',
  'cancel_appointment',
  'view_patients',
  'create_patient',
  'edit_patient',
  'manage_services',
  'manage_staff',
  'manage_schedules',
  'manage_packages',
  'manage_classes',
  'manage_inventory',
  'view_financial',
  'manage_financial',
  'view_reports',
  'manage_settings',
  'access_zemda_med',
  'access_zemda_fisio',
  'access_zemda_odonto',
  'access_zemda_nutri',
  'access_zemda_to',
  'access_zemda_fono',
  'access_zemda_psico',
  'access_zemda_pp',
  'access_zemda_personal',
  'access_zemda_estetic',
  'access_zemda_body',
  'access_zemda_360'
];

const envProvisionLocks = new Map<string, Promise<any>>();

function quoteIdentifier(identifier: string): string {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function stableShortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 10);
}

function buildInternalSandboxPasswordHash(): string {
  // Hash aleatório não reutilizável; contas sandbox jamais autenticam por senha pública
  return bcrypt.hashSync(crypto.randomBytes(48).toString('hex'), 6);
}

export class SandboxService {
  /**
   * Identifica se um tenant pertence ao Laboratório Sandbox pelo registro persistente no banco.
   */
  public static isSandboxTenant(tenantId?: string | null): boolean {
    const clean = String(tenantId || '').trim();
    if (!clean) return false;
    try {
      const tenant = db
        .prepare('SELECT is_sandbox FROM tenants WHERE id = ?')
        .get(clean) as { is_sandbox?: number } | undefined;
      if (tenant && Number(tenant.is_sandbox) === 1) return true;

      const env = db
        .prepare('SELECT id FROM sandbox_environments WHERE sandbox_tenant_id = ?')
        .get(clean);
      if (env) return true;

      const sess = db
        .prepare('SELECT id FROM sandbox_test_sessions WHERE sandbox_tenant_id = ? LIMIT 1')
        .get(clean);
      if (sess) return true;
    } catch {
      // Fallback seguro caso consultado durante inicialização inicial
    }
    return clean.startsWith('sbx-tenant-');
  }

  /**
   * Identifica se um usuário é conta de teste do Laboratório Sandbox.
   */
  public static isSandboxUser(userId?: string | null): boolean {
    const clean = String(userId || '').trim();
    if (!clean) return false;
    try {
      const user = db
        .prepare('SELECT is_sandbox, tenant_id, email FROM users WHERE id = ?')
        .get(clean) as { is_sandbox?: number; tenant_id?: string | null; email?: string | null } | undefined;
      if (user) {
        if (Number(user.is_sandbox) === 1) return true;
        if (user.email && user.email.toLowerCase().endsWith('@zemda.test')) return true;
        if (user.tenant_id && this.isSandboxTenant(user.tenant_id)) return true;
      }
      const env = db
        .prepare('SELECT id FROM sandbox_environments WHERE manager_user_id = ? OR professional_user_id = ?')
        .get(clean, clean);
      if (env) return true;
    } catch {}
    return clean.startsWith('sbx-user-') || clean.startsWith('sbx-mgr-') || clean.startsWith('sbx-profuser-');
  }

  /**
   * Verifica de forma centralizada se o contexto atual (tenant, usuário, email ou sessão) é sandbox.
   */
  public static isSandboxContext(params: {
    tenantId?: string | null;
    userId?: string | null;
    email?: string | null;
    isSandboxSession?: boolean;
  }): boolean {
    if (params.isSandboxSession) return true;
    if (params.tenantId && this.isSandboxTenant(params.tenantId)) return true;
    if (params.userId && this.isSandboxUser(params.userId)) return true;
    if (params.email) {
      const lower = params.email.trim().toLowerCase();
      if (lower.endsWith('@zemda.test') || lower.endsWith('@test.invalid')) return true;
    }
    return false;
  }

  /**
   * Valida uma sessão sandbox emitida via JWT diretamente contra o banco de dados.
   */
  public static validateSandboxSession(
    sessionId: string,
    userId: string,
    tenantId?: string | null
  ): { session: any; environment: any; tenant: any; user: any } | null {
    if (!sessionId || !userId) return null;

    const session = db
      .prepare(`
        SELECT *
        FROM sandbox_test_sessions
        WHERE id = ?
      `)
      .get(sessionId) as any;

    if (!session) return null;
    if (String(session.status || 'active') !== 'active' || session.revoked_at) return null;

    const expiresMs = new Date(session.expires_at).getTime();
    if (!session.expires_at || Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
      try {
        db.prepare("UPDATE sandbox_test_sessions SET status = 'expired' WHERE id = ? AND status = 'active'").run(sessionId);
      } catch {}
      return null;
    }

    if (session.sandbox_user_id && session.sandbox_user_id !== userId) return null;
    if (tenantId && session.sandbox_tenant_id !== tenantId) return null;

    const tenant = db
      .prepare('SELECT * FROM tenants WHERE id = ? AND COALESCE(is_sandbox, 0) = 1')
      .get(session.sandbox_tenant_id) as any;
    if (!tenant) return null;

    const user = db
      .prepare('SELECT * FROM users WHERE id = ? AND COALESCE(is_sandbox, 0) = 1 AND status = ?')
      .get(userId, 'active') as any;
    if (!user || user.role === 'superadmin') return null;

    const environment = db
      .prepare('SELECT * FROM sandbox_environments WHERE sandbox_tenant_id = ?')
      .get(session.sandbox_tenant_id) as any;
    if (!environment) return null;

    try {
      db.prepare("UPDATE sandbox_test_sessions SET last_used_at = datetime('now') WHERE id = ?").run(sessionId);
    } catch {}

    return { session, environment, tenant, user };
  }

  /**
   * Retorna o status atual do Ambiente de Teste Reutilizável do SuperAdmin.
   */
  public static getEnvironmentStatus(adminUserId: string) {
    const admin = db.prepare('SELECT id, role FROM users WHERE id = ?').get(adminUserId) as any;
    if (!admin || admin.role !== 'superadmin') {
      throw new SandboxError(403, 'Apenas SuperAdmin pode consultar o status do Laboratório Sandbox.');
    }

    const env = db
      .prepare('SELECT * FROM sandbox_environments WHERE admin_user_id = ?')
      .get(adminUserId) as any;

    let activeSession: any = null;
    let stats = {
      patients: 0,
      services: 0,
      appointments: 0,
      records: 0,
      inventoryItems: 0,
      payments: 0,
      classSchedules: 0,
      packages: 0
    };
    let managerAccount: any = null;
    let professionalAccount: any = null;

    if (env) {
      activeSession = db
        .prepare(`
          SELECT id, account_mode, establishment_profile, profession_id, plan_code, status, created_at, expires_at, last_used_at
          FROM sandbox_test_sessions
          WHERE environment_id = ? AND status = 'active' AND revoked_at IS NULL AND expires_at > datetime('now')
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(env.id) as any;

      managerAccount = db
        .prepare('SELECT id, name, email, role, status FROM users WHERE id = ?')
        .get(env.manager_user_id) as any;
      professionalAccount = db
        .prepare('SELECT id, name, email, role, profession_id, profession_name, status FROM users WHERE id = ?')
        .get(env.professional_user_id) as any;

      const countTable = (sql: string) => {
        try {
          return Number((db.prepare(sql).get(env.sandbox_tenant_id) as any)?.total || 0);
        } catch {
          return 0;
        }
      };

      stats = {
        patients: countTable('SELECT COUNT(*) as total FROM patients WHERE tenant_id = ?'),
        services: countTable('SELECT COUNT(*) as total FROM services WHERE tenant_id = ?'),
        appointments: countTable('SELECT COUNT(*) as total FROM appointments WHERE tenant_id = ?'),
        records: countTable('SELECT COUNT(*) as total FROM records WHERE tenant_id = ?'),
        inventoryItems: countTable('SELECT COUNT(*) as total FROM inventory_items WHERE tenant_id = ?'),
        payments: countTable('SELECT COUNT(*) as total FROM payments WHERE tenant_id = ?'),
        classSchedules: countTable('SELECT COUNT(*) as total FROM class_schedules WHERE tenant_id = ?'),
        packages: countTable('SELECT COUNT(*) as total FROM service_packages WHERE tenant_id = ?')
      };
    }

    const legacyReport = this.getLegacySandboxReport();
    const tenantRow = env
      ? (db.prepare('SELECT id, name, slug FROM tenants WHERE id = ?').get(env.sandbox_tenant_id) as any)
      : null;
    const resetCount = env
      ? Number(
          (
            db
              .prepare("SELECT COUNT(*) as total FROM audit_logs WHERE tenant_id = ? AND action = 'SANDBOX_ENVIRONMENT_RESET'")
              .get(env.sandbox_tenant_id) as any
          )?.total || 0
        )
      : 0;

    return {
      provisioned: Boolean(env),
      status: (env ? env.status : 'unprovisioned') as SandboxEnvironmentStatus | 'unprovisioned',
      lastError: env?.last_error || null,
      environment: env
        ? {
            id: env.id,
            name: tenantRow?.name || 'Clínica Modelo (Sandbox)',
            slug: tenantRow?.slug || 'sandbox-lab',
            sandboxTenantId: env.sandbox_tenant_id,
            status: env.status as SandboxEnvironmentStatus,
            establishmentProfile: env.establishment_profile as SandboxEstablishmentProfile,
            planCode: env.plan_code as SandboxPlanCode,
            managerUserId: env.manager_user_id,
            managerEmail: managerAccount?.email || null,
            professionalUserId: env.professional_user_id,
            professionalEmail: professionalAccount?.email || null,
            lastProfessionId: env.last_profession_id,
            lastResetAt: env.last_reset_at,
            lastError: env.last_error,
            resetCount,
            createdAt: env.created_at,
            updatedAt: env.updated_at
          }
        : null,
      accounts: {
        manager: managerAccount,
        professional: professionalAccount
      },
      activeSession,
      stats,
      counts: stats,
      legacySandboxesCount: legacyReport.totalLegacyTenants
    };
  }

  /**
   * Relatório apenas de leitura dos sandboxes históricos anteriores à reestruturação (NUNCA exclui automaticamente).
   */
  public static getLegacySandboxReport() {
    const rows = db
      .prepare(`
        SELECT
          t.id,
          t.name,
          t.slug,
          t.email,
          t.created_at,
          (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS users_count,
          (SELECT COUNT(*) FROM patients p WHERE p.tenant_id = t.id) AS patients_count,
          (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = t.id) AS appointments_count,
          (SELECT COUNT(*) FROM records r WHERE r.tenant_id = t.id) AS records_count
        FROM tenants t
        WHERE (COALESCE(t.is_sandbox, 0) = 1 OR t.id LIKE 'sbx-tenant-%')
          AND t.id NOT IN (SELECT sandbox_tenant_id FROM sandbox_environments)
        ORDER BY t.created_at DESC
      `)
      .all() as any[];

    return {
      totalLegacyTenants: rows.length,
      requiresApprovalForCleanup: true,
      note: 'Registros históricos preservados intactos para auditoria. A limpeza destrutiva exige aprovação explícita separada.',
      legacyTenants: rows
    };
  }

  /**
   * Provisiona (uma única vez) ou reutiliza o Ambiente de Teste persistente do SuperAdmin.
   * Seguro contra chamadas concorrentes.
   */
  public static async ensureSandboxEnvironment(
    adminUserId: string,
    options?: {
      establishmentProfile?: SandboxEstablishmentProfile;
      planCode?: SandboxPlanCode;
    }
  ): Promise<any> {
    const pending = envProvisionLocks.get(adminUserId);
    if (pending) {
      await pending;
    }

    const work = Promise.resolve().then(() => {
      const admin = db
        .prepare('SELECT id, role, status, COALESCE(is_sandbox, 0) as is_sandbox FROM users WHERE id = ?')
        .get(adminUserId) as any;

      if (!admin || admin.role !== 'superadmin' || admin.status !== 'active' || admin.is_sandbox === 1) {
        throw new SandboxError(403, 'Apenas SuperAdmin ativo fora do sandbox pode gerenciar o Ambiente de Teste.');
      }

      const profile: SandboxEstablishmentProfile = VALID_PROFILES.has(options?.establishmentProfile as any)
        ? (options!.establishmentProfile as SandboxEstablishmentProfile)
        : 'clinic';
      const planCode: SandboxPlanCode = VALID_PLANS.has(options?.planCode as any)
        ? (options!.planCode as SandboxPlanCode)
        : 'ALL';

      const existingEnv = db
        .prepare('SELECT * FROM sandbox_environments WHERE admin_user_id = ?')
        .get(adminUserId) as any;

      if (existingEnv) {
        this.repairCoreEnvironmentIdentities(existingEnv);
        return db.prepare('SELECT * FROM sandbox_environments WHERE id = ?').get(existingEnv.id);
      }

      const shortHash = stableShortHash(adminUserId);
      const envId = `sbx-env-${shortHash}`;
      const sandboxTenantId = `sbx-tenant-${shortHash}`;
      const managerUserId = `sbx-mgr-${shortHash}`;
      const professionalUserId = `sbx-profuser-${shortHash}`;
      const professionalId = `sbx-prof-${shortHash}`;

      const managerPasswordHash = buildInternalSandboxPasswordHash();
      const profPasswordHash = buildInternalSandboxPasswordHash();
      const clientTerm = profile === 'studio' ? 'Aluno' : 'Paciente';

      db.transaction(() => {
        // Re-check inside transaction against concurrent callers
        const raceCheck = db
          .prepare('SELECT * FROM sandbox_environments WHERE admin_user_id = ?')
          .get(adminUserId) as any;
        if (raceCheck) return;

        db.prepare(`
          INSERT OR IGNORE INTO tenants (
            id, slug, name, trade_name, email, phone, status, onboarding_status,
            onboarding_completed, onboarding_step, manager_confirmed, terms_accepted,
            privacy_accepted, trial_used, billing_required, client_term_label,
            establishment_profile, public_booking_enabled, is_sandbox, created_at, updated_at
          ) VALUES (
            ?, ?, 'Ambiente de Teste Zemda', 'Zemda Laboratório Sandbox', ?, '(11) 99999-0000',
            'active', 'active', 1, 99, 1, 1, 1, 1, 0, ?, ?, 0, 1, datetime('now'), datetime('now')
          )
        `).run(
          sandboxTenantId,
          `sandbox-env-${shortHash}`,
          `clinica-teste-${shortHash}@zemda.test`,
          clientTerm,
          profile
        );

        // Conta Reutilizável: Gestor de Teste (clinic_admin, NUNCA superadmin)
        db.prepare(`
          INSERT OR IGNORE INTO users (
            id, tenant_id, name, email, password_hash, role, status, onboarding_status,
            email_verified, phone_verified, auth_provider, terms_version_accepted,
            privacy_version_accepted, terms_accepted_at, privacy_accepted_at,
            is_sandbox, created_at, updated_at
          ) VALUES (
            ?, ?, 'Gestor de Teste Sandbox', ?, ?, 'clinic_admin', 'active', 'active',
            1, 1, 'sandbox', ?, ?, datetime('now'), datetime('now'),
            1, datetime('now'), datetime('now')
          )
        `).run(
          managerUserId,
          sandboxTenantId,
          `gestor-${shortHash}@zemda.test`,
          managerPasswordHash,
          CURRENT_TERMS_VERSION,
          CURRENT_PRIVACY_VERSION
        );

        const defaultProf = resolveCanonicalProfession({ id: 'prof-fisioterapeuta' });

        db.prepare(`
          INSERT OR IGNORE INTO clinic_users (
            id, tenant_id, user_id, role, status, is_manager, permissions_json,
            zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled,
            zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled,
            zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled,
            zemda_body_enabled, zemda_estetic_enabled, created_at
          ) VALUES (
            ?, ?, ?, 'clinic_admin', 'active', 1, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, datetime('now')
          )
        `).run(
          `cu-mgr-${shortHash}`,
          sandboxTenantId,
          managerUserId,
          JSON.stringify(DEFAULT_MANAGER_PERMISSIONS),
          defaultProf.flags.zemda_fisio_enabled,
          defaultProf.flags.zemda_odonto_enabled,
          defaultProf.flags.zemda_nutri_enabled,
          defaultProf.flags.zemda_to_enabled,
          defaultProf.flags.zemda_fono_enabled,
          defaultProf.flags.zemda_pp_enabled,
          defaultProf.flags.zemda_psico_enabled,
          defaultProf.flags.zemda_personal_enabled,
          defaultProf.flags.zemda_med_enabled
        );

        // Conta Reutilizável: Profissional de Teste
        db.prepare(`
          INSERT OR IGNORE INTO users (
            id, tenant_id, name, email, password_hash, role, status, onboarding_status,
            email_verified, phone_verified, auth_provider, profession_id, profession_name,
            terms_version_accepted, privacy_version_accepted, terms_accepted_at, privacy_accepted_at,
            zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled,
            zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled,
            zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled,
            is_sandbox, created_at, updated_at
          ) VALUES (
            ?, ?, 'Dr(a). Profissional Teste', ?, ?, 'professional', 'active', 'active',
            1, 1, 'sandbox', ?, ?, ?, ?, datetime('now'), datetime('now'),
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            1, datetime('now'), datetime('now')
          )
        `).run(
          professionalUserId,
          sandboxTenantId,
          `prof-${shortHash}@zemda.test`,
          profPasswordHash,
          defaultProf.canonicalId,
          defaultProf.canonicalName,
          CURRENT_TERMS_VERSION,
          CURRENT_PRIVACY_VERSION,
          defaultProf.flags.zemda_fisio_enabled,
          defaultProf.flags.zemda_odonto_enabled,
          defaultProf.flags.zemda_nutri_enabled,
          defaultProf.flags.zemda_to_enabled,
          defaultProf.flags.zemda_fono_enabled,
          defaultProf.flags.zemda_pp_enabled,
          defaultProf.flags.zemda_psico_enabled,
          defaultProf.flags.zemda_personal_enabled,
          defaultProf.flags.zemda_med_enabled
        );

        db.prepare(`
          INSERT OR IGNORE INTO clinic_users (
            id, tenant_id, user_id, role, status, is_manager,
            zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled,
            zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled,
            zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled,
            zemda_body_enabled, created_at
          ) VALUES (
            ?, ?, ?, 'professional', 'active', 0,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now')
          )
        `).run(
          `cu-prof-${shortHash}`,
          sandboxTenantId,
          professionalUserId,
          defaultProf.flags.zemda_fisio_enabled,
          defaultProf.flags.zemda_odonto_enabled,
          defaultProf.flags.zemda_nutri_enabled,
          defaultProf.flags.zemda_to_enabled,
          defaultProf.flags.zemda_fono_enabled,
          defaultProf.flags.zemda_pp_enabled,
          defaultProf.flags.zemda_psico_enabled,
          defaultProf.flags.zemda_personal_enabled,
          defaultProf.flags.zemda_med_enabled
        );

        db.prepare(`
          INSERT OR IGNORE INTO professionals (
            id, tenant_id, user_id, name, profession_id, registration_type,
            registration_number, practice_areas,
            zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled,
            zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled,
            zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled,
            active, is_sandbox, created_at, updated_at
          ) VALUES (
            ?, ?, ?, 'Dr(a). Profissional Teste', ?, ?, '123456-TESTE', '',
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            1, 1, datetime('now'), datetime('now')
          )
        `).run(
          professionalId,
          sandboxTenantId,
          professionalUserId,
          defaultProf.canonicalId,
          defaultProf.boardLabel || 'REG',
          defaultProf.flags.zemda_fisio_enabled,
          defaultProf.flags.zemda_odonto_enabled,
          defaultProf.flags.zemda_nutri_enabled,
          defaultProf.flags.zemda_to_enabled,
          defaultProf.flags.zemda_fono_enabled,
          defaultProf.flags.zemda_pp_enabled,
          defaultProf.flags.zemda_psico_enabled,
          defaultProf.flags.zemda_personal_enabled,
          defaultProf.flags.zemda_med_enabled
        );

        db.prepare(`
          INSERT INTO sandbox_environments (
            id, admin_user_id, sandbox_tenant_id, manager_user_id, professional_user_id,
            professional_id, status, establishment_profile, plan_code, last_profession_id,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, datetime('now'), datetime('now')
          )
        `).run(
          envId,
          adminUserId,
          sandboxTenantId,
          managerUserId,
          professionalUserId,
          professionalId,
          profile,
          planCode,
          defaultProf.canonicalId
        );

        this.seedSandboxData(sandboxTenantId, professionalId, profile);
      })();

      return db.prepare('SELECT * FROM sandbox_environments WHERE admin_user_id = ?').get(adminUserId);
    });

    envProvisionLocks.set(adminUserId, work);
    try {
      return await work;
    } finally {
      if (envProvisionLocks.get(adminUserId) === work) {
        envProvisionLocks.delete(adminUserId);
      }
    }
  }

  /**
   * Garante integridade das contas base caso alguma tabela auxiliar tenha sido afetada.
   */
  private static repairCoreEnvironmentIdentities(env: any): void {
    db.prepare(`
      UPDATE tenants
      SET status = 'active', billing_required = 0, onboarding_completed = 1, is_sandbox = 1
      WHERE id = ?
    `).run(env.sandbox_tenant_id);

    db.prepare(`
      UPDATE users
      SET status = 'active', role = 'clinic_admin', is_sandbox = 1
      WHERE id = ? AND role != 'superadmin'
    `).run(env.manager_user_id);

    db.prepare(`
      UPDATE users
      SET status = 'active', role = 'professional', is_sandbox = 1
      WHERE id = ? AND role != 'superadmin'
    `).run(env.professional_user_id);

    db.prepare(`
      UPDATE professionals
      SET active = 1, is_sandbox = 1
      WHERE id = ? AND tenant_id = ?
    `).run(env.professional_id, env.sandbox_tenant_id);
  }

  /**
   * Inicia ou reutiliza uma sessão de simulação (como Gestor de Teste ou Profissional de Teste).
   * NUNCA cria novos estabelecimentos ou novas contas comerciais a cada simulação.
   */
  public static async createTestSession(params: {
    adminUserId: string;
    mode?: SandboxAccountMode;
    establishmentProfile?: SandboxEstablishmentProfile;
    professionId?: string;
    practiceAreaIds?: string[];
    planCode?: string;
  }): Promise<{
    token: string;
    sessionId: string;
    environmentId: string;
    sandboxTenantId: string;
    sandboxUserId: string;
    mode: SandboxAccountMode;
    accountMode: SandboxAccountMode;
    establishmentProfile: SandboxEstablishmentProfile;
    user: any;
    tenant: any;
    capabilities: any;
  }> {
    const mode: SandboxAccountMode = VALID_MODES.has(params.mode as any)
      ? (params.mode as SandboxAccountMode)
      : 'professional';
    const requestedProfile = params.establishmentProfile;
    const planCode: SandboxPlanCode = VALID_PLANS.has(String(params.planCode || 'ALL').toUpperCase() as any)
      ? (String(params.planCode || 'ALL').toUpperCase() as SandboxPlanCode)
      : 'ALL';

    const env = await this.ensureSandboxEnvironment(params.adminUserId, {
      establishmentProfile: requestedProfile,
      planCode
    });

    if (env.status === 'resetting') {
      throw new SandboxError(409, 'O Ambiente de Teste está sendo restaurado neste momento. Aguarde alguns segundos.');
    }

    const effectiveProfile: SandboxEstablishmentProfile = VALID_PROFILES.has(requestedProfile as any)
      ? (requestedProfile as SandboxEstablishmentProfile)
      : (VALID_PROFILES.has(env.establishment_profile) ? env.establishment_profile : 'clinic');

    const rawProfessionId = params.professionId || env.last_profession_id || 'prof-fisioterapeuta';
    const resolution = resolveCanonicalProfession({ id: rawProfessionId });
    const canonicalProfId = resolution.canonicalId;
    const profRow = db.prepare('SELECT name, registration_board_label FROM professions WHERE id = ?').get(canonicalProfId) as any;
    const profName = resolution.canonicalName || profRow?.name || 'Profissional de Saúde';
    const regBoard = resolution.boardLabel || profRow?.registration_board_label || 'REG';
    const commercialModule = resolution.commercialModule || 'ZemdaGestao';
    const flags = resolution.flags;

    let finalAreaIds = Array.isArray(params.practiceAreaIds) && params.practiceAreaIds.length > 0
      ? params.practiceAreaIds.map(id => String(id).trim()).filter(Boolean)
      : [];
    if (finalAreaIds.length === 0 && (resolution.automaticPracticeAreaId || resolution.inferredAreaId)) {
      finalAreaIds = [resolution.automaticPracticeAreaId || resolution.inferredAreaId!];
    }

    let medSpecIds: string[] | undefined = undefined;
    let medPaIds: string[] | undefined = undefined;

    const sessionId = 'sbx-sess-' + uuidv4().slice(0, 10);
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    const targetUserId = mode === 'manager' ? env.manager_user_id : env.professional_user_id;

    let computedCaps: any;

    db.transaction(() => {
      // Atualiza configuração simulada do estabelecimento sandbox (somente sandbox)
      const clientTerm = effectiveProfile === 'studio' ? 'Aluno' : 'Paciente';
      db.prepare(`
        UPDATE tenants
        SET establishment_profile = ?, client_term_label = ?, updated_at = datetime('now')
        WHERE id = ? AND COALESCE(is_sandbox, 0) = 1
      `).run(effectiveProfile, clientTerm, env.sandbox_tenant_id);

      // Reutiliza o MESMO profissional sandbox em caso de simulação profissional (sem criar novo tenant ou usuário)
      if (mode === 'professional') {
        db.prepare(`
          UPDATE users SET
            name = ?,
            profession_id = ?,
            profession_name = ?,
            practice_areas = ?,
            zemda_fisio_enabled = ?,
            zemda_odonto_enabled = ?,
            zemda_nutri_enabled = ?,
            zemda_to_enabled = ?,
            zemda_fono_enabled = ?,
            zemda_pp_enabled = ?,
            zemda_psico_enabled = ?,
            zemda_personal_enabled = ?,
            zemda_med_enabled = ?,
            updated_at = datetime('now')
          WHERE id = ? AND COALESCE(is_sandbox, 0) = 1
        `).run(
          `Dr(a). Teste (${profName})`,
          canonicalProfId,
          profName,
          finalAreaIds.join(', '),
          flags.zemda_fisio_enabled,
          flags.zemda_odonto_enabled,
          flags.zemda_nutri_enabled,
          flags.zemda_to_enabled,
          flags.zemda_fono_enabled,
          flags.zemda_pp_enabled,
          flags.zemda_psico_enabled,
          flags.zemda_personal_enabled,
          flags.zemda_med_enabled,
          env.professional_user_id
        );

        db.prepare(`
          UPDATE clinic_users SET
            role = 'professional',
            status = 'active',
            is_manager = 0,
            zemda_fisio_enabled = ?,
            zemda_odonto_enabled = ?,
            zemda_nutri_enabled = ?,
            zemda_to_enabled = ?,
            zemda_fono_enabled = ?,
            zemda_pp_enabled = ?,
            zemda_psico_enabled = ?,
            zemda_personal_enabled = ?,
            zemda_med_enabled = ?,
            zemda_body_enabled = 1
          WHERE user_id = ? AND tenant_id = ?
        `).run(
          flags.zemda_fisio_enabled,
          flags.zemda_odonto_enabled,
          flags.zemda_nutri_enabled,
          flags.zemda_to_enabled,
          flags.zemda_fono_enabled,
          flags.zemda_pp_enabled,
          flags.zemda_psico_enabled,
          flags.zemda_personal_enabled,
          flags.zemda_med_enabled,
          env.professional_user_id,
          env.sandbox_tenant_id
        );

        db.prepare(`
          UPDATE professionals SET
            name = ?,
            profession_id = ?,
            registration_type = ?,
            practice_areas = ?,
            zemda_fisio_enabled = ?,
            zemda_odonto_enabled = ?,
            zemda_nutri_enabled = ?,
            zemda_to_enabled = ?,
            zemda_fono_enabled = ?,
            zemda_pp_enabled = ?,
            zemda_psico_enabled = ?,
            zemda_personal_enabled = ?,
            zemda_med_enabled = ?,
            active = 1,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          `Dr(a). Teste (${profName})`,
          canonicalProfId,
          regBoard,
          finalAreaIds.join(', '),
          flags.zemda_fisio_enabled,
          flags.zemda_odonto_enabled,
          flags.zemda_nutri_enabled,
          flags.zemda_to_enabled,
          flags.zemda_fono_enabled,
          flags.zemda_pp_enabled,
          flags.zemda_psico_enabled,
          flags.zemda_personal_enabled,
          flags.zemda_med_enabled,
          env.professional_id,
          env.sandbox_tenant_id
        );

        CapabilityService.setUserPracticeAreas(env.professional_user_id, env.sandbox_tenant_id, finalAreaIds);

        if (canonicalProfId === 'prof-medico' || commercialModule === 'ZemdaMed') {
          let specs: string[] = [];
          if (resolution.medicalSpecialtyId) specs.push(resolution.medicalSpecialtyId);
          for (const a of finalAreaIds.filter(id => id.startsWith('med-spec-'))) {
            if (!specs.includes(a)) specs.push(a);
          }
          if (specs.length === 0) specs = ['med-spec-clinica'];
          const pas = finalAreaIds.filter(id => id.startsWith('med-pa-'));
          MedicalTreeService.setUserMedicalHierarchy(env.professional_user_id, env.sandbox_tenant_id, specs, pas);
          medSpecIds = specs;
          medPaIds = pas;
        }
      } else {
        // Modo Gestor de Teste: garante clinic_admin (JAMAIS superadmin) e permissões administrativas/modulares compatíveis com o plano simulado
        db.prepare(`
          UPDATE users SET
            role = 'clinic_admin',
            profession_id = ?,
            profession_name = ?,
            zemda_fisio_enabled = ?,
            zemda_odonto_enabled = ?,
            zemda_nutri_enabled = ?,
            zemda_to_enabled = ?,
            zemda_fono_enabled = ?,
            zemda_pp_enabled = ?,
            zemda_psico_enabled = ?,
            zemda_personal_enabled = ?,
            zemda_med_enabled = ?,
            updated_at = datetime('now')
          WHERE id = ? AND COALESCE(is_sandbox, 0) = 1 AND role != 'superadmin'
        `).run(
          canonicalProfId,
          profName,
          flags.zemda_fisio_enabled,
          flags.zemda_odonto_enabled,
          flags.zemda_nutri_enabled,
          flags.zemda_to_enabled,
          flags.zemda_fono_enabled,
          flags.zemda_pp_enabled,
          flags.zemda_psico_enabled,
          flags.zemda_personal_enabled,
          flags.zemda_med_enabled,
          env.manager_user_id
        );

        db.prepare(`
          UPDATE clinic_users SET
            role = 'clinic_admin',
            status = 'active',
            is_manager = 1,
            permissions_json = ?,
            zemda_fisio_enabled = ?,
            zemda_odonto_enabled = ?,
            zemda_nutri_enabled = ?,
            zemda_to_enabled = ?,
            zemda_fono_enabled = ?,
            zemda_pp_enabled = ?,
            zemda_psico_enabled = ?,
            zemda_personal_enabled = ?,
            zemda_med_enabled = ?,
            zemda_estetic_enabled = ?
          WHERE user_id = ? AND tenant_id = ?
        `).run(
          JSON.stringify(DEFAULT_MANAGER_PERMISSIONS),
          flags.zemda_fisio_enabled,
          flags.zemda_odonto_enabled,
          flags.zemda_nutri_enabled,
          flags.zemda_to_enabled,
          flags.zemda_fono_enabled,
          flags.zemda_pp_enabled,
          flags.zemda_psico_enabled,
          flags.zemda_personal_enabled,
          flags.zemda_med_enabled,
          commercialModule === 'ZemdaEstetic' ? 1 : 0,
          env.manager_user_id,
          env.sandbox_tenant_id
        );
      }

      // Garante que existe massa de dados inicial caso o ambiente ainda não tenha sido populado
      const patCount = Number(
        (db.prepare('SELECT COUNT(*) as c FROM patients WHERE tenant_id = ?').get(env.sandbox_tenant_id) as any)?.c || 0
      );
      const srvCount = Number(
        (db.prepare('SELECT COUNT(*) as c FROM services WHERE tenant_id = ?').get(env.sandbox_tenant_id) as any)?.c || 0
      );
      if (patCount === 0 && srvCount === 0) {
        this.seedSandboxData(env.sandbox_tenant_id, env.professional_id, effectiveProfile);
      }

      computedCaps = CapabilityService.calculateCapabilities({
        professionId: canonicalProfId,
        commercialModule: mode === 'manager' ? 'ZemdaGestao' : commercialModule,
        practiceAreaIds: finalAreaIds,
        medicalSpecialtyIds: medSpecIds,
        medicalPracticeAreaIds: medPaIds,
        tenantId: env.sandbox_tenant_id,
        planCode
      });

      // Revoga sessões sandbox anteriores deste ambiente (impede sessões zumbis em outras abas)
      db.prepare(`
        UPDATE sandbox_test_sessions
        SET status = 'revoked', revoked_at = datetime('now')
        WHERE environment_id = ? AND status = 'active'
      `).run(env.id);

      const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId) as any;
      const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(env.sandbox_tenant_id) as any;

      const token = generateToken({
        userId: userRow.id,
        tenantId: env.sandbox_tenant_id,
        name: userRow.name,
        role: mode === 'manager' ? 'clinic_admin' : 'professional',
        email: userRow.email,
        sessionVersion: Number(tenantRow.session_version || 0),
        userSessionVersion: Number(userRow.session_version || 0),
        isSandbox: true,
        sandboxSessionId: sessionId,
        sandboxAccountType: mode,
        sandboxPlanCode: planCode
      });

      db.prepare(`
        INSERT INTO sandbox_test_sessions (
          id, admin_user_id, environment_id, account_mode, establishment_profile,
          profession_id, practice_areas_json, plan_code, token,
          sandbox_tenant_id, sandbox_user_id, status, created_at, expires_at, last_used_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), ?, datetime('now')
        )
      `).run(
        sessionId,
        params.adminUserId,
        env.id,
        mode,
        effectiveProfile,
        canonicalProfId,
        JSON.stringify(finalAreaIds),
        planCode,
        token,
        env.sandbox_tenant_id,
        targetUserId,
        expiresAt
      );

      db.prepare(`
        UPDATE sandbox_environments SET
          status = 'in_use',
          establishment_profile = ?,
          plan_code = ?,
          last_profession_id = ?,
          last_practice_areas_json = ?,
          last_error = NULL,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(effectiveProfile, planCode, canonicalProfId, JSON.stringify(finalAreaIds), env.id);
    })();

    const savedSession = db.prepare('SELECT * FROM sandbox_test_sessions WHERE id = ?').get(sessionId) as any;
    const savedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId) as any;
    const savedTenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(env.sandbox_tenant_id) as any;

    const permissions =
      mode === 'manager'
        ? [...DEFAULT_MANAGER_PERMISSIONS]
        : this.buildProfessionalPermissions(flags);

    const userObj = {
      id: savedUser.id,
      name: savedUser.name,
      email: savedUser.email,
      role: savedUser.role, // 'clinic_admin' ou 'professional' (JAMAIS superadmin)
      status: savedUser.status,
      tenantId: env.sandbox_tenant_id,
      professionalId: mode === 'professional' ? env.professional_id : null,
      professionId: canonicalProfId,
      professionName: profName,
      canonicalProfessionId: canonicalProfId,
      canonicalProfessionName: profName,
      registrationType: regBoard,
      registrationNumber: '123456-TESTE',
      practiceAreas: finalAreaIds.join(', '),
      practiceAreaIds: finalAreaIds,
      commercialModule: mode === 'manager' ? 'ZemdaGestao' : commercialModule,
      capabilities: computedCaps.activeCapabilities,
      permissions,
      zemdaMedEnabled: mode === 'manager' || flags.zemda_med_enabled === 1,
      zemdaFisioEnabled: mode === 'manager' || flags.zemda_fisio_enabled === 1,
      zemdaOdontoEnabled: mode === 'manager' || flags.zemda_odonto_enabled === 1,
      zemdaNutriEnabled: mode === 'manager' || flags.zemda_nutri_enabled === 1,
      zemdaToEnabled: mode === 'manager' || flags.zemda_to_enabled === 1,
      zemdaFonoEnabled: mode === 'manager' || flags.zemda_fono_enabled === 1,
      zemdaPsicoEnabled: mode === 'manager' || flags.zemda_psico_enabled === 1,
      zemdaPPEnabled: mode === 'manager' || flags.zemda_pp_enabled === 1,
      zemdaPersonalEnabled: mode === 'manager' || flags.zemda_personal_enabled === 1,
      zemda360Enabled: true,
      zemdaBodyEnabled: true,
      zemdaEsteticEnabled: mode === 'manager' || commercialModule === 'ZemdaEstetic',
      isSandbox: true,
      sandboxSessionId: sessionId,
      sandboxAccountType: mode,
      sandboxPlanCode: planCode
    };

    const tenantObj = {
      id: savedTenant.id,
      name: savedTenant.name,
      trade_name: savedTenant.trade_name,
      client_term_label: savedTenant.client_term_label,
      establishment_profile: savedTenant.establishment_profile,
      billing_required: 0,
      is_sandbox: 1,
      isSandbox: true
    };

    return {
      token: savedSession.token,
      sessionId,
      environmentId: env.id,
      sandboxTenantId: env.sandbox_tenant_id,
      sandboxUserId: targetUserId,
      mode,
      accountMode: mode,
      establishmentProfile: effectiveProfile,
      user: userObj,
      tenant: tenantObj,
      capabilities: computedCaps
    };
  }

  private static buildProfessionalPermissions(flags: any): string[] {
    const permissions = ['view_schedule', 'create_appointment', 'edit_appointment', 'create_patient', 'edit_patient', 'view_patients'];
    if (flags.zemda_personal_enabled === 1) permissions.push('access_zemda_personal');
    if (flags.zemda_med_enabled === 1) permissions.push('access_zemda_med');
    if (flags.zemda_fisio_enabled === 1) permissions.push('access_zemda_fisio');
    if (flags.zemda_odonto_enabled === 1) permissions.push('access_zemda_odonto');
    if (flags.zemda_nutri_enabled === 1) permissions.push('access_zemda_nutri');
    if (flags.zemda_to_enabled === 1) permissions.push('access_zemda_to');
    if (flags.zemda_fono_enabled === 1) permissions.push('access_zemda_fono');
    if (flags.zemda_psico_enabled === 1) permissions.push('access_zemda_psico');
    if (flags.zemda_pp_enabled === 1) permissions.push('access_zemda_pp');
    return permissions;
  }

  /**
   * Encerra e revoga a sessão sandbox no backend, evitando abas zumbis.
   */
  public static exitSession(params: {
    sessionId?: string;
    userId: string;
    userRole: string;
  }): { revokedCount: number } {
    let revokedCount = 0;

    if (params.sessionId) {
      const sess = db.prepare('SELECT * FROM sandbox_test_sessions WHERE id = ?').get(params.sessionId) as any;
      if (sess && (sess.sandbox_user_id === params.userId || sess.admin_user_id === params.userId || params.userRole === 'superadmin')) {
        const res = db
          .prepare(`
            UPDATE sandbox_test_sessions
            SET status = 'revoked', revoked_at = datetime('now')
            WHERE id = ? AND status = 'active'
          `)
          .run(params.sessionId);
        revokedCount += res.changes;

        if (sess.environment_id) {
          this.syncEnvironmentIdleStatus(sess.environment_id);
        }
      }
      return { revokedCount };
    }

    if (params.userRole === 'superadmin') {
      const env = db.prepare('SELECT id FROM sandbox_environments WHERE admin_user_id = ?').get(params.userId) as any;
      const res = db
        .prepare(`
          UPDATE sandbox_test_sessions
          SET status = 'revoked', revoked_at = datetime('now')
          WHERE admin_user_id = ? AND status = 'active'
        `)
        .run(params.userId);
      revokedCount += res.changes;
      if (env) this.syncEnvironmentIdleStatus(env.id);
    }

    return { revokedCount };
  }

  private static syncEnvironmentIdleStatus(environmentId: string): void {
    const activeCount = Number(
      (
        db
          .prepare(`
            SELECT COUNT(*) as total
            FROM sandbox_test_sessions
            WHERE environment_id = ? AND status = 'active' AND revoked_at IS NULL AND expires_at > datetime('now')
          `)
          .get(environmentId) as any
      )?.total || 0
    );

    const nextStatus: SandboxEnvironmentStatus = activeCount > 0 ? 'in_use' : 'ready';
    db.prepare(`
      UPDATE sandbox_environments
      SET status = CASE WHEN status = 'resetting' THEN status ELSE ? END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, environmentId);
  }

  /**
   * Executa reset seguro, completo e transacional exclusivamente no Ambiente de Teste autorizado.
   */
  public static async resetSandboxEnvironment(params: {
    actorUserId: string;
    actorRole: string;
    actorTenantId?: string | null;
    isSandboxSession?: boolean;
    sandboxSessionId?: string;
    sandboxAccountType?: string;
    requestedTenantId?: string;
    confirmationText?: string;
  }): Promise<{
    success: true;
    sandboxTenantId: string;
    environmentId: string;
    deletedTables: string[];
    removedFilesCount: number;
    status: SandboxEnvironmentStatus;
  }> {
    if (!params.actorUserId) {
      throw new SandboxError(401, 'Usuário não autenticado.', 'UNAUTHENTICATED');
    }

    let targetEnv: any = null;

    if (params.isSandboxSession) {
      // Usuário operando dentro de uma sessão sandbox
      if (!params.sandboxSessionId || !params.actorTenantId) {
        throw new SandboxError(403, 'Sessão sandbox inválida ou ausente.', 'SANDBOX_SESSION_REQUIRED');
      }
      if (params.requestedTenantId && params.requestedTenantId !== params.actorTenantId) {
        throw new SandboxError(403, 'Violação de escopo: não é permitido informar outro tenantId para reset.', 'SANDBOX_TENANT_SPOOFING');
      }
      const verified = this.validateSandboxSession(params.sandboxSessionId, params.actorUserId, params.actorTenantId);
      if (!verified) {
        throw new SandboxError(403, 'Sessão de teste expirada, revogada ou inválida.', 'SANDBOX_SESSION_INVALID');
      }
      if (verified.session.account_mode !== 'manager' && verified.user.role !== 'clinic_admin') {
        throw new SandboxError(403, 'Somente o Gestor de Teste ou o SuperAdmin podem restaurar o ambiente.', 'SANDBOX_RESET_FORBIDDEN');
      }
      targetEnv = verified.environment;
    } else if (params.actorRole === 'superadmin') {
      // SuperAdmin fora do sandbox só pode restaurar ambientes sob sua administração
      if (params.requestedTenantId) {
        targetEnv = db
          .prepare('SELECT * FROM sandbox_environments WHERE sandbox_tenant_id = ? AND admin_user_id = ?')
          .get(params.requestedTenantId, params.actorUserId) as any;
        if (!targetEnv) {
          throw new SandboxError(403, 'Operação negada: o tenant informado não pertence a um Ambiente de Teste sob sua administração.', 'REAL_TENANT_RESET_FORBIDDEN');
        }
      } else {
        targetEnv = db
          .prepare('SELECT * FROM sandbox_environments WHERE admin_user_id = ?')
          .get(params.actorUserId) as any;
      }

      if (!targetEnv) {
        throw new SandboxError(404, 'Nenhum Ambiente de Teste provisionado para restauração.', 'SANDBOX_NOT_FOUND');
      }
    } else {
      // Usuário comum de clínica real é terminantemente bloqueado
      throw new SandboxError(403, 'Acesso negado: contas reais de clientes nunca podem executar reset de ambiente.', 'REAL_USER_FORBIDDEN');
    }

    const sandboxTenantId = targetEnv.sandbox_tenant_id;
    const tenantRecord = db
      .prepare('SELECT id, is_sandbox, establishment_profile FROM tenants WHERE id = ?')
      .get(sandboxTenantId) as { id: string; is_sandbox: number; establishment_profile?: string } | undefined;

    if (!tenantRecord || Number(tenantRecord.is_sandbox) !== 1) {
      throw new SandboxError(403, 'Abortado: o estabelecimento alvo não é um sandbox verificado.', 'NOT_A_SANDBOX');
    }

    // Marca status atomically como resetting evitando corrida concorrente
    const lockRes = db
      .prepare(`
        UPDATE sandbox_environments
        SET status = 'resetting', last_error = NULL, updated_at = datetime('now')
        WHERE id = ? AND status != 'resetting'
      `)
      .run(targetEnv.id);

    if (lockRes.changes === 0) {
      throw new SandboxError(409, 'Já existe uma restauração em andamento neste Ambiente de Teste.', 'RESET_IN_PROGRESS');
    }

    const deletedTables: string[] = [];
    const localPathsToDelete = new Set<string>();

    try {
      // Coleta caminhos locais de uploads vinculados ao tenant sandbox antes de apagar os registros
      this.collectSandboxLocalUploadPaths(sandboxTenantId, localPathsToDelete);

      db.transaction(() => {
        // Suspende triggers de imutabilidade de consentimento apenas para este reset dentro da transação
        this.dropConsentTriggers();
        try {
          db.exec('PRAGMA defer_foreign_keys = ON;');

          // 1. Limpeza completa e dinâmica de todas as tabelas mutáveis do sandbox
          const cleaned = this.purgeMutableSandboxTables(sandboxTenantId, targetEnv);
          deletedTables.push(...cleaned);

          // 2. Preserva Gestor Sandbox e Profissional Sandbox; remove usuários/profissionais extras criados em testes
          db.prepare('DELETE FROM professionals WHERE tenant_id = ? AND id != ?').run(sandboxTenantId, targetEnv.professional_id);
          db.prepare('DELETE FROM clinic_users WHERE tenant_id = ? AND user_id NOT IN (?, ?)').run(
            sandboxTenantId,
            targetEnv.manager_user_id,
            targetEnv.professional_user_id
          );
          db.prepare('DELETE FROM users WHERE tenant_id = ? AND id NOT IN (?, ?) AND COALESCE(is_sandbox, 0) = 1 AND role != ?').run(
            sandboxTenantId,
            targetEnv.manager_user_id,
            targetEnv.professional_user_id,
            'superadmin'
          );

          // 3. Restaura preferências mutáveis do tenant sandbox preservando sua identidade persistente
          const profile = VALID_PROFILES.has((tenantRecord.establishment_profile || targetEnv.establishment_profile) as any)
            ? ((tenantRecord.establishment_profile || targetEnv.establishment_profile) as SandboxEstablishmentProfile)
            : 'clinic';
          const clientTerm = profile === 'studio' ? 'Aluno' : 'Paciente';

          db.prepare(`
            UPDATE tenants SET
              name = 'Ambiente de Teste Zemda',
              trade_name = 'Zemda Laboratório Sandbox',
              corporate_name = NULL,
              cnpj_cpf = NULL,
              logo_url = NULL,
              address = NULL,
              street = NULL,
              number = NULL,
              complement = NULL,
              neighborhood = NULL,
              city = NULL,
              state = NULL,
              zip_code = NULL,
              public_booking_enabled = 0,
              client_term_label = ?,
              billing_required = 0,
              status = 'active',
              is_sandbox = 1,
              updated_at = datetime('now')
            WHERE id = ? AND is_sandbox = 1
          `).run(clientTerm, sandboxTenantId);

          // 4. Integridade referencial antes de comitar
          const fkViolations = db.prepare('PRAGMA foreign_key_check').all() as any[];
          if (fkViolations.length > 0) {
            throw new Error(`Violação de chave estrangeira detectada após limpeza: ${JSON.stringify(fkViolations.slice(0, 3))}`);
          }

          // 5. Restaura dados iniciais simulados
          this.repairCoreEnvironmentIdentities(targetEnv);
          this.seedSandboxData(sandboxTenantId, targetEnv.professional_id, profile);
        } finally {
          ensureConsentTriggers(db as any);
        }
      })();

      // Limpeza de arquivos locais e remotos R2 pertencentes exclusivamente ao sandbox
      const removedFilesCount = await this.cleanupSandboxStorage(sandboxTenantId, localPathsToDelete);

      const hasActiveSession = Boolean(
        db
          .prepare(`
            SELECT id FROM sandbox_test_sessions
            WHERE environment_id = ? AND status = 'active' AND revoked_at IS NULL AND expires_at > datetime('now')
            LIMIT 1
          `)
          .get(targetEnv.id)
      );
      const nextStatus: SandboxEnvironmentStatus = hasActiveSession ? 'in_use' : 'ready';

      db.prepare(`
        UPDATE sandbox_environments
        SET status = ?, last_reset_at = datetime('now'), last_error = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(nextStatus, targetEnv.id);

      return {
        success: true,
        sandboxTenantId,
        environmentId: targetEnv.id,
        deletedTables,
        removedFilesCount,
        status: nextStatus
      };
    } catch (err: any) {
      const errorMsg = err?.message || 'Erro durante restauração do Ambiente de Teste';
      try {
        db.prepare(`
          UPDATE sandbox_environments
          SET status = 'error', last_error = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(errorMsg, targetEnv.id);
      } catch {}
      throw err instanceof SandboxError ? err : new SandboxError(500, errorMsg, 'SANDBOX_RESET_FAILED');
    }
  }

  private static dropConsentTriggers(): void {
    const triggers = db
      .prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'trigger' AND (name LIKE 'immutable_%' OR name LIKE 'consent_document_frozen_%')
      `)
      .all() as { name: string }[];

    for (const trig of triggers) {
      db.exec(`DROP TRIGGER IF EXISTS ${quoteIdentifier(trig.name)};`);
    }
  }

  /**
   * Descobre dinamicamente TODAS as tabelas mutáveis e relacionamentos de FK para limpeza completa do sandbox.
   */
  private static purgeMutableSandboxTables(sandboxTenantId: string, env: any): string[] {
    const allTables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    )
      .map(r => r.name)
      .filter(name => !PRESERVED_GLOBAL_TABLES.has(name));

    const tableInfoCache = new Map<string, { cols: Set<string>; fks: { table: string; from: string; to: string }[] }>();
    for (const t of allTables) {
      const cols = new Set((db.prepare(`PRAGMA table_info(${quoteIdentifier(t)})`).all() as any[]).map(c => c.name));
      const fks = (db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(t)})`).all() as any[]).map(f => ({
        table: String(f.table),
        from: String(f.from),
        to: String(f.to)
      }));
      tableInfoCache.set(t, { cols, fks });
    }

    // Ordena tabelas para remover filhos antes dos pais com base em FKs
    const ordered: string[] = [];
    const remaining = new Set(allTables);
    while (remaining.size > 0) {
      let pickedAny = false;
      for (const table of Array.from(remaining)) {
        const referencedByOtherRemaining = Array.from(remaining).some(other => {
          if (other === table) return false;
          const info = tableInfoCache.get(other);
          return Boolean(info?.fks.some(fk => fk.table === table));
        });
        if (!referencedByOtherRemaining) {
          ordered.push(table);
          remaining.delete(table);
          pickedAny = true;
        }
      }
      if (!pickedAny) {
        const next = remaining.values().next().value;
        if (next) {
          ordered.push(next);
          remaining.delete(next);
        }
      }
    }

    // Exercícios personalizados do sandbox são apenas inativados para respeitar regra estrita sobre personal_exercises
    try {
      db.prepare('UPDATE personal_exercises SET is_active = 0 WHERE tenant_id = ? AND is_custom = 1').run(sandboxTenantId);
    } catch {}

    // Exclui registros de treinos do sandbox primeiro (cascateando personal_workout_exercises automaticamente)
    try {
      db.prepare('DELETE FROM personal_workouts WHERE tenant_id = ?').run(sandboxTenantId);
    } catch {}

    const cleanedSet = new Set<string>();
    const preservedUsers = [env.manager_user_id, env.professional_user_id];

    // Múltiplos passes garantem remoção completa mesmo em cadeias FK complexas
    for (let pass = 0; pass < 3; pass++) {
      let changesInPass = 0;

      for (const table of ordered) {
        if (table === 'personal_workouts') continue;
        const info = tableInfoCache.get(table)!;
        const qTable = quoteIdentifier(table);

        // Coluna direta de vínculo com tenant/clínica
        const tenantCol = info.cols.has('tenant_id')
          ? 'tenant_id'
          : info.cols.has('clinic_id')
            ? 'clinic_id'
            : info.cols.has('organization_id')
              ? 'organization_id'
              : null;

        if (tenantCol) {
          // Tabelas onde o vínculo com o usuário principal do sandbox não deve ser apagado se for onboarding/legal do gestor/profissional
          if (table === 'user_onboarding' || table === 'legal_acceptances') {
            const res = db
              .prepare(`DELETE FROM ${qTable} WHERE ${tenantCol} = ? AND user_id NOT IN (?, ?)`)
              .run(sandboxTenantId, ...preservedUsers);
            if (res.changes > 0) {
              cleanedSet.add(table);
              changesInPass += res.changes;
            }
          } else {
            const res = db.prepare(`DELETE FROM ${qTable} WHERE ${tenantCol} = ?`).run(sandboxTenantId);
            if (res.changes > 0) {
              cleanedSet.add(table);
              changesInPass += res.changes;
            }
          }
          continue;
        }

        // Tabelas filhas sem coluna tenant_id direta, mas com FK para entidades do sandbox
        for (const fk of info.fks) {
          const parentInfo = tableInfoCache.get(fk.table);
          const qFrom = quoteIdentifier(fk.from);
          const qTo = quoteIdentifier(fk.to);
          const qParent = quoteIdentifier(fk.table);

          if (fk.table === 'tenants') {
            const res = db.prepare(`DELETE FROM ${qTable} WHERE ${qFrom} = ?`).run(sandboxTenantId);
            if (res.changes > 0) {
              cleanedSet.add(table);
              changesInPass += res.changes;
            }
          } else if (fk.table === 'professionals') {
            const res = db
              .prepare(`DELETE FROM ${qTable} WHERE ${qFrom} IN (SELECT ${qTo} FROM professionals WHERE tenant_id = ?)`)
              .run(sandboxTenantId);
            if (res.changes > 0) {
              cleanedSet.add(table);
              changesInPass += res.changes;
            }
          } else if (fk.table === 'users') {
            if (table === 'legal_acceptances' || table === 'user_onboarding') {
              const res = db
                .prepare(`DELETE FROM ${qTable} WHERE ${qFrom} IN (SELECT ${qTo} FROM users WHERE tenant_id = ? AND id NOT IN (?, ?))`)
                .run(sandboxTenantId, ...preservedUsers);
              if (res.changes > 0) {
                cleanedSet.add(table);
                changesInPass += res.changes;
              }
            } else {
              const res = db
                .prepare(`DELETE FROM ${qTable} WHERE ${qFrom} IN (SELECT ${qTo} FROM users WHERE tenant_id = ?)`)
                .run(sandboxTenantId);
              if (res.changes > 0) {
                cleanedSet.add(table);
                changesInPass += res.changes;
              }
            }
          } else if (parentInfo) {
            const parentTenantCol = parentInfo.cols.has('tenant_id')
              ? 'tenant_id'
              : parentInfo.cols.has('clinic_id')
                ? 'clinic_id'
                : null;
            if (parentTenantCol) {
              const res = db
                .prepare(`DELETE FROM ${qTable} WHERE ${qFrom} IN (SELECT ${qTo} FROM ${qParent} WHERE ${parentTenantCol} = ?)`)
                .run(sandboxTenantId);
              if (res.changes > 0) {
                cleanedSet.add(table);
                changesInPass += res.changes;
              }
            }
          }
        }
      }

      if (changesInPass === 0) break;
    }

    return Array.from(cleanedSet);
  }

  private static getUploadsRoot(): string {
    return process.env.UPLOADS_DIR
      ? path.resolve(process.env.UPLOADS_DIR)
      : path.resolve(process.cwd(), 'uploads');
  }

  private static collectSandboxLocalUploadPaths(sandboxTenantId: string, collector: Set<string>): void {
    const uploadsRoot = this.getUploadsRoot();
    const tryAdd = (rawPath?: string | null) => {
      if (!rawPath || typeof rawPath !== 'string') return;
      const trimmed = rawPath.trim();
      if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) return;
      // Jamais remover mídias protegidas da biblioteca oficial
      if (
        trimmed.includes('exercise-media') ||
        trimmed.includes('exercise-photos') ||
        trimmed.includes('exercise-fallbacks')
      ) {
        return;
      }
      const relative = trimmed.replace(/^\/+uploads\/+/i, '').replace(/^uploads\/+/i, '');
      const resolved = path.resolve(uploadsRoot, relative);
      if (resolved.startsWith(uploadsRoot + path.sep) && fs.existsSync(resolved)) {
        collector.add(resolved);
      }
    };

    try {
      const tenant = db.prepare('SELECT logo_url FROM tenants WHERE id = ?').get(sandboxTenantId) as any;
      tryAdd(tenant?.logo_url);
    } catch {}
    try {
      const pats = db.prepare('SELECT photo_url FROM patients WHERE tenant_id = ?').all(sandboxTenantId) as any[];
      for (const p of pats) tryAdd(p.photo_url);
    } catch {}
    try {
      const docs = db.prepare('SELECT file_url FROM documents WHERE tenant_id = ?').all(sandboxTenantId) as any[];
      for (const d of docs) tryAdd(d.file_url);
    } catch {}
    try {
      const photos = db.prepare('SELECT photo_url FROM personal_assessment_photos WHERE tenant_id = ?').all(sandboxTenantId) as any[];
      for (const ph of photos) tryAdd(ph.photo_url);
    } catch {}
  }

  private static async cleanupSandboxStorage(sandboxTenantId: string, localPaths: Set<string>): Promise<number> {
    let removed = 0;

    for (const filePath of Array.from(localPaths)) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch (err: any) {
        throw new Error(`Falha ao excluir arquivo local de teste (${path.basename(filePath)}): ${err?.message || err}`);
      }
    }

    const sanitizedClinicId = sandboxTenantId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (sanitizedClinicId) {
      const uploadsRoot = this.getUploadsRoot();
      const clinicUploadDir = path.resolve(uploadsRoot, 'clinics', sanitizedClinicId);
      if (clinicUploadDir.startsWith(uploadsRoot + path.sep) && fs.existsSync(clinicUploadDir)) {
        try {
          fs.rmSync(clinicUploadDir, { recursive: true, force: true });
          removed++;
        } catch (err: any) {
          throw new Error(`Falha ao excluir diretório temporário local de teste: ${err?.message || err}`);
        }
      }
      removed += await r2StorageService.deletePrefix(`clinics/${sanitizedClinicId}/`);
    }

    return removed;
  }

  /**
   * Popula dados mockados iniciais para testes no sandbox (pacientes/alunos, sala, serviço, escala, agenda, prontuário, estoque e financeiro fictício).
   */
  public static seedSandboxData(
    tenantId: string,
    profId: string,
    profile: SandboxEstablishmentProfile = 'clinic'
  ): void {
    const p1Id = 'pat-sbx-' + uuidv4().slice(0, 8);
    const p2Id = 'pat-sbx-' + uuidv4().slice(0, 8);

    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, email, birth_date, active, created_at)
      VALUES (?, ?, 'Paciente Teste 01 (João da Silva)', '(11) 98888-1111', 'joao.teste@zemda.test', '1985-04-12', 1, datetime('now'))
    `).run(p1Id, tenantId);

    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, email, birth_date, active, created_at)
      VALUES (?, ?, 'Aluno Teste 02 (Maria Santos)', '(11) 97777-2222', 'maria.teste@zemda.test', '1992-08-25', 1, datetime('now'))
    `).run(p2Id, tenantId);

    const roomId = 'room-sbx-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO rooms (id, tenant_id, name, description, active, created_at)
      VALUES (?, ?, ?, 'Espaço inicial do Ambiente de Teste', 1, datetime('now'))
    `).run(roomId, tenantId, profile === 'studio' ? 'Estúdio 01 (Teste)' : 'Consultório 01 (Teste)');

    // Horários padrão seg-sex para agenda funcionar imediatamente
    for (const dow of [1, 2, 3, 4, 5]) {
      db.prepare(`
        INSERT OR IGNORE INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
        VALUES (?, ?, ?, ?, '08:00', '18:00', 1)
      `).run(`sch-sbx-${dow}-${uuidv4().slice(0, 6)}`, tenantId, profId, dow);
    }

    const srvId = 'srv-sbx-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, service_kind, active, created_at)
      VALUES (?, ?, ?, 'Atendimento Padrão (Teste)', 50, 200.0, 'individual', 1, datetime('now'))
    `).run(srvId, tenantId, profId);

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const apptId = 'appt-sbx-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, appointment_number, patient_id, professional_id, service_id, room_id,
        start_time, end_time, status, modality, patient_notes, created_at
      ) VALUES (
        ?, ?, 'SBX-001', ?, ?, ?, ?,
        ?, ?, 'confirmed', 'presential', 'Sessão simulada no Laboratório Zemda', datetime('now')
      )
    `).run(apptId, tenantId, p1Id, profId, srvId, roomId, `${todayStr}T14:00:00`, `${todayStr}T14:50:00`);

    const recId = 'rec-sbx-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO records (
        id, tenant_id, patient_id, appointment_id, professional_id, session_date,
        title, clinical_evolution, is_sealed, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        'Evolução Clínica de Teste',
        'Registro fictício inicial do Laboratório Sandbox. Pode ser editado e restaurado livremente.',
        0, datetime('now')
      )
    `).run(recId, tenantId, p1Id, apptId, profId, todayStr);

    const invId = 'inv-sbx-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO inventory_items (
        id, tenant_id, name, category, quantity, unit, min_stock, unit_cost, active, created_at
      ) VALUES (
        ?, ?, 'Insumo de Teste (Luvas Descartáveis)', 'Consumível Teste', 25, 'cx', 5, 35.0, 1, datetime('now')
      )
    `).run(invId, tenantId);

    const payId = 'pay-sbx-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO payments (
        id, tenant_id, appointment_id, patient_id, service_id, amount, payment_method, status, payment_date, notes, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, 200.0, 'pix', 'paid', ?, 'Lançamento financeiro fictício de teste', datetime('now')
      )
    `).run(payId, tenantId, apptId, p1Id, srvId, todayStr);
  }
}
