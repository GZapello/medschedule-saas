import { test, expect } from '../../helpers/audit-test';
import { login, apiLogin } from '../../helpers/session';

const cases = [
  { account: 'fono', module: 'ZemdaFono', route: '/zemda-fono', tab: 'finish', field: 'Descreva as atividades fonoterápicas realizadas, resposta aos estímulos, produção fonêmica e evolução vocal...', finish: 'Finalizar Atendimento e Gravar Prontuário' },
  { account: 'to', module: 'ZemdaTO', route: '/zemda-to', tab: 'finish', field: 'Descreva as atividades realizadas na sessão, desempenho do paciente, respostas sensoriais e nível de engajamento...', finish: 'Finalizar Atendimento e Gravar Prontuário' },
  { account: 'nutri', module: 'ZemdaNutri', route: '/zemda-nutri', tab: 'finish', field: 'Descreva a evolução da consulta, conduta terapêutica e recomendações...', finish: 'Finalizar Atendimento' },
  { account: 'odonto', module: 'ZemdaOdonto', route: '/zemda-odonto', tab: 'odontogram', field: 'Ex: Realizada profilaxia ultrassônica e restauração em resina composta no dente 16 (oclusal). Paciente orientado quanto à higiene interdental.', finish: 'Finalizar e Lacrar Atendimento Odontológico' },
  { account: 'med-audit', module: 'ZemdaMed', route: '/zemda-med', tab: 'conduct', field: 'Prescrição de medicamentos, posologia, solicitações de exames laboratoriais ou de imagem, encaminhamentos e orientações gerais ao paciente...', finish: 'Finalizar Consulta e Registrar no Prontuário' },
  { account: 'psico-audit', module: 'ZemdaPsico', route: '/zemda-psico', tab: 'sessions', field: 'Descreva a escuta psicológica, intervenções técnicas realizadas, resposta do paciente e observações clínicas relevantes...', finish: 'Concluir Atendimento' },
  { account: 'pp-audit', module: 'ZemdaPP', route: '/zemda-pp', tab: 'finish', field: 'Descreva a evolução psicopedagógica completa observada durante a sessão...', finish: 'Finalizar Atendimento Psicopedagógico' },
];

for (const item of cases) {
  test(`@critical ${item.module}: sidebar → autosave → F5 → revisão → recebimento → prontuário`, async ({ page, request }) => {
    const manager = await apiLogin(request, 'manager');
    const name = `e2e-patient-roundtrip-${item.account}`;
    const created = await request.post('/api/v1/patients', { headers: manager, data: { fullName: name, phone: '11999990000' } });
    expect(created.status()).toBe(201);
    const patientId = (await created.json()).id;
    await login(page, item.account);
    const headers = await apiLogin(request, item.account);
    const select = async () => {
      const search = page.locator('main input[placeholder*="Buscar paciente"], main input[placeholder*="Buscar aprendente"]').first();
      await expect(search.or(page.getByTitle('Trocar paciente', { exact: true })).first()).toBeVisible();
      if (await search.isVisible()) {
        await search.fill(name);
        await page.getByText(name, { exact: true }).last().click();
      }
      await expect(page.locator('main')).toContainText(name);
      await page.locator(`main [data-tour=tab-${item.tab}]`).click();
    };
    await page.goto(item.route, { waitUntil: 'domcontentloaded' });
    await select();
    const text = `Registro exclusivamente sintético de auditoria ${item.module}.`;
    const input = page.getByPlaceholder(item.field, { exact: true });
    const saved = page.waitForResponse(r => /\/clinical\/draft$|\/psychology\/draft$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
    await input.fill(text);
    await saved;
    await page.reload();
    await select();
    await expect(input).toHaveValue(text);
    await page.getByRole('button', { name: item.finish, exact: true }).last().click();
    const review = page.getByRole('dialog', { name: 'Resumo do atendimento' });
    await expect(review).toContainText(text);
    await expect(review).toContainText(name);
    const clinicalSaved = page.waitForResponse(r => /\/finish$|\/finish-consultation$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await review.getByRole('button', { name: 'Finalizar atendimento', exact: true }).click();
    const response = await clinicalSaved;
    expect(response.ok(), await response.text()).toBe(true);
    const result = await response.json();
    expect(result.awaitingPayment).toBe(true);
    const payment = page.getByRole('dialog', { name: 'Recebimento do atendimento' });
    await expect(payment).toBeVisible();
    await payment.getByLabel('Valor do atendimento').fill('180');
    await payment.getByLabel('Forma de pagamento').selectOption('pix');
    await payment.getByLabel('Status do recebimento').selectOption('paid');
    const paid = page.waitForResponse(r => /\/appointments\/[^/]+\/finish$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await payment.getByRole('button', { name: 'Confirmar e finalizar', exact: true }).click();
    const paidResponse = await paid;
    expect(paidResponse.ok(), await paidResponse.text()).toBe(true);
    const appointmentId = paidResponse.url().split('/').at(-2)!;
    await expect(payment).toHaveCount(0);
    const completion = await request.get(`/api/v1/appointments/${appointmentId}/completion`, { headers });
    const state = await completion.json();
    expect(state.alreadyCompleted).toBe(true);
    expect(state.payment.status).toBe('paid');
    expect(Number(state.payment.amount)).toBe(180);
    const records = await request.get(`/api/v1/clinical-records/patient/${patientId}`, { headers });
    expect(records.ok()).toBe(true);
    expect(JSON.stringify(await records.json())).toContain(text);
    const repeated = await request.post(`/api/v1/appointments/${appointmentId}/finish`, { headers, data: { payment: { amount: 180, paymentMethod: 'pix', status: 'paid' } } });
    expect((await repeated.json()).alreadyCompleted).toBe(true);
  });
}
