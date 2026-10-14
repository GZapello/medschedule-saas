import { Request, Response } from 'express';
import { db } from '../config/database';
import { SHARED_CLINICAL_CATALOG } from '../services/shared-clinical-catalog';
import { canReadSharedRecord, sharedOrigins } from '../services/patient-sharing.service';
import { hasClinicalAccess } from './clinical.controller';
import { r2StorageService } from '../services/r2-storage.service';
import { logAudit } from '../middlewares/audit.middleware';

// Nested clinical form values must not expose internal links, financial values or private notes.
export function projectClinicalValue(value: any, depth = 0): any {
  if (depth > 20) return null;
  if (typeof value === 'string' && /^(https?:|data:|file:|clinics\/)/i.test(value.trim())) return null;
  if (Array.isArray(value)) return value.map(v => projectClinicalValue(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(private|confidential|privad|sigilos|url|token|secret|password|credential|price|cost|amount|payment|budget|billing|commission|inventory|preco|preço|valor|custo|pagamento|finance|faturamento)/i.test(key))
    .map(([key, v]) => [key, projectClinicalValue(v, depth + 1)]));
  return value;
}

function allowedFile(req: Request, file: any): boolean {
  return !!file && !!file.patient_id && hasClinicalAccess(req, file.patient_id) &&
    sharedOrigins(req.user!.userId, req.tenantId!, file.patient_id, 'files').includes(file.clinic_id) &&
    canReadSharedRecord(req, {patient_id: file.patient_id, tenant_id: file.clinic_id, module_type: file.module_type || 'general'});
}

export class SharedHistoryController {
  static list(req: Request, res: Response): void {
    const patientId = String(req.params.patientId);
    if (!hasClinicalAccess(req, patientId)) { res.status(403).json({error: 'Acesso clínico restrito.'}); return; }
    try {
      const history: any[] = [];
      for (const origin of sharedOrigins(req.user!.userId, req.tenantId!, patientId, 'records')) {
        const originName = db.prepare('SELECT name FROM tenants WHERE id=?').get(origin)?.name;
        for (const entry of SHARED_CLINICAL_CATALOG) {
          if (!canReadSharedRecord(req, {patient_id: patientId, tenant_id: origin, module_type: entry.module})) continue;
          // Table and column names are exclusively the reviewed, static catalog above.
          const rows = db.prepare(`SELECT ${entry.columns.join(',')} FROM ${entry.table} WHERE patient_id=? AND tenant_id=?`).all(patientId, origin);
          for (const row of rows) {
            const data = Object.fromEntries(Object.entries(row).filter(([k]) => !['id','tenant_id','patient_id','professional_id','appointment_id'].includes(k)).map(([key,value]) => {
              if (key.endsWith('_json') && typeof value === 'string') { try { value=JSON.parse(value); } catch { value=null; } }
              return [key, projectClinicalValue(value)];
            }));
            history.push({id: row.id, type: entry.table, module: entry.module, originId: origin, originName, date: row.created_at, data});
          }
        }
      }
      const files: any[] = [];
      for (const origin of sharedOrigins(req.user!.userId, req.tenantId!, patientId, 'files')) {
        for (const file of db.prepare('SELECT id,clinic_id,patient_id,module_type,original_filename,mime_type,created_at FROM file_attachments WHERE patient_id=? AND clinic_id=?').all(patientId, origin)) {
          if (allowedFile(req, file)) files.push({id:file.id,name:file.original_filename,mimeType:file.mime_type,date:file.created_at,originName:db.prepare('SELECT name FROM tenants WHERE id=?').get(origin)?.name});
        }
      }
      logAudit(req,'VIEW_SHARED_HISTORY','patients',patientId,{records:history.length,files:files.length});
      res.setHeader('Cache-Control','no-store');
      res.json({history:history.sort((a,b)=>String(b.date).localeCompare(String(a.date))),files});
    } catch(error) { console.error('[SharedHistory]',error); res.status(500).json({error:'Não foi possível consultar o histórico compartilhado.'}); }
  }

  static async file(req: Request, res: Response): Promise<void> {
    const file=db.prepare('SELECT * FROM file_attachments WHERE id=?').get(req.params.id);
    if (!allowedFile(req,file)) { res.status(403).json({error:'Arquivo fora do compartilhamento autorizado.'}); return; }
    try {
      const content=await r2StorageService.getObjectBuffer(file.object_key);
      // Recheck after storage I/O: a revocation during retrieval also prevents delivery.
      if (!allowedFile(req,file)) { res.status(403).json({error:'Compartilhamento encerrado.'}); return; }
      logAudit(req,'DOWNLOAD_SHARED_FILE','file_attachments',file.id,{sourceTenantId:file.clinic_id,patientId:file.patient_id});
      res.setHeader('Cache-Control','no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.json({name:file.original_filename,mimeType:file.mime_type,base64:content.toString('base64')});
    } catch { res.status(404).json({error:'Arquivo indisponível.'}); }
  }
}
