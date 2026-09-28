import taxonomy from './data/region-taxonomy.json';
import { BodyPanoramaRegion, getPanoramaRegions, getRegionLabel } from './bodyRegionsData';
import type { AnatomicalView, SexVariant } from './anatomicalDocument';

export const REGION_TAXONOMY=taxonomy.regions;
export const LEGACY_TO_CANONICAL:Record<string,string>={
  coluna_cervical:'joint_cervical',coluna_toracica:'thoracic_back',coluna_lombar:'lumbar',pelve:'pelvis',
  ombro_direito:'shoulder_right',ombro_esquerdo:'shoulder_left',cotovelo_direito:'elbow_right',cotovelo_esquerdo:'elbow_left',
  punho_direito:'wrist_right',punho_esquerdo:'wrist_left',quadril_direito:'hip_right',quadril_esquerdo:'hip_left',
  joelho_direito:'knee_right',joelho_esquerdo:'knee_left',tornozelo_direito:'ankle_right',tornozelo_esquerdo:'ankle_left',
  pe_direito:'foot_right',pe_esquerdo:'foot_left',antebraco_direito:'forearm_right',antebraco_esquerdo:'forearm_left',
  quadriceps_direito:'thigh_anterior_right',quadriceps_esquerdo:'thigh_anterior_left',posteriores_direito:'thigh_posterior_right',posteriores_esquerdo:'thigh_posterior_left'
};
export const canonicalRegion=(id:string)=>LEGACY_TO_CANONICAL[id] || id;
export const anatomicalLabel=(id:string,sex:SexVariant='female')=>taxonomy.regions.find(r=>r.id===canonicalRegion(id))?.label || getRegionLabel(id,sex);
export const BODY_VIEWS: {id:AnatomicalView;label:string}[]=[{id:'all',label:'Todas as vistas'},{id:'front',label:'Frente'},{id:'back',label:'Costas'},{id:'left',label:'Lado E'},{id:'right',label:'Lado D'}];
export const FACE_VIEWS: {id:AnatomicalView;label:string}[]=[{id:'front',label:'Frontal'},{id:'left',label:'Perfil E'},{id:'right',label:'Perfil D'},{id:'3q_left',label:'3/4 E'},{id:'3q_right',label:'3/4 D'}];
export interface AnatomyAsset {src:string;width:number;height:number;regions:BodyPanoramaRegion[];label:string;}

export function shape(id:string,view:BodyPanoramaRegion['view'],coordinates:number[] | string):BodyPanoramaRegion {
  const meta=taxonomy.regions.find(r=>r.id===id);
  if(!meta)throw Error(`Unknown anatomical ID: ${id}`);
  const ellipse=Array.isArray(coordinates);
  const points=ellipse ? [] : (coordinates as string).split(' ').map(p=>p.split(',').map(Number));
  const center=ellipse ? {x:coordinates[0],y:coordinates[1]} : {x:points.reduce((n,p)=>n+p[0],0)/points.length,y:points.reduce((n,p)=>n+p[1],0)/points.length};
  return {id:`${view}_${id}`,baseRegion:id,region:id,label:meta.label,view,side:meta.side==='center'?'midline':meta.side as 'left'|'right',isJoint:meta.kind==='joint',shapeType:ellipse?'ellipse':'polygon',center,
    ...(ellipse?{ellipseCoords:{cx:coordinates[0],cy:coordinates[1],rx:coordinates[2],ry:coordinates[3]}}:{points:coordinates as string})};
}

// Additive calibration against the unchanged 1024x768 body panoramas. Existing
// geometries remain available; canonical aliases do not rewrite stored IDs.
export function bodyAnatomicalRegions(sex:SexVariant):BodyPanoramaRegion[]{
  const old=getPanoramaRegions(sex);
  const regions=old.map(r=>({...r,baseRegion:canonicalRegion(r.baseRegion),region:canonicalRegion(r.region)}));
  const female=sex==='female',front=160,back=female?406:447;
  const add=(id:string,view:BodyPanoramaRegion['view'],c:number[]|string)=>regions.push(shape(id,view,c));
  const poly=(cx:number,y:number,w:number,h:number)=>`${cx-w},${y} ${cx+w},${y} ${cx+w},${y+h} ${cx-w},${y+h}`;
  add('cervical','front',[front,116,13,15]);
  add('thorax','front',poly(front,150,44,78));
  add('sternum','front',poly(front,female?155:145,7,70));
  add('abdomen_upper','front',poly(front,231,31,32));
  add('abdomen_lower','front',poly(front,265,32,37));
  add('sacral','back',[back,318,13,16]);
  for(const side of ['right','left'] as const){
    const direction=side==='right'?-1:1;
    add(`pectoral_${side}`,'front',poly(front+direction*26,160,17,50));
    add(`ribs_${side}`,'front',poly(front+direction*40,213,12,36));
    add(`flank_${side}`,'front',poly(front+direction*43,254,9,40));
    add(`scapula_${side}`,'back',poly(back-direction*33,153,20,59));
    add(`glute_${side}`,'back',[back-direction*33,female?337:340,25,27]);
    add(`joint_sacroiliac_${side}`,'back',[back-direction*17,307,7,9]);
    const arm=old.find(r=>r.view==='front'&&r.baseRegion===`biceps_${side==='right'?'direito':'esquerdo'}`)!;
    add(`upper_arm_${side}`,'front',arm.points!);
    const thigh=old.find(r=>r.view==='front'&&r.baseRegion===`quadriceps_${side==='right'?'direito':'esquerdo'}`)!;
    add(`thigh_medial_${side}`,'front',poly(thigh.center.x-direction*18,370,6,78));
    add(`thigh_lateral_${side}`,'front',poly(thigh.center.x+direction*19,370,6,78));
    add(`leg_anterior_${side}`,'front',poly(female?(side==='right'?119:199):(side==='right'?113:204),505,12,102));
    add(`leg_posterior_${side}`,'back',poly(back-direction*35,509,17,97));
    add(`heel_${side}`,'back',[back-direction*38,645,10,9]);
  }
  // Individually measured digit landmarks; not a uniform synthetic subdivision.
  const hands=female ? {
    right:[[58,372],[47,387],[46,397],[49,403],[53,397]],left:[[256,372],[266,387],[270,397],[273,401],[275,393]]
  } : {right:[[47,365],[41,386],[36,395],[29,393],[24,384]],left:[[269,365],[272,386],[279,395],[286,393],[291,385]]};
  const toes=female ? {right:[[122,658],[114,656],[106,656],[99,656],[94,654]],left:[[197,658],[204,657],[211,657],[217,656],[222,654]]}
    : {right:[[102,650],[95,650],[87,649],[82,647],[77,644]],left:[[214,650],[222,650],[228,649],[233,647],[238,644]]};
  for(const side of ['right','left'] as const){
    add(`hand_${side}`,'front',[side==='right'?(female?50:36):(female?266:279),365,female?9:13,15]);
    hands[side].forEach(([x,y],i)=>add(`hand_digit_${i+1}_${side}`,'front',[x,y,2.7,4]));
    toes[side].forEach(([x,y],i)=>add(`foot_digit_${i+1}_${side}`,'front',[x,y,2.6,3.5]));
  }
  // Regions precede joints so broad surfaces never intercept joint hits.
  return regions.sort((a,b)=>Number(Boolean(a.isJoint))-Number(Boolean(b.isJoint)));
}
