import React from 'react';
import { anatomicalLabel } from '../zemda-body/anatomicalRegions';
import { Activity, Compass, MapPin, PenTool, CheckCircle2 } from 'lucide-react';

export interface ParsedZemdaAssessment {
  isZemda: boolean;
  title: string;
  modelLabel: string;
  evaluatedRegions: string[];
  marksCount: number;
  hasDrawings: boolean;
  drawingsCount: number;
  clinicalNotes: string;
}

export const TECHNICAL_JSON_KEYS = new Set([
  'schemaVersion',
  'schema_version',
  'mapType',
  'map_type',
  'activeLayerKey',
  'active_layer_key',
  'layers',
  'layer',
  'sexVariant',
  'sex_variant',
  'selectionViews',
  'selection_views',
  'drawings',
  'drawing',
  'points',
  'point',
  'strokeId',
  'stroke_id',
  'toolType',
  'tool_type',
  'coordinates',
  'coordinate',
  'assessmentId',
  'assessment_id',
  'updatedBy',
  'updated_by',
  'createdBy',
  'created_by',
  'updatedAt',
  'updated_at',
  'createdAt',
  'created_at',
  'legacyNotes',
  'legacy_notes',
  'markers',
  'selectedRegions',
  'selected_regions',
  'viewsDrawn',
  'views_drawn',
  'id',
  'tenant_id',
  'patient_id',
  'professional_id'
]);

/**
 * Identifica e extrai dados clínicos de um payload Zemda360 / Canvas,
 * garantindo que nenhum JSON técnico ou estrutura crua chegue ao usuário.
 */
export function parseZemdaAssessment(raw: any): ParsedZemdaAssessment {
  const result: ParsedZemdaAssessment = {
    isZemda: false,
    title: 'Mapeamento Corporal 360',
    modelLabel: 'Feminino',
    evaluatedRegions: [],
    marksCount: 0,
    hasDrawings: false,
    drawingsCount: 0,
    clinicalNotes: ''
  };

  if (!raw) return result;

  let obj: any = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return result;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        obj = JSON.parse(trimmed);
      } catch {
        // Se contiver chaves técnicas de canvas, marcamos como Zemda quebrado para suprimir JSON cru
        if (/["'](?:schemaVersion|mapType|activeLayerKey|layers|drawings|strokeId|selectedRegions)["']/.test(trimmed)) {
          result.isZemda = true;
        }
        return result;
      }
    } else {
      return result;
    }
  }

  if (!obj || typeof obj !== 'object') return result;

  // Verifica se é estrutura Zemda360
  const isSchema2 = obj.schemaVersion === 2 || Boolean(obj.layers);
  const isLegacyBody = Boolean(obj.mapType) || Boolean(obj.activeLayerKey) || Boolean(obj.selectedRegions) || Boolean(obj.drawings);

  if (!isSchema2 && !isLegacyBody && !obj.body_model && !obj.total_markers) {
    return result;
  }

  result.isZemda = true;

  // Determina sexo / modelo corporal
  const sexVariant = obj.sexVariant || obj.body_model || obj.bodyModel || (obj.layers && Object.values(obj.layers)[0] as any)?.sexVariant;
  result.modelLabel = sexVariant === 'male' ? 'Masculino' : 'Feminino';

  // Determina tipo de mapa (Corpo / Face / Misto)
  const mapType = obj.mapType || (obj.layers && Object.values(obj.layers)[0] as any)?.mapType;
  if (mapType === 'FACE') {
    result.title = 'Mapeamento Facial 360';
  } else if (mapType === 'BODY') {
    result.title = 'Mapeamento Corporal 360';
  } else {
    result.title = 'Mapeamento Anatômico 360';
  }

  const rawRegions: string[] = [];
  const notesCollected: string[] = [];
  let totalMarks = 0;
  let totalStrokes = 0;

  if (obj.layers && typeof obj.layers === 'object') {
    const layers = Object.values(obj.layers) as any[];
    for (const l of layers) {
      if (Array.isArray(l.selectedRegions)) {
        rawRegions.push(...l.selectedRegions);
      }
      if (Array.isArray(l.marks)) {
        totalMarks += l.marks.length;
        for (const m of l.marks) {
          if (m?.note && typeof m.note === 'string' && m.note.trim()) {
            notesCollected.push(m.note.trim());
          }
        }
      }
      if (Array.isArray(l.drawings)) {
        totalStrokes += l.drawings.length;
      }
      if (l.clinicalNotes && typeof l.clinicalNotes === 'string' && l.clinicalNotes.trim()) {
        notesCollected.push(l.clinicalNotes.trim());
      }
    }
  }

  if (Array.isArray(obj.selectedRegions)) {
    rawRegions.push(...obj.selectedRegions);
  }
  if (Array.isArray(obj.regions)) {
    rawRegions.push(...obj.regions);
  }
  if (Array.isArray(obj.drawings)) {
    totalStrokes += obj.drawings.length;
  } else if (obj.drawings && typeof obj.drawings === 'object') {
    const vals = Object.values(obj.drawings);
    for (const v of vals) {
      if (Array.isArray(v)) totalStrokes += v.length;
    }
  }

  if (typeof obj.total_markers === 'number') {
    totalMarks = Math.max(totalMarks, obj.total_markers);
  }

  if (obj.clinicalNotes && typeof obj.clinicalNotes === 'string' && obj.clinicalNotes.trim()) {
    notesCollected.push(obj.clinicalNotes.trim());
  }
  if (obj.notes && typeof obj.notes === 'string') {
    // Se notes for JSON interno aninhado, analisa recursivamente
    const nested = parseZemdaAssessment(obj.notes);
    if (nested.isZemda) {
      rawRegions.push(...nested.evaluatedRegions);
      totalMarks += nested.marksCount;
      totalStrokes += nested.drawingsCount;
      if (nested.clinicalNotes) notesCollected.push(nested.clinicalNotes);
    } else if (obj.notes.trim() && !obj.notes.trim().startsWith('{')) {
      notesCollected.push(obj.notes.trim());
    }
  }

  // Deduplica e converte ids anatômicos em rótulos amigáveis
  const uniqueRegionIds = Array.from(new Set(rawRegions.filter(Boolean)));
  result.evaluatedRegions = uniqueRegionIds.map(id => {
    try {
      return anatomicalLabel(id, sexVariant === 'male' ? 'male' : 'female') || id;
    } catch {
      return id;
    }
  });

  result.marksCount = totalMarks;
  result.drawingsCount = totalStrokes;
  result.hasDrawings = totalStrokes > 0;

  // Limpa e unifica anotações clínicas
  const uniqueNotes = Array.from(new Set(notesCollected.filter(n => {
    if (!n) return false;
    // Remove caso seja fragmento JSON técnico acidental
    return !n.startsWith('{') && !n.includes('"schemaVersion"') && !n.includes('"strokeId"');
  })));
  result.clinicalNotes = uniqueNotes.join('\n\n');

  return result;
}

