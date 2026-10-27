const assert=require('node:assert/strict'),{build}=require('esbuild'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const plans=[{id:'zemda-SOLO',code:'SOLO',name:'Zemda Solo',monthly_price:69.9,max_users:1,extra_user_price:59.9,total_user_limit:3,cycle:'MONTHLY',trial_days:7},{id:'zemda-TEAM',code:'TEAM',name:'Zemda Equipe',monthly_price:249.9,max_users:5,extra_user_price:44.9,total_user_limit:12,cycle:'MONTHLY',trial_days:0},{id:'zemda-CLINIC',code:'CLINIC',name:'Zemda Clínica',monthly_price:619.9,max_users:15,extra_user_price:29.9,total_user_limit:null,cycle:'MONTHLY',trial_days:0}];
(async()=>{
const bundle=async(source)=>(await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},plugins:[{name:'boundaries',setup(b){b.onLoad({filter:/[\\/]context[\\/]AuthContext\.tsx$/},()=>({contents:'export const useAuth=()=>({currentUser:{id:"qa",role:"clinic_admin"},currentTenant:{id:"qa"},loginWithToken:()=>{window.loggedIn=true},reloadSession:async()=>{}})',loader:'js'}));b.onLoad({filter:/[\\/]context[\\/]ToastContext\.tsx$/},()=>({contents:'export const useToast=()=>({showToast:(message,type)=>window.toasts.push({message,type})})',loader:'js'}));b.onLoad({filter:/[\\/]api[\\/]client\.ts$/},()=>({contents:'export const ApiClient={get:(...a)=>window.qaGet(...a),post:(...a)=>window.qaPost(...a),put:(...a)=>window.qaPut(...a)}',loader:'js'}));}}]})).outputFiles[0].text;
const modal=await bundle(`import React from 'react';import{createRoot}from'react-dom/client';import{RegistrationPlans}from'./src/components/auth/RegistrationPlans';createRoot(document.getElementById('root')).render(<RegistrationPlans plans={window.plans} selectedCode="SOLO" busy={false} onChoose={p=>window.chosen=p.code} onBack={()=>{}}/>);`);
const billing=await bundle(`import React from 'react';import{createRoot}from'react-dom/client';import{BillingView}from'./src/components/billing/BillingView';createRoot(document.getElementById('root')).render(<React.StrictMode><BillingView callback={window.qaCallback}/></React.StrictMode>);`);
const utility=(await build({entryPoints:['src/utils/purchaseAnalytics.ts'],bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},globalName:'qaPurchase'})).outputFiles[0].text;
const css=fs.readdirSync('dist/assets').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join('dist/assets',f),'utf8')).join('\n');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
async function page(width=390,url='https://zemda.test/'){
 const p=await browser.newPage({viewport:{width,height:900}});await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div>'}));await p.goto(url);
 await p.evaluate(plans=>{window.plans=plans;window.events=[];window.toasts=[];window.calls=[];window.gtag=(...a)=>events.push(a);localStorage.setItem('zemda_cookie_consent',JSON.stringify({analytics:true,marketing:false}));window.qaGet=async()=>plans;window.qaPost=async(ep,payload)=>{calls.push({ep,payload});if(ep.endsWith('request-code'))return {success:true};if(ep.endsWith('verify-code'))return {success:true,emailVerificationToken:'verified'};if(ep.endsWith('tenants/register'))return {token:'synthetic',user:{id:'qa'},isTrial:payload.startTrial};throw Error(ep);};},plans);return p;
}
try {
 for(const width of [390,1280])for(const plan of plans){
   const p=await page(width);await p.addScriptTag({content:modal});
   assert.equal(await p.locator('article').count(),3);
   const card=p.locator('article').filter({has:p.getByRole('heading',{name:plan.name,exact:true})});
   assert.ok((await card.innerText()).includes(`${plan.max_users} acessos incluídos`));
   assert.ok((await card.innerText()).includes('adicional'));
   await card.getByRole('button').click();assert.equal(await p.evaluate(()=>window.chosen),plan.code);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.close();
 }
 // Existing billing form resumes the persisted selection and starts checkout only after valid billing data.
 for(const plan of plans.slice(1)){const p=await page(390,'https://zemda.test/assinatura?checkout=1');await p.evaluate(plan=>{window.qaGet=async ep=>ep.endsWith('/plans')?plans:ep.endsWith('/profile')?{name:'QA',email:'qa@example.invalid',phone:'11999999999'}:{selectedPlan:plan,status:'NOT_SUBSCRIBED',canOperate:false,canManage:true,managed:false,payments:[]};window.qaPut=async(ep,data)=>{calls.push({ep,data});return {message:'Salvo'}};window.qaPost=async(ep,data)=>{calls.push({ep,data});if(window.fail){window.fail=false;throw Error('Pagamento indisponível. Tente novamente.')}return {url:'https://sandbox.asaas.com/checkoutSession/show?id=synthetic'};};window.fail=true;},plan);await p.addScriptTag({content:billing});await p.getByRole('button',{name:'Salvar e ir para pagamento'}).waitFor();for(const [label,value] of [['CPF/CNPJ','12345678909'],['CEP','01310930'],['Logradouro','Rua QA'],['Número','100'],['Bairro','Centro']])await p.getByLabel(label,{exact:true}).fill(value);await p.getByRole('button',{name:'Salvar e ir para pagamento'}).click();await p.getByRole('alert').filter({hasText:'Pagamento indisponível'}).waitFor();assert.equal(await p.evaluate(()=>events.length),0);await p.getByRole('button',{name:'Salvar e ir para pagamento'}).click();await p.waitForURL('https://sandbox.asaas.com/**');await p.close();}
 // Callback text alone never emits purchase: only the confirmed server summary does.
 for(const paid of [false,true]){const p=await page();await p.evaluate(paid=>{window.qaCallback='sucesso';window.qaGet=async ep=>ep.endsWith('/plans')?plans:ep.endsWith('/profile')?{}:{canOperate:paid,canManage:true,status:paid?'ACTIVE':'PENDING_PAYMENT',managed:true,payments:[],confirmedPurchase:paid?{transaction_id:'safe-transaction',value:249.9}:null};},paid);await p.addScriptTag({content:billing});await p.getByText('Pagamento enviado para confirmação.',{exact:true}).waitFor();if(paid)await p.waitForFunction(()=>events.length===1);assert.deepEqual(await p.evaluate(()=>events.map(e=>e[1])),paid?['purchase']:[]);await p.addScriptTag({content:utility});await p.evaluate(()=>{qaPurchase.trackConfirmedPurchase(null);qaPurchase.trackConfirmedPurchase({transaction_id:'safe-transaction',value:249.9});qaPurchase.trackConfirmedPurchase({transaction_id:'safe-transaction',value:249.9});});assert.equal(await p.evaluate(()=>events.length),1);const event=(await p.evaluate(()=>events))[0];assert.equal(event[2].currency,'BRL');assert.equal(event[2].value,249.9);assert.ok(!JSON.stringify(event).includes('qa@example'));await p.evaluate(()=>{localStorage.setItem('zemda_cookie_consent',JSON.stringify({analytics:false}));qaPurchase.trackConfirmedPurchase({transaction_id:'other',value:619.9});});assert.equal(await p.evaluate(()=>events.length),1);await p.close();}
 // Seat management sends quantities only; server confirmation remains authoritative.
 for(const width of [390,1280]) {
   const p=await page(width);
   await p.evaluate(()=>{
     window.seatSummary={canOperate:true,canManage:true,status:'ACTIVE',managed:true,plan:plans[0],contractedUsers:1,maxUsers:1,activeUsers:1,monthlyTotal:69.9,payments:[]};
     window.qaGet=async ep=>ep.endsWith('/plans')?plans:ep.endsWith('/profile')?{name:'QA',cpfCnpj:'12345678909',postalCode:'01310930',address:'Rua QA',addressNumber:'1',province:'Centro'}:seatSummary;
     window.qaPost=async(ep,payload)=>{calls.push({ep,payload});seatSummary={...seatSummary,pendingPlan:plans[0],pendingContractedUsers:payload.contractedUsers,pendingMonthlyTotal:129.8,changeEffectiveOn:'2026-12-01'};return {message:'Mudança programada'};};
   });
   await p.addScriptTag({content:billing});
   await p.getByText('1 / 1 acessos utilizados',{exact:true}).waitFor();
   await p.getByRole('spinbutton',{name:'Acessos Zemda Solo',exact:true}).fill('2');
   await p.getByText(/129,80.*mês/).first().waitFor();
   await p.getByRole('button',{name:'Atualizar acessos',exact:true}).click();
   await p.getByText('Mudança programada',{exact:true}).waitFor();
   const sent=await p.evaluate(()=>calls.find(c=>c.ep.endsWith('/change-plan')).payload);
   assert.deepEqual(sent,{planCode:'SOLO',contractedUsers:2});
   assert.equal(await p.getByRole('spinbutton',{name:'Acessos Zemda Solo',exact:true}).isDisabled(),true);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.close();
 }
 console.log('PASS: three plan cards with included/additional seats on mobile/desktop, quantity-only seat management, both paid billing forms, failed checkout retry, confirmed-only purchase, consent and deduplication.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
