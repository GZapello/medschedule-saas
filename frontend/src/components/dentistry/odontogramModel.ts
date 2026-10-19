export type ToothFace = 'vestibular' | 'lingual' | 'palatina' | 'mesial' | 'distal' | 'oclusal' | 'whole';

export interface ToothCondition {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  affectsFace?: boolean;
  affectsWholeTooth?: boolean;
}

export const DENTAL_CONDITIONS: ToothCondition[] = [
  { id: 'healthy', label: 'Hígido', color: '#64748b', bgColor: 'bg-white', borderColor: 'border-slate-300', description: 'Sem alterações patológicas' },
  { id: 'decay', label: 'Cárie Ativa', color: '#ef4444', bgColor: 'bg-red-500', borderColor: 'border-red-600', description: 'Lesão cariosa ativa necessitando restauração', affectsFace: true },
  { id: 'restoration_resin', label: 'Restauração Resina', color: '#3b82f6', bgColor: 'bg-blue-500', borderColor: 'border-blue-600', description: 'Restauração estética em compósito', affectsFace: true },
  { id: 'restoration_amalgam', label: 'Restauração Amálgama', color: '#475569', bgColor: 'bg-slate-700', borderColor: 'border-slate-800', description: 'Restauração metálica em amálgama', affectsFace: true },
  { id: 'endodontics', label: 'Canal Tratado (Endo)', color: '#10b981', bgColor: 'bg-emerald-500', borderColor: 'border-emerald-600', description: 'Tratamento endodôntico realizado / obturado', affectsWholeTooth: true },
  { id: 'endo_indicated', label: 'Canal a Tratar', color: '#f59e0b', bgColor: 'bg-amber-500', borderColor: 'border-amber-600', description: 'Polpa necrosada ou pulpite irreversível', affectsWholeTooth: true },
  { id: 'crown_prosthesis', label: 'Coroa / Bloco Prótese', color: '#d97706', bgColor: 'bg-amber-600', borderColor: 'border-amber-700', description: 'Prótese fixa, jaqueta, inlay/onlay', affectsWholeTooth: true },
  { id: 'implant', label: 'Implante Dentário', color: '#8b5cf6', bgColor: 'bg-purple-600', borderColor: 'border-purple-700', description: 'Implante de titânio osseointegrado', affectsWholeTooth: true },
  { id: 'missing', label: 'Dente Ausente', color: '#1e293b', bgColor: 'bg-slate-900', borderColor: 'border-slate-950', description: 'Dente perdido ou previamente extraído', affectsWholeTooth: true },
  { id: 'extract_indicated', label: 'Indicação Extração', color: '#dc2626', bgColor: 'bg-rose-600', borderColor: 'border-rose-700', description: 'Exodontia indicada', affectsWholeTooth: true },
  { id: 'orthodontic_bracket', label: 'Aparelho / Braquete', color: '#ea580c', bgColor: 'bg-orange-500', borderColor: 'border-orange-600', description: 'Acessório ortodôntico instalado', affectsWholeTooth: true },
  { id: 'fracture', label: 'Dente Fraturado', color: '#e11d48', bgColor: 'bg-rose-500', borderColor: 'border-rose-600', description: 'Trinca ou fratura de esmalte/raiz', affectsFace: true },
  { id: 'sealant', label: 'Selante Preventivo', color: '#06b6d4', bgColor: 'bg-cyan-500', borderColor: 'border-cyan-600', description: 'Selamento de fóssulas e fissuras', affectsFace: true },
  { id: 'veneer', label: 'Faceta / Lente', color: '#0d9488', bgColor: 'bg-teal-600', borderColor: 'border-teal-700', description: 'Laminado cerâmico ou resina direta', affectsFace: true },
  { id: 'periapical_lesion', label: 'Lesão Periapical', color: '#b91c1c', bgColor: 'bg-red-700', borderColor: 'border-red-800', description: 'Radiolucência periapical / granuloma / cisto', affectsWholeTooth: true },
  // Condições Odontopediátricas e Especiais
  { id: 'amelogenesis', label: 'Amelogênese Imperfeita', color: '#c084fc', bgColor: 'bg-purple-400', borderColor: 'border-purple-500', description: 'Defeito estrutural de mineralização do esmalte', affectsWholeTooth: true },
  { id: 'hmi', label: 'HMI (Hipomineralização)', color: '#f97316', bgColor: 'bg-orange-500', borderColor: 'border-orange-600', description: 'Hipomineralização molar-incisivo', affectsFace: true },
  { id: 'natal_tooth', label: 'Dente Natal / Neonatal', color: '#06b6d4', bgColor: 'bg-cyan-500', borderColor: 'border-cyan-600', description: 'Dente irrompido ao nascimento ou dias após', affectsWholeTooth: true },
  { id: 'anodontia', label: 'Agenesia / Anodontia', color: '#64748b', bgColor: 'bg-slate-500', borderColor: 'border-slate-600', description: 'Ausência congênita do elemento dental', affectsWholeTooth: true },
  { id: 'supernumerary', label: 'Dente Supranumerário', color: '#a855f7', bgColor: 'bg-purple-600', borderColor: 'border-purple-700', description: 'Elemento dental supranumerário / mesiodens', affectsWholeTooth: true },
  { id: 'trauma', label: 'Traumatismo Dental', color: '#ef4444', bgColor: 'bg-red-500', borderColor: 'border-red-600', description: 'Subluxação, intrusão, extrusão ou fratura por trauma infantil', affectsFace: true }
];

export interface ToothStatus {
  whole?: string; // condition id
  vestibular?: string;
  lingual?: string;
  palatina?: string;
  mesial?: string;
  distal?: string;
  oclusal?: string;
  notes?: string;
}

export type OdontogramData = Record<number, ToothStatus>;

