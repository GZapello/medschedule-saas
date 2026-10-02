import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/agendar/clinica/clinica-psicom');await page.getByRole('button',{name:'Rejeitar não necessários',exact:true}).click();});

test('clinic specialty/professional/date/time/patient/confirmation and refresh',async({page,request},info)=>{
 const fixture=await(await request.get('/api/__test/fixture')).json();
 await page.goto('/agendar/clinica/clinica-psicom');
 await expect(page.getByRole('heading',{name:'Clínica Psicom',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'O que você procura?'})).toBeVisible();
 await expect(page.getByRole('img',{name:'Zemda',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:`test-results/public-booking/areas-${info.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:/^Psicologia/}).click();
 await expect(page.getByRole('button',{name:/Ana Souza/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Beatriz Lima/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Carlos Lima/})).toHaveCount(0);
 await page.getByRole('button',{name:/Ana Souza/}).click();
 await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByLabel('Data do atendimento',{exact:true}).fill(fixture.date);
 await page.getByRole('button',{name:'Ver horários'}).click();
 await expect(page.getByRole('heading',{name:'Escolha o horário'})).toBeVisible();
 await expect(page.getByRole('button',{name:/^\d\d:\d\d$/}).first()).toBeVisible();
 await page.getByRole('button',{name:/^\d\d:\d\d$/}).first().click();
 await page.screenshot({path:`test-results/public-booking/slots-${info.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByLabel('Nome completo',{exact:true}).fill('Paciente sintético '+info.project.name);
 await page.getByLabel('Telefone / WhatsApp',{exact:true}).fill('11987654321');
 await page.getByRole('button',{name:'Confirmar agendamento',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Agendamento realizado',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Adicionar ao calendário'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Voltar ao Início|Landing/})).toHaveCount(0);
 await page.screenshot({path:`test-results/public-booking/success-${info.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Novo agendamento'}).click();
 await expect(page.getByRole('heading',{name:'O que você procura?'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'O que você procura?'})).toBeVisible();
});

test('unique professional, back one stage, empty date and useful exits',async({page,request})=>{
 const fixture=await(await request.get('/api/__test/fixture')).json();
 await page.goto('/agendar/clinica/clinica-psicom');await page.getByRole('button',{name:/^Fisioterapia/}).click();
 await expect(page.getByRole('heading',{name:'Escolha a data'})).toBeVisible();
 await expect(page.getByText('Carlos Lima',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Voltar',exact:true}).click();await expect(page.getByRole('heading',{name:'Escolha o profissional'})).toBeVisible();
 await page.getByRole('button',{name:'Voltar',exact:true}).click();await expect(page.getByRole('heading',{name:'O que você procura?'})).toBeVisible();
 await page.getByRole('button',{name:/^Fisioterapia/}).click();
 const far=new Date(fixture.date+'T12:00:00Z');far.setUTCDate(far.getUTCDate()+100);
 await page.getByLabel('Data do atendimento',{exact:true}).fill(far.toISOString().slice(0,10));await page.getByRole('button',{name:'Ver horários'}).click();
 await expect(page.getByRole('heading',{name:'Nenhum horário disponível nesta data.'})).toBeVisible();
 await page.getByRole('button',{name:'Escolher outra data'}).click();await expect(page.getByRole('heading',{name:'Escolha a data'})).toBeVisible();
 await page.getByRole('button',{name:'Ver horários'}).click();await page.getByRole('button',{name:'Escolher outro profissional'}).click();await expect(page.getByRole('heading',{name:'Escolha o profissional'})).toBeVisible();
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Ver horários'}).click();await page.getByRole('button',{name:'Voltar para especialidades'}).click();await expect(page.getByRole('heading',{name:'O que você procura?'})).toBeVisible();
 expect(page.url()).toContain('/agendar/clinica/clinica-psicom');
});

test('individual legacy link, light branding, disabled page, duplicate route',async({page})=>{
 await page.goto('/agendar/legacy-clinic-1/ana-antiga');await expect(page.getByRole('heading',{name:'Escolha a data'})).toBeVisible();
 await expect(page.getByText('Ana Souza',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Voltar/})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'Escolha a data'})).toBeVisible();
 await page.goto('/agendar/ana-antiga');await expect(page.getByRole('heading',{name:'Escolha a data'})).toBeVisible();
 await page.goto('/agendar/legacy-clinic-1/oculto');await expect(page.getByRole('heading',{name:'Agendamento indisponível'})).toBeVisible();
 for(const sequence of [2,3]){const response=page.waitForResponse(r=>r.url().includes(`/v1/public/tenants/clinica-psicom?bookingSequence=${sequence}`));await page.goto(`/agendar/clinica/clinica-psicom/${sequence}`);expect((await response).status()).toBe(404);await expect(page.getByRole('heading',{name:'Agendamento indisponível'})).toBeVisible();await expect(page.getByRole('button',{name:/Voltar ao Início/})).toHaveCount(0);}
});

test('conflict shows recovery and clears the selected slot',async({page,request})=>{
 const fixture=await(await request.get('/api/__test/fixture')).json();
 await page.goto('/agendar/legacy-clinic-1/ana-antiga');await page.getByLabel('Data do atendimento',{exact:true}).fill(fixture.date);await page.getByRole('button',{name:'Ver horários'}).click();await page.getByRole('button',{name:/^\d\d:\d\d$/}).first().click();await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByLabel('Nome completo',{exact:true}).fill('Conflito sintético');await page.getByLabel('Telefone / WhatsApp',{exact:true}).fill('11987654321');
 await page.route('**/v1/public/appointments',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Conflito',code:'SLOT_UNAVAILABLE'})}));
 await page.getByRole('button',{name:'Confirmar agendamento',exact:true}).click();await expect(page.getByRole('heading',{name:'Escolha o horário'})).toBeVisible();await expect(page.getByRole('alert')).toContainText('Este horário não está mais disponível');await expect(page.getByRole('button',{name:'Continuar',exact:true})).toBeDisabled();
});
