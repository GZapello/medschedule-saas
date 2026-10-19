import React from 'react';
import { OdontogramData,ToothFace,DENTAL_CONDITIONS } from './odontogramModel';
import { ToothAnatomyView } from './ToothAnatomyView';
import { ToothFaceMiniMap } from './ToothFaceMiniMap';
import { UPPER_PERMANENT,LOWER_PERMANENT } from './permanentTeeth';
import { toothFaces,conditionLabel } from './odontogramClinical';
interface Props {
 currentData:OdontogramData;selected:number|null;hovered:number|null;selectedTeeth:number[];multiSelectMode:boolean;readOnly?:boolean;
 onSelect:(tooth:number)=>void;onHover:(tooth:number|null)=>void;onFaceClick:(tooth:number,face:ToothFace)=>void;
}
export default function HybridDentalArch(props:Props){
 return <div className="space-y-5 p-2">
  {[true,false].map(upper=><section key={String(upper)} data-arch={upper?'upper':'lower'} aria-label={upper?'Arcada superior':'Arcada inferior'}>
   <h4 className="text-xs font-bold text-slate-600 mb-2">{upper?'Arcada superior':'Arcada inferior'}</h4>
   <div className="grid gap-1" style={{gridTemplateColumns:'repeat(8, minmax(0, 1fr)) 8px repeat(8, minmax(0, 1fr))'}}>
    {(upper?UPPER_PERMANENT:LOWER_PERMANENT).map((tooth,i)=>{
     const status=props.currentData[tooth]||{},selected=props.multiSelectMode?props.selectedTeeth.includes(tooth):props.selected===tooth;
     const highlighted=selected||props.hovered===tooth;
     const conditions=[...new Set((['whole',...toothFaces(tooth)] as ToothFace[]).map(f=>status[f]).filter(c=>c&&c!=='healthy'))];
     return <div key={tooth} data-tooth={tooth} data-selected={selected} data-highlighted={highlighted} style={{gridColumn:i<8?i+1:i+2}}
       className={`min-w-0 rounded-lg border p-0.5 ${highlighted?'border-cyan-500 bg-cyan-50/50':'border-transparent bg-white'}`}>
       <div className="text-center text-xs font-bold text-slate-600" data-fdi>{tooth}</div>
       <ToothAnatomyView tooth={tooth} status={status} selected={selected} highlighted={highlighted} onSelect={()=>props.onSelect(tooth)} onHover={props.onHover}/>
       <ToothFaceMiniMap tooth={tooth} status={status} highlighted={highlighted} readOnly={props.readOnly} onFaceClick={face=>props.onFaceClick(tooth,face)} onHover={props.onHover}/>
       <div className="flex flex-wrap justify-center gap-0.5 min-h-3 pt-1" aria-label={`Condições do dente ${tooth}`}>
         {conditions.map(c=><span key={c} title={conditionLabel(c)} className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:DENTAL_CONDITIONS.find(d=>d.id===c)?.color}}/>)}
       </div>
       {(status.whole==='missing'||status.whole==='implant')&&<p className="text-[8px] text-center text-slate-500">{status.whole==='missing'?'Ausente':'Implante'}</p>}
     </div>;
    })}
   </div>
  </section>)}
 </div>;
}
