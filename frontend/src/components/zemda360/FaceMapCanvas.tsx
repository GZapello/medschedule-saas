import React from 'react';
import { Zemda360Canvas, Zemda360CanvasProps } from './Zemda360Canvas';
import { faceAsset } from './faceRegions';
import type { AnatomicalView } from './anatomicalDocument';
export default function FaceMapCanvas({view,...props}:Zemda360CanvasProps & {view:AnatomicalView}) {
  return <Zemda360Canvas {...props} anatomy={faceAsset(props.bodyModel || 'female',view)} />;
}
