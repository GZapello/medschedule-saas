import { test, expect, type Page } from '@playwright/test';
import { login, apiLogin } from '../../helpers/session';

const evolution = (page: Page) => page.getByPlaceholder('Descreva detalhadamente o estado atual do paciente, intervenções aplicadas (cinesioterapia, mobilização articular, eletroterapia), resposta durante os exercícios e raciocínio clínico...');
async function selectPatient(page: Page, name: string) {
  // Welcome-dialog dismissal may blur and close the search popup during navigation.
  await expect(async () => {
    const search = page.getByPlaceholder('Buscar paciente pelo nome, CPF ou telefone...');
    await search.click();
    await search.fill(name);
    await page.getByText(name, { exact: true }).last().click({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

test('@critical recupera rascunho após reload e limpa formulário na troca de paciente', async ({page, request}) => {
  const headers = await apiLogin(request, 'fisio');
  await request.delete('/api/v1/clinical/draft/ZemdaFisio/pat-fisio-second', {headers});
  await login(page);
  await page.goto('/zemda-fisio');
  await selectPatient(page, 'Segundo paciente sintético');
  await expect(evolution(page)).toHaveValue('');
  const saved = page.waitForResponse(r => r.url().includes('/clinical/draft') && r.request().method() === 'POST' && r.ok());
  await evolution(page).fill('Rascunho sintético recuperável');
  await saved;
  await page.reload();
  await selectPatient(page, 'Segundo paciente sintético');
  await expect(evolution(page)).toHaveValue('Rascunho sintético recuperável');
  await page.getByTitle('Trocar paciente', {exact:true}).click();
  await selectPatient(page, 'Paciente teste fisio');
  await expect(evolution(page)).toHaveValue('');
  await page.getByRole('button', {name:'4. Dor & Zemda360',exact:true}).click();
  await expect(page.locator('[data-clinical-scale="pain"]').first().locator('output')).toHaveText('Não avaliado');
});

for (const choice of ['server','local'] as const) {
  test(`@critical conflito conserva versão escolhida: ${choice}`, async ({page,request}) => {
    const headers = await apiLogin(request,'fisio');
    await request.delete('/api/v1/clinical/draft/ZemdaFisio/pat-fisio-second', {headers});
    const serverText = 'Cópia sintética no servidor';
    const localText = 'Cópia sintética no navegador';
    expect((await request.post('/api/v1/clinical/draft',{headers,data:{moduleType:'ZemdaFisio',patientId:'pat-fisio-second',draftData:{clinicalEvolution:serverText},clientUpdatedAt:new Date(Date.now()-60000).toISOString()}})).ok()).toBeTruthy();
    await login(page);
    await page.evaluate(({text}) => localStorage.setItem('zemda_draft_ZemdaFisio_pat-fisio-second_none',JSON.stringify({draftData:{clinicalEvolution:text},clientUpdatedAt:new Date().toISOString()})), {text:localText});
    await page.goto('/zemda-fisio');
    await selectPatient(page,'Segundo paciente sintético');
    const dialog = page.getByRole('dialog',{name:'Recuperar rascunho'});
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:choice==='server'?/Versão da Nuvem/:/Versão Deste Navegador/}).click();
    await expect(dialog).toHaveCount(0);
    await expect(evolution(page)).toHaveValue(choice==='server'?serverText:localText);
    await expect.poll(async()=>{
      const response=await request.get('/api/v1/clinical/draft/ZemdaFisio/pat-fisio-second',{headers});
      return JSON.stringify(await response.json());
    }).toContain(choice==='server'?serverText:localText);
    await page.reload();
    await selectPatient(page,'Segundo paciente sintético');
    await expect(evolution(page)).toHaveValue(choice==='server'?serverText:localText);
    await expect(dialog).toHaveCount(0);
  });
}