/**
 * Formata anotações para impressão / texto puro (PDF, etc.)
 */
export function formatClinicalNotesText(raw?: string | null): string {
  if (!raw || !raw.trim()) return '';
  const trimmed = raw.trim();

  const zemda = parseZemdaAssessment(trimmed);
  if (zemda.isZemda) {
    const lines: string[] = [
      zemda.title,
      `Modelo: ${zemda.modelLabel}`
    ];
    if (zemda.evaluatedRegions.length > 0) {
      lines.push(`Regiões avaliadas: ${zemda.evaluatedRegions.join(', ')}`);
    }
    if (zemda.marksCount > 0) {
      lines.push(`Marcações: ${zemda.marksCount} ${zemda.marksCount === 1 ? 'marcação registrada' : 'marcações registradas'}`);
    }
    if (zemda.hasDrawings) {
      lines.push(`Desenhos registrados: Sim (${zemda.drawingsCount} ${zemda.drawingsCount === 1 ? 'traço' : 'traços'})`);
    }
    if (zemda.clinicalNotes) {
      lines.push(`Observações clínicas: ${zemda.clinicalNotes}`);
    }
    return lines.join('\n');
  }

  // Se for outro JSON, filtra chaves técnicas
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        const cleanLines: string[] = [];
        for (const [k, v] of Object.entries(parsed)) {
          if (!TECHNICAL_JSON_KEYS.has(k) && v !== null && v !== undefined && v !== '') {
            cleanLines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
          }
        }
        return cleanLines.join('\n');
      }
    } catch {
      // Ignora erro de JSON e segue
    }
  }

  // Se contiver chaves técnicas em texto puro, suprime
  if (trimmed.includes('"schemaVersion"') || trimmed.includes('"strokeId"') || trimmed.includes('"activeLayerKey"')) {
    return '';
  }

  return trimmed;
}

interface ClinicalNotesRendererProps {
  notes?: string | null;
  className?: string;
  defaultTitle?: string;
}

