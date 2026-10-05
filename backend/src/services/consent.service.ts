import crypto from 'crypto';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { Request } from 'express';
import { db } from '../config/database';
import { hasConsentAccess, hasConsentDocumentAccess } from '../utils/consent-access';
import { EmailService } from './email.service';

import { resolveClinicalModule } from '../utils/clinical-module';
import { buildZemdaEmailLayout, buildZemdaOtpBox } from './email-template.service';
import { CapabilityService } from './capability.service';

export const consentHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const maskedContact = (value: string, channel: string) => channel==='email' ? value.replace(/^(.).*(@.*)$/, '$1***$2') : `***${value.replace(/\D/g,'').slice(-4)}`;
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export function consentError(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
const text = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const consentBaseUrl = () => (process.env.APP_URL || 'https://zemda.com.br').replace(/\/$/, '');
export const contentHash = (title: string, content: string) => consentHash(JSON.stringify({title, content}));
export const consentDeclarations = ['Li e compreendi as informações apresentadas.', 'Tive oportunidade de esclarecer minhas dúvidas.', 'Manifesto minha concordância com o conteúdo apresentado.'];
export function consentAuthenticationLabel(method: string): string {
  if(!method.includes('otp_')) return 'Assinatura manuscrita e registros da sessão'+(method.includes('+photo')?' e foto opcional':'');
  const base=method.includes('otp_whatsapp')?'Assinatura manuscrita e OTP por WhatsApp':'Assinatura manuscrita e OTP por e-mail';
  return base+(method.includes('+photo')?' e foto opcional':'');
}

export class ConsentService {
  static allowedModule(req: Request, module: string): boolean {
    if (req.user?.role === 'receptionist') return true;
    return module==='general' || module===CapabilityService.computeUserCapabilities(req.user!.userId,req.tenantId!).commercialModule;
  }
  static documentModule(row: any): string {
    return JSON.parse(row.professional_snapshot_json || '{}').consentModule || db.prepare('SELECT module FROM consent_templates WHERE id=?').get(row.template_id)?.module || 'general';
  }
  static access(req: Request, patientId?: string): void {
    if (!req.tenantId || !req.user || !['clinic_admin', 'professional', 'receptionist'].includes(req.user.role)) consentError('Acesso restrito.', 403);
    if (patientId) {
      if (!db.prepare('SELECT id FROM patients WHERE id=? AND tenant_id=?').get(patientId, req.tenantId)) consentError('Paciente não encontrado.', 404);
      if (!hasConsentAccess(req, patientId)) consentError('Sem vínculo autorizado com este paciente.', 403);
    }
  }

  static audit(req: Request, tenantId: string, consentId: string | null, action: string, details: object = {}): void {
    db.prepare('INSERT INTO consent_audit_logs(id,tenant_id,consent_id,action,actor_id,ip_address,user_agent,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id(),tenantId,consentId,action,req.user?.userId || null,req.ip || req.socket.remoteAddress,req.get('user-agent')?.slice(0,1000),JSON.stringify(details),now());
  }

  static templates(req: Request): any[] {
    this.access(req);
    const isReceptionist = req.user?.role === 'receptionist';
    const userCaps = !isReceptionist ? CapabilityService.computeUserCapabilities(req.user!.userId, req.tenantId!) : null;
    return db.prepare(`SELECT t.*,v.id AS version_id,v.title,v.content,v.content_hash,v.created_at AS version_created_at
      FROM consent_templates t JOIN consent_template_versions v ON v.template_id=t.id AND v.version=t.current_version
      WHERE (t.tenant_id=? OR t.tenant_id IS NULL) AND t.active=1 ORDER BY t.tenant_id DESC,t.module,v.title`).all(req.tenantId)
      .filter(t => isReceptionist || (this.allowedModule(req, t.module) && (!t.profession_id || t.profession_id === userCaps?.professionId)));
  }

  static saveTemplate(req: Request, templateId?: string): any {
    this.access(req);
    if (req.user?.role === 'receptionist') consentError('Recepcionistas não possuem permissão para criar ou editar modelos de termos.', 403);
    const b = req.body;
    if(!this.allowedModule(req,text(b.module,100)||'general')) consentError('Módulo não autorizado para sua profissão.',403);
    const professionId = CapabilityService.computeUserCapabilities(req.user!.userId,req.tenantId!).professionId;
    if(b.professionId && b.professionId!==professionId && req.user?.role !== 'clinic_admin') consentError('Profissão não autorizada.',403);
    if (typeof b.title !== 'string' || b.title.trim().length < 3 || b.title.length > 180 || typeof b.content !== 'string' || b.content.trim().length < 20 || b.content.length > 60000) consentError('Informe título (3–180 caracteres) e conteúdo (20–60.000 caracteres).');
    if (b.serviceId && !db.prepare('SELECT id FROM services WHERE id=? AND tenant_id=?').get(b.serviceId,req.tenantId)) consentError('Serviço inválido.');
    const existing = templateId ? db.prepare('SELECT * FROM consent_templates WHERE id=? AND tenant_id=?').get(templateId,req.tenantId) : null;
    if (templateId && !existing) consentError('Duplique o modelo padrão para editar na sua clínica.',404);
    if(existing && !this.allowedModule(req,existing.module)) consentError('Modelo de outra área profissional.',403);
    if(existing?.profession_id && professionId && existing.profession_id!==professionId && req.user?.role !== 'clinic_admin') consentError('Modelo de outra profissão.',403);
    if(existing && (text(b.module,100)||'general')!==existing.module && db.prepare('SELECT professional_snapshot_json FROM patient_consents WHERE template_id=? AND template_version_id IS NOT NULL').all(existing.id).some(r=>!JSON.parse(r.professional_snapshot_json||'{}').consentModule)) consentError('Este modelo possui documentos anteriores. Duplique-o para alterar a área sem modificar o acesso ao histórico.',409);
    const template = templateId || id();
    const versionId = id();
    const version = (existing?.current_version || 0) + 1;
    db.transaction(() => {
      if (existing) db.prepare('UPDATE consent_templates SET module=?,service_id=?,procedure_name=?,required=?,current_version=? WHERE id=? AND tenant_id=?')
        .run(text(b.module,100)||'general',b.serviceId||null,text(b.procedureName,180)||null,b.required===true?1:0,version,template,req.tenantId);
      else db.prepare('INSERT INTO consent_templates(id,tenant_id,module,service_id,procedure_name,required,current_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(template,req.tenantId,text(b.module,100)||'general',b.serviceId||null,text(b.procedureName,180)||null,b.required===true?1:0,version,req.user!.userId,now());
      db.prepare('INSERT INTO consent_template_versions(id,template_id,version,title,content,content_hash,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(versionId,template,version,b.title.trim(),b.content.trim(),contentHash(b.title.trim(),b.content.trim()),req.user!.userId,now());
      db.prepare('UPDATE consent_templates SET profession_id=? WHERE id=? AND tenant_id=?').run(b.professionId||null,template,req.tenantId);
      this.audit(req,req.tenantId!,null,'template_version_created',{templateId:template,version});
    })();
    return {id:template,version,versionId};
  }

  static settings(req: Request): any {
    this.access(req);
    const professionId = req.user?.role === 'receptionist' ? null : CapabilityService.computeUserCapabilities(req.user!.userId,req.tenantId!).professionId;
    return {
      ...(db.prepare('SELECT auth_level,link_hours,photo_requested FROM consent_settings WHERE tenant_id=?').get(req.tenantId) || {auth_level:'recommended',link_hours:168,photo_requested:0}),
      profession_id: professionId || '',
      profession_name: (professionId && db.prepare('SELECT name FROM professions WHERE id=?').get(professionId)?.name) || professionId || ''
    };
  }
  static saveSettings(req: Request): any {
    this.access(req);
    if (req.user!.role !== 'clinic_admin') consentError('Somente o gerenciador configura a clínica.',403);
    const {authLevel,linkHours} = req.body;
    const photoRequested=req.body.photoRequested===undefined?!!this.settings(req).photo_requested:req.body.photoRequested===true;
    if (!['basic','recommended','reinforced'].includes(authLevel) || !Number.isInteger(linkHours) || linkHours<1 || linkHours>720) consentError('Configuração inválida.');
    db.prepare('INSERT INTO consent_settings(tenant_id,auth_level,link_hours) VALUES(?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET auth_level=excluded.auth_level,link_hours=excluded.link_hours').run(req.tenantId,authLevel,linkHours);
    db.prepare('UPDATE consent_settings SET photo_requested=? WHERE tenant_id=?').run(photoRequested?1:0,req.tenantId);
    this.audit(req,req.tenantId!,null,'settings_updated',{authLevel,linkHours});
    return this.settings(req);
  }

  static minor(patient: any): boolean {
    if (patient.is_child) return true;
    if (!patient.birth_date || !/^\d{4}-\d{2}-\d{2}/.test(patient.birth_date)) return false;
    const eighteenth = new Date(`${patient.birth_date.slice(0,10)}T12:00:00Z`);
    eighteenth.setUTCFullYear(eighteenth.getUTCFullYear()+18);
    return eighteenth.getTime()>Date.now();
  }

  static issue(req: Request, patientId: string): any {
    this.access(req,patientId);
    const template = this.templates(req).find(t => t.id===req.body.templateId);
    if (!template) consentError('Modelo não encontrado.',404);
    const patient = db.prepare('SELECT * FROM patients WHERE id=? AND tenant_id=?').get(patientId,req.tenantId);
    if(req.body.signerEmail!==undefined) {
      const email=text(req.body.signerEmail,254);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) consentError('Informe um e-mail válido para o paciente.');
      if(this.minor(patient)||req.body.guardian) consentError('Use o e-mail do responsável legal.');
      db.prepare('UPDATE patients SET email=? WHERE id=? AND tenant_id=?').run(email,patientId,req.tenantId);
      patient.email=email;
    }
    const clinic = db.prepare('SELECT name,cnpj_cpf,phone,email,logo_url FROM tenants WHERE id=?').get(req.tenantId);
    const professional = db.prepare('SELECT id,name,registration_type,registration_number FROM professionals WHERE user_id=? AND tenant_id=? AND active=1').get(req.user!.userId,req.tenantId);
    const capabilities=CapabilityService.computeUserCapabilities(req.user!.userId,req.tenantId!);
    const requester = {...(professional || {id:req.user!.userId,name:req.user!.name}),consentModule:template.module,consentProfession:template.profession_id||null,professionId:capabilities.professionId};
    let signer: any = {kind:'patient',name:patient.full_name,cpf:patient.cpf,email:patient.email,phone:patient.whatsapp || patient.phone};
    if (req.body.guardian) {
      const g=req.body.guardian;
      const cpf=text(g.cpf,20).replace(/\D/g,'');
      if (text(g.name,180).length<3 || !this.validCpf(cpf) || text(g.relationship,80).length<2 || text(g.phone,30).replace(/\D/g,'').length<10 || (g.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(g.email,254)))) consentError('Preencha nome, CPF válido, parentesco, telefone e e-mail válido do responsável.');
      signer={kind:'guardian',name:text(g.name,180),cpf,relationship:text(g.relationship,80),phone:text(g.phone,30),email:text(g.email,254)};
    }
    if (this.minor(patient) && signer.kind!=='guardian') consentError('Paciente menor de idade: informe o responsável legal.');
    const settings=this.settings(req);
    requester.photoRequested=typeof req.body.photoRequested==='boolean'?req.body.photoRequested:!!settings.photo_requested;
    const consentId=id();
    const created=now();
    const expires=new Date(Date.now()+settings.link_hours*3600000).toISOString();
    db.transaction(() => {
      db.prepare(`INSERT INTO patient_consents(id,tenant_id,patient_id,professional_id,consent_type,title,version,content_text,status,
        template_id,template_version_id,document_hash,required,auth_level,signer_json,patient_snapshot_json,clinic_snapshot_json,professional_snapshot_json,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(consentId,req.tenantId,patientId,professional?.id||null,'universal',template.title,String(template.current_version),template.content,'pending',template.id,template.version_id,template.content_hash,template.required,settings.auth_level,JSON.stringify(signer),JSON.stringify({id:patient.id,name:patient.full_name,birthDate:patient.birth_date}),JSON.stringify(clinic),JSON.stringify(requester),created,expires);
      if(signer.kind==='guardian' && signer.email) db.prepare("UPDATE guardians SET email=? WHERE tenant_id=? AND patient_id=? AND REPLACE(REPLACE(cpf,'.',''),'-','')=?").run(signer.email,req.tenantId,patientId,signer.cpf);
      this.audit(req,req.tenantId!,consentId,'requested',{version:template.current_version});
    })();
    return this.newLink(req,consentId);
  }

  static validCpf(cpf: string): boolean {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let size=9;size<=10;size++) {
      const sum=cpf.slice(0,size).split('').reduce((s,d,i)=>s+Number(d)*(size+1-i),0);
      if (Number(cpf[size])!==((sum*10)%11)%10) return false;
    }
    return true;
  }

  static document(req: Request, consentId: string): any {
    const row=db.prepare('SELECT * FROM patient_consents WHERE id=? AND tenant_id=? AND template_version_id IS NOT NULL').get(consentId,req.tenantId);
    if (!row) consentError('Termo não encontrado.',404);
    this.access(req,row.patient_id);
    if(!hasConsentDocumentAccess(req,row.id)) consentError('Termo de outra área profissional.',403);
    return row;
  }
  static invalidated(consentId: string): boolean { return !!db.prepare('SELECT id FROM consent_invalidations WHERE consent_id=?').get(consentId); }

  static newLink(req: Request, consentId: string): any {
    const row=this.document(req,consentId);
    if (row.status!=='pending' || this.invalidated(consentId)) consentError('Este termo não aceita novas assinaturas.',409);
    const token=crypto.randomBytes(32).toString('base64url');
    const settings=this.settings(req);
    const expires=new Date(Date.now()+settings.link_hours*3600000).toISOString();
    db.transaction(() => {
      db.prepare('UPDATE consent_access_tokens SET revoked_at=? WHERE consent_id=? AND revoked_at IS NULL AND used_at IS NULL').run(now(),consentId);
      db.prepare('INSERT INTO consent_access_tokens(id,consent_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').run(id(),consentId,consentHash(token),expires,now());
      db.prepare('UPDATE patient_consents SET expires_at=? WHERE id=?').run(expires,consentId);
      this.audit(req,req.tenantId!,consentId,'link_created');
    })();
    return {id:consentId,url:`${consentBaseUrl()}/assinar-termo/${token}`,expiresAt:expires};
  }

  static token(raw: string): any {
    if (!/^[\w-]{43}$/.test(raw)) consentError('Link inválido ou indisponível.',410);
    const token=db.prepare('SELECT * FROM consent_access_tokens WHERE token_hash=?').get(consentHash(raw));
    if (!token || token.revoked_at || token.used_at || Date.parse(token.expires_at)<=Date.now()) consentError('Link expirado, cancelado ou já utilizado.',410);
    const row=db.prepare('SELECT * FROM patient_consents WHERE id=?').get(token.consent_id);
    if (!row || row.status!=='pending' || this.invalidated(row.id)) consentError('Termo indisponível para assinatura.',410);
    const tenant=db.prepare('SELECT status FROM tenants WHERE id=?').get(row.tenant_id);
    if (!tenant || tenant.status!=='active') consentError('Clínica indisponível.',410);
    return {token,row};
  }

  static publicDocument(req: Request, raw: string): any {
    const {token,row}=this.token(raw);
    this.audit(req,row.tenant_id,row.id,'link_opened');
    const signer=JSON.parse(row.signer_json);
    return {title:row.title,content:row.content_text,version:row.version,documentHash:row.document_hash,
      clinic:JSON.parse(row.clinic_snapshot_json),patient:{name:JSON.parse(row.patient_snapshot_json).name},
      signer:{name:signer.name,kind:signer.kind,relationship:signer.relationship},authLevel:row.auth_level,expiresAt:token.expires_at,
      destinations:{email:signer.email?maskedContact(signer.email,'email'):null},
      photoRequested:JSON.parse(row.professional_snapshot_json).photoRequested ?? row.auth_level==='reinforced',
      declarations:consentDeclarations,otpVerified:!!token.otp_verified_at && Date.parse(token.otp_expires_at)>Date.now(),
      channels:signer.email?['email']:[]};
  }

  static async deliver(channel: string, signer: any, subject: string, message: string, html?: string): Promise<boolean> {
    if (channel==='email' && signer.email) return EmailService.sendCustomEmail(signer.email,subject,html || buildZemdaEmailLayout({title:subject,headline:subject,contentHtml:`<p>${escapeHtml(message)}</p>`}));

    consentError('Canal indisponível. Atualize os contatos antes de solicitar o termo.');
  }
  static async sendLink(req: Request, consentId: string): Promise<any> {
    const row=this.document(req,consentId);
    const signer=JSON.parse(row.signer_json);
    const channel=req.body.channel||'email';
    if(channel==='email'&&!signer.email) consentError(signer.kind==='guardian'?'O responsável legal não possui e-mail cadastrado para validação da assinatura.':'Este paciente não possui e-mail cadastrado para validação da assinatura.');
    if (channel!=='email') consentError('Somente envio por e-mail está disponível para termos.');
    if(!signer.email) consentError('Canal indisponível. Atualize os contatos ou use assinatura neste dispositivo.');
    const link=this.newLink(req,consentId);
    const clinicName=escapeHtml(JSON.parse(row.clinic_snapshot_json).name);
    const ok=await this.deliver(channel,signer,'Assinatura de termo — Zemda',`Você recebeu um termo de ${JSON.parse(row.clinic_snapshot_json).name}. Acesse ${link.url} para ler e assinar. O link expira em ${link.expiresAt}.`,buildZemdaEmailLayout({title:'Assinatura de termo — Zemda',headline:'Revise e assine seu documento',badge:'Termos & Consentimentos',contentHtml:`<p>Olá, ${escapeHtml(signer.name)}.</p><p>${clinicName} enviou um documento para sua revisão e assinatura.</p><p>O link é temporário e não exige cadastro no Zemda.</p>`,ctaText:'Revisar e assinar documento',ctaUrl:escapeHtml(link.url),footerNote:'Não compartilhe este link. Caso tenha dúvidas, entre em contato com a clínica.'}));
    if (!ok) { this.audit(req,row.tenant_id,row.id,'delivery_failed',{channel}); consentError('O provedor não confirmou o envio. Você pode copiar o link ou tentar novamente.',503); }
    db.prepare('UPDATE patient_consents SET sent_at=? WHERE id=? AND status=?').run(now(),consentId,'pending');
    this.audit(req,row.tenant_id,row.id,'link_sent',{channel});
    return link;
  }

  static async requestOtp(req: Request, raw: string): Promise<any> {
    const {token,row}=this.token(raw);
    const signer=JSON.parse(row.signer_json);
    const channel=req.body.channel;
    if(channel==='email'&&!signer.email) consentError(signer.kind==='guardian'?'O responsável legal não possui e-mail cadastrado para validação da assinatura.':'Este paciente não possui e-mail cadastrado para validação da assinatura.');
    if (channel!=='email' || !signer.email) consentError('Canal de autenticação indisponível.');
    if (token.otp_sent_at && Date.now()-Date.parse(token.otp_sent_at)<60000) consentError('Aguarde 60 segundos para reenviar.',429);
    if (db.prepare("SELECT count(*) AS n FROM consent_audit_logs WHERE consent_id=? AND action='otp_requested' AND created_at>?").get(row.id,new Date(Date.now()-3600000).toISOString()).n>=5) consentError('Limite de códigos atingido. Tente em uma hora.',429);
    const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
    const salt=crypto.randomBytes(16).toString('hex');
    const hash=crypto.scryptSync(code,salt,32).toString('hex');
    db.prepare('UPDATE consent_access_tokens SET otp_hash=?,otp_salt=?,otp_expires_at=?,otp_sent_at=?,otp_verified_at=NULL,otp_attempts=0,otp_channel=? WHERE id=?')
      .run(hash,salt,new Date(Date.now()+600000).toISOString(),now(),channel,token.id);
    this.audit(req,row.tenant_id,row.id,'otp_requested',{channel});
    const details={channel,signerKind:signer.kind,destination:maskedContact(channel==='email'?signer.email:signer.phone,channel),verificationId:token.id};
    this.audit(req,row.tenant_id,row.id,token.otp_sent_at?'OTP_RESENT':'OTP_REQUESTED',details);
    if (!await this.deliver(channel,signer,'Código para assinatura — Zemda',`Seu código de confirmação do termo é ${code}. Validade: 10 minutos. Não compartilhe este código.`,buildZemdaEmailLayout({title:'Código para assinatura — Zemda',headline:'Confirme a assinatura do documento',badge:'Segurança & Acesso',contentHtml:`<p>Olá, ${escapeHtml(signer.name)}.</p><p>Use o código abaixo para confirmar sua assinatura do documento enviado por ${escapeHtml(JSON.parse(row.clinic_snapshot_json).name)}.</p>${buildZemdaOtpBox(code)}`,footerNote:'Não compartilhe este código. Se você não solicitou a assinatura, ignore esta mensagem.'}))) {
      db.prepare('UPDATE consent_access_tokens SET otp_hash=NULL WHERE id=? AND otp_hash=?').run(token.id,hash);
      this.audit(req,row.tenant_id,row.id,'otp_delivery_failed',{channel});
      consentError('Não foi possível enviar o código. Tente novamente mais tarde.',503);
    }
    this.audit(req,row.tenant_id,row.id,'OTP_SENT',details);
    return {success:true,cooldownSeconds:60,destination:details.destination};
  }

  static verifyOtp(req: Request, raw: string): any {
    const {token,row}=this.token(raw);
    const signer=JSON.parse(row.signer_json);
    const details={channel:token.otp_channel,signerKind:signer.kind,verificationId:token.id,destination:token.otp_channel?maskedContact(signer[token.otp_channel==='email'?'email':'phone'],token.otp_channel):null};
    if (token.otp_verified_at) consentError('Código já utilizado.',409);
    if (!token.otp_hash || Date.parse(token.otp_expires_at)<=Date.now()) {
      db.prepare('UPDATE consent_access_tokens SET otp_hash=NULL,otp_salt=NULL WHERE id=?').run(token.id);
      this.audit(req,row.tenant_id,row.id,'OTP_EXPIRED',details);
      consentError('Código expirado. Solicite outro.');
    }
    if (token.otp_attempts>=5) {
      this.audit(req,row.tenant_id,row.id,'OTP_TOO_MANY_ATTEMPTS',details);
      consentError('Limite de tentativas atingido. Solicite outro código.',429);
    }
    const code=typeof req.body.code==='string'?req.body.code:'';
    const valid=/^\d{6}$/.test(code) && crypto.timingSafeEqual(crypto.scryptSync(code,token.otp_salt,32),Buffer.from(token.otp_hash,'hex'));
    db.prepare('UPDATE consent_access_tokens SET otp_attempts=otp_attempts+1 WHERE id=?').run(token.id);
    this.audit(req,row.tenant_id,row.id,valid?'otp_verified':'otp_failed');
    this.audit(req,row.tenant_id,row.id,valid?'OTP_VALIDATED':'OTP_INVALID',details);
    if (!valid) consentError('Código inválido.');
    db.prepare('UPDATE consent_access_tokens SET otp_verified_at=?,otp_hash=NULL,otp_salt=NULL WHERE id=?').run(now(),token.id);
    return {success:true};
  }

  static async image(data: unknown, photo=false): Promise<string> {
    if (typeof data!=='string' || data.length>4000000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data)) consentError('Imagem inválida ou muito grande.');
    const buffer=Buffer.from(data.split(',')[1],'base64');
    try {
      const image=sharp(buffer,{limitInputPixels:12000000});
      const meta=await image.metadata();
      if (!meta.width || !meta.height || meta.width<20 || meta.height<20 || (meta.pages || 1)>1) consentError('Imagem inválida.');
      if (!photo) {
        const stats=await image.flatten({background:'#ffffff'}).stats();
        if (stats.channels.every(c => c.stdev<1)) consentError('Desenhe sua assinatura antes de confirmar.');
      }
      const clean=await image.rotate().resize({width:photo?800:1200,height:photo?800:400,fit:'inside',withoutEnlargement:true}).png().toBuffer();
      return `data:image/png;base64,${clean.toString('base64')}`;
    } catch(e: any) { if(e.status) throw e; consentError('Não foi possível validar a imagem.'); }
  }

  static async sign(req: Request, raw: string): Promise<any> {
    const initial=this.token(raw);
    if (!Array.isArray(req.body.declarations) || req.body.declarations.length!==3 || !req.body.declarations.every((v: unknown)=>v===true)) consentError('Aceite as três declarações antes de assinar.');
    if (req.body.documentHash!==initial.row.document_hash) consentError('Documento não corresponde à versão apresentada.',409);
    const photoRequested=JSON.parse(initial.row.professional_snapshot_json).photoRequested ?? initial.row.auth_level==='reinforced';
    if(photoRequested && (!req.body.photoDataUrl || req.body.photoAccepted!==true)) consentError('Registre e confirme a foto do assinante para concluir esta assinatura.');
    if (req.body.photoDataUrl && (!photoRequested || req.body.photoAccepted!==true)) consentError('A foto exige solicitação do profissional e confirmação do assinante.');
    const signature=await this.image(req.body.signatureDataUrl);
    const photo=req.body.photoDataUrl?await this.image(req.body.photoDataUrl,true):null;
    return db.transaction(() => {
      // Check again inside the transaction: expiration, cancellation, OTP and concurrent submissions.
      const {token,row}=this.token(raw);
      if (row.auth_level!=='basic' && (!token.otp_verified_at || token.otp_attempts>5 || Date.parse(token.otp_expires_at)<=Date.now())) consentError('Confirme um código válido antes de assinar.');
      const signedAt=now();
      const signatureId=id();
      const verificationCode=crypto.randomBytes(24).toString('base64url');
      const evidence={signatureId,consentId:row.id,tenantId:row.tenant_id,patient:JSON.parse(row.patient_snapshot_json),signer:JSON.parse(row.signer_json),
        clinic:JSON.parse(row.clinic_snapshot_json),professional:JSON.parse(row.professional_snapshot_json),templateId:row.template_id,versionId:row.template_version_id,
        title:row.title,version:row.version,contentHash:row.document_hash,signatureImageHash:consentHash(signature),photoHash:photo?consentHash(photo):null,
        module:this.documentModule(row),profession:JSON.parse(row.professional_snapshot_json).professionId||null,verificationId:verificationCode,
        authenticationRecipient:token.otp_channel?maskedContact(JSON.parse(row.signer_json)[token.otp_channel==='email'?'email':'phone'],token.otp_channel):null,
        authLevel:row.auth_level,authMethod:`${row.auth_level==='basic'?'handwritten':`handwritten+otp_${token.otp_channel}`}${photo?'+photo':''}`,
        otpVerified:!!token.otp_verified_at,otpVerifiedAt:token.otp_verified_at||null,ip:req.ip || req.socket.remoteAddress,
        userAgent:req.get('user-agent')?.slice(0,1000)||'',browser:req.get('sec-ch-ua')?.slice(0,500)||req.get('user-agent')?.slice(0,1000)||'',
        device:req.get('sec-ch-ua-platform')?.slice(0,100)||(/Android|iPhone|iPad/i.test(req.get('user-agent')||'')?'Mobile/tablet':'Desktop ou não informado'),
        declarations:consentDeclarations,photoPurpose:photo?'Registro fotográfico opcional como evidência da sessão de assinatura; sem reconhecimento facial.':null,
        createdAt:row.created_at,sentAt:row.sent_at,openedAt:db.prepare("SELECT MIN(created_at) AS opened_at FROM consent_audit_logs WHERE consent_id=? AND action='link_opened'").get(row.id).opened_at||null,signedAt};
      if (contentHash(row.title,row.content_text)!==row.document_hash) consentError('Integridade do documento inválida.',409);
      db.prepare('UPDATE patient_consents SET status=?,accepted_at=?,accepted_by_name=?,signature_data_url=?,signature_hash=?,signed_by_cpf=? WHERE id=?')
        .run('accepted',signedAt,evidence.signer.name,signature,consentHash(JSON.stringify(evidence)),evidence.signer.cpf||null,row.id);
      db.prepare('INSERT INTO consent_signatures(id,consent_id,verification_code,evidence_json,evidence_hash,signature_data_url,photo_data_url,signed_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(signatureId,row.id,verificationCode,JSON.stringify(evidence),consentHash(JSON.stringify(evidence)),signature,photo,signedAt);
      db.prepare('UPDATE consent_access_tokens SET used_at=?,otp_hash=NULL,otp_salt=NULL WHERE id=?').run(signedAt,token.id);
      db.prepare('UPDATE consent_access_tokens SET revoked_at=? WHERE consent_id=? AND id<>? AND revoked_at IS NULL').run(signedAt,row.id,token.id);
      this.audit(req,row.tenant_id,row.id,'signed',{signatureId});
      return {success:true,signatureId,verificationUrl:`${consentBaseUrl()}/verificar/${verificationCode}`};
    })();
  }

  static cancel(req: Request, consentId: string): any {
    const row=this.document(req,consentId);
    if (req.user?.role === 'receptionist' && (row.accepted_at || row.signed_at)) {
      consentError('Apenas profissionais clínicos ou administradores podem invalidar termos assinados.', 403);
    }
    const reason=text(req.body.reason,1000);
    if (reason.length<5) consentError('Informe o motivo do cancelamento (mínimo 5 caracteres).');
    if (this.invalidated(consentId)) consentError('Termo já cancelado.',409);
    db.transaction(() => {
      db.prepare('INSERT INTO consent_invalidations(id,consent_id,reason,actor_id,created_at) VALUES(?,?,?,?,?)').run(id(),consentId,reason,req.user!.userId,now());
      db.prepare('UPDATE consent_access_tokens SET revoked_at=?,otp_hash=NULL,otp_salt=NULL,otp_verified_at=NULL,otp_expires_at=NULL WHERE consent_id=? AND revoked_at IS NULL').run(now(),consentId);
      this.audit(req,row.tenant_id,row.id,row.status==='pending'?'cancelled':'invalidated',{reason});
    })();
    return {success:true};
  }

  static list(req: Request, patientId: string): any {
    this.access(req,patientId);
    const rows=db.prepare(`SELECT p.*,s.id AS signature_id,s.signed_at,s.verification_code,s.evidence_json,
      i.reason AS invalidation_reason,i.created_at AS invalidated_at,t.current_version,pr.name AS professional_name
      FROM patient_consents p LEFT JOIN consent_signatures s ON s.consent_id=p.id
      LEFT JOIN consent_invalidations i ON i.consent_id=p.id LEFT JOIN consent_templates t ON t.id=p.template_id
      LEFT JOIN professionals pr ON pr.id=p.professional_id WHERE p.tenant_id=? AND p.patient_id=? ORDER BY p.created_at DESC`).all(req.tenantId,patientId);
    return rows.filter(r=>!r.template_version_id||hasConsentDocumentAccess(req,r.id)).map(r => ({id:r.id,title:r.title,module:this.documentModule(r),profession:r.professional_snapshot_json?JSON.parse(r.professional_snapshot_json).professionId:null,patient:r.patient_snapshot_json?JSON.parse(r.patient_snapshot_json).name:null,version:r.version,templateId:r.template_id,legacy:!r.template_version_id,
      status:r.invalidated_at || r.revoked_at?'cancelled':r.template_version_id && Number(r.version)<r.current_version
        && !rows.some(latest=>latest.template_id===r.template_id && Number(latest.version)===r.current_version && latest.signed_at && !latest.invalidated_at && !latest.revoked_at)
        ?'needs_signature':r.accepted_at?'signed':'pending',
      createdAt:r.created_at,sentAt:r.sent_at,signedAt:r.signed_at||r.accepted_at,expiresAt:r.expires_at,required:!!r.required,
      signer:r.signer_json?JSON.parse(r.signer_json):{name:r.accepted_by_name},professional:r.professional_snapshot_json?JSON.parse(r.professional_snapshot_json).name:r.professional_name,
      authMethod:r.evidence_json?JSON.parse(r.evidence_json).authMethod:null,
      authLabel:r.evidence_json?consentAuthenticationLabel(JSON.parse(r.evidence_json).authMethod):r.template_version_id?(r.auth_level==='basic'?'Assinatura manuscrita (aguardando)': 'Assinatura e OTP (aguardando)'):'Registro anterior, sem OTP documentado',
      signatureId:r.signature_id,reason:r.invalidation_reason}));
  }

  static pending(req: Request, patientId: string, serviceId?: string): any {
    this.access(req, patientId);
    if (serviceId && !db.prepare('SELECT id FROM services WHERE id=? AND tenant_id=?').get(serviceId, req.tenantId)) consentError('Serviço inválido.');

    const allTemplates = this.templates(req);
    const requiredTemplates = allTemplates.filter(t => t.tenant_id === req.tenantId && t.required && (!serviceId || !t.service_id || t.service_id === serviceId));
    const rows = this.list(req, patientId);

    const appointments = db.prepare(`SELECT * FROM appointments WHERE tenant_id=? AND patient_id=?${serviceId ? ' AND service_id=?' : ''}`).all(...(serviceId ? [req.tenantId, patientId, serviceId] : [req.tenantId, patientId]));
    const modules = new Set(appointments.map(a => resolveClinicalModule(a, req.tenantId)));
    for (const record of db.prepare('SELECT DISTINCT module_type FROM records WHERE tenant_id=? AND patient_id=?').all(req.tenantId, patientId)) {
      modules.add(record.module_type);
    }

    const relevantMandatory = requiredTemplates.filter(t =>
      t.module === 'general' ||
      (serviceId && t.service_id === serviceId) ||
      modules.has(t.module) ||
      rows.some((r: any) => r.templateId === t.id)
    );

    // 1. Modelos obrigatórios que nunca foram solicitados
    const missingTemplates = relevantMandatory.filter(t => !rows.some((r: any) => r.templateId === t.id));

    // 2. Solicitações ativas pendentes de assinatura
    const pendingRequests = rows.filter((r: any) =>
      r.status === 'pending' &&
      (!r.expiresAt || Date.parse(r.expiresAt) > Date.now()) &&
      !r.invalidated_at &&
      !r.revoked_at
    );

    // 3. Modelos obrigatórios com termo cancelado, expirado ou invalidado (sem versão assinada válida)
    const invalidMandatoryTemplates = relevantMandatory.filter(t => {
      const isSignedCurrent = rows.some((r: any) => r.templateId === t.id && Number(r.version) === t.current_version && r.status === 'signed');
      if (isSignedCurrent) return false;
      const hasActivePending = rows.some((r: any) => r.templateId === t.id && r.status === 'pending' && (!r.expiresAt || Date.parse(r.expiresAt) > Date.now()));
      if (hasActivePending) return false;
      return rows.some((r: any) =>
        r.templateId === t.id && (
          r.status === 'cancelled' ||
          r.status === 'needs_signature' ||
          (r.expiresAt && Date.parse(r.expiresAt) <= Date.now())
        )
      );
    });

    // 4. Aplicação estrita da prioridade de status (Seções 1 e 2 do Requisito):
    // 1. Faltam termos
    // 2. Aguardando assinatura
    // 3. Termo inválido / nova assinatura necessária
    // 4. Termos OK
    // Padrão: Termos (se nenhum obrigatório configurado/pendente)
    let status: 'missing_terms' | 'waiting_signature' | 'invalid_term' | 'ok' | 'default' = 'default';
    let label = 'Termos';

    if (missingTemplates.length > 0) {
      status = 'missing_terms';
      label = '⚠ Faltam termos';
    } else if (pendingRequests.length > 0) {
      status = 'waiting_signature';
      label = '⏳ Aguardando assinatura';
    } else if (invalidMandatoryTemplates.length > 0) {
      status = 'invalid_term';
      label = '✕ Termo inválido';
    } else if (relevantMandatory.length > 0 && relevantMandatory.every(t => rows.some((r: any) => r.templateId === t.id && Number(r.version) === t.current_version && r.status === 'signed'))) {
      status = 'ok';
      label = '✓ Termos OK';
    } else {
      status = 'default';
      label = 'Termos';
    }

    const pendingTerms = relevantMandatory.filter(t => !rows.some((r: any) => r.templateId === t.id && Number(r.version) === t.current_version && r.status === 'signed'));

    return {
      status,
      label,
      count: pendingTerms.length,
      missingCount: missingTemplates.length,
      waitingCount: pendingRequests.length,
      invalidCount: invalidMandatoryTemplates.length,
      signedCount: relevantMandatory.filter(t => rows.some((r: any) => r.templateId === t.id && Number(r.version) === t.current_version && r.status === 'signed')).length,
      requiredCount: relevantMandatory.length,
      terms: pendingTerms.map(t => ({ id: t.id, title: t.title, version: t.current_version, module: t.module, serviceId: t.service_id }))
    };
  }

  static signedDocument(req: Request, consentId: string): any {
    const row=this.document(req,consentId);
    const signature=db.prepare('SELECT * FROM consent_signatures WHERE consent_id=?').get(consentId);
    if (!signature) consentError('Termo ainda não assinado.',409);
    this.audit(req,row.tenant_id,row.id,'signed_document_read');
    return {row,signature,evidence:JSON.parse(signature.evidence_json),invalidated:this.invalidated(consentId),integrity:this.integrity(row,signature)};
  }
  static integrity(row: any, signature: any): boolean {
    try {
      const evidence=JSON.parse(signature.evidence_json);
      return contentHash(row.title,row.content_text)===row.document_hash && consentHash(signature.evidence_json)===signature.evidence_hash
      && evidence.contentHash===row.document_hash && evidence.signatureImageHash===consentHash(signature.signature_data_url)
      && evidence.photoHash===(signature.photo_data_url?consentHash(signature.photo_data_url):null)
      && evidence.signatureId===signature.id && evidence.consentId===row.id && evidence.versionId===row.template_version_id
      && evidence.templateId===row.template_id && evidence.version===row.version && evidence.title===row.title
      && evidence.tenantId===row.tenant_id && evidence.patient.id===row.patient_id
      && JSON.stringify(evidence.patient)===row.patient_snapshot_json && JSON.stringify(evidence.signer)===row.signer_json
      && JSON.stringify(evidence.clinic)===row.clinic_snapshot_json && JSON.stringify(evidence.professional)===row.professional_snapshot_json
      && signature.evidence_hash===row.signature_hash && signature.signature_data_url===row.signature_data_url
      && evidence.signedAt===signature.signed_at && evidence.signedAt===row.accepted_at;
    } catch { return false; }
  }
  static verify(code: string): any {
    if (!/^[\w-]{32}$/.test(code)) consentError('Documento não encontrado.',404);
    const s=db.prepare('SELECT * FROM consent_signatures WHERE verification_code=?').get(code);
    if (!s) consentError('Documento não encontrado.',404);
    const row=db.prepare('SELECT * FROM patient_consents WHERE id=?').get(s.consent_id);
    const e=JSON.parse(s.evidence_json);
    return {authentic:!this.invalidated(row.id),integrity:this.integrity(row,s),signedAt:s.signed_at,clinic:e.clinic.name,title:e.title,
      signatureId:s.id,version:row.version,hashFragment:row.document_hash.slice(0,20),status:this.invalidated(row.id)?'invalidated':'signed'};
  }
  static qr(url: string): Promise<string> { return QRCode.toDataURL(url,{errorCorrectionLevel:'M',margin:4,width:256}); }
}
