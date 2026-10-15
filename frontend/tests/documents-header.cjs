// Real header/sidebar/document components with synthetic identity/data and no external traffic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const esbuild=require('esbuild'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/documents-header');fs.mkdirSync(out,{recursive:true});
(async()=>{
 await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {Navbar} from './src/components/common/Navbar';import {Sidebar} from './src/components/common/Sidebar';import {useClinicDocumentData} from './src/components/common/ClinicDocumentHeader';import {PsychopedagogyDocumentModal} from './src/components/psychopedagogy/PsychopedagogyDocumentModal';import {PatientFollowUpDocumentModal} from './src/components/clinical/PatientFollowUpDocumentModal';import {PrintableDocumentModal} from './src/components/clinical/PrintableDocumentModal';function ClinicProbe(){const state=useClinicDocumentData();window.qaClinicState=state;return <div data-testid='clinic-probe'>{state.clinic?.name || 'Carregando clínica'}</div>;}const root=createRoot(document.getElementById('root'));window.qaRender=(mode,type='certificate',id='qa')=>root.render(mode==='psychopedagogy'?<PsychopedagogyDocumentModal key={type} isOpen onClose={()=>{}} patient={{id:'patient-QA',full_name:'Paciente QA',birth_date:'1990-01-15'}} initialDocType={type} sessionData={{session_date:'2026-10-13',session_time:null}}/>:mode==='followup'?<PatientFollowUpDocumentModal isOpen onClose={()=>{}} patientId='patient-QA' patientName='Paciente QA' appointmentId='appointment-QA' professionalName='Nome incorreto sugerido' professionalCouncil='REG ERRADO'/>:mode==='clinic'?<ClinicProbe/>:mode==='header'?<><Navbar onToggleSidebar={()=>{}} onNavigate={()=>{}}/><Sidebar currentView="dashboard" onNavigate={()=>{}} isOpen={false} onClose={()=>{}}/></>:<PrintableDocumentModal documentType={type} documentId={id} onClose={()=>{}}/>);window.qaRender('header');`,resolveDir:root,loader:'tsx'},bundle:true,format:'iife',outfile:path.join(out,'app.js'),jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixture',setup(build){
  build.onLoad({filter:/[\\/]context[\\/]AuthContext\.tsx$/},()=>({contents:'export const useAuth=()=>window.qaAuth;',loader:'js'}));
  build.onLoad({filter:/[\\/]context[\\/]ToastContext\.tsx$/},()=>({contents:'export const useToast=()=>({showToast:()=>{}});',loader:'js'}));
  build.onLoad({filter:/[\\/]onboarding[\\/]OnboardingContext\.tsx$/},()=>({contents:'export const useOnboarding=()=>({openHelp:()=>{}});',loader:'js'}));
  build.onLoad({filter:/[\\/]api[\\/]client\.ts$/},()=>({contents:"export const getApiBaseUrl=()=>'/api';export const buildApiUrl=(a,b)=>a+b;export const ApiClient={getBaseUrl:()=>'/api',get:p=>window.qaGet(p),post:()=>{throw Error('Writes prohibited')},put:()=>{throw Error('Writes prohibited')}};",loader:'js'}));
 }}]});
 const css=fs.readFileSync(path.join(root,'dist/assets',fs.readdirSync(path.join(root,'dist/assets')).find(n=>/^index-.*\.css$/.test(n))),'utf8');
 const server=http.createServer((req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(out,'app.js')));return;}
  if(req.url==='/logo.png' || req.url==='/brand/zemda-logo.png'){res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(path.join(root,'public/brand/zemda-logo.png')));return;}
  res.setHeader('Content-Type','text/html');res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({timezoneId:'America/Sao_Paulo'}),results=[];
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript(()=>{
  const name='Consultório de Atendimento Multidisciplinar Gabriel Zapello com nome muito extenso';
  window.qaSwitches=[];window.qaAuth={currentTenant:{id:'A',name},currentUser:{id:'owner',name:'Owner'},isClinicAdmin:true,isSuperAdmin:false,hasPermission:()=>true,hasCapability:()=>true,clientTermLabel:'Paciente',switchTenant:async id=>{window.qaSwitches.push(id);}};
  window.qaDocument={id:'qa',certificate_type:'attendance',days_off:0,patient_name:'Paciente QA',patient_cpf:'123.456.789-09',patient_birth:'1990-01-15',clinic_name:'Clínica A',logo_url:'/logo.png',professional_name:'Profissional atual',signed_by_name:'Profissional emissor',signed_by_registration:'CRFa 12345',registration_number:'12345',registration_type:'CRFa',attendance_date:'2026-10-13',attendance_time:'14:25',signed_at:'2026-10-15T03:00:00Z',content:'Conteúdo prescrito QA',exams_list:'Exames solicitados QA'};
  window.qaGet=async endpoint=>{
   if(endpoint==='/v1/auth/memberships')return [{id:'A',name,role:'clinic_admin'},{id:'B',name:'Clínica B',role:'professional'}];
   if(endpoint.includes('digital-signatures'))return {};
   if(endpoint==='/v1/clinics/current'){const clinic={...window.qaAuth.currentTenant};if(window.qaDelay)await new Promise(r=>setTimeout(r,window.qaDelay));return clinic;}
   if(endpoint==='/v1/appointments/appointment-QA')return {appointment:{id:'appointment-QA',patient_id:'patient-QA',professional_name:'Profissional da consulta',registration_type:'CRFa',registration_number:'67890',attendance_date:'2026-10-13',attendance_time:'14:25'}};
   if(endpoint==='/v1/patients/patient-QA')return {patient:{id:'patient-QA',birth_date:'1990-01-15'}};
   if(window.qaFail)throw Error('Document failed');
   const snapshot={...window.qaDocument};if(window.qaDelay)await new Promise(r=>setTimeout(r,window.qaDelay));
   return {document:snapshot,template:null};
  };
  window.qaPrints=0;window.print=()=>window.qaPrints++;
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 try {
  for(const width of [320,360,390,430,768,1280,1920]) {
   await page.setViewportSize({width,height:900});await page.getByRole('combobox',{name:'Trocar clínica ativa',exact:true}).waitFor();
   if(width<1024)await page.waitForFunction(()=>document.querySelector('aside').getBoundingClientRect().right<=1);
   assert.equal(await page.getByRole('combobox').count(),1);assert.equal(await page.locator('aside select').count(),0);
   assert.equal(await page.getByText('Online',{exact:true}).count(),0);assert.equal(await page.getByText('Clínica Ativa',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);
   assert.ok(await page.getByRole('button',{name:'Ajuda',exact:true}).isVisible());assert.ok(await page.getByRole('button',{name:'Configurações',exact:true}).isVisible());
   const size=await page.getByRole('combobox').boundingBox();assert.ok(size.width<=240);
   const settings=await page.getByRole('button',{name:'Configurações',exact:true}).boundingBox();assert.ok(settings.x>=0 && settings.x+settings.width<=width);
   if(width===390 || width===1280)await page.screenshot({path:path.join(out,'header-'+width+'.png')});
   results.push({scenario:'compact-header',width,passed:true});
  }
  await page.getByRole('combobox').selectOption('B');assert.deepEqual(await page.evaluate(()=>window.qaSwitches),['B']);
  await page.setViewportSize({width:900,height:1100});
  for(const type of ['certificate','prescription','exam_request','pending_exam']) {
   await page.evaluate(type=>window.qaRender('document',type,'qa'),type);await page.locator('#printable-doc-sheet').waitFor();
   const text=await page.locator('#printable-doc-sheet').innerText();assert.ok(text.includes('13/10/2026'));assert.ok(text.includes('14:25'));assert.ok(text.includes('15/01/1990'));assert.ok(text.includes('Profissional emissor'));
   if(type==='certificate'){assert.ok(text.toLocaleLowerCase().includes('declaração de comparecimento'));assert.ok(!text.includes('repouso'));assert.ok(!text.includes('Atestado Médico'));}
   await page.getByRole('button',{name:'Imprimir',exact:true}).click();await page.getByRole('button',{name:'Baixar PDF',exact:true}).click();
   const pdf=await page.pdf({path:path.join(out,type+'.pdf'),format:'A4',printBackground:true});assert.ok(pdf.length>5000);
   await page.emulateMedia({media:'print'});assert.equal(await page.getByRole('button',{name:'Imprimir',exact:true}).isVisible(),false);
   if(type==='certificate')await page.screenshot({path:path.join(out,'certificate-print.png'),fullPage:true});
   await page.emulateMedia({media:'screen'});results.push({scenario:'print/PDF',type,passed:true});
  }
  assert.equal(await page.evaluate(()=>window.qaPrints),8);
  await page.evaluate(()=>{window.qaDocument.certificate_type='rest';window.qaDocument.days_off=2;window.qaDocument.start_date='2026-10-13';window.qaRender('document','certificate','rest');});
  await page.getByText('a contar de 13/10/2026.',{exact:false}).waitFor();assert.ok((await page.locator('#printable-doc-sheet').innerText()).includes('2 dia(s)'));
  await page.pdf({path:path.join(out,'certificate-rest.pdf'),format:'A4',printBackground:true});
  results.push({scenario:'rest certificate date/days/PDF',passed:true});
  await page.evaluate(()=>{window.qaDocument.attendance_time=null;window.qaRender('document','certificate','no-time');});
  await page.waitForFunction(()=>!document.querySelector('#printable-doc-sheet')?.textContent.includes('14:25'));
  await page.locator('#printable-doc-sheet').waitFor();assert.ok(!(await page.locator('#printable-doc-sheet').innerText()).includes('Horário do atendimento:'));
  results.push({scenario:'unknown-time omitted',passed:true});
  await page.evaluate(()=>window.qaRender('followup'));await page.getByRole('button',{name:'Imprimir / PDF A4',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('button[title=\"Imprimir / PDF A4\"]')?.disabled);
  const followup=await page.locator('body').innerText();assert.ok(followup.includes('Profissional da consulta'));assert.ok(followup.includes('CRFa: 67890'));assert.ok(followup.includes('15/01/1990'));assert.ok(followup.includes('13/10/2026'));assert.ok(followup.includes('14:25'));assert.ok(!followup.includes('REG ERRADO'));assert.ok(!followup.includes('Nome incorreto sugerido'));
  results.push({scenario:'followup appointment issuer/date/time',passed:true});
  for(const type of ['relatorio','parecer','encaminhamento','orientacoes']) {
   await page.evaluate(type=>window.qaRender('psychopedagogy',type),type);await page.locator('#printable-pp-sheet').waitFor();
   const sheet=await page.locator('#printable-pp-sheet').innerText();assert.ok(sheet.includes('Paciente QA'));assert.ok(sheet.includes('15/01/1990'));assert.ok(sheet.includes('13/10/2026'));assert.ok(!sheet.includes('Horário:'));
   const editor=page.getByRole('textbox').last();await editor.fill('Conteúdo revisado QA');await page.getByText('Conteúdo revisado QA',{exact:true}).last().waitFor();
   results.push({scenario:'psychopedagogy editable document, missing time',type,passed:true});
  }
  await page.evaluate(()=>{window.qaFail=true;window.qaRender('document','certificate','missing');});await page.getByRole('alert').waitFor();assert.equal(await page.locator('#printable-doc-sheet').count(),0);
  results.push({scenario:'load-error',passed:true});assert.deepEqual(errors,[]);
  await page.evaluate(()=>{window.qaFail=false;window.qaRender('clinic');});await page.waitForFunction(()=>window.qaClinicState?.canIssue);
  await page.evaluate(()=>{window.qaDelay=500;window.qaAuth.currentTenant={id:'B',name:'Clínica B'};window.qaRender('clinic');});
  await page.getByText('Carregando clínica',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qaClinicState.canIssue),false);
  await page.getByText('Clínica B',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qaClinicState.clinic.id),'B');
  results.push({scenario:'clinic document header isolation',passed:true});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(`PASS: ${results.length} header/document rendering cases; unique switcher, no Online, 7 viewports, dates, issuer, missing times, print buttons and 5 A4 PDFs.`);
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
