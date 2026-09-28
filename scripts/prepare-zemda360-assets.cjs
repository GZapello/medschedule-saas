// Deterministic extraction of the supplied portrait grids; no generated anatomy.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../backend/node_modules/sharp');
const root=path.resolve(__dirname,'..');
const source=process.argv[2];
if(!source)throw new Error('Pass the directory containing the two supplied PNG grids.');
const grids={male:'a_clean_studio_composite_portrait_grid_on_a_white.png',female:'a_clean_clinical_medical_illustration_style_comp.png'};
// Side means the subject's anatomical side, not the direction of the nose.
const cells={front:[0,0],right:[2,0],left:[3,0],'3q_right':[0,1],'3q_left':[1,1]};
(async()=>{
  for(const [sex,file]of Object.entries(grids)){
    const input=path.join(source,file),meta=await sharp(input).metadata();
    if(meta.width!==1536||meta.height!==1024)throw new Error('Unexpected source dimensions');
    const dir=path.join(root,'frontend/public/anatomy/face',sex);fs.mkdirSync(dir,{recursive:true});
    for(const [view,[col,row]]of Object.entries(cells))await sharp(input).extract({left:col*384,top:row*512,width:384,height:512}).webp({quality:92}).toFile(path.join(dir,`${view}.webp`));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
