import React from 'react';
import { ToothStatus, ToothFace, DENTAL_CONDITIONS } from './odontogramModel';
import { describeToothStatus, toothFaces, toothName } from './odontogramClinical';
import { toothAnatomy } from './toothAnatomy';

export interface Tooth3DProps {
  tooth: number; status: ToothStatus; selected: boolean; hovered: boolean;
  onSelect: (tooth: number) => void; onHover: (tooth: number | null) => void;
  paintId: string; upper: boolean; showDebugBoundaries?: boolean;
}
export function Tooth3D({tooth,status,selected,hovered,onSelect,onHover,paintId,upper,showDebugBoundaries=false}: Tooth3DProps) {
  const anatomy=toothAnatomy(tooth);
  const highlighted=selected || hovered;
  const clinical=(['whole',...toothFaces(tooth)] as ToothFace[]).filter(f=>status[f] && status[f]!=='healthy');
  const stroke=highlighted?'#0891b2':'#b8afa0';
  return <g data-tooth={tooth} role="button" tabIndex={0} aria-pressed={selected}
    aria-label={`Dente ${tooth} — ${toothName(tooth)} — ${describeToothStatus(status,tooth)}`}
    onClick={e=>{e.stopPropagation();onSelect(tooth);}}
    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(tooth);}}}
    onMouseEnter={()=>onHover(tooth)} onMouseLeave={()=>onHover(null)} onFocus={()=>onHover(tooth)} onBlur={()=>onHover(null)}
    style={{cursor:'pointer',outline:'none'}}>
    <title>{`Dente ${tooth}\n${toothName(tooth)}\n${describeToothStatus(status,tooth)}`}</title>
    <g data-anatomy transform={upper?undefined:'translate(0 210) scale(1 -1)'}
      opacity={status.whole==='missing'?0.15:1} stroke={stroke} strokeWidth={highlighted?1.8:0.7}
      style={{filter:highlighted?'drop-shadow(0 0 2px #22d3ee66)':undefined}}>
      {anatomy.roots.map((d,i)=><path key={i} data-part="root" data-root={i+1} d={d} fill={`url(#${paintId}-root)`} pointerEvents="visiblePainted" />)}
      <path data-part="crown" d={anatomy.crown} fill={`url(#${paintId}-enamel)`} pointerEvents="visiblePainted" />
      <path data-part="cervical" d={anatomy.cervical} fill={`url(#${paintId}-neck)`} pointerEvents="visiblePainted" />
      <path d={anatomy.grooves} fill="none" stroke="#c5bbaa" strokeWidth="0.8" opacity="0.65" pointerEvents="none" />
    </g>
    <g pointerEvents="none" aria-hidden="true">
      <text data-fdi x="32" y={upper?-14:236} textAnchor="middle" fontSize="14" fontWeight="600" fill={highlighted?'#0e7490':'#475569'}>{tooth}</text>
      {clinical.map((f,i)=><circle key={f} cx={32+(i-(clinical.length-1)/2)*8} cy={upper?216:-8} r="3" fill={DENTAL_CONDITIONS.find(c=>c.id===status[f])?.color||'#64748b'} />)}
      {(status.whole==='missing'||status.whole==='implant')&&<text x="32" y={upper?231:-19} textAnchor="middle" fontSize="9" fill="#6d28d9">{status.whole==='missing'?'Ausente':'Implante'}</text>}
      {showDebugBoundaries&&<rect data-debug-boundary x={(64-anatomy.width)/2-2} y="0" width={anatomy.width+4} height="210" fill="none" stroke="#d946ef" strokeDasharray="3 3" strokeWidth="0.6" />}
    </g>
  </g>;
}
