import React from 'react';
import { DENTAL_CONDITIONS, ToothFace, ToothStatus } from './odontogramModel';
import { faceLabel, isUpperTooth, conditionLabel } from './odontogramClinical';

interface Props { tooth: number; status: ToothStatus; highlighted?: boolean; readOnly?: boolean; onFaceClick: (face: ToothFace)=>void; onHover?: (tooth:number|null)=>void; }
/** Same anatomical orientation and paths as the existing map of faces. */
export function ToothFaceMiniMap({tooth,status,highlighted=false,readOnly=false,onFaceClick,onHover}:Props) {
  const upper=isUpperTooth(tooth), inner:ToothFace=upper?'palatina':'lingual';
  const right=[1,4,5,8].includes(Math.floor(tooth/10));
  const faces: {face:ToothFace;d:string}[]=[
    {face:upper?'vestibular':inner,d:'M15 15 H85 L65 35 H35 Z'},
    {face:upper?inner:'vestibular',d:'M35 65 H65 L85 85 H15 Z'},
    {face:right?'distal':'mesial',d:'M15 15 L35 35 V65 L15 85 Z'},
    {face:right?'mesial':'distal',d:'M85 15 L65 35 V65 L85 85 Z'},
    {face:'oclusal',d:tooth%10<=3?'M35 42 H65 V58 H35 Z':'M35 35 H65 V65 H35 Z'}
  ];
  return <svg data-face-map={tooth} viewBox="0 0 100 100" className="block w-full h-auto" aria-label={`Mapa de faces do dente ${tooth}`}
    onMouseEnter={()=>onHover?.(tooth)} onMouseLeave={()=>onHover?.(null)}>
    <rect x="3" y="3" width="94" height="94" rx="12" fill={highlighted?'#ecfeff':'#f8fafc'} stroke={highlighted?'#0891b2':'#e2e8f0'} strokeWidth="2" pointerEvents="none"/>
    {faces.map(({face,d})=><path key={face} data-face={face} d={d} role="button" tabIndex={0}
      aria-label={`${faceLabel(face,tooth)} do dente ${tooth}: ${conditionLabel(status[face])}`} aria-readonly={readOnly}
      fill={!status[face]||status[face]==='healthy'?'#fff':DENTAL_CONDITIONS.find(c=>c.id===status[face])?.color||'#fff'}
      stroke="#64748b" strokeWidth="2" className="cursor-pointer hover:brightness-90 focus:outline-none focus:stroke-cyan-600"
      onClick={e=>{e.stopPropagation();onFaceClick(face);}}
      onFocus={()=>onHover?.(tooth)} onBlur={()=>onHover?.(null)}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onFaceClick(face);}}}>
      <title>{faceLabel(face,tooth)}: {conditionLabel(status[face])}</title>
    </path>)}
  </svg>;
}
