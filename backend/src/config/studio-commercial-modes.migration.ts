import { DatabaseSync } from 'node:sqlite';

/**
 * Migração aditiva e idempotente para separação completa de modalidades comerciais,
 * modelos de créditos/recorrência e fuso horário do estabelecimento (Academia & Studio).
 *
 * REGRAS DE SEGURANÇA:
 * - Nunca altera ou apaga registros clínicos existentes (`service_domain = 'clinical'`).
 * - Colunas novas em `services` ficam nullable para preservar fallback seguro em registros legados.
 */
export function migrateStudioCommercialModes(rawDb: DatabaseSync): void {
  const addColIfMissing = (table: string, col: string, definition: string) => {
    try {
      const cols = rawDb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (cols.length > 0 && !cols.some((c) => c.name === col)) {
        rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
      }
    } catch (e) {
      console.warn(`[StudioCommercialModesMigration] Aviso ao adicionar ${table}.${col}:`, e);
    }
  };

  // 1. Fuso horário explícito por estabelecimento (padrão America/Sao_Paulo)
  addColIfMissing('tenants', 'timezone', "TEXT NOT NULL DEFAULT 'America/Sao_Paulo'");

  // 2. Separação explícita de modalidades comerciais e visibilidade pública no serviço
  addColIfMissing('services', 'allow_single_booking', 'INTEGER');
  addColIfMissing('services', 'allow_plan_booking', 'INTEGER');
  addColIfMissing('services', 'allow_public_single_booking', 'INTEGER');
  addColIfMissing('services', 'allow_public_plan_booking', 'INTEGER');

  // 3. Modelo padrão de contabilização de créditos/ocorrências de planos do serviço
  // ('fixed_credits' | 'weekly_guaranteed' | 'unlimited')
  addColIfMissing('services', 'plan_credit_mode', 'TEXT');
  addColIfMissing('services', 'plan_credits_per_cycle', 'INTEGER');

  // 4. Snapshots comerciais e de créditos nos contratos recorrentes e entitlements de pacotes
  addColIfMissing('recurring_billing_plans', 'credit_mode_snapshot', 'TEXT');
  addColIfMissing('recurring_billing_plans', 'credits_per_cycle_snapshot', 'INTEGER');
  addColIfMissing('recurring_billing_plans', 'commercial_option_id_snapshot', 'TEXT');
  addColIfMissing('recurring_billing_plans', 'commercial_option_label_snapshot', 'TEXT');

  addColIfMissing('student_package_entitlements', 'credit_mode_snapshot', 'TEXT');
  addColIfMissing('student_package_entitlements', 'credits_per_cycle_snapshot', 'INTEGER');

  // 5. Snapshots explícitos nas solicitações de agendamento público
  addColIfMissing('public_booking_requests', 'booking_mode', 'TEXT');
  addColIfMissing('public_booking_requests', 'commercial_option_id', 'TEXT');
  addColIfMissing('public_booking_requests', 'credit_mode_snapshot', 'TEXT');
  addColIfMissing('public_booking_requests', 'credits_per_cycle_snapshot', 'INTEGER');
}
