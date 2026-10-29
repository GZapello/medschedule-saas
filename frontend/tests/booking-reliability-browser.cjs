const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {build}=require('esbuild');const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{NewAppointmentModal,parseAppointmentPrice}from'./src/components/calendar/NewAppointmentModal';import{ApiClient}from'./src/api/client';
 window.parsePrice=parseAppointmentPrice;window.saved=[];window.failStatus=null;window.delay=0;window.slotDelay=0;window.services=[{id:'s1',name:'Consulta',price:150,duration_minutes:30},{id:'s2',name:'Consulta inicial',price:200,duration_minutes:30}];
 ApiClient.get=async(p)=>{if(p.includes('/slots/')){const delay=window.slotDelay;await new Promise(r=>setTimeout(r,delay));}return p==='/v1/services'?window.services:p==='/v1/professionals'?[{id:'pro',name:'Profissional'}]:p.includes('/slots/')?{slots:[{startTime:'2026-11-10T10:00:00',endTime:'2026-11-10T10:30:00',time:'10:00'}]}:[];};
 ApiClient.post=async(p,b)=>{window.saved.push({p,b});await new Promise(r=>setTimeout(r,window.delay));if(window.failStatus!==null){const e=new Error('Mensagem de validação');e.status=window.failStatus;throw e;}return{id:'appointment'}};ApiClient.put=ApiClient.patch=()=>{throw Error('Service mutation forbidden')};
 function Fixture(){const[open,setOpen]=React.useState(true);return <><button onClick={()=>setOpen(true)}>Reabrir</button><NewAppointmentModal isOpen={open} onClose={()=>setOpen(false)} onSuccess={()=>{}}/></>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
 const stubs={
 'AuthContext.tsx':`export const useAuth=()=>({clientTermLabel:'Paciente',isProfessional:false,currentUser:{},isClinicAdmin:true,hasPermission:()=>true});`,
 'ToastContext.tsx':`export const useToast=()=>({showToast:(message)=>window.toast=message});`,
 'PatientSearchSelect.tsx':`import React from'react';export const PatientSearchSelect=({onChange})=><button onClick={()=>onChange('patient',{id:'patient',full_name:'Paciente'})}>Selecionar paciente teste</button>;`,
 'NewServiceModal.tsx':`import React from'react';export const NewServiceModal=({isOpen,onSuccess})=>isOpen?<button onClick={()=>{window.services=[...window.services,{id:'s3',name:'Novo serviço',price:180,duration_minutes:30}];onSuccess({id:'s3'})}}>Criar serviço teste</button>:null;`,
 };
 for(const name of ['NewPatientModal','NewInsuranceModal','NewRoomModal'])stubs[name+'.tsx']=`export const ${name}=()=>null;`;
 const bundle=await build({stdin:{contents:fixture,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/\.tsx$/},args=>{const content=stubs[path.basename(args.path)];if(content)return{contents:content,loader:'tsx',resolveDir:path.dirname(args.path)}})}}]});
 const cssFile=fs.readdirSync(path.join(root,'dist/assets')).find(f=>/^index-.*\.css$/.test(f));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(root,'dist/assets',cssFile),'utf8')}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try{
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:1000}});await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel('Valor da consulta *').waitFor();
  await page.getByRole('button',{name:'Selecionar paciente teste'}).click();
  await page.getByText('10:00',{exact:true}).waitFor();
  const confirm=page.getByRole('button',{name:/Confirmar Agendamento/i});
  assert.equal(await confirm.isDisabled(),true,'must select a slot');
  for(const [status,title] of [[500,'Não foi possível concluir'],[403,'Acesso não autorizado'],[400,'Revise os dados'],[0,'Falha de conexão'],[409,'Horário indisponível']]) {
    await page.evaluate(s=>{window.failStatus=s;window.saved=[]},status);
    await page.getByText('10:00',{exact:true}).click();
    await confirm.click();
    await page.getByText(title+':',{exact:true}).waitFor();
    assert.equal(await page.getByText('Conflito Detectado:',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.saved.length),1);
  }
  await page.evaluate(()=>{window.failStatus=null;window.delay=150;window.saved=[]});
  await page.getByText('10:00',{exact:true}).click();
  // Two immediate native clicks exercise the synchronous submission guard.
  await confirm.evaluate(button=>{button.click();button.click()});
  await page.waitForFunction(()=>window.saved.length===1);
  await page.getByRole('heading',{name:'Novo Agendamento',exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.saved.length),1);
  assert.equal(await page.evaluate(()=>window.saved[0].b.roomId),null);
  assert.equal(await page.evaluate(()=>window.saved[0].b.startTime),'2026-11-10T10:00:00');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.close();
 }
 console.log('PASS shared booking form: missing slot, server/permission/validation/network/conflict messages, double-click guard and payload at 320/390/1280');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
