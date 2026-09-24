import { v4 as uuidv4 } from 'uuid';

/**
 * Cria a grade padrão de horários de trabalho para um novo profissional.
 * Padrão:
 * - Segunda a Sexta-feira (dias 1 a 5): ATIVO (08:00 às 18:00 com intervalo 12:00 às 13:30)
 * - Sábado (dia 6): ATIVO (08:00 às 12:00, sem intervalo)
 * - Domingo (dia 0): INATIVO (08:00 às 12:00, sem intervalo)
 */
export function createDefaultSchedules(db: any, tenantId: string, professionalId: string): void {
  // Não sobrescreve horários já existentes de profissionais já cadastrados
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM schedules WHERE tenant_id = ? AND professional_id = ?').get(tenantId, professionalId) as { c: number } | undefined;
  if (existingCount && existingCount.c > 0) {
    return;
  }

  const insertSched = db.prepare(`
    INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Segunda a Sexta-feira: Ativo (1)
  for (let day = 1; day <= 5; day++) {
    insertSched.run(
      `sch-${uuidv4().slice(0, 8)}`,
      tenantId,
      professionalId,
      day,
      '08:00',
      '18:00',
      '12:00',
      '13:30',
      1
    );
  }

  // Sábado: Ativo (1)
  insertSched.run(
    `sch-${uuidv4().slice(0, 8)}`,
    tenantId,
    professionalId,
    6,
    '08:00',
    '12:00',
    null,
    null,
    1
  );

  // Domingo: Inativo (0)
  insertSched.run(
    `sch-${uuidv4().slice(0, 8)}`,
    tenantId,
    professionalId,
    0,
    '08:00',
    '12:00',
    null,
    null,
    0
  );
}
