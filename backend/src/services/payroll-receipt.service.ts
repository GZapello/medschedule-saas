import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

export type PayrollReceiptStatus = 'active' | 'superseded' | 'reversed';

export interface PayrollReceiptBreakdownItem {
  id?: string;
  serviceName: string;
  serviceKind?: string;
  participantRole: 'primary' | 'co_instructor';
  isPackageCovered: boolean;
  commissionType: string;
  commissionRate: number;
  grossBasisAmount: number;
  commissionAmount: number;
  eligibleStudentsCount: number;
  referenceDate?: string | null;
  financialBasisNote?: string | null;
}

export interface PayrollReceiptSnapshot {
  receiptNumber: string;
  documentId: string;
  verificationCode: string;
  issuedAt: string;
  issuedAtBr: string;
  receiptStatus: PayrollReceiptStatus;
  statusReason: string | null;
  previousReceiptNumber: string | null;
  payrollId: string;
  payrollStatus: string;
  establishment: {
    id: string;
    name: string;
    tradeName: string;
    corporateName: string | null;
    document: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    establishmentProfile: 'clinic' | 'studio' | 'mixed';
  };
  professional: {
    id: string;
    name: string;
    profession: string;
    specialty: string | null;
    cpf: string | null;
    registry: string | null;
  };
  payment: {
    periodMonth: string;
    competenceLabel: string;
    referencePeriodLabel: string;
    paidDate: string | null;
    paidDateBr: string | null;
    dueDate: string | null;
    remunerationType: 'commission' | 'salary' | 'both';
    remunerationLabel: string;
    paymentMethod: string | null;
    notes: string | null;
  };
  values: {
    hasFixedSalary: boolean;
    hasCommission: boolean;
    fixedSalary: number;
    appointmentsCount: number;
    producedAmount: number;
    commissionPercentage: number | null;
    commissionPercentageLabel: string | null;
    commissionAmount: number;
    adjustments: number;
    adjustmentNotes: string | null;
    totalPaid: number;
    totalPaidInWords: string;
    otherPayouts: Array<{ label: string; amount: number }>;
    breakdownItems: PayrollReceiptBreakdownItem[];
  };
}

