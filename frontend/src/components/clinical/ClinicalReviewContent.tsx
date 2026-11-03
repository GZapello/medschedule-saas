import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { ZemdaBodyModal } from '../zemda-body/ZemdaBodyModal';
import { clinicalLabels as recordLabels } from './clinicalLabels';

// Presentation only: never mutate the payload submitted by the consultation.
const labels: Record<string, string> = { ...recordLabels,
  currentMedications: 'Medicamentos atuais', previousSurgeries: 'Cirurgias anteriores', anesthesiaHistory: 'Histórico anestésico',
  sessionsCount: 'Número de sessões', estimatedSessions: 'Sessões estimadas', sessionFrequency: 'Frequência das sessões',
  habits: 'Hábitos', value: 'Valor', facialRegion: 'Região facial', productBrand: 'Marca do produto', lotNumber: 'Lote', unitsQuantity: 'Quantidade de unidades',
  pocketDepth: 'Profundidade de bolsa', insertionLoss: 'Perda de inserção', bleedingOnProbing: 'Sangramento à sondagem',
  pulpDiagnosis: 'Diagnóstico pulpar', periapicalDiagnosis: 'Diagnóstico periapical', vitalityTest: 'Teste de vitalidade',
  percussion: 'Percussão', palpation: 'Palpação', coldTest: 'Teste térmico ao frio', heatTest: 'Teste térmico ao calor',
  workingLength: 'Comprimento de trabalho', canals: 'Canais', obturation: 'Obturação',
  allergies: 'Alergias', medications: 'Medicamentos', complaint: 'Queixa principal', expectations: 'Expectativas',
  diagnosis: 'Diagnóstico', medicalDiagnosis: 'Diagnóstico médico', physioDiagnosis: 'Diagnóstico fisioterapêutico',
  hypothesis: 'Hipótese', hypotheses: 'Hipóteses', conduct: 'Conduta', treatment: 'Tratamento', plan: 'Plano',
  objectives: 'Objetivos', goals: 'Metas', guidelines: 'Orientações', technicalNotes: 'Observações',
  prescription: 'Prescrição', certificate: 'Atestado', examRequest: 'Solicitação de exames', referral: 'Encaminhamento',
  returnAppt: 'Retorno', reason: 'Motivo', specialty: 'Especialidade', date: 'Data', days: 'Dias',
  dosage: 'Dose', frequency: 'Frequência', duration: 'Duração', route: 'Via de administração', medication: 'Medicamento',
  exams: 'Exames', attachments: 'Anexos', documents: 'Documentos', fileName: 'Nome do arquivo',
  assessmentForm: 'Avaliação', evolutionForm: 'Evolução', planForm: 'Plano terapêutico', procedureForm: 'Procedimento', returnForm: 'Retorno',
  painScore: 'Dor · EVA (0–10)', painAtRest: 'Dor em repouso · EVA', painOnMovement: 'Dor ao movimento · EVA',
  score: 'Pontuação', result: 'Resultado', right: 'Direita', left: 'Esquerda', rightGrade: 'Grau à direita', leftGrade: 'Grau à esquerda',
  goniometryData: 'Goniometria', muscleStrengthData: 'Força muscular', postureData: 'Postura', testsData: 'Testes funcionais',
  joint: 'Articulação', movement: 'Movimento', degrees: 'Graus', muscle: 'Músculo', grade: 'Grau', normal: 'Referência normativa',
  postureAnterior: 'Vista anterior', postureLateral: 'Vista lateral', posturePosterior: 'Vista posterior', gaitAnalysis: 'Análise da marcha',
  treatmentResources: 'Recursos terapêuticos', reassessmentDate: 'Data de reavaliação', homeExercisesData: 'Exercícios domiciliares',
  bleeding: 'Sangramento', probingDepth: 'Profundidade de sondagem', mobility: 'Mobilidade', plaqueIndex: 'Índice de placa',
  gingivalIndex: 'Índice gengival', furcation: 'Furca', recession: 'Recessão', toothNumber: 'Dente',
  smoking: 'Tabagismo', alcohol: 'Consumo de álcool', diabetes: 'Diabetes', hypertension: 'Hipertensão', pregnant: 'Gestação',
  pregnancy: 'Gestação', heartDisease: 'Doença cardíaca', systemicDiseases: 'Doenças sistêmicas', medicalHistory: 'Histórico médico',
  dentalHistory: 'Histórico odontológico', lastVisit: 'Última consulta', brushingFrequency: 'Frequência de escovação', flossing: 'Uso de fio dental',
  budget: 'Orçamento', budgetData: 'Orçamento', total: 'Total', discount: 'Desconto (R$)', subtotal: 'Subtotal (R$)',
  biological_response: 'Resposta biológica', patient_feedback: 'Relato do paciente', evaluation_notes: 'Avaliação do retorno',
  clinicalConduct: 'Conduta clínica', previousTreatments: 'Tratamentos anteriores', contraindications: 'Contraindicações',
  touchup_required: 'Necessidade de retoque', touchup_description: 'Descrição do retoque', scheduled_date: 'Data prevista',
  fitzpatrick: 'Fototipo de Fitzpatrick', glogau: 'Escala de Glogau', area: 'Área', title: 'Título',
  cbdfData: 'Diagnóstico funcional', cbdfBodyFunction: 'Funções do corpo', cbdfBodyStructure: 'Estruturas do corpo',
  cbdfActivityParticipation: 'Atividade e participação', cbdfContextualFactors: 'Fatores contextuais', cbdfDiagnosticSummary: 'Síntese diagnóstica',
};
const sections = ['Evolução clínica', 'Anamnese', 'Avaliações / Exame', 'Diagnóstico / Hipóteses', 'Conduta / Plano terapêutico',
  'Procedimentos', 'Prescrições / Orientações', 'Documentos / Exames', 'Encaminhamentos', 'Retorno'];
