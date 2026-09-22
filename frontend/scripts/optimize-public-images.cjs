// Uses the project's existing backend image pipeline; no new dependency.
const sharp=require('../../backend/node_modules/sharp');
const path=require('node:path');
const dir=path.resolve(__dirname,'../public/brand');
(async()=>{
 await sharp(path.join(dir,'zemda-icon.png')).resize(96,96,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toFile(path.join(dir,'zemda-icon-96.webp'));
 await sharp(path.join(dir,'zemda-icon.png')).resize(512,512,{fit:'inside',withoutEnlargement:true}).png({compressionLevel:9,palette:true}).toFile(path.join(dir,'zemda-social.png'));
})().catch(e=>{console.error(e);process.exit(1)});