/**
 * Renderizador inteligente de anotações técnicas e encaminhamentos.
 * Se o conteúdo for Zemda360, renderiza um card clínico com acabamento profissional.
 * Se for texto clínico comum, exibe de forma legível.
 * Nunca exibe JSON bruto ou chaves técnicas.
 */
export const ClinicalNotesRenderer: React.FC<ClinicalNotesRendererProps> = ({
  notes,
  className = '',
  defaultTitle = 'Anotações Técnicas & Encaminhamentos'
}) => {
  if (!notes || !notes.trim()) return null;
  const trimmed = notes.trim();

  // Verifica se é Zemda360
  const zemda = parseZemdaAssessment(trimmed);

  if (zemda.isZemda) {
    const hasAnyContent = zemda.evaluatedRegions.length > 0 || zemda.marksCount > 0 || zemda.hasDrawings || Boolean(zemda.clinicalNotes);
    if (!hasAnyContent) return null;

    return (
      <div className={`bg-gradient-to-br from-teal-50/70 via-emerald-50/40 to-slate-50 border border-teal-200/90 rounded-2xl p-4 shadow-2xs space-y-3 ${className}`}>
        {/* Cabeçalho do Bloco */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-teal-700 uppercase tracking-wider block">
                Zemda360 • {zemda.title}
              </span>
              <span className="text-xs font-bold text-slate-800">
                Modelo {zemda.modelLabel}
                {zemda.marksCount > 0 && ` • ${zemda.marksCount} ${zemda.marksCount === 1 ? 'marcação' : 'marcações'}`}
                {zemda.hasDrawings && ' • Com anotações gráficas'}
              </span>
            </div>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
            Registro Anatômico
          </span>
        </div>

        {/* Regiões Avaliadas */}
        {zemda.evaluatedRegions.length > 0 && (
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-teal-600" />
              Regiões Avaliadas ({zemda.evaluatedRegions.length})
            </span>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {zemda.evaluatedRegions.map((regionName, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-white text-teal-950 border border-teal-200 shadow-2xs"
                >
                  {regionName}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Detalhes de Desenhos & Marcações se não houver regiões listadas */}
        {zemda.evaluatedRegions.length === 0 && (zemda.marksCount > 0 || zemda.hasDrawings) && (
          <div className="flex items-center gap-3 text-xs text-slate-700">
            {zemda.marksCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                {zemda.marksCount} {zemda.marksCount === 1 ? 'marcação registrada' : 'marcações registradas'}
              </span>
            )}
            {zemda.hasDrawings && (
              <span className="inline-flex items-center gap-1">
                <PenTool className="w-3.5 h-3.5 text-teal-600" />
                Desenhos registrados ({zemda.drawingsCount} {zemda.drawingsCount === 1 ? 'traço' : 'traços'})
              </span>
            )}
          </div>
        )}

        {/* Observações Clínicas Humanizadas */}
        {zemda.clinicalNotes && (
          <div className="bg-white/90 p-3 rounded-xl border border-teal-100 text-xs text-slate-800 space-y-1 shadow-inner">
            <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">
              Observações Clínicas
            </span>
            <p className="whitespace-pre-wrap leading-relaxed font-sans text-slate-800">
              {zemda.clinicalNotes}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Se for outro JSON, tenta extrair campos não-técnicos
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        const entries = Object.entries(parsed).filter(([k, v]) => !TECHNICAL_JSON_KEYS.has(k) && v !== null && v !== undefined && v !== '');
        if (entries.length === 0) return null;

        return (
          <div className={`bg-teal-50/50 p-3.5 rounded-xl border border-teal-100 text-xs text-teal-950 space-y-1.5 ${className}`}>
            <h5 className="font-bold text-teal-900 uppercase tracking-wider text-[11px] mb-1">
              {defaultTitle}
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {entries.map(([k, v]) => (
                <div key={k}>
                  <span className="font-semibold text-slate-600 block text-[11px]">{k}:</span>
                  <span className="text-slate-900">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
    } catch {
      // Ignora erro
    }
  }

  // Se o texto puro contiver fragmentos internos de serialização, não exibe
  if (trimmed.includes('"schemaVersion"') || trimmed.includes('"strokeId"') || trimmed.includes('"activeLayerKey"')) {
    return null;
  }

  // Texto livre clínico normal
  return (
    <div className={className}>
      <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">
        {defaultTitle}
      </h5>
      <p className="bg-teal-50/50 p-3 rounded-xl border border-teal-100 text-teal-950 whitespace-pre-wrap text-xs leading-relaxed">
        {trimmed}
      </p>
    </div>
  );
};