const ignored = /^(patient_?id|patientName|professional_?id|professionalName|appointment_?id|tenant_?id|module_?type|sessionDate|serviceName|saveOnly|isSealed|is_sealed|id|created_at|updated_at|sourceId|sourceType|payment|attachmentIds)$/i;
const wrappers = /^(moduleData|assessmentData|evolution|clinicalData)$/;
const money = /^(totalValue|discountValue|finalValue|totalPrice|unitPrice|costValue|total|subtotal|discount)$/;
const values: Record<string, string> = { not_tested: '', normal: 'Normal', adequate: 'Adequado', preserved: 'Preservado', absent: 'Ausente',
  independent: 'Independente', mild: 'Leve', moderate: 'Moderado', severe: 'Intenso', yes: 'Sim', no: 'Não',
  pending: 'Pendente', planned: 'Planejado', completed: 'Concluído', draft: 'Rascunho', healthy: 'Hígido',
  decayed: 'Cariado', restored: 'Restaurado', missing: 'Ausente', implant: 'Implante', crown: 'Coroa',
  male: 'Masculino', female: 'Feminino', FACIAL: 'Facial', CORPORAL: 'Corporal', CAPILAR: 'Capilar' };
const canonical = (key: string) => key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
export const reviewLabel = (key: string) => labels[key] || labels[canonical(key)] ||
  (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][^_]*[ áàâãéêíóôõúç]/.test(key) ? key : /^\d+$/.test(key) ? `Item ${key}` : 'Informação complementar');