export interface PayrollReceiptRecord {
  id: string;
  tenantId: string;
  payrollId: string;
  professionalId: string;
  receiptNumber: string;
  sequenceNumber: number;
  periodMonth: string;
  receiptStatus: PayrollReceiptStatus;
  statusReason: string | null;
  snapshotHash: string;
  issuedByUserId: string | null;
  issuedByName: string | null;
  issuedAt: string;
  supersededAt: string | null;
  snapshot: PayrollReceiptSnapshot;
}

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function formatCurrencyBr(val: number): string {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateBr(ymd?: string | null): string | null {
  if (!ymd) return null;
  const clean = String(ymd).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return String(ymd);
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTimeBr(isoStr?: string | null): string {
  if (!isoStr) return '';
  try {
    const normalized = isoStr.includes('T') ? isoStr : `${isoStr.replace(' ', 'T')}Z`;
    const dt = new Date(normalized);
    if (Number.isNaN(dt.getTime())) return String(isoStr);
    const d = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(dt);
    const t = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(dt);
    return `${d} às ${t}`;
  } catch {
    return String(isoStr);
  }
}

export function formatCompetenceLabel(periodMonth: string): string {
  const m = String(periodMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodMonth;
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  return `${MONTHS_PT[monthIdx] || m[2]}/${year}`;
}

export function formatReferencePeriodLabel(periodMonth: string): string {
  const m = String(periodMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodMonth;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return `01/${mm}/${year} a ${String(lastDay).padStart(2, '0')}/${mm}/${year}`;
}

function numberToWordsPt(num: number): string {
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  const groupToWords = (n: number): string => {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const parts: string[] = [];
    const c = Math.floor(n / 100);
    const r = n % 100;
    if (c > 0) parts.push(hundreds[c]);
    if (r > 0) {
      if (r < 10) parts.push(units[r]);
      else if (r < 20) parts.push(teens[r - 10]);
      else {
        const d = Math.floor(r / 10);
        const u = r % 10;
        parts.push(tens[d]);
        if (u > 0) parts.push(units[u]);
      }
    }
    return parts.join(' e ');
  };

  const integerToWords = (n: number): string => {
    if (n === 0) return 'zero';
    const chunks: number[] = [];
    let rem = n;
    while (rem > 0) {
      chunks.push(rem % 1000);
      rem = Math.floor(rem / 1000);
    }
    const singular = ['', 'mil', 'milhão', 'bilhão'];
    const plural = ['', 'mil', 'milhões', 'bilhões'];
    const parts: string[] = [];
    for (let i = chunks.length - 1; i >= 0; i--) {
      const val = chunks[i];
      if (val === 0) continue;
      if (i === 1 && val === 1) {
        parts.push('mil');
      } else {
        const words = groupToWords(val);
        const suffix = i > 0 ? (val === 1 ? singular[i] : plural[i]) : '';
        parts.push(suffix ? `${words} ${suffix}` : words);
      }
    }
    return parts.join(', ');
  };

  const abs = Math.max(0, Math.round(Number(num || 0) * 100));
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;

  if (abs === 0) return 'zero reais';
  const res: string[] = [];
  if (reais > 0) {
    res.push(`${integerToWords(reais)} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) {
    res.push(`${integerToWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  return res.join(' e ');
}

function sanitizeFilenameSlug(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'profissional';
}

export function buildPayrollReceiptFilename(snapshot: PayrollReceiptSnapshot): string {
  const period = String(snapshot.payment.periodMonth || 'periodo').replace(/[^0-9-]/g, '') || 'periodo';
  const profSlug = sanitizeFilenameSlug(snapshot.professional.name);
  return `recibo-repasse-${profSlug}-${period}.pdf`;
}

function inferPaymentMethod(explicitMethod?: string | null, notes?: string | null): string | null {
  const map: Record<string, string> = {
    pix: 'PIX',
    bank_transfer: 'Transferência Bancária / TED',
    transfer: 'Transferência Bancária',
    ted: 'TED',
    doc: 'DOC',
    cash: 'Dinheiro',
    dinheiro: 'Dinheiro',
    credit_card: 'Cartão de Crédito',
    debit_card: 'Cartão de Débito',
    deposit: 'Depósito Bancário',
    check: 'Cheque'
  };
  if (explicitMethod && explicitMethod.trim()) {
    const k = explicitMethod.trim().toLowerCase();
    return map[k] || explicitMethod.trim();
  }
  if (notes && notes.trim()) {
    const low = notes.toLowerCase();
    if (/\bpix\b/.test(low)) return 'PIX';
    if (/\bted\b|transfer[êe]ncia/.test(low)) return 'Transferência Bancária';
    if (/dinheiro|esp[eé]cie/.test(low)) return 'Dinheiro';
    if (/dep[oó]sito/.test(low)) return 'Depósito Bancário';
  }
  return null;
}

function extractProfessionalCpf(profRow: any, userRow: any, tenantRow: any): string | null {
  try {
    if (profRow?.custom_attributes_json) {
      const attrs = JSON.parse(profRow.custom_attributes_json);
      const rawCpf = attrs?.cpf || attrs?.CPF || attrs?.document || attrs?.documento;
      if (rawCpf && String(rawCpf).trim()) return String(rawCpf).trim();
    }
  } catch {}
  if (
    tenantRow?.responsible_cpf &&
    userRow?.email &&
    tenantRow?.responsible_email &&
    String(userRow.email).trim().toLowerCase() === String(tenantRow.responsible_email).trim().toLowerCase()
  ) {
    return String(tenantRow.responsible_cpf).trim();
  }
  return null;
}

function buildEstablishmentAddress(tenant: any, settings: any): string | null {
  const street = tenant?.street || settings?.emitter_street || '';
  const num = tenant?.number || settings?.emitter_number || '';
  const comp = tenant?.complement || settings?.emitter_complement || '';
  const neigh = tenant?.neighborhood || settings?.emitter_neighborhood || '';
  const city = tenant?.city || settings?.emitter_city || '';
  const state = tenant?.state || settings?.emitter_state || '';
  const zip = tenant?.zip_code || settings?.emitter_zip_code || '';

  const lineParts: string[] = [];
  if (street) {
    lineParts.push(`${street}${num ? `, ${num}` : ''}${comp ? ` (${comp})` : ''}`);
  } else if (tenant?.address) {
    lineParts.push(String(tenant.address));
  }
  if (neigh) lineParts.push(neigh);
  if (city || state) lineParts.push([city, state].filter(Boolean).join('/'));
  if (zip) lineParts.push(`CEP ${zip}`);

  return lineParts.length > 0 ? lineParts.join(' — ') : null;
}

async function resolveLogoPngBuffer(logoUrl?: string | null): Promise<Buffer | null> {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  const clean = logoUrl.trim();
  if (!clean) return null;

  try {
    let rawBuf: Buffer | null = null;
    if (clean.startsWith('data:image/')) {
      const b64Idx = clean.indexOf('base64,');
      if (b64Idx !== -1) {
        rawBuf = Buffer.from(clean.slice(b64Idx + 7), 'base64');
      }
    } else if (clean.startsWith('/uploads/') || clean.startsWith('uploads/')) {
      const root = path.resolve(process.env.CLINIC_UPLOAD_ROOT || process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads'));
      const rel = clean.replace(/^\/?uploads\/+/, '');
      const abs = path.resolve(root, rel);
      if (abs.startsWith(root + path.sep) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        rawBuf = fs.readFileSync(abs);
      }
    } else if (clean.startsWith('/brand/') || clean.startsWith('brand/')) {
      const rel = clean.replace(/^\/?/, '');
      const candidates = [
        path.resolve(process.cwd(), '../frontend/public', rel),
        path.resolve(process.cwd(), '../frontend/dist', rel),
        path.resolve(process.cwd(), 'public', rel)
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          rawBuf = fs.readFileSync(candidate);
          break;
        }
      }
    }

    if (!rawBuf || rawBuf.length === 0) return null;
    return await sharp(rawBuf).png().toBuffer();
  } catch {
    return null;
  }
}

function formatPaymentMethodText(val?: string | null): string {
  return val || 'Não informada';
}

export class PayrollReceiptService {
  static assertAccessAndLoadPayroll(params: {
    tenantId: string;
    payrollId: string;
    userId: string;
    role: string;
  }) {
    const { tenantId, payrollId, userId, role } = params;
    const payroll = db.prepare(`
      SELECT
        py.*,
        p.user_id as prof_user_id,
        p.name as professional_name,
        p.profession_name as prof_profession_name,
        p.registration_type as prof_registration_type,
        p.registration_number as prof_registration_number,
        p.custom_attributes_json as prof_custom_attributes_json,
        pr.name as catalog_profession_name,
        COALESCE(p.specialty_custom, spec.name, '') as specialty_name
      FROM professional_payrolls py
      JOIN professionals p ON p.id = py.professional_id AND p.tenant_id = py.tenant_id
      LEFT JOIN professions pr ON pr.id = p.profession_id
      LEFT JOIN specialties spec ON spec.id = p.specialty_id
      WHERE py.id = ? AND py.tenant_id = ?
    `).get(payrollId, tenantId) as any;

    if (!payroll) {
      throw Object.assign(new Error('Registro de pagamento não encontrado neste estabelecimento.'), {
        status: 404,
        code: 'PAYROLL_NOT_FOUND'
      });
    }

    const cleanRole = String(role || '').toLowerCase();
    if (cleanRole === 'professional') {
      const ownProf = db.prepare(`SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?`)
        .get(userId, tenantId) as { id: string } | undefined;
      if (!ownProf || ownProf.id !== payroll.professional_id) {
        throw Object.assign(new Error('Você não possui permissão para acessar recibos de outros profissionais.'), {
          status: 403,
          code: 'FORBIDDEN'
        });
      }
    } else if (cleanRole !== 'clinic_admin' && cleanRole !== 'superadmin') {
      throw Object.assign(new Error('Você não possui permissão financeira para acessar recibos de pagamento.'), {
        status: 403,
        code: 'FORBIDDEN'
      });
    }

    return payroll;
  }

  private static buildSnapshotPayload(params: {
    tenantId: string;
    payroll: any;
    receiptNumber: string;
    documentId: string;
    verificationCode: string;
    issuedAt: string;
    receiptStatus: PayrollReceiptStatus;
    statusReason: string | null;
    previousReceiptNumber: string | null;
  }): PayrollReceiptSnapshot {
    const {
      tenantId,
      payroll,
      receiptNumber,
      documentId,
      verificationCode,
      issuedAt,
      receiptStatus,
      statusReason,
      previousReceiptNumber
    } = params;

    const tenant = db.prepare(`
      SELECT id, name, trade_name, corporate_name, cnpj_cpf, responsible_cpf, responsible_email,
             street, number, complement, neighborhood, city, state, zip_code, address,
             phone, mobile, whatsapp, email, logo_url,
             COALESCE(establishment_profile, 'clinic') as establishment_profile
      FROM tenants WHERE id = ?
    `).get(tenantId) as any;

    const receiptSettings = db.prepare(`SELECT * FROM receipt_settings WHERE tenant_id = ?`).get(tenantId) as any;
    const userRow = payroll.prof_user_id
      ? (db.prepare(`SELECT id, email FROM users WHERE id = ?`).get(payroll.prof_user_id) as any)
      : null;

    const estProfile = (['studio', 'mixed'].includes(String(tenant?.establishment_profile))
      ? tenant.establishment_profile
      : 'clinic') as 'clinic' | 'studio' | 'mixed';

    const itemsRows = db.prepare(`
      SELECT * FROM payroll_items
      WHERE tenant_id = ? AND payroll_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(tenantId, payroll.id) as any[];

    let parsedBreakdown: any[] = [];
    try {
      if (payroll.commission_breakdown_json) parsedBreakdown = JSON.parse(payroll.commission_breakdown_json);
    } catch {}

    const rawItems = itemsRows.length > 0 ? itemsRows : (Array.isArray(parsedBreakdown) ? parsedBreakdown : []);
    const breakdownItems: PayrollReceiptBreakdownItem[] = rawItems.map((it: any) => ({
      id: it.id,
      serviceName: it.service_name_snapshot || it.serviceName || it.service_name || 'Serviço / Aula',
      serviceKind: it.service_kind_snapshot || it.serviceKind || 'individual',
      participantRole: it.participant_role === 'co_instructor' || it.participantRole === 'co_instructor' ? 'co_instructor' : 'primary',
      isPackageCovered: Boolean(it.is_package_covered ?? it.isPackageCovered),
      commissionType: it.commission_type || it.commissionType || 'percentage',
      commissionRate: Number(it.commission_rate ?? it.commissionRate ?? it.commissionValue ?? 0),
      grossBasisAmount: Number(it.gross_basis_amount ?? it.grossBasisAmount ?? it.grossAmount ?? 0),
      commissionAmount: Number(it.commission_amount ?? it.commissionAmount ?? 0),
      eligibleStudentsCount: Number(it.eligible_students_count ?? it.eligibleStudentsCount ?? it.studentsCount ?? 1),
      referenceDate: it.occurrence_date || it.referenceDate || it.start_time || null,
      financialBasisNote: it.financial_basis_note || it.financialBasisNote || it.notes || null
    }));

    const remType = (['salary', 'both'].includes(String(payroll.remuneration_type))
      ? payroll.remuneration_type
      : 'commission') as 'commission' | 'salary' | 'both';

    const fixedSalary = Math.round(Number(payroll.fixed_salary || 0) * 100) / 100;
    const commissionAmount = Math.round(Number(payroll.commission_amount || 0) * 100) / 100;
    const adjustments = Math.round(Number(payroll.adjustments || 0) * 100) / 100;
    const totalPaid = Math.round(Number(payroll.total_payable || 0) * 100) / 100;
    const producedAmount = Math.round(Number(payroll.produced_amount || 0) * 100) / 100;
    const appointmentsCount = Number(payroll.appointments_count || 0);
    const commPctNum = Number(payroll.commission_percentage || 0);

    // Regra estrita: recibo exclusivamente de comissão não inclui salário fixo zerado/não pactuado
    const hasFixedSalary = remType === 'salary' || remType === 'both' || fixedSalary > 0;
    const hasCommission = remType === 'commission' || remType === 'both' || commissionAmount > 0 || breakdownItems.length > 0;

    const distinctServiceRates = new Set(
      breakdownItems.map(i => `${i.commissionType}:${i.commissionRate}`)
    );
    let commissionPercentageLabel: string | null = null;
    if (hasCommission) {
      if (distinctServiceRates.size > 1) {
        commissionPercentageLabel = 'Conforme regras por serviço';
      } else if (breakdownItems.length === 0 && commPctNum > 0) {
        commissionPercentageLabel = `${commPctNum}%`;
      } else if (distinctServiceRates.size === 1 && breakdownItems[0]) {
        const only = breakdownItems[0];
        if (only.commissionType === 'percentage') commissionPercentageLabel = `${only.commissionRate}%`;
        else if (only.commissionType === 'fixed_per_class') commissionPercentageLabel = `${formatCurrencyBr(only.commissionRate)}/aula`;
        else if (only.commissionType === 'fixed_per_student') commissionPercentageLabel = `${formatCurrencyBr(only.commissionRate)}/aluno`;
        else commissionPercentageLabel = commPctNum > 0 ? `${commPctNum}%` : 'Valor fixo';
      } else if (commPctNum > 0) {
        commissionPercentageLabel = `${commPctNum}%`;
      }
    }

    const isStudioContext =
      estProfile === 'studio' ||
      breakdownItems.some(i => i.serviceKind === 'group' || i.participantRole === 'co_instructor');

    const remunerationLabel =
      remType === 'salary'
        ? 'Salário Fixo'
        : remType === 'both'
        ? (isStudioContext ? 'Salário Fixo + Repasse / Comissão' : 'Salário Fixo + Comissão')
        : isStudioContext
        ? 'Comissão / Repasse de Aulas'
        : 'Comissão';

    const tradeName = String(
      tenant?.trade_name || receiptSettings?.emitter_trade_name || tenant?.name || 'Estabelecimento'
    ).trim();
    const corporateNameRaw = String(tenant?.corporate_name || receiptSettings?.emitter_name || '').trim();
    const corporateName = corporateNameRaw && corporateNameRaw !== tradeName ? corporateNameRaw : null;

    const regType = String(payroll.prof_registration_type || '').trim();
    const regNum = String(payroll.prof_registration_number || '').trim();
    const registry = regNum ? [regType, regNum].filter(Boolean).join(' ') : null;

    const paidDateStr = payroll.paid_date ? String(payroll.paid_date).slice(0, 10) : null;
    const paidDateBr = paidDateStr ? formatDateBr(paidDateStr) : null;
    const paymentMethod = inferPaymentMethod(payroll.payment_method, payroll.notes);

    // Soma de componentes informados vs total pago para verificar eventual repasse adicional incluído
    const accountedSum =
      (hasFixedSalary ? fixedSalary : 0) +
      (hasCommission ? commissionAmount : 0) +
      adjustments;
    const residualOther = Math.round((totalPaid - accountedSum) * 100) / 100;
    const otherPayouts: Array<{ label: string; amount: number }> = [];
    if (residualOther > 0.009) {
      otherPayouts.push({ label: 'Outros repasses incluídos', amount: residualOther });
    }

    const cpf = extractProfessionalCpf(
      { custom_attributes_json: payroll.prof_custom_attributes_json },
      userRow,
      tenant
    );

    return {
      receiptNumber,
      documentId,
      verificationCode,
      issuedAt,
      issuedAtBr: formatDateTimeBr(issuedAt),
      receiptStatus,
      statusReason,
      previousReceiptNumber,
      payrollId: payroll.id,
      payrollStatus: payroll.status,
      establishment: {
        id: tenantId,
        name: String(tenant?.name || tradeName),
        tradeName,
        corporateName,
        document: tenant?.cnpj_cpf || receiptSettings?.emitter_document || null,
        address: buildEstablishmentAddress(tenant, receiptSettings),
        city: tenant?.city || receiptSettings?.emitter_city || null,
        state: tenant?.state || receiptSettings?.emitter_state || null,
        phone: tenant?.phone || tenant?.whatsapp || tenant?.mobile || receiptSettings?.emitter_phone || null,
        email: tenant?.email || receiptSettings?.emitter_email || null,
        logoUrl: tenant?.logo_url || null,
        establishmentProfile: estProfile
      },
      professional: {
        id: payroll.professional_id,
        name: String(payroll.professional_name || 'Profissional'),
        profession: String(
          payroll.prof_profession_name ||
          payroll.catalog_profession_name ||
          (isStudioContext ? 'Instrutor(a)' : 'Profissional de Saúde')
        ),
        specialty: payroll.specialty_name ? String(payroll.specialty_name) : null,
        cpf,
        registry
      },
      payment: {
        periodMonth: payroll.period_month,
        competenceLabel: formatCompetenceLabel(payroll.period_month),
        referencePeriodLabel: formatReferencePeriodLabel(payroll.period_month),
        paidDate: paidDateStr,
        paidDateBr,
        dueDate: payroll.due_date || null,
        remunerationType: remType,
        remunerationLabel,
        paymentMethod,
        notes: payroll.notes || null
      },
      values: {
        hasFixedSalary,
        hasCommission,
        fixedSalary: hasFixedSalary ? fixedSalary : 0,
        appointmentsCount,
        producedAmount,
        commissionPercentage: hasCommission && commPctNum > 0 ? commPctNum : null,
        commissionPercentageLabel,
        commissionAmount: hasCommission ? commissionAmount : 0,
        adjustments,
        adjustmentNotes: payroll.adjustment_notes || null,
        totalPaid,
        totalPaidInWords: numberToWordsPt(totalPaid),
        otherPayouts,
        breakdownItems
      }
    };
  }

  private static computeSettledHash(payroll: any): string {
    const hashPayload = {
      id: payroll.id,
      periodMonth: payroll.period_month,
      remunerationType: payroll.remuneration_type,
      appointmentsCount: Number(payroll.appointments_count || 0),
      producedAmount: Math.round(Number(payroll.produced_amount || 0) * 100),
      commissionPercentage: Math.round(Number(payroll.commission_percentage || 0) * 100),
      commissionAmount: Math.round(Number(payroll.commission_amount || 0) * 100),
      fixedSalary: Math.round(Number(payroll.fixed_salary || 0) * 100),
      adjustments: Math.round(Number(payroll.adjustments || 0) * 100),
      adjustmentNotes: payroll.adjustment_notes || null,
      totalPayable: Math.round(Number(payroll.total_payable || 0) * 100),
      paidDate: payroll.paid_date ? String(payroll.paid_date).slice(0, 10) : null,
      paymentMethod: payroll.payment_method || null
    };
    return crypto.createHash('sha256').update(JSON.stringify(hashPayload)).digest('hex');
  }

  /**
   * Emite ou retorna de forma idempotente o recibo oficial de quitação para um lançamento Pago.
   * Nunca cria pagamento extra nem altera status financeiro.
   */
  static issueOrGetReceipt(params: {
    tenantId: string;
    payrollId: string;
    userId: string;
    userName: string;
    role: string;
    requestedReceiptId?: string | null;
  }): { receipt: PayrollReceiptRecord; history: PayrollReceiptRecord[]; alreadyIssued: boolean } {
    const { tenantId, payrollId, userId, userName, role, requestedReceiptId } = params;
    const payroll = this.assertAccessAndLoadPayroll({ tenantId, payrollId, userId, role });

    const historyRows = db.prepare(`
      SELECT * FROM payroll_receipts
      WHERE tenant_id = ? AND payroll_id = ?
      ORDER BY sequence_number DESC, rowid DESC
    `).all(tenantId, payrollId) as any[];

    const mapDbRow = (row: any): PayrollReceiptRecord => {
      const snap = JSON.parse(row.snapshot_json || '{}') as PayrollReceiptSnapshot;
      snap.receiptStatus = row.receipt_status;
      snap.statusReason = row.status_reason || null;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        payrollId: row.payroll_id,
        professionalId: row.professional_id,
        receiptNumber: row.receipt_number,
        sequenceNumber: Number(row.sequence_number),
        periodMonth: row.period_month,
        receiptStatus: row.receipt_status,
        statusReason: row.status_reason || null,
        snapshotHash: row.snapshot_hash,
        issuedByUserId: row.issued_by_user_id || null,
        issuedByName: row.issued_by_name || null,
        issuedAt: row.issued_at,
        supersededAt: row.superseded_at || null,
        snapshot: snap
      };
    };

    const history = historyRows.map(mapDbRow);

    if (requestedReceiptId) {
      const target = history.find(h => h.id === requestedReceiptId || h.receiptNumber === requestedReceiptId);
      if (!target) {
        throw Object.assign(new Error('Recibo histórico não encontrado para este pagamento.'), {
          status: 404,
          code: 'RECEIPT_NOT_FOUND'
        });
      }
      return { receipt: target, history, alreadyIssued: true };
    }

    // Nunca gerar recibo de quitação para pagamento pendente ou atrasado!
    if (payroll.status !== 'paid') {
      throw Object.assign(
        new Error('Recibos de quitação só podem ser emitidos para pagamentos com status Pago.'),
        { status: 409, code: 'PAYROLL_NOT_PAID', history }
      );
    }

    const currentHash = this.computeSettledHash(payroll);
    const activeReceipt = history.find(h => h.receiptStatus === 'active');

    // Reutiliza o recibo existente se a quitação não sofreu alteração desde a emissão
    if (activeReceipt && activeReceipt.snapshotHash === currentHash) {
      return { receipt: activeReceipt, history, alreadyIssued: true };
    }

    // Caso contrário, emite novo registro atômico preservando integralmente históricos anteriores
    const nowIso = new Date().toISOString();
    const created = db.transaction(() => {
      let previousReceiptNumber: string | null = null;
      if (activeReceipt) {
        previousReceiptNumber = activeReceipt.receiptNumber;
        db.prepare(`
          UPDATE payroll_receipts
          SET receipt_status = 'superseded',
              status_reason = 'Substituído após atualização/correção da folha paga',
              superseded_at = ?
          WHERE id = ? AND tenant_id = ?
        `).run(nowIso, activeReceipt.id, tenantId);
      } else if (history[0]) {
        previousReceiptNumber = history[0].receiptNumber;
      }

      const maxSeqRow = db.prepare(`
        SELECT COALESCE(MAX(sequence_number), 0) as max_seq
        FROM payroll_receipts
        WHERE tenant_id = ?
      `).get(tenantId) as { max_seq: number } | undefined;
      const nextSeq = Number(maxSeqRow?.max_seq || 0) + 1;
      const year = String(payroll.period_month || new Date().getFullYear()).slice(0, 4);
      const receiptNumber = `RP-${year}-${String(nextSeq).padStart(6, '0')}`;
      const docId = 'prc-' + uuidv4().slice(0, 8);
      const verificationCode = currentHash.slice(0, 12).toUpperCase();

      const snapshot = this.buildSnapshotPayload({
        tenantId,
        payroll,
        receiptNumber,
        documentId: docId,
        verificationCode,
        issuedAt: nowIso,
        receiptStatus: 'active',
        statusReason: null,
        previousReceiptNumber
      });

      db.prepare(`
        INSERT INTO payroll_receipts (
          id, tenant_id, payroll_id, professional_id, receipt_number, sequence_number,
          period_month, receipt_status, status_reason, snapshot_hash, snapshot_json,
          issued_by_user_id, issued_by_name, issued_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?)
      `).run(
        docId,
        tenantId,
        payroll.id,
        payroll.professional_id,
        receiptNumber,
        nextSeq,
        payroll.period_month,
        currentHash,
        JSON.stringify(snapshot),
        userId || null,
        userName || 'Sistema',
        nowIso
      );

      return db.prepare(`SELECT * FROM payroll_receipts WHERE id = ? AND tenant_id = ?`).get(docId, tenantId) as any;
    })();

    const freshHistory = (db.prepare(`
      SELECT * FROM payroll_receipts
      WHERE tenant_id = ? AND payroll_id = ?
      ORDER BY sequence_number DESC, rowid DESC
    `).all(tenantId, payrollId) as any[]).map(mapDbRow);

    return {
      receipt: mapDbRow(created),
      history: freshHistory,
      alreadyIssued: false
    };
  }

  /**
   * Somente leitura: retorna recibo ativo (se pago) + histórico preservado (inclusive se estornado).
   */
  static getReceiptForPayroll(params: {
    tenantId: string;
    payrollId: string;
    userId: string;
    role: string;
  }): { payrollStatus: string; activeReceipt: PayrollReceiptRecord | null; history: PayrollReceiptRecord[] } {
    const payroll = this.assertAccessAndLoadPayroll(params);
    const rows = db.prepare(`
      SELECT * FROM payroll_receipts
      WHERE tenant_id = ? AND payroll_id = ?
      ORDER BY sequence_number DESC, rowid DESC
    `).all(params.tenantId, params.payrollId) as any[];

    const history = rows.map(row => {
      const snap = JSON.parse(row.snapshot_json || '{}') as PayrollReceiptSnapshot;
      snap.receiptStatus = row.receipt_status;
      snap.statusReason = row.status_reason || null;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        payrollId: row.payroll_id,
        professionalId: row.professional_id,
        receiptNumber: row.receipt_number,
        sequenceNumber: Number(row.sequence_number),
        periodMonth: row.period_month,
        receiptStatus: row.receipt_status,
        statusReason: row.status_reason || null,
        snapshotHash: row.snapshot_hash,
        issuedByUserId: row.issued_by_user_id || null,
        issuedByName: row.issued_by_name || null,
        issuedAt: row.issued_at,
        supersededAt: row.superseded_at || null,
        snapshot: snap
      } as PayrollReceiptRecord;
    });

    const activeReceipt = payroll.status === 'paid'
      ? (history.find(h => h.receiptStatus === 'active') || null)
      : null;

    return {
      payrollStatus: payroll.status,
      activeReceipt,
      history
    };
  }

  /**
   * Preserva histórico quando um lançamento já pago volta para pendente/estornado.
   */
  static markReceiptsReversedForPayrollTx(tenantId: string, payrollId: string, reason?: string): number {
    const info = db.prepare(`
      UPDATE payroll_receipts
      SET receipt_status = 'reversed',
          status_reason = COALESCE(?, 'Pagamento estornado / alterado para pendente após emissão'),
          superseded_at = datetime('now')
      WHERE tenant_id = ? AND payroll_id = ? AND receipt_status = 'active'
    `).run(reason || null, tenantId, payrollId);
    return Number(info?.changes || 0);
  }

  /**
   * Gera o documento PDF A4 oficial com logotipo, partes, competência, quitação e discriminação fiel.
   */
  static async renderPayrollReceiptPdfBuffer(record: PayrollReceiptRecord): Promise<Buffer> {
    const snap = record.snapshot;
    const logoPng = await resolveLogoPngBuffer(snap.establishment.logoUrl);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 44,
        info: {
          Title: `Recibo ${snap.receiptNumber} - ${snap.professional.name}`,
          Author: snap.establishment.tradeName || 'Zemda',
          Subject: `Recibo de pagamento ${snap.payment.competenceLabel}`
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const left = 44;
      const right = 551;
      const contentWidth = right - left;

      // Tarja de aviso caso recibo tenha sido estornado ou substituído após emissão
      if (record.receiptStatus !== 'active') {
        doc.save();
        doc.roundedRect(left, doc.y, contentWidth, 28, 6).fill('#fef2f2');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#b91c1c').text(
          record.receiptStatus === 'reversed'
            ? `RECIBO INATIVO — PAGAMENTO ESTORNADO/REABERTO (${record.statusReason || 'Consulte a folha atual'})`
            : `RECIBO SUBSTITUÍDO POR CORREÇÃO POSTERIOR (${record.statusReason || 'Nova emissão registrada'})`,
          left + 10,
          doc.y + 9,
          { width: contentWidth - 20, align: 'center' }
        );
        doc.restore();
        doc.y += 36;
      }

      // 1. Cabeçalho do Estabelecimento + Identificador do Recibo
      const headerTop = doc.y;
      let textStartX = left;

      if (logoPng) {
        try {
          doc.image(logoPng, left, headerTop, { fit: [56, 56], align: 'center', valign: 'center' });
          textStartX = left + 68;
        } catch {}
      }

      const estWidth = right - textStartX - 150;
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a')
        .text(snap.establishment.tradeName.toUpperCase(), textStartX, headerTop, { width: estWidth });
      if (snap.establishment.corporateName) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#475569')
          .text(`Razão Social: ${snap.establishment.corporateName}`, textStartX, doc.y + 1, { width: estWidth });
      }
      const contactParts: string[] = [];
      if (snap.establishment.document) contactParts.push(`CPF/CNPJ: ${snap.establishment.document}`);
      if (snap.establishment.phone) contactParts.push(`Tel: ${snap.establishment.phone}`);
      if (snap.establishment.email) contactParts.push(snap.establishment.email);
      if (contactParts.length > 0) {
        doc.font('Helvetica').fontSize(8).fillColor('#475569')
          .text(contactParts.join('  •  '), textStartX, doc.y + 2, { width: estWidth });
      }
      if (snap.establishment.address) {
        doc.font('Helvetica').fontSize(8).fillColor('#64748b')
          .text(snap.establishment.address, textStartX, doc.y + 2, { width: estWidth });
      }
      const estBottomY = doc.y;

      // Bloco lateral do número/status do recibo
      doc.save();
      doc.roundedRect(right - 142, headerTop, 142, 60, 6).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f766e')
        .text(snap.receiptNumber, right - 134, headerTop + 7, { width: 126, align: 'right' });
      doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
        .text(`Emitido em ${snap.issuedAtBr}`, right - 134, headerTop + 23, { width: 126, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(record.receiptStatus === 'active' ? '#047857' : '#b91c1c')
        .text(
          record.receiptStatus === 'active'
            ? 'SITUAÇÃO: PAGO'
            : record.receiptStatus === 'reversed'
            ? 'ESTORNADO'
            : 'SUBSTITUÍDO',
          right - 134,
          headerTop + 39,
          { width: 126, align: 'right' }
        );
      doc.restore();

      doc.y = Math.max(estBottomY, headerTop + 66) + 8;
      doc.strokeColor('#0f172a').lineWidth(1.5).moveTo(left, doc.y).lineTo(right, doc.y).stroke();
      doc.moveDown(0.8);

      // 2. Título
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a')
        .text('RECIBO DE PAGAMENTO AO PROFISSIONAL', left, doc.y, { width: contentWidth, align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b')
        .text(`Competência: ${snap.payment.competenceLabel}  •  Período de referência: ${snap.payment.referencePeriodLabel}`, left, doc.y + 2, { width: contentWidth, align: 'center' });
      doc.moveDown(0.9);

      // 3. Quadro de Total Destacado
      const highlightTop = doc.y;
      doc.save();
      doc.roundedRect(left, highlightTop, contentWidth, 56, 8).fillAndStroke('#f0fdfa', '#99f6e4');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f766e')
        .text('TOTAL EFETIVAMENTE PAGO', left + 12, highlightTop + 9, { width: contentWidth - 24, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a')
        .text(formatCurrencyBr(snap.values.totalPaid), left + 12, highlightTop + 21, { width: contentWidth - 24, align: 'center' });
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#334155')
        .text(`(${snap.values.totalPaidInWords})`, left + 12, highlightTop + 43, { width: contentWidth - 24, align: 'center' });
      doc.restore();
      doc.y = highlightTop + 68;

      // 4. Dados das Partes e Referências do Pagamento (duas colunas)
      const colGap = 12;
      const colW = (contentWidth - colGap) / 2;
      const cardTop = doc.y;

      doc.save();
      doc.roundedRect(left, cardTop, colW, 88, 6).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.roundedRect(left + colW + colGap, cardTop, colW, 88, 6).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.restore();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('PROFISSIONAL BENEFICIÁRIO', left + 10, cardTop + 8);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(snap.professional.name, left + 10, cardTop + 21, { width: colW - 20 });
      doc.font('Helvetica').fontSize(8).fillColor('#334155');
      doc.text(`Profissão: ${snap.professional.profession}${snap.professional.specialty ? ` (${snap.professional.specialty})` : ''}`, left + 10, cardTop + 36, { width: colW - 20 });
      if (snap.professional.cpf) {
        doc.text(`CPF: ${snap.professional.cpf}`, left + 10, cardTop + 50, { width: colW - 20 });
      }
      if (snap.professional.registry) {
        doc.text(`Registro profissional: ${snap.professional.registry}`, left + 10, snap.professional.cpf ? cardTop + 63 : cardTop + 50, { width: colW - 20 });
      }

      const rightColX = left + colW + colGap + 10;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('REFERÊNCIAS DO PAGAMENTO', rightColX, cardTop + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#334155');
      doc.text(`Modalidade: ${snap.payment.remunerationLabel}`, rightColX, cardTop + 22, { width: colW - 20 });
      doc.text(`Competência: ${snap.payment.competenceLabel}`, rightColX, cardTop + 35, { width: colW - 20 });
      doc.text(`Data do pagamento: ${snap.payment.paidDateBr || 'Registrado'}`, rightColX, cardTop + 48, { width: colW - 20 });
      doc.text(`Forma de pagamento: ${formatPaymentMethodText(snap.payment.paymentMethod)}`, rightColX, cardTop + 61, { width: colW - 20 });
      doc.text(`Situação: ${record.receiptStatus === 'active' ? 'Pago' : record.receiptStatus === 'reversed' ? 'Estornado' : 'Substituído'}`, rightColX, cardTop + 74, { width: colW - 20 });

      doc.y = cardTop + 100;

      // 5. Declaração de Quitação
      const declText = `Declaro ter recebido de ${snap.establishment.tradeName}${snap.establishment.document ? ` (CPF/CNPJ ${snap.establishment.document})` : ''} a importância líquida de ${formatCurrencyBr(snap.values.totalPaid)} (${snap.values.totalPaidInWords}), referente à competência ${snap.payment.competenceLabel} (${snap.payment.referencePeriodLabel}), paga em ${snap.payment.paidDateBr || snap.issuedAtBr.slice(0, 10)}, dando plena quitação dos valores abaixo discriminados.`;
      const declHeight = doc.heightOfString(declText, { width: contentWidth - 20, lineGap: 2 }) + 16;
      const declTop = doc.y;
      doc.save();
      doc.roundedRect(left, declTop, contentWidth, declHeight, 6).fillAndStroke('#ffffff', '#cbd5e1');
      doc.restore();
      doc.font('Helvetica').fontSize(8.5).fillColor('#1e293b')
        .text(declText, left + 10, declTop + 8, { width: contentWidth - 20, lineGap: 2 });
      doc.y = declTop + declHeight + 12;

      // 6. Tabela Discriminada de Valores
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text('DISCRIMINAÇÃO DOS VALORES QUITADOS', left, doc.y);
      doc.moveDown(0.4);

      const valueRows: Array<{ label: string; detail: string; value: string; bold?: boolean }> = [];
      if (snap.values.hasFixedSalary) {
        valueRows.push({
          label: 'Salário fixo',
          detail: 'Remuneração fixa mensal acordada',
          value: formatCurrencyBr(snap.values.fixedSalary)
        });
      }
      if (snap.values.hasCommission) {
        valueRows.push({
          label: 'Atendimentos considerados',
          detail: `Faturamento de referência: ${formatCurrencyBr(snap.values.producedAmount)}`,
          value: `${snap.values.appointmentsCount} atendimento(s)`
        });
        valueRows.push({
          label: 'Comissões',
          detail: snap.values.commissionPercentageLabel ? `Regra aplicada: ${snap.values.commissionPercentageLabel}` : 'Comissões apuradas no período',
          value: formatCurrencyBr(snap.values.commissionAmount)
        });
      } else if (snap.values.appointmentsCount > 0) {
        valueRows.push({
          label: 'Atendimentos registrados no período',
          detail: `Faturamento de referência: ${formatCurrencyBr(snap.values.producedAmount)}`,
          value: `${snap.values.appointmentsCount} atendimento(s)`
        });
      }

      if (snap.values.adjustments !== 0 || snap.values.adjustmentNotes) {
        const adjLabel = snap.values.adjustments > 0
          ? 'Ajustes positivos / Bonificações (+)'
          : snap.values.adjustments < 0
          ? 'Ajustes negativos / Deduções (-)'
          : 'Ajustes';
        valueRows.push({
          label: adjLabel,
          detail: snap.values.adjustmentNotes || 'Ajuste financeiro registrado na folha',
          value: formatCurrencyBr(snap.values.adjustments)
        });
      } else {
        valueRows.push({
          label: 'Ajustes financeiros',
          detail: 'Sem acréscimos ou descontos lançados',
          value: formatCurrencyBr(0)
        });
      }

      for (const op of snap.values.otherPayouts) {
        valueRows.push({
          label: op.label,
          detail: 'Incluído no pagamento líquido',
          value: formatCurrencyBr(op.amount)
        });
      }

      valueRows.push({
        label: 'Total recebido / pago',
        detail: `Situação: ${record.receiptStatus === 'active' ? 'Pago' : record.receiptStatus}`,
        value: formatCurrencyBr(snap.values.totalPaid),
        bold: true
      });

      // Header da tabela
      const tHeaderY = doc.y;
      doc.save();
      doc.rect(left, tHeaderY, contentWidth, 20).fill('#f1f5f9');
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569');
      doc.text('DESCRIÇÃO', left + 8, tHeaderY + 6, { width: 170 });
      doc.text('REFERÊNCIA / DETALHE', left + 182, tHeaderY + 6, { width: 220 });
      doc.text('VALOR', right - 108, tHeaderY + 6, { width: 100, align: 'right' });
      doc.y = tHeaderY + 20;

      for (const r of valueRows) {
        const rowY = doc.y;
        const rowH = 22;
        if (r.bold) {
          doc.save();
          doc.rect(left, rowY, contentWidth, 24).fill('#f0fdfa');
          doc.restore();
        }
        doc.font(r.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(r.bold ? 9.5 : 8.5).fillColor('#0f172a')
          .text(r.label, left + 8, rowY + 6, { width: 170 });
        doc.font('Helvetica').fontSize(8).fillColor('#475569')
          .text(r.detail, left + 182, rowY + 6, { width: 220 });
        doc.font(r.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(r.bold ? 10 : 8.5).fillColor(r.bold ? '#0f766e' : '#0f172a')
          .text(r.value, right - 108, rowY + 6, { width: 100, align: 'right' });
        doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(left, rowY + (r.bold ? 24 : rowH)).lineTo(right, rowY + (r.bold ? 24 : rowH)).stroke();
        doc.y = rowY + (r.bold ? 24 : rowH);
      }

      if (snap.payment.notes) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('Observações / Comprovante:', left, doc.y);
        doc.font('Helvetica').fontSize(8).fillColor('#334155').text(snap.payment.notes, left, doc.y + 1, { width: contentWidth });
      }

      // 7. Detalhamento resumido dos atendimentos/aulas se houver itens
      if (snap.values.breakdownItems.length > 0) {
        doc.moveDown(0.8);
        if (doc.y > 670) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
          .text(`ITENS CONSIDERADOS NA APURAÇÃO (${snap.values.breakdownItems.length})`, left, doc.y);
        doc.moveDown(0.3);

        const maxPdfItems = 18;
        const shown = snap.values.breakdownItems.slice(0, maxPdfItems);
        for (const it of shown) {
          if (doc.y > 755) doc.addPage();
          const roleText = it.participantRole === 'co_instructor' ? 'Coinstrutor' : 'Titular';
          const rateLabel = it.commissionType === 'percentage'
            ? `${it.commissionRate}%`
            : formatCurrencyBr(it.commissionRate);
          const dateTag = it.referenceDate ? `${formatDateBr(it.referenceDate) || String(it.referenceDate).slice(0, 10)} • ` : '';
          doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
            .text(
              `• ${dateTag}${it.serviceName} (${roleText}) — Base ${formatCurrencyBr(it.grossBasisAmount)} | Regra ${rateLabel} | Repasse ${formatCurrencyBr(it.commissionAmount)}`,
              left + 4,
              doc.y,
              { width: contentWidth - 8 }
            );
          doc.moveDown(0.15);
        }
        if (snap.values.breakdownItems.length > maxPdfItems) {
          doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#64748b')
            .text(`... e mais ${snap.values.breakdownItems.length - maxPdfItems} item(ns) incluído(s) nesta folha (${snap.values.appointmentsCount} atendimento(s) no total).`, left + 4, doc.y);
        }
      }

      // 8. Assinatura & Rodapé com identificador único
      if (doc.y > 700) doc.addPage();
      doc.moveDown(1.4);
      const sigY = doc.y;
      doc.strokeColor('#64748b').lineWidth(0.7).moveTo(left + 40, sigY).lineTo(left + 230, sigY).stroke();
      doc.moveTo(right - 230, sigY).lineTo(right - 40, sigY).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
        .text(snap.establishment.tradeName, left + 40, sigY + 4, { width: 190, align: 'center' })
        .text(snap.professional.name, right - 230, sigY + 4, { width: 190, align: 'center' });

      doc.y = sigY + 24;
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
        .text(
          `Documento emitido pelo Zemda  •  Identificador único: ${snap.documentId}  •  Código: ${snap.verificationCode}  •  Emissão: ${snap.issuedAtBr}`,
          left,
          doc.y,
          { width: contentWidth, align: 'center' }
        );

      doc.end();
    });
  }
}
