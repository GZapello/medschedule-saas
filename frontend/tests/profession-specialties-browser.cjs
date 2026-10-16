const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {build}=require('esbuild'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/profession-specialties');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const js=(await build({stdin:{resolveDir:root,loader:'tsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {SettingsView} from './src/components/settings/SettingsView';import {MyResourcesView} from './src/components/profile/MyResourcesView';function App(){const [user,setUser]=useState(window.qaUser());window.qaSetUser=setUser;window.qaAuth=()=>({currentUser:user,currentTenant:{id:'clinic-QA'},isClinicAdmin:false,hasPermission:()=>true,reloadSession:async()=>{window.qaReloads++;setUser(window.qaUser());},refreshTenant:async()=>{}});return window.qaStandalone?<MyResourcesView areasOnly/>:<SettingsView initialSection='resources'/>;}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'iife',define:{'import.meta.env':'{}'},plugins:[{name:'fixture',setup(b){
 b.onLoad({filter:/[\\/]context[\\/]AuthContext\.tsx$/},()=>({contents:'export const useAuth=()=>window.qaAuth();',loader:'js'}));
 b.onLoad({filter:/[\\/]context[\\/]ToastContext\.tsx$/},()=>({contents:'export const useToast=()=>({showToast:(m,t)=>window.qaToasts.push({m,t})});',loader:'js'}));
 b.onLoad({filter:/[\\/]api[\\/]client\.ts$/},()=>({contents:"export const ApiClient={get:(...a)=>window.qaGet(...a),put:(...a)=>window.qaPut(...a),getBaseUrl:()=>'/api'};export const getApiBaseUrl=()=>'/api';export const buildApiUrl=(a,b)=>a+b;",loader:'js'}));
 }}]})).outputFiles[0].text;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body><div id="root"></div><script>'+js+'</script></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),results=[];
 try {
  for(const [from,to] of [['fono','fisio'],['nutri','psico'],['medico','fono'],['fisio','medico']]) {
   const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await context.addInitScript(({from})=>{
    window.qaNames={fono:'Fonoaudiologia',fisio:'Fisioterapia',nutri:'Nutrição',psico:'Psicologia',medico:'Medicina'};
    window.qaModules={fono:'ZemdaFono',fisio:'ZemdaFisio',nutri:'ZemdaNutri',psico:'ZemdaPsico',medico:'ZemdaMed'};
    window.qaServer=JSON.parse(localStorage.getItem('qa-profession')||'null')||{profession:from,used:0,areas:['area-'+from]};window.qaReloads=0;window.qaGets=[];window.qaPuts=[];window.qaToasts=[];
    window.qaUser=()=>({id:'same-user',professionalId:'same-professional',role:'professional',name:'Profissional QA',professionId:'prof-'+window.qaServer.profession,canonicalProfessionId:'prof-'+window.qaServer.profession,commercialModule:window.qaModules[window.qaServer.profession],capabilities:['cap-'+window.qaServer.profession],profession_change_used:window.qaServer.used});
    window.qaResources=()=>{const p=window.qaServer.profession,medical=p==='medico';return {professionId:'prof-'+p,commercialModule:window.qaModules[p],practiceAreaIds:medical?[]:window.qaServer.areas,availableAreas:medical?[]:[{id:'area-'+p,name:'Área de '+window.qaNames[p]}],activeCapabilities:[],defaultCapabilities:[],availableOptionalCapabilities:[],selectedOptionalCapabilities:[],hiddenCapabilities:[],catalog:[],medicalTree:medical?{specialties:[{id:'spec-medico',name:'Especialidade de Medicina',practiceAreas:[{id:'sub-medico',name:'Subárea de Medicina'}]}]}:null,medicalHierarchy:medical?{specialtyIds:window.qaServer.used?[]:['spec-medico'],practiceAreaIds:window.qaServer.used?[]:['sub-medico']}:null};};
    window.qaGet=async url=>{window.qaGets.push(url);if(url==='/v1/capabilities/my-resources'){const snapshot=window.qaResources();if(window.qaHold){window.qaHold=false;return await new Promise(resolve=>{window.qaReleaseOld=()=>resolve(snapshot);});}return snapshot;}
     if(url==='/v1/professionals/same-professional')return {professional:{id:'same-professional',name:'Profissional QA',profession_id:'prof-'+window.qaServer.profession,profession_name:window.qaNames[window.qaServer.profession],profession_change_used:window.qaServer.used}};
     if(url==='/v1/taxonomy/professions')return Object.entries(window.qaNames).map(([id,name])=>({id:'prof-'+id,name}));return [];
    };
    window.qaPut=async(url,body)=>{window.qaPuts.push({url,body});if(body.professionId){if(window.qaServer.used)throw Error('Apenas uma troca');window.qaServer={profession:body.professionId.replace('prof-',''),used:1,areas:[]};localStorage.setItem('qa-profession',JSON.stringify(window.qaServer));return {};}
     if(body.practiceAreaIds) {window.qaServer.areas=body.practiceAreaIds;localStorage.setItem('qa-profession',JSON.stringify(window.qaServer));return {practiceAreaIds:body.practiceAreaIds};}return {};};
   },{from});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.getByRole('button',{name:'Errei minha profissão, preciso trocar',exact:true}).click();await page.locator('select').selectOption('prof-'+to);await page.getByRole('button',{name:'Confirmar alteração',exact:true}).click();
   await page.waitForFunction(to=>window.qaAuth().currentUser.professionId==='prof-'+to,to);await page.getByRole('button',{name:'Editar especialidades',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.getByText(to==='medico'?'Especialidade de Medicina':'Área de '+await page.evaluate(to=>window.qaNames[to],to),{exact:true}).waitFor();
   assert.ok(!(await dialog.innerText()).includes('Área de '+await page.evaluate(from=>window.qaNames[from],from)));if(from==='medico')assert.ok(!(await dialog.innerText()).includes('Especialidade de Medicina'));
   assert.equal(await page.getByRole('button',{name:'Errei minha profissão, preciso trocar',exact:true}).count(),0);
   assert.ok(await page.evaluate(()=>window.qaReloads>0));assert.ok(await page.evaluate(()=>window.qaGets.filter(u=>u==='/v1/professionals/same-professional').length>=2));
   assert.equal(await page.evaluate(()=>window.qaAuth().currentUser.commercialModule),await page.evaluate(to=>window.qaModules[to],to));
   await page.reload();await page.getByRole('button',{name:'Editar especialidades',exact:true}).click();await page.getByRole('dialog').getByText(to==='medico'?'Especialidade de Medicina':'Área de '+await page.evaluate(to=>window.qaNames[to],to),{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Errei minha profissão, preciso trocar',exact:true}).count(),0);
   if(to!=='medico'){
    await page.getByRole('dialog').getByRole('button',{name:'Salvar Áreas de Atuação',exact:true}).click();await page.waitForFunction(()=>window.qaPuts.some(p=>p.url==='/v1/capabilities/my-practice-areas'));
    assert.deepEqual(await page.evaluate(()=>window.qaPuts.find(p=>p.url==='/v1/capabilities/my-practice-areas').body.practiceAreaIds),[]);
   } else {
    await page.getByRole('dialog').getByText('Especialidade de Medicina',{exact:true}).click();await page.getByRole('button',{name:'Salvar Especialidades Médicas',exact:true}).click();await page.waitForFunction(()=>window.qaPuts.some(p=>p.url==='/v1/capabilities/my-medical-hierarchy'));
    assert.deepEqual(await page.evaluate(()=>window.qaPuts.find(p=>p.url==='/v1/capabilities/my-medical-hierarchy').body),{specialtyIds:['spec-medico'],practiceAreaIds:[]});
   }
   assert.deepEqual(errors,[]);results.push({from,to,refresh:true,singleChangePreserved:true,passed:true});await page.evaluate(()=>{window.qaStandalone=true;window.qaHold=true;});
   // A reload starts an editor fetch for the current profession, deliberately delayed.
   await page.addInitScript(()=>{window.qaStandalone=true;window.qaHold=true;});await page.reload();await page.waitForFunction(()=>typeof window.qaReleaseOld==='function');
   await page.evaluate(({from})=>{window.qaServer={profession:from,used:1,areas:[]};window.qaSetUser(window.qaUser());window.dispatchEvent(new CustomEvent('zemda-profession-changed'));},{from});
   const freshLabel=from==='medico'?'Especialidade de Medicina':'Área de '+await page.evaluate(from=>window.qaNames[from],from);await page.getByText(freshLabel,{exact:true}).waitFor();
   await page.evaluate(async()=>{window.qaReleaseOld();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});assert.ok((await page.locator('body').innerText()).includes(freshLabel));
   const staleLabel=to==='medico'?'Especialidade de Medicina':'Área de '+await page.evaluate(to=>window.qaNames[to],to);assert.ok(!(await page.locator('body').innerText()).includes(staleLabel));
   await context.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS: 4 profession transitions via Settings → Editar especialidades, session/profile refresh, page reload, empty compatible selections, single-change rule and mounted-editor stale-response isolation.');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
