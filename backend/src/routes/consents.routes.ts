import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { ConsentService as S } from '../services/consent.service';
import { writeConsentPdf } from '../services/consent-pdf.service';
import { requireTenant } from '../middlewares/tenant.middleware';

const wrap=(fn:(req:Request,res:Response)=>unknown) => (req:Request,res:Response,next:NextFunction):void => {
  Promise.resolve().then(()=>fn(req,res)).catch((e:any)=>{
    if(res.headersSent) { next(e); return; }
    if(e.status) res.status(e.status).json({error:e.message});
    else { console.error('[Consents]',e.code || e.name); res.status(500).json({error:'Não foi possível processar o termo.'}); }
  });
};
const noStore=(_req:Request,res:Response,next:NextFunction) => {
  res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer'); next();
};
export function mountPublicConsentRoutes(api:Router):void {
  const router=Router();
  router.use(noStore,rateLimit({windowMs:15*60*1000,limit:100,standardHeaders:true,legacyHeaders:false,message:{error:'Muitas tentativas. Aguarde alguns minutos.'}}));
  const otpLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false,message:{error:'Muitas tentativas de autenticação.'}});
  // Bearer signing tokens stay in JSON bodies, so access logs never contain them.
  router.post('/read',wrap((req,res)=>res.json(S.publicDocument(req,req.body.token))));
  router.post('/otp/request',otpLimiter,wrap(async(req,res)=>res.json(await S.requestOtp(req,req.body.token))));
  router.post('/otp/verify',otpLimiter,wrap((req,res)=>res.json(S.verifyOtp(req,req.body.token))));
  router.post('/sign',wrap(async(req,res)=>res.json(await S.sign(req,req.body.token))));
  router.get('/verify/:code',wrap((req,res)=>res.json(S.verify(String(req.params.code)))));
  api.use('/v1/public/consents',router);
}
export function mountConsentRoutes(api:Router):void {
  const router=Router();
  router.use(requireTenant,noStore);
  router.get('/templates',wrap((req,res)=>res.json(S.templates(req))));
  router.post('/templates',wrap((req,res)=>res.status(201).json(S.saveTemplate(req))));
  router.put('/templates/:id',wrap((req,res)=>res.json(S.saveTemplate(req,String(req.params.id)))));
  router.get('/settings',wrap((req,res)=>res.json(S.settings(req))));
  router.put('/settings',wrap((req,res)=>res.json(S.saveSettings(req))));
  router.get('/patients/:patientId',wrap((req,res)=>res.json(S.list(req,String(req.params.patientId)))));
  router.get('/patients/:patientId/pending',wrap((req,res)=>res.json(S.pending(req,String(req.params.patientId),typeof req.query.serviceId==='string'?req.query.serviceId:undefined))));
  const withQr=async(result:any)=>({...result,qrCode:await S.qr(result.url)});
  router.post('/patients/:patientId/request',wrap(async(req,res)=>res.status(201).json(await withQr(S.issue(req,String(req.params.patientId))))));
  router.post('/:id/link',wrap(async(req,res)=>res.json(await withQr(S.newLink(req,String(req.params.id))))));
  router.post('/:id/send',wrap(async(req,res)=>res.json(await withQr(await S.sendLink(req,String(req.params.id))))));
  router.post('/:id/cancel',wrap((req,res)=>res.json(S.cancel(req,String(req.params.id)))));
  router.get('/:id/document',wrap((req,res)=>{
    const data=S.signedDocument(req,String(req.params.id));
    res.json({title:data.row.title,content:data.row.content_text,evidence:data.evidence,signature:data.signature.signature_data_url,photo:data.signature.photo_data_url,integrity:data.integrity,invalidated:data.invalidated});
  }));
  router.get('/:id/pdf',wrap(async(req,res)=>writeConsentPdf(S.signedDocument(req,String(req.params.id)),res)));
  api.use('/v1/consents',router);
}
