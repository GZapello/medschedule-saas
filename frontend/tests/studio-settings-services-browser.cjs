const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');
async function main() {
 const root = path.resolve(__dirname, '..');
 const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import {AuthProvider} from './src/context/AuthContext'; import {ToastProvider} from './src/context/ToastContext';
 import {ApiClient} from './src/api/client'; import {SettingsView} from './src/components/settings/SettingsView';
 localStorage.setItem('auth_token','fixture'); ApiClient.setCustomBaseUrl(location.origin);
 createRoot(document.querySelector('main')).render(<AuthProvider><ToastProvider><SettingsView initialSection={new URLSearchParams(location.search).get('section') || 'services'}/></ToastProvider></AuthProvider>);
 ` }, bundle: true, write: false, format:'esm', outfile:'main.js', jsx:'automatic', define:{'import.meta.env':'{}'} });
 const assets=path.join(root,'dist/assets'); const css=fs.readFileSync(path.join(assets,fs.readdirSync(assets).find(f=>/^index-.*\.css$/.test(f))),'utf8') + bundle.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
 const server=http.createServer((req,res)=>{
  if(req.url==='/main.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).text);}
  res.setHeader('Content-Type','text/html'); res.end('<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>'+css+'</style><main></main><script type="module" src="/main.js"></script>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch();
 const option={id:'annual',label:'Anual',active:true,modality:'any',accessType:'unlimited',frequencyType:'unlimited',frequencyCount:null,contractDurationCode:'12_months',paymentPeriodicity:'monthly',participantsCount:1,commercialUnit:'per_month',amountCents:9999,installmentsCount:1,fidelityMonths:0,gracePeriodDays:0,autoRenew:true,creditMode:'unlimited',allowPublicBooking:true,allowOptionalAddons:false};
 const addons={enabled:false,allowMultiple:false,noAddonLabel:'Não adicionar',promptTitle:'Deseja adicionar acompanhamento personalizado?',options:[]}; let checks=0;
 try {for(const profile of ['studio','mixed','clinic']) for(const width of [390,1440]) {
  const page=await browser.newPage({viewport:{width,height:1000}}); page.setDefaultTimeout(12000);
  const writes=[], errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const studio=profile!=='clinic', tenant={id:'test',name:'Zemda teste',establishment_profile:profile};
  const professional={id:'charlyze',name:'Charlyze',active:1,profession_id:'prof-personal-trainer',profession_name:'Personal Trainer',available_modules:[{code:'ZemdaPersonal',label:'Personal Trainer (ZemdaPersonal)'}]};
  const service={id:'muscle',name:studio?'Musculação':'Consulta',professional_id:'charlyze',linked_professional_ids:['charlyze'],clinical_module:'ZemdaPersonal',duration_minutes:50,buffer_minutes:10,price:0,active:1,modality:'presential',service_domain:studio?'studio':'clinical',service_kind:'individual',studio_service_type:'individual',requires_appointment:1,allow_single_booking:studio?0:1,allow_plan_booking:studio?1:0,allow_public_booking:1,allow_public_single_booking:0,allow_public_plan_booking:1,billing_mode:studio?'annual':'per_session',periodic_price:studio?99.99:null,commercial_price_options:studio?[option]:[],optional_addons:addons,allow_recurrence:1,plan_credit_mode:'unlimited'};
  const commissionServices=[
   {...service,service_id:'muscle',service_name:service.name,is_studio:studio},
   {service_id:'personal',service_name:'Acompanhamento Personal',is_studio:studio,price:0,allow_single_booking:false,allow_plan_booking:true,billing_mode:'monthly',periodic_price:120,commercial_price_options:[{...option,id:'personal',label:'Mensal',accessType:'scheduled',frequencyType:'weekly',frequencyCount:1,contractDurationCode:'1_month',amountCents:12000,creditMode:'fixed_credits',creditsPerCycle:4}]},
   {service_id:'both',service_name:'Pilates',is_studio:studio,price:50,allow_single_booking:true,allow_plan_booking:true,commercial_price_options:[{...option,accessType:'scheduled',frequencyType:'weekly',frequencyCount:2,label:'Anual total',commercialUnit:'contract_total',amountCents:120000}]},
   {service_id:'free',service_name:'Aula experimental',is_studio:studio,price:0,allow_single_booking:true,allow_plan_booking:false},
   {service_id:'frequency',service_name:'Funcional',is_studio:studio,price:0,allow_single_booking:false,allow_plan_booking:true,billing_mode:'monthly',frequency_pricing:{version:1,enabled:true,unit:'per_period',tables:{monthly:{'2':18000}}}}
  ];
  await page.route('**/v1/**',async route=>{
   const request=route.request(), p=new URL(request.url()).pathname; let result=[];
   if(request.method()!=='GET'){writes.push({p,body:request.postDataJSON()});result={id:service.id,...service,...request.postDataJSON()};}
   else if(p.endsWith('/auth/me'))result={user:{id:'admin',name:'Gestor',role:'clinic_admin'},tenant};
   else if(p.endsWith('/clinics/current'))result=tenant;
   else if(p.endsWith('/services'))result=[service];
   else if(p.endsWith('/professionals'))result=[professional];
   else if(p.endsWith('/professionals/charlyze'))result={...professional,schedules:[]};
   else if(p.endsWith('/service-commissions'))result={services:commissionServices};
   else if(p.endsWith('/packages'))result={packages:[]};
   else if(p.endsWith('/staff/invites'))result={invites:[]};
   else if(p.endsWith('/staff'))result={staff:[]};
   else if(p.endsWith('/templates'))result={templates:[]};
   else if(p.includes('/class-schedules'))result={schedules:[],weeklySummary:[]};
   else if(p.endsWith('/addon-candidates'))result={services:[]};
   await route.fulfill({json:result});
  });
  await page.goto(url+'/configuracoes?section=services');
  if(studio){
    await page.getByText('Serviços gerais da Academia & Studio',{exact:true}).waitFor();
    const cardText=await page.locator('div.rounded-xl.border').filter({hasText:'Musculação'}).first().innerText();
    assert.ok(!/ZemdaPersonal/.test(cardText),'Musculacao card hides clinical module');
    assert.ok(!/50\s*min/.test(cardText),'Musculacao card hides duration');
    assert.match(cardText,/Planos a partir de R\$\s*99,99|Plano\s+R\$\s*99,99/); checks+=3;
  }
  await page.getByTitle('Editar Serviço',{exact:true}).click();
  const modal=page.locator('.mobile-modal').last();
  if(studio){
   assert.equal(await modal.getByText('Profissional Responsável',{exact:false}).count(),0);
   assert.equal(await modal.getByText('Módulo do atendimento',{exact:false}).count(),0);
   if(profile==='studio'&&width===1440){
    const summaryText=await modal.getByLabel('Resumo do serviço',{exact:true}).innerText();
    assert.match(summaryText,/Sem aula avulsa/);
    assert.match(summaryText,/Contrato:\s*Anual \(12 meses\)/);
    assert.match(summaryText,/Cobrança mensal/);
    assert.match(summaryText,/Equiv\.\s*mensal:\s*R\$\s*99,99\/mês/);
    assert.match(summaryText,/Total contrato:\s*R\$\s*1\.199,88/); checks+=5;
   }
   await modal.getByRole('button',{name:'Salvar Alterações',exact:true}).click(); await page.waitForTimeout(150);
   assert.equal(writes.length,1,'SettingsView saves edited access'); const edited=writes[0].body;
   assert.equal(edited.studioServiceType,'facility_access'); assert.equal(edited.professionalId,null); assert.deepEqual(edited.linkedProfessionalIds,[]);
   assert.equal(edited.clinicalModule,null); assert.equal(edited.durationMinutes,0); assert.equal(edited.bufferMinutes,0); assert.equal(edited.requiresAppointment,false);
   assert.equal(edited.commercialPriceOptions[0].amountCents,9999); assert.equal(edited.commercialPriceOptions[0].paymentPeriodicity,'monthly'); assert.equal(edited.commercialPriceOptions[0].contractDurationCode,'12_months'); assert.deepEqual(edited.optionalAddons,addons); checks+=14;
   await page.getByRole('button',{name:'Cadastrar Aula',exact:true}).click();
   if(profile==='mixed')await page.getByRole('button',{name:'Aula / Serviço de Studio',exact:true}).click();
   await page.getByRole('button',{name:/Tipo A — Acesso ao Estabelecimento/}).click();
   const create=page.locator('.mobile-modal').last();
   assert.equal(await create.getByText('Profissional Responsável',{exact:false}).count(),0);
   assert.equal(await create.getByText('Módulo do atendimento',{exact:false}).count(),0);
   await create.getByPlaceholder('Ex: Musculação — Acesso Livre').fill('Acesso limitado');
   const billing=create.locator('[data-studio-section="billing"] h4 > button');
   if(await billing.count() && await billing.getAttribute('aria-expanded')==='false')await billing.click();
   await create.locator('label').filter({hasText:'Valor por período'}).locator('xpath=ancestor::div[descendant::input][1]').locator('input').first().fill('154');
   await create.getByRole('button',{name:'Salvar Serviço',exact:true}).click(); await page.waitForTimeout(150);
   assert.equal(writes.length,2,'SettingsView creates access without professional'); assert.equal(writes[1].body.professionalId,null); assert.equal(writes[1].body.requiresAppointment,false); checks+=5;
  }else{
   assert.equal(await modal.getByText('Profissional Responsável',{exact:false}).count(),1);
   assert.equal(await modal.getByText('Módulo do atendimento',{exact:false}).count(),1); checks+=2;
  }
  await page.goto(url+'/configuracoes?section=team');
  await page.getByRole('button',{name:/Ficha|Editar/}).first().click();
  await page.getByRole('button',{name:'Financeiro',exact:true}).click();
  await page.getByText('Comissões por Serviço / Modalidade (Opcional)',{exact:true}).waitFor();
  if(studio){
   const muscle=await page.getByLabel('Preços de Musculação',{exact:true}).innerText(); assert.match(muscle,/Sem aula avulsa/); assert.match(muscle,/Plano Anual: R\$\s*99,99/);
   const personal=await page.getByLabel('Preços de Acompanhamento Personal',{exact:true}).innerText(); assert.match(personal,/Sem aula avulsa/); assert.match(personal,/120,00/);
   const both=await page.getByLabel('Preços de Pilates',{exact:true}).innerText(); assert.match(both,/Avulso: R\$\s*50,00/); assert.match(both,/Valor total do contrato/); assert.match(both,/Por cobrança: R\$\s*100,00/);
   assert.match(await page.getByLabel('Preços de Aula experimental').innerText(),/Avulso: R\$\s*0,00/);
   assert.match(await page.getByLabel('Preços de Funcional').innerText(),/Plano 2x\/semana: R\$\s*180,00/); checks+=9;
  }else{assert.equal(await page.getByText('Sem aula avulsa',{exact:true}).count(),0);checks++;}
  assert.deepEqual(errors,[],'No runtime errors'); await page.close(); console.log(`PASS /configuracoes ${profile} ${width}px`);
 }
 console.log(`PASS ${checks} SettingsView/editor/financial UI checks`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
