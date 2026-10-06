import { test, expect } from '@playwright/test';
import { login, apiLogin } from '../../helpers/session';

test('Estetic salva rascunho e exige revisão antes de gravar a finalização', async ({ page, request }) => {
  await login(page, 'estetic');
  await page.getByRole('heading', {name:'Paciente sintético estética',exact:true}).locator('xpath=ancestor::div[.//button[@title="Iniciar Atendimento Rápido"]][1]').getByTitle('Iniciar Atendimento Rápido').click();
  await page.getByRole('button', { name: 'Abrir ZemdaEstetic', exact: true }).first().click();
  const workspace = page.getByTestId('zemda-estetic-workspace');
  await workspace.getByRole('button', { name: 'Avaliação Estética', exact: true }).click();
  const complaint = workspace.locator('textarea').first();
  await expect(complaint).toHaveValue('');
  const text = 'Queixa sintética informada explicitamente no teste.';
  const saved = page.waitForResponse(r => r.url().includes('/clinical/draft') && r.request().method() === 'POST' && r.ok());
  await complaint.fill(text);
  await saved;
  await workspace.getByRole('button', { name: 'Finalizar atendimento', exact: true }).click();
  await page.getByRole('button', { name: 'Concluir Atendimento', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Resumo do atendimento' });
  await expect(review).toContainText(text);
  await expect(review).toContainText('Paciente sintético estética');
  const headers = await apiLogin(request, 'estetic');
  const records = await request.get('/api/v1/clinical-records/patient/pat-estetic', { headers });
  expect(await records.json()).toHaveLength(0);
  await review.getByRole('button', { name: 'Voltar e editar' }).click();
  await expect(review).toHaveCount(0);
  await page.getByRole('button', { name: 'Concluir Atendimento', exact: true }).click();
  await review.getByRole('button', { name: 'Finalizar atendimento', exact: true }).click();
  await expect.poll(async () => {
    const response = await request.get('/api/v1/clinical-records/patient/pat-estetic', { headers });
    return JSON.stringify(await response.json());
  }).toContain(text);
});
