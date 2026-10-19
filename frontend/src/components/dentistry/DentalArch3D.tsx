import React, {useId} from 'react';
import { OdontogramData } from './odontogramModel';
import { Tooth3D } from './Tooth3D';
import { UPPER_PERMANENT, LOWER_PERMANENT, toothAnatomy } from './toothAnatomy';

interface Props {
  currentData: OdontogramData; selected: number | null; hovered: number | null;
  selectedTeeth: number[]; multiSelectMode: boolean;
  onSelect: (tooth: number)=>void; onHover: (tooth: number|null)=>void;
  showDebugBoundaries?: boolean;
}
const widths=UPPER_PERMANENT.map((n,i)=>Math.max(toothAnatomy(n).width,toothAnatomy(LOWER_PERMANENT[i]).width)+6);
const edge=(index:number)=>24+widths.slice(0,index).reduce((sum,w)=>sum+w,0)+(index>=8?12:0);
const xPosition=(index:number)=>edge(index)+widths[index]/2-32;
const sceneWidth=edge(16)+24;
/** Cervical tissue connects the elements behind them; it cannot receive clicks. */
function Gingiva({upper,paintId}:{upper:boolean;paintId:string}) {
  const scallops=Array.from({length:16},(_,i)=>`Q${xPosition(i)+32} 117 ${edge(i)+widths[i]} 137`).join(' ');
  return <path data-gingiva={upper?'upper':'lower'} pointerEvents="none"
    transform={upper?undefined:'translate(0 210) scale(1 -1)'}
    d={`M24 137 ${scallops} L${sceneWidth-24} 116 Q${sceneWidth/2} 96 24 116 Z`} fill={`url(#${paintId}-gum)`} opacity="0.9" />;
}
export default function DentalArch3D(props:Props) {
  const paintId='tooth-'+useId().replace(/:/g,'');
  return <svg viewBox={`0 0 ${sceneWidth} 570`} className="block w-full h-auto" aria-label="Arcadas permanentes individualizadas">
    <defs>
      <linearGradient id={`${paintId}-enamel`} x1="0" x2="1"><stop stopColor="#c8c7c0"/><stop offset=".24" stopColor="#fffef7"/><stop offset=".52" stopColor="#fff"/><stop offset=".78" stopColor="#e8e6dd"/><stop offset="1" stopColor="#c9c9c3"/></linearGradient>
      <linearGradient id={`${paintId}-root`} x1="0" x2="1"><stop stopColor="#b9a789"/><stop offset=".3" stopColor="#f5ead1"/><stop offset=".6" stopColor="#e9dabe"/><stop offset="1" stopColor="#b6a185"/></linearGradient>
      <linearGradient id={`${paintId}-neck`} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#ded1b9"/><stop offset="1" stopColor="#fff9e9"/></linearGradient>
      <linearGradient id={`${paintId}-gum`} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#f7d5d5"/><stop offset=".55" stopColor="#eaa3a7"/><stop offset="1" stopColor="#ce7682"/></linearGradient>
    </defs>
    {[true,false].map(upper=><g key={String(upper)} data-arch={upper?'upper':'lower'} transform={`translate(0 ${upper?48:302})`}>
      <Gingiva upper={upper} paintId={paintId}/>
      {(upper?UPPER_PERMANENT:LOWER_PERMANENT).map((tooth,i)=><g key={tooth} transform={`translate(${xPosition(i)} 0)`}>
        <Tooth3D tooth={tooth} upper={upper} paintId={paintId} status={props.currentData[tooth]||{}}
          selected={props.multiSelectMode?props.selectedTeeth.includes(tooth):props.selected===tooth}
          hovered={props.hovered===tooth} onSelect={props.onSelect} onHover={props.onHover} showDebugBoundaries={props.showDebugBoundaries}/>
      </g>)}
    </g>)}
    <path d={`M${sceneWidth/2} 24 V40 M${sceneWidth/2} 542 V554`} stroke="#94a3b8" strokeDasharray="3 3" pointerEvents="none"/>
  </svg>;
}
