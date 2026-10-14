import { db } from '../config/database';

/** Mutates only the response snapshot, never the global identity in users. */
export function selectLoginClinic(user: any): void {
  if (user.role === 'superadmin') return;
  const link = db.prepare(`SELECT cu.tenant_id,cu.role FROM clinic_users cu JOIN tenants t ON t.id=cu.tenant_id
    LEFT JOIN user_clinic_preferences pref ON pref.user_id=cu.user_id
    WHERE cu.user_id=? AND cu.status='active' AND t.status='active'
    ORDER BY CASE WHEN cu.tenant_id=pref.tenant_id THEN 0 WHEN cu.tenant_id=? THEN 1 ELSE 2 END,cu.created_at LIMIT 1`).get(user.id,user.tenant_id);
  if (link) { user.tenant_id=link.tenant_id; user.role=link.role; }
}
