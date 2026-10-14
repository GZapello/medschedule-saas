const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../../tmp/personal-report-tests');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:820,height:1100}});
  const css=fs.readdirSync(path.resolve(__dirname,'../dist/assets')).find(f=>/^index-.*\.css$/.test(f));
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(path.resolve(__dirname,'../dist/assets',css),'utf8')}</style></head><body><main style="padding:24px">${fs.readFileSync(path.join(out,'report.html'),'utf8')}</main></body></html>`);
  assert.ok(!/NaN|Infinity|#DIV\/0!/.test(await page.innerText('body')));
  assert.ok(await page.locator('svg[role="img"]').count()>10);
  assert.ok(await page.locator('.zemda-assessment-page').count()>=5);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('.zemda-assessment-page').first().evaluate(e=>getComputedStyle(e).breakAfter),'page');
  const overflow=await page.locator('main').evaluate(e=>e.scrollWidth>e.clientWidth);assert.equal(overflow,false,'no horizontal overflow');
  await page.screenshot({path:path.join(out,'print-preview.png'),fullPage:true});
  await page.pdf({path:path.join(out,'report-a4.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
  console.log(JSON.stringify({checks:5,pages:await page.locator('.zemda-assessment-page').count(),pdf:'tmp/personal-report-tests/report-a4.pdf'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
