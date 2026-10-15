// Real App gate + BillingView with synthetic auth/API. External network is blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const esbuild=require('esbuild'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/billing-access');fs.mkdirSync(out,{recursive:true});
function bootstrap(scenario) {
  const query=new URLSearchParams(location.search),allowed=scenario==='allowed';
  const user={id:'qa-user',tenantId:'qa-clinic',name:'QA',email:'qa@example.test',role:'clinic_admin',status:'active',onboardingStatus:'active',emailVerified:true,needsLegalAcceptance:false};
  const tenant={id:'qa-clinic',name:'QA clinic',status:'active',clinicalWorkspace:'ZemdaMed'};
  window.qaAuth={currentUser:user,currentTenant:tenant,loading:false,token:'synthetic',isClinicAdmin:true,isSuperAdmin:false,isSandboxSession:false,
    hasPermission:()=>true,hasCapability:()=>true,userPermissions:[],capabilities:[],practiceAreaIds:[],clientTermLabel:'Paciente',
    reloadSession:async()=>{},refreshTenant:async()=>{},logout:()=>{}};
  if(scenario==='admin') {user.role='superadmin';window.qaAuth.isSuperAdmin=true;}
  window.qaCalls=[];
  window.qaGet=async endpoint=>{
    if(endpoint==='/v1/admin/metrics')return {totalClinics:1,activeClinics:1,pendingClinics:0,totalUsers:3,totalProfessionals:2,totalAppointments:0,totalRevenueEstimate:0};
    if(endpoint==='/v1/tenants')return [{id:'qa-clinic',name:'Clínica QA',trade_name:'Clínica QA',slug:'qa',status:'active',onboarding_completed:1,created_at:'2026-10-14',billing_required:1,
      subscription_status:'PENDING_PAYMENT',subscription_plan_name:'Zemda Equipe',subscription_plan_code:'TEAM',total_professionals:2,total_appointments:0}];
    if(endpoint.includes('/summary'))return {
      subscription:{plan:{name:'Zemda Equipe'},status:'PENDING_PAYMENT',canOperate:false,activeUsers:3,maxUsers:5},
      activeProfessionals:[{id:'other-clinic-user',name:'Profissional de outra clínica',email:'profissional@example.test',professionName:'Fonoaudiólogo',role:'professional',status:'active',registrationType:'CRFa',registrationNumber:'12345'}],
      users:{total:3,active:3,inactive:0,professionals:2,receptionists:0,admins:1},patients:{total:0,attendedUnique:0,newThisMonth:0},
      appointments:{total:0,completed:0,scheduled:0,canceled:0,noShow:0,thisMonth:0,today:0},services:{total:0},schedules:{activeProfessionals:2},rooms:{total:0},
      inventory:{totalItems:0,lowStock:0},documents:{total:0},consents:{signed:0,pending:0},financial:{totalRevenue:0,currentMonthRevenue:0,pendingAmount:0}};
    if(endpoint==='/v1/subscriptions/current') {
      if(scenario==='error')throw Error('Falha de conexão simulada');
      if(scenario==='delayed')await new Promise(r=>setTimeout(r,800));
      const status=query.get('status') || 'NOT_SUBSCRIBED';
      return {clinicName:'QA clinic',canOperate:allowed && !window.qaBlocked,status,managed:status!=='NOT_SUBSCRIBED',isTrial:status==='TRIAL',trialDaysRemaining:7,
        trialEligible:false,trialUsed:status==='TRIAL_EXPIRED',canManage:true,activeUsers:1,maxUsers:5,payments:[]};
    }
    if(endpoint==='/v1/plans')return ['SOLO','TEAM','CLINIC'].map((code,i)=>({id:code,code,name:['Zemda Solo','Zemda Equipe','Zemda Clínica'][i],monthly_price:[69.9,249.9,619.9][i],max_users:[1,5,20][i],trial_days:i===0?7:0}));
    if(endpoint==='/v1/subscriptions/profile')return {name:'QA',cpfCnpj:'12345678909',email:user.email,phone:'',postalCode:'01310930',address:'Rua QA',addressNumber:'1',province:'Centro',complement:''};
    if(endpoint.includes('user-onboarding'))return {onboardingStatus:'completed',onboardingDismissed:true,moduleToursCompleted:[],whatsNewDismissed:[]};
    if(endpoint.includes('appointments'))return [];
    if(endpoint.includes('dashboard'))return {today:{appointments:[]},monthly:{},totals:{},permissions:{},chart:[]};
    if(endpoint.includes('current'))return tenant;
    return [];
  };
  window.qaPost=async(endpoint,body)=>{window.qaCalls.push({endpoint,body});throw Error('Checkout observado no teste, sem cobrança externa');};
}
(async()=>{
  await esbuild.build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './src/App';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:root,loader:'tsx'},bundle:true,format:'iife',outfile:path.join(out,'app.js'),jsx:'automatic',external:['/landing/*'],define:{'import.meta.env':'{}'},plugins:[{name:'synthetic-fixture',setup(build){
    build.onLoad({filter:/[\\/]context[\\/]AuthContext\.tsx$/},()=>({contents:'export const useAuth=()=>window.qaAuth;export const AuthProvider=({children})=>children;',loader:'js'}));
    build.onLoad({filter:/[\\/]api[\\/]client\.ts$/},()=>({contents:"export const getApiBaseUrl=()=>'/api';export const buildApiUrl=(a,b)=>a+b;export const ApiClient={getBaseUrl:()=>'/api',get:p=>window.qaGet(p),post:(p,b)=>window.qaPost(p,b),put:(p,b)=>window.qaPost(p,b),delete:(p,b)=>window.qaPost(p,b)};",loader:'js'}));
  }}]});
  const css=fs.readFileSync(fs.readdirSync(path.join(root,'dist/assets')).filter(n=>/^index-.*\.css$/.test(n)).map(n=>path.join(root,'dist/assets',n))[0],'utf8');
  const server=http.createServer((req,res)=>{
    if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(out,'app.js')));return;}
    if(req.url.startsWith('/brand/')){res.end(fs.readFileSync(path.join(root,'public',req.url)));return;}
    res.setHeader('Content-Type','text/html');res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true}),results=[];
  try {
    for(const width of [360,1280])for(const status of ['NOT_SUBSCRIBED','PENDING_PAYMENT','TRIAL_EXPIRED','SUSPENDED','TRIAL'])for(const route of ['/dashboard','/agenda','/pacientes','/zemda-med']) {
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
      await context.addInitScript({content:`(${bootstrap.toString()})('denied');`});
      const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}${route}?status=${status}`);
      await page.getByRole('heading',{name:'Assinatura e Plano',exact:true}).waitFor();
      const cookie=page.getByRole('button',{name:'Rejeitar não necessários',exact:true});if(await cookie.isVisible())await cookie.click();
      assert.equal(await page.locator('main[data-tour-page]').count(),0,`${route} ${status}`);
      await page.getByText('Acesso operacional indisponível.',{exact:false}).waitFor();
      if(status==='TRIAL_EXPIRED' && route==='/dashboard') {
        const labels=await page.getByRole('button').allTextContents();assert.ok(!labels.some(t=>t.includes('Começar teste grátis')));
        await page.getByRole('button',{name:'Alterar plano',exact:true}).click();
        await page.getByRole('button',{name:'Assinar Zemda Solo',exact:true}).last().click();
        await page.waitForFunction(()=>window.qaCalls.length>0);
        assert.equal((await page.evaluate(()=>window.qaCalls)).at(-1).endpoint,'/v1/subscriptions/checkout');
        assert.ok(!(await page.evaluate(()=>window.qaCalls)).some(c=>c.endpoint.includes('start-trial')));
      }
      if(width===360 && status==='PENDING_PAYMENT' && route==='/dashboard')await page.screenshot({path:path.join(out,'unpaid-mobile.png'),fullPage:true});
      results.push({route,status,width,passed:true});await context.close();
    }
    for(const scenario of ['error','delayed','allowed']) {
      const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
      await context.addInitScript({content:`(${bootstrap.toString()})(${JSON.stringify(scenario)});`});
      const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/dashboard`);
      if(scenario==='allowed') {
        await page.locator('main[data-tour-page="dashboard"]').waitFor();
        await page.evaluate(()=>{window.qaBlocked=true;window.dispatchEvent(new Event('zemda-billing-denied'));});
        await page.getByRole('heading',{name:'Assinatura e Plano',exact:true}).waitFor();
        assert.equal(await page.locator('main[data-tour-page]').count(),0);
      }
      else {
        if(scenario==='error') {
          await page.getByText('Não foi possível verificar sua assinatura agora.',{exact:true}).waitFor();
          assert.equal(await page.getByRole('heading',{name:'Assinatura e Plano',exact:true}).count(),0);
        } else {
          await page.getByRole('status').filter({hasText:'Carregando Zemda...'}).waitFor();
          assert.equal(await page.getByRole('heading',{name:'Assinatura e Plano',exact:true}).count(),0);
          await page.getByRole('heading',{name:'Assinatura e Plano',exact:true}).waitFor();
        }
        assert.equal(await page.locator('main[data-tour-page]').count(),0);
      }
      results.push({scenario,passed:true});await context.close();
    }
    for(const width of [360,1280]) {
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
      await context.addInitScript({content:`(${bootstrap.toString()})('admin');`});
      const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/superadmin`);
      await page.getByText('Aguardando pagamento',{exact:true}).waitFor();
      const cookie=page.getByRole('button',{name:'Rejeitar não necessários',exact:true});if(await cookie.isVisible())await cookie.click();
      await page.locator('button[title="Resumo da Clínica (Métricas Agregadas)"]').click();
      await page.getByRole('heading',{name:'Profissionais ativos',exact:true}).waitFor();
      await page.getByText('profissional@example.test',{exact:true}).waitFor();
      await page.getByText('3 / 5 acessos',{exact:true}).waitFor();
      await page.getByText('Sem acesso operacional',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(width===360)await page.screenshot({path:path.join(out,'superadmin-summary-mobile.png'),fullPage:false});
      results.push({scenario:'admin-summary',width,passed:true});await context.close();
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(`PASS: ${results.length} browser billing cases; active accounts/local navigation cannot bypass denial; expired Solo opens paid checkout.`);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
