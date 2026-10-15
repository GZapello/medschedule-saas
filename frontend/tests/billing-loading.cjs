// Actual App, AuthProvider and billing hook. Only the API/optional cookie banner are fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const esbuild=require('esbuild'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/billing-loading');fs.mkdirSync(out,{recursive:true});
function bootstrap(config) {
  window.qaConfig=config;window.qaCalls=[];
  const tenant=id=>({id,name:'Clínica '+id,slug:id.toLowerCase(),status:'active',clinicalWorkspace:'ZemdaMed'});
  const user=id=>({id:'qa-owner',tenantId:id,name:'QA',email:'qa@example.test',role:'clinic_admin',status:'active',onboardingStatus:'active',emailVerified:true,
    needsOnboarding:false,needsLegalAcceptance:false,professionalId:'qa-prof',professionId:'prof-medico',commercialModule:'ZemdaMed',clinicalWorkspace:'ZemdaMed',permissions:[],capabilities:[]});
  window.qaSession=id=>({token:'synthetic-token',user:user(id),tenant:tenant(id)});
  if(!sessionStorage.getItem('qa-initialized')) {
    sessionStorage.setItem('qa-initialized','1');
    if(!config.loggedOut){localStorage.setItem('auth_token','synthetic-token');localStorage.setItem('active_tenant_id','A');}
  }
  window.qaGet=async endpoint=>{
    const id=localStorage.getItem('active_tenant_id') || 'A';
    if(endpoint==='/v1/auth/me')return window.qaSession(id);
    if(endpoint==='/v1/subscriptions/current') {
      const state={...(window.qaConfig[id] || window.qaConfig.A)};window.qaCalls.push({endpoint,id});
      if(state.delay)await new Promise(r=>setTimeout(r,state.delay));
      if(state.error)throw Error('HTTP 500 simulado');
      if(state.invalid)return {};
      return {clinicName:'Clínica '+id,canOperate:state.allowed,status:state.status || 'ACTIVE',managed:true,canManage:true,plan:{name:'Plano '+id,max_users:5},
        trialEligible:false,trialUsed:true,isTrial:state.status==='TRIAL',trialDaysRemaining:7,activeUsers:1,maxUsers:5,payments:[]};
    }
    if(endpoint==='/v1/tenants/current')return tenant(id);
    if(endpoint==='/v1/plans')return [];
    if(endpoint==='/v1/subscriptions/profile')return {name:'QA',cpfCnpj:'12345678909',email:'qa@example.test',postalCode:'01310930',address:'Rua QA',addressNumber:'1',province:'Centro'};
    if(endpoint.includes('user-onboarding'))return {onboardingStatus:'completed',onboardingDismissed:true,moduleToursCompleted:[],whatsNewDismissed:[]};
    if(endpoint.includes('dashboard'))return {today:{appointments:[]},monthly:{},totals:{},permissions:{},chart:[]};
    if(endpoint.includes('current'))return tenant(id);
    return [];
  };
  window.qaPost=async(endpoint)=>{
    if(endpoint==='/v1/auth/login')return window.qaSession('A');
    if(endpoint==='/v1/auth/active-clinic')return {success:true};
    throw Error('Mutation prohibited: '+endpoint);
  };
  const record=()=>{
    const root=document.querySelector('#root');if(!root)return;
    const state={tenant:window.qaAuthControl?.currentTenant?.id || null,
      billing:[...root.querySelectorAll('h1')].some(n=>n.textContent==='Assinatura e Plano'),
      dashboard:!!root.querySelector('main[data-tour-page="dashboard"]'),
      loader:!!root.querySelector('[role="status"]') && root.textContent.includes('Carregando Zemda...'),
      error:root.textContent.includes('Não foi possível verificar sua assinatura agora.')};
    const rows=JSON.parse(sessionStorage.getItem('qa-trace') || '[]');
    if(JSON.stringify(rows.at(-1))!==JSON.stringify(state)){rows.push(state);sessionStorage.setItem('qa-trace',JSON.stringify(rows));}
  };
  new MutationObserver(record).observe(document,{subtree:true,childList:true,characterData:true});
}
(async()=>{
  await esbuild.build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './src/App';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:root,loader:'tsx'},bundle:true,format:'iife',outfile:path.join(out,'app.js'),jsx:'automatic',external:['/landing/*'],define:{'import.meta.env':'{}'},logOverride:{'empty-import-meta':'silent'},plugins:[{name:'synthetic-api',setup(build){
    build.onLoad({filter:/[\\/]api[\\/]client\.ts$/},()=>({contents:"export const getApiBaseUrl=()=>'/api';export const buildApiUrl=(a,b)=>a+b;export const ApiClient={getBaseUrl:()=>'/api',get:p=>window.qaGet(p),post:(p,b)=>window.qaPost(p,b),put:(p,b)=>window.qaPost(p,b),delete:(p,b)=>window.qaPost(p,b)};",loader:'js'}));
    build.onLoad({filter:/[\\/]common[\\/]CookieBanner\.tsx$/},()=>({contents:"import {useAuth} from '../../context/AuthContext';export const CookieBanner=()=>{window.qaAuthControl=useAuth();return null;};",loader:'tsx',resolveDir:path.join(root,'src/components/common')}));
  }}]});
  const css=fs.readFileSync(path.join(root,'dist/assets',fs.readdirSync(path.join(root,'dist/assets')).find(n=>/^index-.*\.css$/.test(n))),'utf8');
  const server=http.createServer((req,res)=>{
    if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(out,'app.js')));return;}
    if(req.url.startsWith('/brand/')){res.end(fs.readFileSync(path.join(root,'public',req.url)));return;}
    res.setHeader('Content-Type','text/html');res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true}),results=[],base=`http://127.0.0.1:${server.address().port}`;
  const open=async(config,route='/dashboard')=>{
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await context.addInitScript({content:`(${bootstrap.toString()})(${JSON.stringify(config)});`});
    const page=await context.newPage();page.setDefaultTimeout(12000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+route);
    return {context,page,errors};
  };
  const trace=page=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('qa-trace') || '[]'));
  const noBilling=async(page)=>assert.ok(!(await trace(page)).some(s=>s.billing),'Subscription page appeared during valid access/loading');
  const dashboard=page=>page.locator('main[data-tour-page="dashboard"]').waitFor();
  const loading=async(page)=>{
    await page.getByRole('status').filter({hasText:'Carregando Zemda...'}).waitFor();
    assert.equal(await page.locator('main[data-tour-page]').count(),0);
    assert.equal(await page.getByRole('heading',{name:'Assinatura e Plano',exact:true}).count(),0);
  };
  try {
    for(const status of ['TRIAL','ACTIVE'])for(const delay of [0,150,3000]) {
      const {context,page,errors}=await open({A:{allowed:true,status,delay}});
      if(delay===3000){await loading(page);await page.waitForTimeout(500);await loading(page);await page.screenshot({path:path.join(out,'loading.png')});}
      await dashboard(page);await noBilling(page);assert.deepEqual(errors,[]);
      if(delay===3000){await page.reload();await loading(page);await dashboard(page);await noBilling(page);}
      results.push({scenario:'restore/reload',status,delay,passed:true});await context.close();
    }
    for(const allowed of [true,false]) {
      const {context,page,errors}=await open({A:{allowed:true},B:{allowed,delay:3000,status:allowed?'ACTIVE':'NOT_SUBSCRIBED'}});
      await dashboard(page);
      await Promise.all([page.waitForNavigation(),page.evaluate(()=>void window.qaAuthControl.switchTenant('B'))]);
      await loading(page);assert.equal(await page.getByText('Plano A',{exact:true}).count(),0);
      if(allowed){await dashboard(page);await noBilling(page);}
      else {
        await page.getByRole('heading',{name:'Assinatura e Plano',exact:true}).waitFor();
        await page.getByText('Clínica B',{exact:true}).waitFor();
        assert.ok(!(await trace(page)).some(s=>s.tenant==='B' && s.dashboard));
      }
      await Promise.all([page.waitForNavigation(),page.evaluate(()=>void window.qaAuthControl.switchTenant('A'))]);
      await dashboard(page);assert.equal(await page.evaluate(()=>window.qaAuthControl.currentTenant.id),'A');
      assert.deepEqual(errors,[]);results.push({scenario:'A→B→A',allowed,passed:true});await context.close();
    }
    for(const method of ['login','loginWithToken']) {
      const {context,page}=await open({loggedOut:true,A:{allowed:true,delay:3000}},'/login');
      await page.waitForFunction(()=>window.qaAuthControl && !window.qaAuthControl.loading);
      await page.evaluate(method=>method==='login' ? window.qaAuthControl.login('qa@example.test','synthetic') : window.qaAuthControl.loginWithToken('synthetic-token',window.qaSession('A').user,window.qaSession('A').tenant),method);
      await loading(page);await dashboard(page);await noBilling(page);
      await page.evaluate(()=>window.qaAuthControl.logout());
      await page.waitForFunction(()=>!window.qaAuthControl.currentUser);
      await page.evaluate(()=>window.qaAuthControl.loginWithToken('synthetic-token',window.qaSession('A').user,window.qaSession('A').tenant));
      await loading(page);await dashboard(page);await noBilling(page);
      results.push({scenario:method+'/logout/login',passed:true});await context.close();
    }
    for(const invalid of [false,true]) {
      const {context,page}=await open({A:{allowed:true,error:!invalid,invalid}});
      await page.getByText('Não foi possível verificar sua assinatura agora.',{exact:true}).waitFor();
      await noBilling(page);assert.equal(await page.locator('main[data-tour-page]').count(),0);
      await page.screenshot({path:path.join(out,'error.png')});
      await page.evaluate(()=>{window.qaConfig.A={allowed:true,delay:500};});
      await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await loading(page);await dashboard(page);await noBilling(page);
      results.push({scenario:invalid?'invalid-response/retry':'500/retry',passed:true});await context.close();
    }
    const {context,page}=await open({A:{allowed:true}});await dashboard(page);
    await page.evaluate(()=>{
      window.qaDashboard=document.querySelector('main[data-tour-page="dashboard"]');
      window.qaConfig.A.delay=3000;window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.qaDashboard===document.querySelector('main[data-tour-page="dashboard"]')),true);
    await page.waitForTimeout(3000);await noBilling(page);
    assert.equal(await page.evaluate(()=>window.qaDashboard===document.querySelector('main[data-tour-page="dashboard"]')),true);
    await page.evaluate(()=>{window.qaConfig.A={allowed:false,status:'SUSPENDED',delay:100};window.dispatchEvent(new Event('zemda-billing-refresh'));});
    await page.getByRole('heading',{name:'Assinatura e Plano',exact:true}).waitFor();
    assert.equal(await page.locator('main[data-tour-page]').count(),0);
    results.push({scenario:'focus silent refresh / authoritative denial',passed:true});await context.close();
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(`PASS: ${results.length} loading/login/switch/error/focus scenarios; real AuthContext, DOM transition traces, delays up to 3 seconds, no billing flicker or previous-clinic access.`);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
