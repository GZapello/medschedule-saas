"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountPublicConsentRoutes = mountPublicConsentRoutes;
exports.mountConsentRoutes = mountConsentRoutes;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const consent_service_1 = require("../services/consent.service");
const consent_pdf_service_1 = require("../services/consent-pdf.service");
const tenant_middleware_1 = require("../middlewares/tenant.middleware");
const wrap = (fn) => (req, res, next) => {
    Promise.resolve().then(() => fn(req, res)).catch((e) => {
        if (res.headersSent) {
            next(e);
            return;
        }
        if (e.status)
            res.status(e.status).json({ error: e.message });
        else {
            console.error('[Consents]', e.code || e.name);
            res.status(500).json({ error: 'Não foi possível processar o termo.' });
        }
    });
};
const noStore = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
};
function mountPublicConsentRoutes(api) {
    const router = (0, express_1.Router)();
    router.use(noStore, (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } }));
    const otpLimiter = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas de autenticação.' } });
    // Bearer signing tokens stay in JSON bodies, so access logs never contain them.
    router.post('/read', wrap((req, res) => res.json(consent_service_1.ConsentService.publicDocument(req, req.body.token))));
    router.post('/otp/request', otpLimiter, wrap(async (req, res) => res.json(await consent_service_1.ConsentService.requestOtp(req, req.body.token))));
    router.post('/otp/verify', otpLimiter, wrap((req, res) => res.json(consent_service_1.ConsentService.verifyOtp(req, req.body.token))));
    router.post('/sign', wrap(async (req, res) => res.json(await consent_service_1.ConsentService.sign(req, req.body.token))));
    router.get('/verify/:code', wrap((req, res) => res.json(consent_service_1.ConsentService.verify(String(req.params.code)))));
    api.use('/v1/public/consents', router);
}
function mountConsentRoutes(api) {
    const router = (0, express_1.Router)();
    router.use(tenant_middleware_1.requireTenant, noStore);
    router.get('/templates', wrap((req, res) => res.json(consent_service_1.ConsentService.templates(req))));
    router.post('/templates', wrap((req, res) => res.status(201).json(consent_service_1.ConsentService.saveTemplate(req))));
    router.put('/templates/:id', wrap((req, res) => res.json(consent_service_1.ConsentService.saveTemplate(req, String(req.params.id)))));
    router.get('/settings', wrap((req, res) => res.json(consent_service_1.ConsentService.settings(req))));
    router.put('/settings', wrap((req, res) => res.json(consent_service_1.ConsentService.saveSettings(req))));
    router.get('/patients/:patientId', wrap((req, res) => res.json(consent_service_1.ConsentService.list(req, String(req.params.patientId)))));
    router.get('/patients/:patientId/pending', wrap((req, res) => res.json(consent_service_1.ConsentService.pending(req, String(req.params.patientId), typeof req.query.serviceId === 'string' ? req.query.serviceId : undefined))));
    const withQr = async (result) => ({ ...result, qrCode: await consent_service_1.ConsentService.qr(result.url) });
    router.post('/patients/:patientId/request', wrap(async (req, res) => res.status(201).json(await withQr(consent_service_1.ConsentService.issue(req, String(req.params.patientId))))));
    router.post('/:id/link', wrap(async (req, res) => res.json(await withQr(consent_service_1.ConsentService.newLink(req, String(req.params.id))))));
    router.post('/:id/send', wrap(async (req, res) => res.json(await withQr(await consent_service_1.ConsentService.sendLink(req, String(req.params.id))))));
    router.post('/:id/cancel', wrap((req, res) => res.json(consent_service_1.ConsentService.cancel(req, String(req.params.id)))));
    router.get('/:id/document', wrap((req, res) => {
        const data = consent_service_1.ConsentService.signedDocument(req, String(req.params.id));
        res.json({ title: data.row.title, content: data.row.content_text, evidence: data.evidence, signature: data.signature.signature_data_url, photo: data.signature.photo_data_url, integrity: data.integrity, invalidated: data.invalidated });
    }));
    router.get('/:id/pdf', wrap(async (req, res) => (0, consent_pdf_service_1.writeConsentPdf)(consent_service_1.ConsentService.signedDocument(req, String(req.params.id)), res)));
    api.use('/v1/consents', router);
}
