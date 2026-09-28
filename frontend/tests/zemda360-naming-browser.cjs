const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5176';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));

 await page.addInitScript(()=>localStorage.setItem('auth_token','test-local'));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.route('**/api/**',route=>{
  const p=new URL(route.request().url()).pathname;
  if(!p.startsWith('/api/'))return route.continue();
  let data={};
  if(p.endsWith('/auth/me'))data={user:{id:'user-a',role:'professional',name:'Teste legado',status:'active',zemdaBodyEnabled:true},tenant:{id:'a',name:'Clínica teste'}};
  else if(p.endsWith('/estetic/config'))data={allowedAreas:['FACIAL','CORPORAL','CAPILAR'],catalog:[],inventoryItems:[]};
  else if(p.includes('/body-assessments')&&route.request().method()==='POST')data={assessmentId:'test-map'};
  else if(p.endsWith('/patients/patient-a'))data={id:'patient-a',full_name:'Paciente teste'};
  return route.fulfill({json:data});
 });
 for(const route of ['/zemda360','/zemda-body','/mapa-corporal']){
  // Actual application route handling; avoid clinical state mutation.
  await page.goto(base+route);
  await page.waitForURL('**/zemda360',{timeout:90000}).catch(async e=>{console.error('route failure',route,page.url(),errors, (await page.locator('body').innerText()).slice(0,1200));throw e;});
 }
 await page.goto(base+'/tests/zemda360-naming.html?sidebar');
 await page.getByRole('button',{name:'Zemda360',exact:true}).click();
 assert.equal(await page.locator('html').getAttribute('data-navigation'),'zemda360');
 assert.ok(!/ZemdaBody/.test(await page.locator('body').innerText()));
 await page.goto(base+'/tests/zemda360-naming.html');
 await page.getByRole('button',{name:'Zemda360',exact:true}).first().click();
 const map=page.getByTestId('zemda360-workspace');await map.waitFor();
 assert.equal(await map.getByRole('button',{name:'Face',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:/Fechar/}).first().click();
 await page.getByRole('button',{name:/Área: Estética Facial/}).click();
 await page.getByRole('button',{name:'Estética Corporal',exact:true}).click();
 await page.getByRole('button',{name:'Zemda360',exact:true}).first().click();
 await map.waitFor();
 assert.equal(await map.getByRole('button',{name:'Corpo',exact:true}).getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);
 console.log('PASS canonical/legacy routes, legacy-user Sidebar access, Estetic Facial → Face and Corporal → Body, console');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
