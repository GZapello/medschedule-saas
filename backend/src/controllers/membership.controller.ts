import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../config/database';
import { requireCapacity, BillingError } from '../services/billing.service';
import { respondBillingError } from './billing.controller';
import { getDefaultPermissionsForRole } from '../utils/role-permissions';
import { createDefaultSchedules } from '../utils/schedule-defaults';


export class MembershipController {
  static list(req: Request, res: Response): void {
    res.json(db.prepare(`SELECT t.id,t.name,cu.role,cu.is_manager FROM clinic_users cu
      JOIN tenants t ON t.id=cu.tenant_id WHERE cu.user_id=? AND cu.status='active' AND t.status='active'
      ORDER BY t.name`).all(req.user!.userId));
  }

  static remember(req: Request, res: Response): void {
    if (req.user!.role !== 'superadmin') {
      db.prepare(`INSERT INTO user_clinic_preferences(user_id,tenant_id) VALUES(?,?)
        ON CONFLICT(user_id) DO UPDATE SET tenant_id=excluded.tenant_id,updated_at=datetime('now')`)
        .run(req.user!.userId, req.tenantId);
    }
    res.json({ success: true });
  }

  static accept(req: Request, res: Response): void {
    try {
      if (req.user!.role === 'superadmin' || req.user!.role === 'patient') {
        res.status(403).json({error: 'Esta conta não pode aceitar convite de equipe.'}); return;
      }
      const result = db.transaction(() => {
        const invite = db.prepare(`SELECT ci.*,t.status AS clinic_status,t.registrations_blocked
          FROM clinic_invites ci JOIN tenants t ON t.id=ci.tenant_id WHERE ci.token=?`).get(req.params.token);
        if (!invite || invite.clinic_status !== 'active' || invite.registrations_blocked) throw new BillingError('INVITE_INVALID','Convite indisponível.');
        const existing = db.prepare('SELECT status FROM clinic_users WHERE user_id=? AND tenant_id=?').get(req.user!.userId,invite.tenant_id);
        if (existing?.status === 'active') return {tenantId:invite.tenant_id,alreadyMember:true};
        // An invitation must never override a deliberate local access revocation.
        if (existing) throw new BillingError('MEMBERSHIP_INACTIVE','Solicite a reativação do vínculo ao administrador da clínica.',403);
        if (invite.status !== 'pending' || invite.used_count >= invite.max_uses ||
          !Number.isFinite(Date.parse(invite.expires_at.replace(' ','T')+'Z')) ||
          Date.parse(invite.expires_at.replace(' ','T')+'Z') <= Date.now()) throw new BillingError('INVITE_EXPIRED','Convite expirado ou já utilizado.');
        if (!['clinic_admin','professional','receptionist','secretary','financial','assistant'].includes(invite.role)) throw new BillingError('INVITE_ROLE','Papel de convite inválido.');
        requireCapacity(invite.tenant_id,1,req.user!.userId);
        const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.userId);
        db.prepare(`INSERT INTO clinic_users(id,tenant_id,user_id,role,status,is_manager,permissions_json,approved_by,approved_at,profession_id,profession_name,profession_custom)
          VALUES(?,?,?,?,'active',?,?,?,?,?,?,?)`).run(randomUUID(),invite.tenant_id,user.id,invite.role,invite.role==='clinic_admin'?1:0,
            JSON.stringify(getDefaultPermissionsForRole(invite.role)),invite.created_by,new Date().toISOString(),
            user.profession_id,user.profession_name,user.profession_name);
        if (['professional','clinic_admin'].includes(invite.role)) {
          const id=randomUUID();
          db.prepare(`INSERT INTO professionals(id,tenant_id,user_id,name,profession_id,registration_type,registration_number,active)
            VALUES(?,?,?,?,?,?,?,1)`).run(id,invite.tenant_id,user.id,user.name,user.profession_id,user.registration_type,user.registration_number);
          createDefaultSchedules(db,invite.tenant_id,id);
        }
        db.prepare(`UPDATE clinic_invites SET used_count=used_count+1,status=CASE WHEN used_count+1>=max_uses THEN 'used' ELSE 'pending' END,
          used_by=?,updated_at=datetime('now') WHERE id=?`).run(user.id,invite.id);
        for (const [action,entity,entityId] of [['ACCEPT_CLINIC_INVITE','clinic_invites',invite.id],['CREATE_MEMBERSHIP','clinic_users',user.id]]) {
          db.prepare('INSERT INTO audit_logs(id,tenant_id,user_id,action,entity,entity_id,details_json) VALUES(?,?,?,?,?,?,?)')
            .run(randomUUID(),invite.tenant_id,user.id,action,entity,entityId,JSON.stringify({targetTenantId:invite.tenant_id,role:invite.role}));
        }
        return {tenantId:invite.tenant_id,alreadyMember:false};
      })();
      res.json({...result,message:result.alreadyMember?'Sua conta já está vinculada a esta clínica.':'Vínculo criado. Seus dados continuam separados.'});
    } catch(error) {
      if (respondBillingError(res,error)) return;
      console.error('[Membership.accept]',error);
      res.status(500).json({error:'Não foi possível concluir o vínculo.'});
    }
  }
}
