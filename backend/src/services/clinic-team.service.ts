import { db } from '../config/database';

// Membership is authoritative. Legacy fallback applies only when that membership is absent.
export function clinicTeam(tenantId: string): any[] {
  return db.prepare(`WITH members AS (
    SELECT cu.user_id,cu.role,cu.status,cu.profession_name FROM clinic_users cu WHERE cu.tenant_id=?
    UNION ALL
    SELECT u.id,u.role,u.status,u.profession_name FROM users u WHERE u.tenant_id=?
      AND NOT EXISTS(SELECT 1 FROM clinic_users cu WHERE cu.user_id=u.id AND cu.tenant_id=?)
  ) SELECT u.id,u.name,u.email,m.role,m.status,u.status AS account_status,
      COALESCE(NULLIF(m.profession_name,''),NULLIF(p.profession_name,''),u.profession_name) AS profession_name,
      COALESCE(NULLIF(p.registration_type,''),u.registration_type) AS registration_type,
      COALESCE(NULLIF(p.registration_number,''),u.registration_number) AS registration_number,
      CASE WHEN m.role='professional' OR p.id IS NOT NULL THEN 1 ELSE 0 END AS is_professional
    FROM members m JOIN users u ON u.id=m.user_id
    LEFT JOIN professionals p ON p.id=(SELECT pr.id FROM professionals pr
      WHERE pr.user_id=u.id AND pr.tenant_id=? ORDER BY pr.active DESC,pr.id LIMIT 1)
    WHERE u.role NOT IN ('patient','superadmin') AND m.role NOT IN ('patient','superadmin')
    ORDER BY u.name,u.id`).all(tenantId,tenantId,tenantId,tenantId);
}
