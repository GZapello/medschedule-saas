import React, { useState, useRef, useEffect } from 'react';
import { SecureFileImage } from '../common/SecureFileImage';
import { Point, Stroke, PosturePhoto, regions } from './posture';
interface Props { photo:PosturePhoto; strokes:Stroke[]; guides?:boolean; tool?:'pen'|'line'|'eraser'|'select'; onStrokes?:(strokes:Stroke[])=>void; onRegion?:(region:any)=>void; attentionRegions?:string[] }
export function PosturePhotoCanvas({photo,strokes,guides,tool='select',onStrokes,onRegion,attentionRegions=[]}:Props) {
  const host=useRef<HTMLDivElement>(null);
  const drawing=useRef<Point[]>([]);
  const [preview,setPreview]=useState<Point[]>([]);
  const [ready,setReady]=useState(false);
  useEffect(()=>{setReady(false);drawing.current=[];setPreview([]);},[photo.fileId,photo.url]);
  const point=(e:React.PointerEvent):Point=>{const r=host.current!.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  const path=(pts:Point[])=>pts.map((p,i)=>`${i?'L':'M'}${p[0]*1000},${p[1]*1000}`).join(' ');
  const shown=tool==='line' && preview.length>1 ? [preview[0],preview[preview.length-1]]:preview;
  const end=()=>{if(drawing.current.length>1 && onStrokes && strokes.length<100) {const pts=tool==='line'?[drawing.current[0],drawing.current[drawing.current.length-1]]:drawing.current;onStrokes([...strokes,{tool:tool==='line'?'line':'pen',points:pts}]);}drawing.current=[];setPreview([]);};
  return <div ref={host} className="relative w-full bg-slate-100 rounded-xl overflow-hidden" style={{minHeight:ready?undefined:180}} onLoadCapture={()=>setReady(true)}>
    <SecureFileImage fileId={photo.fileId} fallbackUrl={photo.url} alt="Foto da avaliação postural" className="block w-full h-auto" placeholderText="Adicione a foto nesta vista para fazer marcações" />
    {ready && <svg aria-label="Área de marcação postural" className="absolute inset-0 w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{touchAction:tool==='select'?'auto':'none',pointerEvents:!onStrokes?'none':undefined}}
      onPointerDown={e=>{if(!onStrokes || tool==='select')return;if(tool==='eraser'){const i=(e.target as SVGElement).getAttribute('data-stroke');if(i!==null)onStrokes(strokes.filter((_,idx)=>idx!==Number(i)));return;}if(strokes.length>=100)return;e.currentTarget.setPointerCapture(e.pointerId);drawing.current=[point(e)];setPreview(drawing.current);}}
      onPointerMove={e=>{if(!drawing.current.length)return;const p=point(e);const last=drawing.current[drawing.current.length-1];if(Math.hypot(p[0]-last[0],p[1]-last[1])<.003)return;if(drawing.current.length<300)drawing.current=[...drawing.current,p];setPreview(drawing.current);}}
      onPointerUp={end} onPointerCancel={()=>{drawing.current=[];setPreview([]);}}>
      {guides && <g stroke="#ffffff" strokeWidth="1" strokeDasharray="7 5" vectorEffect="non-scaling-stroke" opacity=".85"><path d="M500 0V1000 M0 250H1000 M0 500H1000 M0 750H1000" /></g>}
      {strokes.map((s,i)=><g key={i}><path d={path(s.points)} fill="none" stroke="#f43f5e" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />{tool==='eraser'&&<path data-stroke={i} d={path(s.points)} fill="none" stroke="transparent" strokeWidth="18" vectorEffect="non-scaling-stroke" style={{pointerEvents:'stroke',cursor:'crosshair'}} />}</g>)}
      {shown.length>1&&<path d={path(shown)} fill="none" stroke="#f43f5e" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
    </svg>}
    {ready && onRegion && regions.map(([id,label,y])=><button type="button" key={id} aria-label={`Adicionar observação: ${label}`} title={label} onClick={()=>onRegion(id)} className={`absolute right-2 w-7 h-7 rounded-full ${attentionRegions.includes(id)?'bg-amber-600 ring-2 ring-amber-200':'bg-indigo-600'} text-white shadow border border-white text-lg leading-none`} style={{top:`${y*100}%`,transform:'translateY(-50%)'}}>+</button>)}
  </div>;
}
