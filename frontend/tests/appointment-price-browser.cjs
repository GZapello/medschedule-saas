const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {build}=require('esbuild');const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{NewAppointmentModal,parseAppointmentPrice}from'./src/components/calendar/NewAppointmentModal';import{ApiClient}from'./src/api/client';
 window.parsePrice=parseAppointmentPrice;window.saved=[];window.services=[{id:'s1',name:'Consulta',price:150,duration_minutes:30},{id:'s2',name:'Consulta inicial',price:200,duration_minutes:30}];
 ApiClient.get=async(p)=>p==='/v1/services'?window.services:p==='/v1/professionals'?[{id:'pro',name:'Profissional'}]:p.includes('/slots/')?{slots:[{startTime:'2026-11-10T10:00:00',endTime:'2026-11-10T10:30:00',time:'10:00'}]}:[];
 ApiClient.post=async(p,b)=>{window.saved.push({p,b});return{id:'appointment'}};ApiClient.put=ApiClient.patch=()=>{throw Error('Service mutation forbidden')};
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
  const field=page.getByLabel('Valor da consulta *');await field.waitFor();await page.waitForFunction(()=>document.getElementById('appointment-price').value==='150,00');
  assert.deepEqual(await page.evaluate(()=>['150','150,00','150.50','1.234,56','0','-1','NaN','1e3','12,345'].map(window.parsePrice)),[150,150,150.5,1234.56,0,null,null,null,null]);
  await field.click();
  assert.equal(await page.getByRole('button',{name:'+ Adicionar novo serviço',exact:true}).count(),0,'editing price does not open dropdown');
  await page.getByRole('button',{name:'Consulta',exact:true}).click();await page.getByRole('button',{name:'+ Adicionar novo serviço',exact:true}).waitFor({state:'visible'});await field.click();
  assert.equal(await page.getByRole('button',{name:'+ Adicionar novo serviço',exact:true}).count(),1,'editing price does not close dropdown');
  await page.getByRole('button',{name:'Abrir opções',exact:true}).click();
  assert.equal(await field.evaluate(input=>{const trigger=input.closest('.border.rounded-xl');return !!trigger && !!trigger.querySelector('button') && !input.closest('button')}),true,'price and service share one border with valid interactive markup');
  await field.fill('120,00');await page.getByRole('button',{name:'Consulta',exact:true}).click();await page.getByText('Consulta inicial',{exact:true}).click();await page.waitForFunction(()=>document.getElementById('appointment-price').value==='200,00');
  await page.getByRole('button',{name:'Consulta inicial',exact:true}).click();await page.getByText('Consulta',{exact:true}).last().click();await page.waitForFunction(()=>document.getElementById('appointment-price').value==='150,00');
  await page.getByRole('button',{name:'Consulta',exact:true}).click();await page.getByRole('button',{name:'+ Adicionar novo serviço',exact:true}).click();await page.getByRole('button',{name:'Criar serviço teste'}).click();await page.waitForFunction(()=>document.getElementById('appointment-price').value==='180,00');
  await field.fill('120');await field.blur();assert.equal(await field.inputValue(),'120,00');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  fs.mkdirSync(path.resolve(root,'../tmp/appointment-price'),{recursive:true});await page.screenshot({path:path.resolve(root,'../tmp/appointment-price/modal-'+width+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Selecionar paciente teste'}).click();
  await page.getByText('10:00',{exact:true}).click();
  await page.getByRole('button',{name:/Confirmar Agendamento/i}).click();await page.waitForFunction(()=>window.saved.length===1);
  assert.equal((await page.evaluate(()=>window.saved))[0].b.appointmentPrice,120);
  await page.getByRole('button',{name:'Reabrir'}).click();await page.waitForFunction(()=>document.getElementById('appointment-price')?.value==='150,00');
  await page.close();
 }
 console.log('PASS defaults, service changes, new service auto-selection, manual input, normalized POST, reopening and mobile layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
