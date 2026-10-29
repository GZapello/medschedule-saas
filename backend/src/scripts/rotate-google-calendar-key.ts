import 'dotenv/config';
import { db } from '../config/database';
import { calendarEncryptionConfigured, decryptRefreshToken, encryptRefreshToken } from '../utils/google-calendar-crypto';

// Run against an already migrated database. Dry-run unless --apply is explicit.
if (!calendarEncryptionConfigured()) throw new Error('Configure a nova chave dedicada antes da rotação.');
const rows = db.prepare('SELECT id, encrypted_refresh_token FROM google_calendar_connections').all() as { id: string; encrypted_refresh_token: string }[];
const updates = rows.map(row => {
  const token = decryptRefreshToken(row.encrypted_refresh_token);
  if (!token) throw new Error('Há conexão indecifrável. Nenhum token foi alterado; confira as chaves anteriores.');
  return { id: row.id, encrypted: encryptRefreshToken(token) };
});
if (process.argv.includes('--apply')) {
  db.transaction(() => {
    for (const row of updates) db.prepare('UPDATE google_calendar_connections SET encrypted_refresh_token = ? WHERE id = ?').run(row.encrypted, row.id);
  })();
  console.log(`Rotação concluída para ${updates.length} conexão(ões). Nenhuma credencial foi exibida.`);
} else {
  console.log(`Validação concluída para ${updates.length} conexão(ões). Nenhuma alteração. Use --apply para executar a rotação.`);
}