function sectionFor(key: string, inherited = 2) {
  if (/diagnos|hypoth|hip[oó]tes|cbdf/i.test(key)) return 3;
  if (/anamnes|history|hist[oó]r|chiefComplaint|hpi|allerg|currentMedications|previousSurgeries|anesthesia/i.test(key)) return 1;
  if (/clinicalEvolution|evolutionForm|technicalNotes|soapNotes/i.test(key)) return 0;
  if (/referral|encaminh/i.test(key)) return 8;
  if (/return|retorno|reassessment/i.test(key)) return 9;
  if (/prescri|guideline|orienta|homeExercise|mealPlan/i.test(key)) return 6;
  if (/certificate|document|examRequest|attachment|^exams$/i.test(key)) return 7;
  if (/procedure|toothChanges/i.test(key)) return 5;
  if (/conduct|treatment|plan|goals|objective|budget/i.test(key)) return 4;
  return inherited;
}
export function reviewGroups(data: Record<string, any>) {
  const groups: { label: string; value: string; path: string }[][] = sections.map(() => []);
  const walk = (value: any, key: string, path: string, group: number, context: string[]) => {
    if (ignored.test(key) || value == null || value === '' || value === 'not_tested') return;
    if (typeof value === 'string' && !value.trim()) return;
    const nextGroup = sectionFor(key, group);
    if (/anatomical_?map_?id/i.test(key) && value) {
      const mapId = String(value);
      const label = [...new Set([...context, 'Mapeamento Anatômico (Zemda360)'])].join(' · ');
      if (!groups[nextGroup].some((row: any) => row.mapId === mapId)) {
        groups[nextGroup].push({ label, value: 'Mapa Registrado', path, isMapId: true, mapId } as any);
      }
      return;
    }
    if (typeof value === 'string' && /^[\[{]/.test(value)) { try { walk(JSON.parse(value), key, path, group, context); return; } catch { /* Free text */ } }
    if (Array.isArray(value)) { value.forEach((item, index) => walk(item, key, `${path}.${index}`, nextGroup, [...context, `${reviewLabel(key)} ${index + 1}`])); return; }
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      const financialContext = /budget|treatmentPlan|planForm|orçamento/i.test(key) || entries.some(([child]) => /^(totalValue|discountValue|finalValue|paymentTerms)$/.test(child));
      const unusedFinance = !entries.some(([child, item]) => !money.test(child) && !ignored.test(child) &&
        (typeof item === 'string' ? item.trim() !== '' : Array.isArray(item) ? item.length > 0 : typeof item === 'number' ? item !== 0 : item === true)) &&
        !entries.some(([child, item]) => money.test(child) && Number(item) !== 0);
      entries.forEach(([child, item]) => {
        if (financialContext && money.test(child) && Number(item) === 0 && unusedFinance) return;
        walk(item, child, `${path}.${child}`, nextGroup, wrappers.test(key) || !key ? context : [...context, reviewLabel(key)]);
      }); return;
    }
    const rendered = typeof value === 'boolean' ? value ? 'Sim' : 'Não' : values[String(value)] ?? String(value);
    if (!rendered) return;
    const content = /^data:image\//.test(rendered) ? 'Imagem clínica anexada' : /^data:audio\//.test(rendered) ? 'Áudio clínico anexado' : rendered;
    const label = [...new Set([...context, reviewLabel(key)])].join(' · ');
    if (!groups[nextGroup].some(row => row.label === label && row.value === content)) groups[nextGroup].push({ label, value: content, path });
  };
  walk(data, '', '', 2, []);
  return groups.map((rows, index) => ({ title: sections[index], rows })).filter(group => group.rows.length);
}
export function ClinicalReviewContent({ data }: { data: Record<string, any> }) {
  const [viewingMapId, setViewingMapId] = useState<string | null>(null);
  const groups = reviewGroups(data);
  return groups.length ? (
    <>
      <div className="space-y-3">{groups.map(group => <section key={group.title} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-semibold text-slate-900">{group.title}</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 p-4">{group.rows.map((row: any) => <div key={row.path} className={`min-w-0 ${row.value.length > 100 || row.isMapId ? 'sm:col-span-2' : ''}`}>
          <dt className="text-xs text-slate-500 mb-0.5 break-words">{row.label}</dt>
          {row.isMapId ? (
            <dd className="flex items-center gap-2 mt-1">
              <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                Mapa Anatômico Registrado
              </span>
              <button
                type="button"
                onClick={() => setViewingMapId(row.mapId)}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-teal-700 bg-white hover:bg-teal-50 border border-teal-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Visualizar Mapa Facial / Corporal</span>
              </button>
            </dd>
          ) : (
            <dd className="text-sm text-slate-900 whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">{row.value}</dd>
          )}
        </div>)}</dl>
      </section>)}</div>

      {viewingMapId && (
        <ZemdaBodyModal
          isOpen={Boolean(viewingMapId)}
          onClose={() => setViewingMapId(null)}
          patientId={data?.patient_id || data?.patientId || ''}
          patientName={data?.patientName || data?.patient?.full_name}
          assessmentId={viewingMapId}
          initialMapType={String(data?.module_type || '').toLowerCase().includes('facial') || String(data?.activeArea || '').toUpperCase() === 'FACIAL' ? 'FACE' : 'BODY'}
          readOnly={true}
        />
      )}
    </>
  ) : <p className="text-sm text-slate-500 py-4">Nenhuma informação clínica preenchida para revisar.</p>;
}
