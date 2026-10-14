import React,{useEffect,useRef,useState} from 'react';

export function SignatureCanvas({onChange,disabled=false}:{onChange:(data:string|null)=>void;disabled?:boolean}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const drawing=useRef(false);
  const points=useRef(0);
  const [drawn,setDrawn]=useState(false);
  useEffect(()=>{const c=canvas.current;if(c){const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);}},[]);
  const coordinate=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const c=canvas.current!,r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};
  };
  const start=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(disabled || (e.pointerType==='mouse' && e.button!==0))return;
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    const p=coordinate(e),ctx=e.currentTarget.getContext('2d')!;
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#0f172a';drawing.current=true;
  };
  const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!drawing.current)return;
    const p=coordinate(e),ctx=e.currentTarget.getContext('2d')!;
    ctx.lineTo(p.x,p.y);ctx.stroke();points.current++;setDrawn(true);
  };
  const finish=()=>{if(!drawing.current)return;drawing.current=false;onChange(points.current>2?canvas.current!.toDataURL('image/png'):null);};
  const clear=()=>{if(disabled)return;const c=canvas.current!,ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);points.current=0;setDrawn(false);onChange(null);};
  return <div className="space-y-2">
    <p className="text-sm font-semibold text-slate-700" id="signature-label">Assinatura manuscrita</p>
    <p className="text-xs text-slate-500" id="signature-help">Assine com o dedo, mouse ou caneta no espaço abaixo.</p>
    <canvas ref={canvas} width={900} height={280} aria-labelledby="signature-label" aria-describedby="signature-help"
      onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
      className="w-full h-40 sm:h-48 border border-slate-300 rounded-xl bg-white" style={{touchAction:'none',cursor:disabled?'default':'crosshair'}} />
    <div className="flex gap-3"><button type="button" onClick={clear} disabled={disabled} className="consent-secondary">Limpar</button><button type="button" onClick={clear} disabled={!drawn||disabled} className="consent-secondary">Refazer</button></div>
  </div>;
}
