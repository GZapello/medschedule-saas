const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../frontend'),results=[];
for(const file of fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.cjs')).sort()) {
 console.log('TEST '+file);
 const r=spawnSync(process.execPath,[path.join(root,'tests',file)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:30*1024*1024});
 fs.writeFileSync(path.join(__dirname,'multiclinic-frontend-'+file+'.log'),(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):''));
 results.push({file,status:r.status,error:r.error?.message});
 fs.writeFileSync(path.join(__dirname,'multiclinic-frontend-results.json'),JSON.stringify(results,null,2));
 console.log(r.status===0?'PASS':'FAIL');
}
process.exitCode=results.some(r=>r.status!==0)?1:0;
