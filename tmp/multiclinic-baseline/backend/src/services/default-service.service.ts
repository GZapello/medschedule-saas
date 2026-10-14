import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * Cria de forma estritamente idempotente o serviço inicial "Atendimento / Consulta" (R$ 180,00)
 * para uma NOVA clínica/conta cadastrada no sistema.
 * 
 * Regras:
 * - Nome: "Atendimento / Consulta"
 * - Valor: R$ 180,00
 * - Status: Ativo (active = 1)
 * - Duração: 50 minutos
 * - Buffer: 10 minutos
 * - Modalidade: 'both' (presencial e online)
 * - Pertence exclusivamente à nova clínica (tenant_id)
 * - Se a clínica já possuir um serviço com este nome, não duplica.
 */
export function ensureDefaultClinicService(
  tenantId: string,
  strict: boolean = false
): { id: string; name: string; price: number; created: boolean } | null {
  if (!tenantId || typeof tenantId !== 'string') {
    if (strict) throw new Error('TENANT_ID_REQUIRED_FOR_DEFAULT_SERVICE');
    return null;
  }

  try {
    const trimmedTenantId = tenantId.trim();

    // 1. Verifica se a clínica existe
    const tenantExists = db.prepare('SELECT id FROM tenants WHERE id = ?').get(trimmedTenantId) as { id: string } | undefined;
    if (!tenantExists) {
      console.warn(`[ensureDefaultClinicService] Clínica ${trimmedTenantId} não encontrada.`);
      if (strict) throw new Error(`Clínica ${trimmedTenantId} não encontrada ao provisionar serviço padrão.`);
      return null;
    }

    // 2. Verificação de Idempotência: verifica se a clínica já possui o serviço padrão
    const existing = db.prepare(`
      SELECT id, name, price, active
      FROM services
      WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM('Atendimento / Consulta'))
    `).get(trimmedTenantId) as { id: string; name: string; price: number; active: number } | undefined;

    if (existing) {
      // Já existe, não duplica
      return {
        id: existing.id,
        name: existing.name,
        price: existing.price,
        created: false
      };
    }

    // 3. Criação do serviço padrão da clínica
    const serviceId = 'srv-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO services (
        id, tenant_id, specialty_id, name, description,
        duration_minutes, buffer_minutes, price, modality, active,
        min_lead_time_hours, max_advance_days, cancellation_policy,
        created_at, updated_at
      ) VALUES (
        ?, ?, NULL, 'Atendimento / Consulta', 'Serviço inicial padrão para consultas e atendimentos clínicos',
        50, 10, 180.0, 'both', 1,
        2, 60, 'Cancelamentos com até 24h de antecedência.',
        datetime('now'), datetime('now')
      )
    `).run(serviceId, trimmedTenantId);

    // 4. Se houver profissionais cadastrados para essa clínica, associa automaticamente
    const professionals = db.prepare('SELECT id FROM professionals WHERE tenant_id = ?').all(trimmedTenantId) as { id: string }[];
    for (const prof of professionals) {
      db.prepare(`
        INSERT OR IGNORE INTO professional_services (id, professional_id, service_id, custom_price, custom_duration)
        VALUES (?, ?, ?, 180.0, 50)
      `).run('ps-' + uuidv4().slice(0, 8), prof.id, serviceId);
    }

    return {
      id: serviceId,
      name: 'Atendimento / Consulta',
      price: 180.0,
      created: true
    };
  } catch (err) {
    console.error(`[ensureDefaultClinicService] Erro ao provisionar serviço padrão para a clínica ${tenantId}:`, err);
    if (strict) {
      throw err;
    }
    return null;
  }
}
