import { db } from '../config/database';
import { Request } from 'express';
import { CapabilityService } from './capability.service';

export const SHARED_CLINICAL_MODULES = ['ZemdaFono','ZemdaTO','ZemdaNutri','ZemdaPsico','ZemdaPP','ZemdaFisio','ZemdaOdonto','ZemdaPersonal','ZemdaEstetic','ZemdaMed','Zemda360'] as const;
export const SHARE_SCOPES: readonly string[] = ['patient','records','appointments','files',...SHARED_CLINICAL_MODULES.map(m=>'module:'+m)];
export const SHARE_CONSENT_VERSION = '2026-10-14.1';

/** Consult the destination's professional capabilities; source permissions are never inherited. */
export function canReadSharedRecord(req: Request, record: any): boolean {
  if (!req.user || !req.tenantId || !['professional','clinic_admin'].includes(req.user.role)) return false;
  if (!sharedOrigins(req.user.userId,req.tenantId,record.patient_id,'records').includes(record.tenant_id)) return false;
  const module = record.module_type === 'ZemdaBody' ? 'Zemda360' : record.module_type;
  if (!module || module === 'general' || module === 'Geral') return true;
  if (!(SHARED_CLINICAL_MODULES as readonly string[]).includes(module) ||
    !sharedOrigins(req.user.userId,req.tenantId,record.patient_id,'module:'+module).includes(record.tenant_id)) return false;
  const prof=db.prepare('SELECT id FROM professionals WHERE user_id=? AND tenant_id=? AND active=1').get(req.user.userId,req.tenantId);
  if (!prof) return false;
  return module==='Zemda360' || CapabilityService.computeUserCapabilities(req.user.userId,req.tenantId).commercialModule===module;
}

export function canAuthorizeShare(userId: string, tenantId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM clinic_users cu JOIN users u ON u.id=cu.user_id JOIN tenants t ON t.id=cu.tenant_id
    WHERE cu.user_id=? AND cu.tenant_id=? AND cu.status='active' AND u.status='active' AND t.status='active'
    AND (cu.role='clinic_admin' OR cu.is_manager=1) AND u.role!='superadmin'`).get(userId,tenantId);
}

/** Only direct, explicit grants are traversed. A→B and B→C never imply A→C. */
export function sharedOrigins(userId: string, activeTenantId: string, patientId: string, scope: string): string[] {
  if (!db.prepare("SELECT 1 FROM clinic_users cu JOIN users u ON u.id=cu.user_id JOIN tenants t ON t.id=cu.tenant_id WHERE cu.user_id=? AND cu.tenant_id=? AND cu.status='active' AND u.status='active' AND t.status='active'").get(userId,activeTenantId)) return [];
  return db.prepare(`SELECT DISTINCT CASE WHEN s.source_tenant_id=? THEN s.target_tenant_id ELSE s.source_tenant_id END AS origin
    FROM clinic_data_shares s JOIN shared_patient_links l ON l.share_id=s.id
    JOIN tenants a ON a.id=s.source_tenant_id JOIN tenants b ON b.id=s.target_tenant_id
    WHERE s.status='ACTIVE' AND a.status='active' AND b.status='active' AND l.patient_id=?
    AND (s.source_tenant_id=? OR s.target_tenant_id=?)
    AND EXISTS(SELECT 1 FROM json_each(s.scope_json) WHERE value=?)`)
    .all(activeTenantId,patientId,activeTenantId,activeTenantId,scope).map(r=>r.origin);
}

export function canAccessPatient(userId: string, tenantId: string, patientId: string, scope='patient'): boolean {
  const patient=db.prepare('SELECT tenant_id FROM patients WHERE id=?').get(patientId);
  // Local controllers already validate the authenticated clinic; preserve that boundary.
  // Cross-clinic reads always require a live membership and explicit grant.
  return !!patient && (patient.tenant_id===tenantId || sharedOrigins(userId,tenantId,patientId,scope).includes(patient.tenant_id));
}
