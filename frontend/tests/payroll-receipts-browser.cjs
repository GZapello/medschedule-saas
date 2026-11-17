const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-payroll-receipt-ui-'));

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const fixtureTsx = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProfessionalPayrollView } from '../src/components/payroll/ProfessionalPayrollView';

const state: any = (window as any).__payTestState = {
  payrolls: [
    {
      id: 'py-paid-both',
      tenant_id: 't-1',
      professional_id: 'pro-1',
      professional_name: 'João Silva',
      specialty_name: 'Fisioterapia',
      period_month: '2026-11',
      remuneration_type: 'both',
      appointments_count: 1,
      produced_amount: 180,
      commission_percentage: 40,
      commission_amount: 72,
      fixed_salary: 2500,
      adjustments: 0,
      adjustment_notes: '',
      total_payable: 2572,
      paid_date: '2026-11-17',
      status: 'paid',
      items: [],
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-17T10:00:00Z'
    },
    {
      id: 'py-pending-comm',
      tenant_id: 't-1',
      professional_id: 'pro-2',
      professional_name: 'Maria Costa',
      specialty_name: 'Pilates Studio',
      period_month: '2026-11',
      remuneration_type: 'commission',
      appointments_count: 4,
      produced_amount: 800,
      commission_percentage: 50,
      commission_amount: 400,
      fixed_salary: 0,
      adjustments: 50,
      adjustment_notes: 'Bônus aulas',
      total_payable: 450,
      paid_date: null,
      status: 'pending',
      items: [],
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z'
    }
  ],
  pdfFetched: 0,
  printed: 0
};

(window as any).print = () => { state.printed += 1; };

const buildSnapshot = (p: any) => ({
  receiptNumber: p.id === 'py-paid-both' ? 'RP-2026-000001' : 'RP-2026-000002',
  documentId: 'prc-' + p.id,
  verificationCode: 'A1B2C3D4E5F6',
  issuedAt: '2026-11-17T14:00:00.000Z',
  issuedAtBr: '17/11/2026 às 11:00',
  receiptStatus: 'active',
  statusReason: null,
  previousReceiptNumber: null,
  payrollId: p.id,
  payrollStatus: 'paid',
  establishment: {
    id: 't-1',
    name: 'Clínica Exemplo',
    tradeName: 'Clínica Exemplo',
    corporateName: 'Clínica Exemplo Saúde LTDA',
    document: '12.345.678/0001-90',
    address: 'Rua Teste, 100 — São Paulo/SP',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 3333-4444',
    email: 'contato@clinica.test',
    logoUrl: '${TINY_PNG}',
    establishmentProfile: 'mixed'
  },
  professional: {
    id: p.professional_id,
    name: p.professional_name,
    profession: p.specialty_name,
    specialty: p.specialty_name,
    cpf: '123.456.789-00',
    registry: 'CREFITO-3 12345-F'
  },
  payment: {
    periodMonth: p.period_month,
    competenceLabel: 'Novembro/2026',
    referencePeriodLabel: '01/11/2026 a 30/11/2026',
    paidDate: p.paid_date,
    paidDateBr: '17/11/2026',
    dueDate: null,
    remunerationType: p.remuneration_type,
    remunerationLabel: p.remuneration_type === 'commission' ? 'Comissão' : 'Salário Fixo + Comissão',
    paymentMethod: 'PIX',
    notes: p.notes || null
  },
  values: {
    hasFixedSalary: p.remuneration_type !== 'commission',
    hasCommission: true,
    fixedSalary: p.fixed_salary,
    appointmentsCount: p.appointments_count,
    producedAmount: p.produced_amount,
    commissionPercentage: p.commission_percentage,
    commissionPercentageLabel: p.commission_percentage + '%',
    commissionAmount: p.commission_amount,
    adjustments: p.adjustments,
    adjustmentNotes: p.adjustment_notes || null,
    totalPaid: p.total_payable,
    totalPaidInWords: 'dois mil quinhentos e setenta e dois reais',
    otherPayouts: [],
    breakdownItems: []
  }
});

const origFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = (init?.method || 'GET').toUpperCase();

  if (url.includes('/v1/payroll/') && url.includes('/receipt/pdf')) {
    state.pdfFetched += 1;
    const bytes = new TextEncoder().encode('%PDF-1.4 test');
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="recibo-repasse-joao-silva-2026-11.pdf"'
      }
    });
  }

  const recMatch = url.match(/\\/v1\\/payroll\\/([^/]+)\\/receipt/);
  if (recMatch) {
    const id = recMatch[1];
    const p = state.payrolls.find((x: any) => x.id === id);
    const snap = buildSnapshot(p);
    const record = {
      id: snap.documentId,
      tenantId: 't-1',
      payrollId: p.id,
      professionalId: p.professional_id,
      receiptNumber: snap.receiptNumber,
      sequenceNumber: 1,
      periodMonth: p.period_month,
      receiptStatus: 'active',
      statusReason: null,
      snapshotHash: 'abc',
      issuedByUserId: 'u-1',
      issuedByName: 'Gestor',
      issuedAt: snap.issuedAt,
      supersededAt: null,
      snapshot: snap
    };
    return new Response(JSON.stringify({
      success: true,
      receipt: record,
      history: [record],
      alreadyIssued: false,
      filename: 'recibo-repasse-joao-silva-2026-11.pdf'
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }

  const payMatch = url.match(/\\/v1\\/payroll\\/([^/]+)\\/pay/);
  if (payMatch && method === 'PATCH') {
    const id = payMatch[1];
    const body = JSON.parse(String(init?.body || '{}'));
    const p = state.payrolls.find((x: any) => x.id === id);
    p.status = 'paid';
    p.paid_date = body.paidDate || '2026-11-17';
    return new Response(JSON.stringify({ success: true, status: 'paid', payroll: p }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/v1/payroll?')) {
    return new Response(JSON.stringify(state.payrolls), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return origFetch(input, init);
};

createRoot(document.getElementById('root')!).render(<div className="p-4 bg-slate-50 min-h-screen"><ProfessionalPayrollView /></div>);
`;

(async () => {
  await build({
    stdin: { contents: fixtureTsx, resolveDir: __dirname, loader: 'tsx' },
    bundle: true,
    outfile: path.join(out, 'test.js'),
    jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
    plugins: [
      {
        name: 'stubs',
        setup(b) {
          b.onLoad({ filter: /AuthContext\.tsx$/ }, () => ({
            contents: `const q = new URLSearchParams(location.search); const admin = q.get('role') !== 'denied'; export const useAuth = () => ({ currentUser: { id: 'u-1' }, currentTenant: { id: 't-1', name: 'Clínica Exemplo', trade_name: 'Clínica Exemplo', logo_url: '${TINY_PNG}' }, isClinicAdmin: admin, isProfessional: !admin });`,
            loader: 'tsx'
          }));
          b.onLoad({ filter: /ToastContext\.tsx$/ }, () => ({
            contents: `export const useToast = () => ({ showToast: () => {} });`,
            loader: 'tsx'
          }));
        }
      }
    ]
  });

  const assets = path.join(root, 'dist/assets');
  const css = fs.readdirSync(assets).find(f => /^index-.*\.css$/.test(f));
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(assets, css), 'utf8')}</style><div id="root"></div><script>${fs.readFileSync(path.join(out, 'test.js'), 'utf8')}</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.setDefaultTimeout(10000);

      // Reset mock state for each width iteration
      await page.goto(`${base}?w=${width}`);
      await page.getByText('João Silva').first().waitFor();

      // Paid row shows "Gerar Recibo"; Pending row shows "Marcar Pago" ONLY (never "Gerar Recibo")
      assert.equal(await page.getByTestId('payroll-generate-receipt-py-paid-both').count(), 1);
      assert.equal(await page.getByTestId('payroll-generate-receipt-py-pending-comm').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Marcar Pago', exact: true }).count(), 1);

      // Open receipt preview for Paid record
      await page.getByTestId('payroll-generate-receipt-py-paid-both').click();
      await page.getByTestId('payroll-receipt-preview').waitFor();
      const previewText = await page.getByTestId('payroll-receipt-preview').textContent();
      assert.ok(previewText.includes('RECIBO DE PAGAMENTO AO PROFISSIONAL'));
      assert.ok(previewText.includes('Clínica Exemplo'));
      assert.ok(previewText.includes('João Silva'));
      assert.ok(previewText.includes('Novembro/2026'));
      assert.ok(previewText.includes('17/11/2026'));
      assert.ok(previewText.includes('2.500,00'));
      assert.ok(previewText.includes('72,00'));
      assert.ok(previewText.includes('2.572,00'));
      assert.ok(previewText.includes('RP-2026-000001'));

      // Download PDF + Print actions
      await page.getByTestId('payroll-receipt-download-pdf').click();
      await page.waitForFunction(() => window.__payTestState.pdfFetched >= 1);
      await page.getByTestId('payroll-receipt-print').click();
      assert.equal(await page.evaluate(() => window.__payTestState.printed), 1);

      await page.getByRole('button', { name: 'Fechar recibo', exact: true }).click();
      await page.getByTestId('payroll-receipt-preview').waitFor({ state: 'hidden' });

      // Mark pending row as paid -> "Gerar Recibo" unlocks immediately, and commission-only omits Salário fixo!
      await page.getByRole('button', { name: 'Marcar Pago', exact: true }).first().click();
      await page.getByRole('button', { name: 'Confirmar Quitação', exact: true }).click();
      await page.getByTestId('payroll-generate-receipt-py-pending-comm').waitFor();
      await page.getByTestId('payroll-generate-receipt-py-pending-comm').click();
      await page.getByTestId('payroll-receipt-preview').waitFor();
      const commText = await page.getByTestId('payroll-receipt-preview').textContent();
      assert.ok(commText.includes('Maria Costa'));
      assert.ok(commText.includes('400,00'));
      assert.ok(commText.includes('450,00'));
      assert.equal(commText.includes('Salário fixo'), false, 'Commission-only preview omits Salário fixo line');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

      // Permission denied state preserves access gate
      await page.goto(`${base}?role=denied`);
      await page.getByText('Acesso Restrito ao Gerenciador').waitFor();

      await page.close();
      console.log(`PASS ${width}px: Gerar Recibo pós-quitação, bloqueio pendente, preview A4, PDF/print, comissão sem salário fixo e permissão`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS payroll receipts browser suite zero errors.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
