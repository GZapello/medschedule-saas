/** Local drawing coordinates, not hitboxes. Stylized permanent anatomy, not
 * patient-specific morphology. Each path is both visible and interactive. */
export interface ToothAnatomy { width: number; crown: string; roots: string[]; cervical: string; grooves: string; }
export const UPPER_PERMANENT = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
export const LOWER_PERMANENT = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

export function toothAnatomy(tooth: number): ToothAnatomy {
  const digit = tooth % 10;
  const upper = tooth < 30;
  const width = (upper ? [38,31,37,43,45,58,55,50] : [28,30,35,39,43,59,55,49])[digit - 1];
  if (!width) throw new Error('Unsupported permanent tooth');
  const l = (64-width)/2, r = 64-l;
  const neckL = l+5, neckR = r-5;
  const tip = digit === 3 ? 200 : digit <= 2 ? 187 : digit <= 5 ? 191 : 184;
  const roots: string[] = [];
  if (digit >= 6) {
    if (upper) roots.push(`M25 134 C23 99 25 40 35 17 C41 22 40 87 40 134 Z`);
    roots.push(`M${neckL} 136 C${l+1} 108 ${l-1} 50 ${l+3} 29 C${l+12} 24 23 95 32 136 Z`);
    roots.push(`M32 136 C43 94 ${r-10} 32 ${r-3} 26 C${r+2} 34 ${r-2} 101 ${neckR} 136 Z`);
  } else if (upper && digit === 4) {
    roots.push(`M${neckL} 136 C14 101 17 44 23 22 C29 32 28 98 32 136 Z`);
    roots.push(`M30 136 C36 93 37 34 42 27 C49 44 48 108 ${neckR} 136 Z`);
  } else {
    const apex = digit === 3 ? 5 : digit === 2 ? 23 : digit === 5 ? 29 : 18;
    roots.push(`M${neckL} 136 C${neckL+1} 96 24 ${apex+17} 32 ${apex} C43 ${apex-4} ${neckR-1} 98 ${neckR} 136 Z`);
  }
  let crown: string;
  let grooves: string;
  if (digit <= 2) {
    crown = `M${neckL} 130 Q32 125 ${neckR} 130 C${r} 144 ${r+1} 171 ${r} ${tip-3} Q32 ${tip+3} ${l} ${tip-3} C${l-1} 167 ${l} 143 ${neckL} 130 Z`;
    grooves = `M${l+9} 143 Q${l+6} 162 ${l+7} 177 M${r-9} 143 Q${r-5} 162 ${r-6} 177`;
  } else if (digit === 3) {
    crown = `M${neckL} 130 Q32 124 ${neckR} 130 C${r+2} 145 ${r} 166 ${r-3} 179 Q42 189 32 ${tip} Q21 190 ${l+3} 179 C${l-1} 164 ${l-2} 145 ${neckL} 130 Z`;
    grooves = 'M32 140 Q28 161 32 189';
  } else {
    crown = `M${neckL} 130 Q32 124 ${neckR} 130 C${r+3} 140 ${r+1} 164 ${r} 176 Q${r-4} ${tip+7} ${r-14} ${tip-1} Q32 ${tip+8} 25 ${tip-2} Q${l+5} ${tip+7} ${l} 176 C${l-2} 154 ${l-2} 139 ${neckL} 130 Z`;
    grooves = digit <= 5 ? 'M32 143 Q25 164 32 183' : `M${l+11} 143 Q25 162 23 178 M${r-11} 142 Q39 160 42 177 M23 163 Q32 168 42 162`;
  }
  return {width,crown,roots,cervical:`M${neckL} 129 Q32 124 ${neckR} 129 L${neckR+1} 137 Q32 131 ${neckL-1} 137 Z`,grooves};
}
