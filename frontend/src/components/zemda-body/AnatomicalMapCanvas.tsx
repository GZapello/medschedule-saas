import React, { lazy, Suspense } from 'react';
import { ZemdaBodyCanvas, ZemdaBodyCanvasProps } from './ZemdaBodyCanvas';
import { bodyAnatomicalRegions, canonicalRegion } from './anatomicalRegions';
import type { AnatomicalView, MapType } from './anatomicalDocument';
const FaceMapCanvas=lazy(()=>import('./FaceMapCanvas'));
export function AnatomicalMapCanvas({mapType,view,onViewChange,...props}:Omit<ZemdaBodyCanvasProps,'onViewChange'> & {mapType:MapType;view:AnatomicalView;onViewChange?:(v:AnatomicalView)=>void}){
  const selectedRegions=(props.selectedRegions || []).map(canonicalRegion);
  if(mapType==='FACE')return <Suspense fallback={<p role="status">Carregando mapa facial...</p>}><FaceMapCanvas key={`${props.bodyModel}:${view}`} {...props} selectedRegions={selectedRegions} view={view}/></Suspense>;
  return <ZemdaBodyCanvas {...props} selectedRegions={selectedRegions} regionCatalog={bodyAnatomicalRegions(props.bodyModel || 'female')} controlledView={view as any} onViewChange={onViewChange}/>;
}
