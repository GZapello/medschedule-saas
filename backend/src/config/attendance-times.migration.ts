import { DatabaseSync } from 'node:sqlite';

function ensureColumn(rawDb: DatabaseSync, table: string, column: string, typeDef: string): void {
  try {
    const cols = rawDb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.length > 0 && !cols.some(c => c.name === column)) {
      rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
    }
  } catch (err) {
    console.warn(`[Migration] Aviso ao adicionar coluna ${table}.${column}:`, err);
  }
}

export function migrateAttendanceTimes(rawDb: DatabaseSync): void {
  // 1. Separar horário agendado (start_time, end_time) de horário real do atendimento
  ensureColumn(rawDb, 'appointments', 'attendance_start_at', 'TEXT');
  ensureColumn(rawDb, 'appointments', 'attendance_expected_end_at', 'TEXT');
  ensureColumn(rawDb, 'appointments', 'attendance_end_at', 'TEXT');

  // 2. Horário final real no prontuário clínico
  ensureColumn(rawDb, 'records', 'session_end_time', 'TEXT');

  // 3. Contexto documental congelado com horário final real do atendimento
  for (const table of ['clinical_certificates', 'clinical_prescriptions', 'clinical_exam_requests']) {
    ensureColumn(rawDb, table, 'attendance_end_time', 'TEXT');
  }
}
