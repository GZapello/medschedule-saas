import { AnatomyAsset, shape } from './anatomicalRegions';
import type { AnatomicalView, SexVariant } from './anatomicalDocument';
type Geometry=Record<string,string|number[]>;
// Landmarks measured in the supplied 384x512 portrait crops. Each base/view
// receives its own geometry; only semantic IDs are shared.
function frontal(sex:SexVariant):Geometry {
  const f=sex==='female',dy=f?10:0;
  const g:Geometry={
    face_forehead:f?'117,136 157,119 218,119 270,141 285,181 232,187 199,201 167,186 111,184':'113,134 159,117 224,118 278,139 292,181 238,183 197,194 161,182 106,182',
    face_glabella:[198,204+dy,12,15],face_nose:`185,226 208,226 222,${271+dy} 213,${284+dy} 180,${284+dy} 172,${272+dy}`,
    face_perioral:`163,${302+dy} 231,${302+dy} 243,${339+dy} 219,${353+dy} 172,${353+dy} 153,${336+dy}`,
    face_upper_lip:`164,${317+dy} 181,${309+dy} 196,${313+dy} 208,${309+dy} 229,${317+dy} 212,${322+dy} 179,${322+dy}`,
    face_lower_lip:`170,${324+dy} 224,${324+dy} 211,${335+dy} 184,${335+dy}`,
    face_chin:[197,f?374:370,29,15],face_submental:[198,f?401:402,33,9],
    neck_anterior:f?'140,410 255,410 268,453 247,485 150,485 127,453':'126,416 274,416 289,458 246,487 149,487 109,458'
  };
  for(const side of ['right','left']){
    const right=side==='right',mirror=(x:number)=>right?x:394-x;
    const p=(coords:number[][])=>coords.map(([x,y])=>`${mirror(x)},${y+dy}`).join(' ');
    g[`face_temporal_${side}`]=p([[102,182],[112,188],[117,218],[102,235],[95,213]]);
    g[`face_eyebrow_${side}`]=p([[118,193],[141,184],[166,187],[181,195],[178,203],[148,196],[119,201]]);
    g[`face_periocular_${side}`]=[mirror(150),216+dy,29,13];
    g[`face_malar_${side}`]=p([[109,240],[141,235],[170,245],[162,263],[120,272],[105,260]]);
    g[`face_cheek_${side}`]=p([[114,277],[155,267],[165,287],[154,313],[123,323],[110,304]]);
    g[`face_nasolabial_${side}`]=p([[171,282],[181,292],[164,313],[156,318],[157,304]]);
    g[`face_masseter_${side}`]=p([[98,278],[111,284],[116,321],[132,344],[114,346],[101,321]]);
    g[`face_mandible_${side}`]=p([[117,351],[143,366],[171,379],[164,388],[138,379],[119,365]]);
    g[`face_ear_${side}`]=[mirror(86),249,11,31];
    g[`joint_tmj_${side}`]=[mirror(103),f?252:245,6,7];
  }
  return g;
}
function profile(sex:SexVariant,side:'left'|'right'):Geometry {
  const f=sex==='female';
  // Right-side profile faces left in the image.
  const g:Geometry={
    face_forehead:f?'94,126 114,128 139,151 146,183 99,185 82,180':'115,126 146,126 178,148 178,184 120,185 96,177',
    face_glabella:[f?80:84,198,7,9],
    face_nose:f?'75,230 90,240 88,271 67,286 43,282 44,266':'71,228 89,237 88,266 63,283 39,278 44,261',
    face_perioral:'76,289 103,297 103,334 78,348 67,332 63,305',
    face_upper_lip:'64,307 85,309 93,317 77,320 64,315',face_lower_lip:'65,322 92,322 83,333 69,332',
    face_chin:f?'76,343 110,346 117,372 86,380 70,371 68,357':'79,346 119,348 128,378 96,389 76,378 70,361',
    face_submental:f?'115,373 160,360 172,369 156,379 127,382':'130,379 174,368 188,377 177,392 153,390',
    neck_anterior:f?'182,390 219,372 229,414 211,463 172,480 182,437':'190,387 234,359 249,411 247,463 188,493 205,442',
    neck_posterior:f?'275,323 285,354 307,417 324,456 289,447 254,384':'291,317 307,355 329,412 354,447 309,440 270,379'
  };
  g.face_temporal_right=f?'148,164 179,189 204,226 194,249 174,225 156,209':'182,155 205,176 216,210 207,238 185,222 179,191';
  g.face_eyebrow_right=f?'84,192 105,192 131,205 128,212 104,203 82,202':'86,190 112,186 144,198 139,206 112,199 85,201';
  g.face_periocular_right=[f?107:112,218,21,12];
  g.face_malar_right=f?'116,235 163,237 184,255 155,276 114,266 100,252':'121,233 165,230 201,250 183,271 134,271 104,252';
  g.face_cheek_right=f?'112,280 163,278 183,300 156,331 110,329 101,307':'119,280 170,278 198,302 179,329 119,331 105,308';
  g.face_nasolabial_right='94,281 109,290 109,309 99,317 94,301 85,290';
  g.face_masseter_right=f?'190,275 215,288 207,334 169,353 170,326':'210,278 237,291 225,336 186,360 187,326';
  g.face_mandible_right=f?'115,354 166,342 206,332 204,345 163,367 118,377':'132,357 181,345 225,334 223,348 183,373 130,386';
  g.face_ear_right=[f?247:265,246,f?23:25,37];
  g.joint_tmj_right=[f?219:235,242,7,8];
  if(side==='right')return g;
  // Corresponding left portraits have different framing. Affine landmark fit
  // uses nose tip and tragus measured separately for each supplied crop.
  const flip=(x:number)=>(384-x)*(f?0.91:0.90)+(f?68:76);
  const left:Geometry=Object.fromEntries(Object.entries(g).map(([id,c])=>[id.replace(/_right$/,'_left'),Array.isArray(c)?[flip(c[0]),c[1],c[2]*(f?0.91:0.90),c[3]]:c.split(' ').map(p=>{const [x,y]=p.split(',').map(Number);return `${flip(x)},${y}`;}).join(' ')]));
  left.neck_anterior=f?'231,383 270,371 254,414 234,453 248,485 215,477 213,432':'232,392 267,382 249,422 232,467 232,491 197,478 209,427';
  return left;
}
function threeQuarter(sex:SexVariant,side:'left'|'right'):Geometry {
  const f=sex==='female',dy=f?13:0;
  if(side==='right')return {
    face_forehead:'89,125 138,101 193,115 217,163 185,176 143,177 111,172 78,171',
    face_glabella:[121,196+dy,8,12],face_temporal_right:'224,159 243,195 253,234 237,251 215,197',
    face_eyebrow_right:`137,${178+dy} 173,${165+dy} 202,${175+dy} 208,${183+dy} 173,${178+dy} 138,${190+dy}`,
    face_eyebrow_left:`80,${178+dy} 101,${176+dy} 112,${189+dy} 105,${195+dy} 78,${188+dy}`,
    face_periocular_right:[173,197+dy,27,12],face_periocular_left:[94,200+dy,14,10],
    face_nose:`108,${211+dy} 129,${214+dy} 143,${252+dy} 121,${265+dy} 97,${259+dy} 94,${247+dy}`,
    face_malar_right:`153,${218+dy} 200,${219+dy} 230,${239+dy} 211,${259+dy} 163,${254+dy} 146,${242+dy}`,
    face_malar_left:`79,${217+dy} 93,${218+dy} 97,${240+dy} 82,${245+dy} 74,${235+dy}`,
    face_cheek_right:`158,${263+dy} 211,${267+dy} 225,${290+dy} 195,${326+dy} 157,${316+dy} 145,${289+dy}`,
    face_cheek_left:`78,${252+dy} 88,${258+dy} 89,${290+dy} 81,${303+dy} 75,${282+dy}`,
    face_nasolabial_right:`140,${260+dy} 153,${274+dy} 150,${301+dy} 141,${300+dy} 138,${280+dy} 130,${270+dy}`,
    face_nasolabial_left:`94,${268+dy} 98,${277+dy} 90,${294+dy} 87,${287+dy}`,
    face_perioral:`96,${278+dy} 137,${278+dy} 156,${303+dy} 143,${326+dy} 106,${325+dy} 89,${306+dy}`,
    face_upper_lip:`94,${293+dy} 110,${285+dy} 123,${288+dy} 144,${299+dy} 121,${302+dy} 96,${301+dy}`,
    face_lower_lip:`96,${304+dy} 143,${303+dy} 128,${315+dy} 107,${315+dy}`,
    face_chin:[124,346+dy,25,14],face_masseter_right:'244,276 267,285 247,329 211,351 218,323',
    face_mandible_right:'167,357 214,338 244,324 245,340 207,365 170,375',face_mandible_left:'87,321 96,333 98,352 91,350',
    face_submental:[162,382,27,9],face_ear_right:[f?300:307,f?244:234,22,34],joint_tmj_right:[f?273:278,f?243:231,6,8],
    neck_anterior:'129,391 199,381 219,427 209,469 146,483 131,443',neck_posterior:'261,329 279,350 289,398 318,440 285,442 247,380'
  };
  return {
    face_forehead:f?'198,137 236,121 288,134 318,163 323,185 284,179 242,179 215,167':'192,112 233,100 289,110 306,142 315,169 279,161 242,164 212,147',
    face_glabella:[287,f?201:187,8,13],face_temporal_left:'161,165 193,151 208,173 184,210 164,224 151,209',
    face_eyebrow_left:`211,${178+dy} 240,${166+dy} 270,${176+dy} 275,${183+dy} 242,${178+dy} 211,${187+dy}`,
    face_eyebrow_right:`291,${178+dy} 315,${171+dy} 325,${180+dy} 322,${189+dy} 295,${189+dy}`,
    face_periocular_left:[242,198+dy,26,12],face_periocular_right:[f?307:303,199+dy,f?10:9,10],
    face_nose:`279,${214+dy} 299,${213+dy} 313,${248+dy} 299,${266+dy} 276,${262+dy} 270,${253+dy}`,
    face_malar_left:`189,${220+dy} 227,${217+dy} 265,${231+dy} 259,${252+dy} 217,${263+dy} 181,${244+dy}`,
    face_malar_right:`312,${219+dy} 322,${219+dy} 319,${245+dy} 311,${246+dy}`,
    face_cheek_left:`183,${261+dy} 222,${269+dy} 252,${260+dy} 263,${283+dy} 244,${310+dy} 201,${322+dy} 175,${297+dy}`,
    
    face_nasolabial_left:`269,${264+dy} 278,${268+dy} 265,${288+dy} 259,${306+dy} 253,${300+dy} 259,${280+dy}`,
    
    face_perioral:`272,${278+dy} 300,${280+dy} 306,${305+dy} 298,${325+dy} 265,${326+dy} 252,${307+dy}`,
    face_upper_lip:`258,${300+dy} 279,${287+dy} 291,${292+dy} 302,${296+dy} 299,${305+dy} 278,${302+dy}`,
    face_lower_lip:`260,${306+dy} 299,${308+dy} 292,${318+dy} 275,${317+dy}`,
    face_chin:[277,347+dy,23,12],face_masseter_left:'134,277 156,271 178,317 172,344 149,326',
    face_mandible_left:'177,339 215,351 247,356 246,372 213,369 180,356',
    face_submental:[232,384,26,8],face_ear_left:[f?91:86,f?242:230,22,34],joint_tmj_left:[f?122:121,f?241:234,7,8],
    neck_anterior:'177,386 221,391 229,420 216,476 157,473 156,424',neck_posterior:'105,309 124,339 134,392 115,438 80,446 101,383'
  };
}
export function faceAsset(sex:SexVariant,view:AnatomicalView):AnatomyAsset{
  const valid=['front','left','right','3q_left','3q_right'].includes(view)?view:'front';
  const geometry=valid==='front'?frontal(sex):valid.startsWith('3q')?threeQuarter(sex,valid==='3q_left'?'left':'right'):profile(sex,valid as 'left'|'right');
  const regions=Object.entries(geometry).map(([id,c])=>shape(id,valid.includes('left')?'left':valid.includes('right')?'right':'front',c));
  // The perioral envelope is under the independently selectable lips/folds.
  regions.sort((a,b)=>Number(Boolean(a.isJoint))-Number(Boolean(b.isJoint)) || (a.baseRegion==='face_perioral'?-1:b.baseRegion==='face_perioral'?1:0));
  return {src:`/anatomy/face/${sex}/${valid}.webp`,width:384,height:512,regions,label:`Face ${sex==='female'?'feminina':'masculina'} — ${valid}`};
}
