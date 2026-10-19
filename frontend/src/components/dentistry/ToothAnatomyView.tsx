import React, {useEffect,useRef,useState} from 'react';
import { ToothStatus } from './odontogramModel';
import { describeToothStatus,toothName } from './odontogramClinical';

interface Props {tooth:number;status:ToothStatus;selected:boolean;highlighted:boolean;onSelect:()=>void;onHover:(tooth:number|null)=>void;}
/** Selection uses the PNG's actual alpha pixels, never a rectangle/polygon. */
export function ToothAnatomyView({tooth,status,selected,highlighted,onSelect,onHover}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null), alpha=useRef<Uint8ClampedArray>();
  const [failed,setFailed]=useState(false),[ready,setReady]=useState(false);
  useEffect(()=>{
    let cancelled=false;const img=new Image();setReady(false);setFailed(false);
    img.onload=()=>{
      if(cancelled||!canvas.current)return;
      const source=document.createElement('canvas');source.width=img.width;source.height=img.height;
      const sourceCtx=source.getContext('2d');const ctx=canvas.current.getContext('2d');
      if(!sourceCtx||!ctx){setFailed(true);return;}
      sourceCtx.drawImage(img,0,0);const pixels=sourceCtx.getImageData(0,0,img.width,img.height).data;
      let l=img.width,r=0,t=img.height,b=0;
      for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++)if(pixels[(y*img.width+x)*4+3]>80){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
      if(r<=l||b<=t){setFailed(true);return;}
      const w=r-l+1,h=b-t+1,scale=Math.min(176/w,240/h);
      ctx.clearRect(0,0,192,256);ctx.drawImage(img,l,t,w,h,(192-w*scale)/2,(256-h*scale)/2,w*scale,h*scale);
      alpha.current=ctx.getImageData(0,0,192,256).data;setReady(true);
    };
    img.onerror=()=>{if(!cancelled)setFailed(true);};img.src=`/assets/dentistry/hybrid/tooth-${tooth}.png`;
    return()=>{cancelled=true;alpha.current=undefined;};
  },[tooth]);
  const painted=(e:React.PointerEvent|React.MouseEvent)=>{
    const bounds=canvas.current?.getBoundingClientRect();if(!bounds||!alpha.current)return false;
    const x=Math.floor((e.clientX-bounds.left)*192/bounds.width),y=Math.floor((e.clientY-bounds.top)*256/bounds.height);
    return x>=0&&x<192&&y>=0&&y<256&&alpha.current[(y*192+x)*4+3]>80;
  };
  if(failed)return <div className="h-32 flex items-center justify-center text-center text-[10px] text-slate-500">Anatomia indisponível. Use as faces abaixo.</div>;
  return <canvas ref={canvas} width={192} height={256} data-anatomy={tooth} data-ready={ready} role="button" tabIndex={0}
    aria-label={`Dente ${tooth} — ${toothName(tooth)} — ${describeToothStatus(status,tooth)}`} aria-pressed={selected}
    className="block w-full h-auto focus:outline-none" title={`Dente ${tooth} — ${toothName(tooth)} · ${describeToothStatus(status,tooth)}`}
    style={{opacity:status.whole==='missing'?.15:1,filter:highlighted?'drop-shadow(1px 0 0 #06b6d4) drop-shadow(-1px 0 0 #06b6d4) drop-shadow(0 1px 2px #22d3ee)':undefined}}
    onClick={e=>{if(painted(e)){e.stopPropagation();onSelect();}}}
    onPointerMove={e=>{const hit=painted(e);e.currentTarget.style.cursor=hit?'pointer':'default';onHover(hit?tooth:null);}}
    onPointerLeave={()=>onHover(null)} onFocus={()=>onHover(tooth)} onBlur={()=>onHover(null)}
    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect();}}}/>;
}
