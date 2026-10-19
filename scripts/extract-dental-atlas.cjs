// Package the generated transparent atlas into the 32 requested independent assets.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const order=[[18,17,16,15,14,13,12,11],[21,22,23,24,25,26,27,28],[48,47,46,45,44,43,42,41],[31,32,33,34,35,36,37,38]];
(async()=>{
 const source=process.argv[2];if(!source)throw Error('Provide generated transparent atlas PNG');
 const dir=path.resolve('frontend/public/assets/dentistry/hybrid');fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch();try{
 const page=await browser.newPage();
 const images=await page.evaluate(async({data,order})=>{
  const img=new Image();img.src=data;await img.decode();
  const results=[];
  for(let row=0;row<4;row++)for(let col=0;col<8;col++){
   const canvas=document.createElement('canvas');canvas.width=img.width/8;canvas.height=img.height/4;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,col*canvas.width,row*canvas.height,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);let opaque=0,transparent=0;
   for(let i=3;i<pixels.data.length;i+=4){if(pixels.data[i]>128)opaque++;if(pixels.data[i]===0)transparent++;}
   if(opaque<1000||transparent<1000)throw Error('Invalid transparent tooth cell '+order[row][col]);
   // The generated spacing is not perfectly uniform. Crop the largest alpha
   // component in each cell, excluding slivers of the neighboring tooth.
   const seen=new Uint8Array(canvas.width*canvas.height);let largest=[];
   for(let p=0;p<seen.length;p++){
    if(seen[p]||pixels.data[p*4+3]<=80)continue;
    const component=[],queue=[p];seen[p]=1;
    for(let q=0;q<queue.length;q++){
     const n=queue[q];component.push(n);const x=n%canvas.width,y=Math.floor(n/canvas.width);
     for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nx=x+dx,ny=y+dy,k=ny*canvas.width+nx;
      if(nx<0||nx>=canvas.width||ny<0||ny>=canvas.height||seen[k]||pixels.data[k*4+3]<=80)continue;
      seen[k]=1;queue.push(k);
     }
    }if(component.length>largest.length)largest=component;
   }
   const xs=largest.map(p=>p%canvas.width),ys=largest.map(p=>Math.floor(p/canvas.width));
   const left=Math.max(0,Math.min(...xs)-2),top=Math.max(0,Math.min(...ys)-2);
   const width=Math.min(canvas.width,Math.max(...xs)+3)-left,height=Math.min(canvas.height,Math.max(...ys)+3)-top;
   const isolated=document.createElement('canvas');isolated.width=192;isolated.height=256;
   const scale=Math.min(176/width,240/height);
   isolated.getContext('2d').drawImage(canvas,left,top,width,height,(192-width*scale)/2,(256-height*scale)/2,width*scale,height*scale);
   results.push({tooth:order[row][col],png:isolated.toDataURL('image/png').split(',')[1],opaque,transparent});
  }return results;
 },{data:'data:image/png;base64,'+fs.readFileSync(source).toString('base64'),order});
 for(const item of images)fs.writeFileSync(path.join(dir,`tooth-${item.tooth}.png`),Buffer.from(item.png,'base64'));
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({source:'Reference-derived transparent atlas, built-in image_gen',width:192,height:256,teeth:images.map(({tooth,opaque,transparent})=>({tooth,opaque,transparent}))},null,2));
 console.log('Exported and checked alpha on',images.length,'independent tooth assets');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
