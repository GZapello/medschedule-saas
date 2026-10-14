import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../config/database';
import { canAuthorizeShare, SHARE_SCOPES, SHARE_CONSENT_VERSION } from '../services/patient-sharing.service';
import { BillingError } from '../services/billing.service';
import { respondBillingError } from './billing.controller';

function audit(user: string, source: string, target: string, action: string, details: any) {
  // Mandatory audit: failure aborts the surrounding transaction.
  db.prepare(`INSERT INTO audit_logs(id,tenant_id,user_id,action,entity,entity_id,details_json)
    VALUES(?,?,?,?,'clinic_data_shares',?,?)`).run(randomUUID(),source,user,action,details.id,JSON.stringify({sourceTenantId:source,targetTenantId:target,...details}));
}

export class PatientSharingController {
  static sources(req: Request,res: Response): void {
    const sources=db.prepare(`SELECT t.id,t.name FROM clinic_users cu JOIN tenants t ON t.id=cu.tenant_id
      WHERE cu.user_id=? AND cu.status='active' AND t.status='active' AND (cu.role='clinic_admin' OR cu.is_manager=1)`)
      .all(req.user!.userId).filter(s=>s.id!==req.query.targetTenantId && canAuthorizeShare(req.user!.userId,s.id));
    res.json({sources,scopes:SHARE_SCOPES,consentVersion:SHARE_CONSENT_VERSION});
  }

  static patients(req: Request,res: Response): void {
    const source=String(req.params.sourceId);
    if(!canAuthorizeShare(req.user!.userId,source)){res.status(403).json({error:'Sem autoridade na clínica de origem.'});return;}
    res.json(db.prepare(`SELECT id,full_name,birth_date,substr(replace(replace(cpf,'.',''),'-',''),-4) AS identifier_suffix
      FROM patients WHERE tenant_id=? AND active=1 ORDER BY full_name`).all(source));
  }

  static create(req: Request,res: Response): void {
    try {
      const {sourceTenantId:source,targetTenantId:target,patientIds,scopes,consentVersion,confirmed,keepSeparate}=req.body;
      if(typeof source!=='string'||typeof target!=='string'||source===target||!Array.isArray(patientIds)||!patientIds.length||patientIds.length>10000||patientIds.some(p=>typeof p!=='string')||
        !Array.isArray(scopes)||!scopes.includes('patient')||((scopes.includes('files')||scopes.some((s:any)=>typeof s==='string'&&s.startsWith('module:')))&&!scopes.includes('records'))||scopes.some(s=>!SHARE_SCOPES.includes(s))||confirmed!==true||consentVersion!==SHARE_CONSENT_VERSION)
        throw new BillingError('SHARE_INVALID','Seleção e confirmação explícita são obrigatórias.',400);
      const result=db.transaction(()=>{
        if(!canAuthorizeShare(req.user!.userId,source))throw new BillingError('SHARE_AUTHORITY','Sem autoridade na clínica de origem.',403);
        if(!db.prepare(`SELECT 1 FROM clinic_users cu JOIN tenants t ON t.id=cu.tenant_id WHERE cu.user_id=? AND cu.tenant_id=? AND cu.status='active' AND t.status='active'`).get(req.user!.userId,target))
          throw new BillingError('SHARE_TARGET','Aceite o vínculo com a clínica de destino primeiro.',403);
        const ids=[...new Set(patientIds)] as string[];
        const duplicates: any[]=[];
        for(const id of ids){
          const p=db.prepare('SELECT id,full_name,cpf,birth_date FROM patients WHERE id=? AND tenant_id=? AND active=1').get(id,source);
          if(!p)throw new BillingError('SHARE_PATIENT','Paciente não pertence à clínica de origem.',403);
          const matches=db.prepare(`SELECT id,full_name FROM patients WHERE tenant_id=? AND active=1 AND
            ((length(replace(replace(COALESCE(cpf,''),'.',''),'-',''))=11 AND replace(replace(cpf,'.',''),'-','')=?) OR
            (lower(full_name)=lower(?) AND birth_date=? AND birth_date IS NOT NULL))`).all(target,String(p.cpf||'').replace(/\D/g,''),p.full_name,p.birth_date);
          if(matches.length)duplicates.push({patientId:id,name:p.full_name,matches});
        }
        if(duplicates.length && keepSeparate!==true) return {duplicates};
        const id=randomUUID();
        db.prepare(`INSERT INTO clinic_data_shares(id,source_tenant_id,target_tenant_id,authorized_by_user_id,scope_json,consent_version)
          VALUES(?,?,?,?,?,?)`).run(id,source,target,req.user!.userId,JSON.stringify([...new Set(scopes)]),consentVersion);
        for(const patientId of ids)db.prepare('INSERT INTO shared_patient_links(share_id,patient_id) VALUES(?,?)').run(id,patientId);
        audit(req.user!.userId,source,target,'SHARE_PATIENTS',{id,patientIds:ids,scopes,consentVersion,keepSeparate:keepSeparate===true});
        return {id,count:ids.length};
      })();
      res.status('duplicates' in result?200:201).json(result);
    } catch(error){if(respondBillingError(res,error))return;console.error(error);res.status(500).json({error:'Não foi possível compartilhar.'});}
  }

  static list(req:Request,res:Response):void {
    res.json(db.prepare(`SELECT s.id,s.source_tenant_id,s.target_tenant_id,s.status,s.scope_json,s.created_at,s.revoked_at,
      (SELECT count(*) FROM shared_patient_links l WHERE l.share_id=s.id) AS patient_count,
      t.name AS target_name FROM clinic_data_shares s JOIN tenants t ON t.id=s.target_tenant_id
      WHERE s.source_tenant_id=? ORDER BY s.created_at DESC`).all(req.tenantId)
      .filter(()=>canAuthorizeShare(req.user!.userId,req.tenantId!)));
  }

  static revoke(req:Request,res:Response):void {
    try{
      db.transaction(()=>{
        const s=db.prepare('SELECT * FROM clinic_data_shares WHERE id=?').get(req.params.id);
        if(!s||!canAuthorizeShare(req.user!.userId,s.source_tenant_id))throw new BillingError('SHARE_AUTHORITY','Sem autoridade para revogar.',403);
        if(s.status==='REVOKED')return;
        db.prepare("UPDATE clinic_data_shares SET status='REVOKED',revoked_at=datetime('now'),revoked_by_user_id=? WHERE id=?").run(req.user!.userId,s.id);
        audit(req.user!.userId,s.source_tenant_id,s.target_tenant_id,'REVOKE_SHARE',{id:s.id});
      })();res.json({success:true});
    }catch(error){if(respondBillingError(res,error))return;res.status(500).json({error:'Falha ao revogar.'});}
  }
}
