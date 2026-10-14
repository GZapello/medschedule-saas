import React from 'react';
import { ZemdaBodyCanvas, ZemdaBodyCanvasProps } from './ZemdaBodyCanvas';
import { faceAsset } from './faceRegions';
import type { AnatomicalView } from './anatomicalDocument';
export default function FaceMapCanvas({view,...props}:ZemdaBodyCanvasProps & {view:AnatomicalView}) {
  return <ZemdaBodyCanvas {...props} anatomy={faceAsset(props.bodyModel || 'female',view)} />;
}
