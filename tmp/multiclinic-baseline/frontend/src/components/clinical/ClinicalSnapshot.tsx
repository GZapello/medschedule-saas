import React from 'react';
import { clinicalLabels, labels, formatClinicalKey } from './clinicalLabels';
import {
  Calendar,
  User,
  HeartPulse,
  Stethoscope,
  Activity,
  FileCheck,
  Target,
  Wrench,
  HelpCircle,
  FileText,
  Clock,
  Paperclip,
  CheckCircle2
} from 'lucide-react';

export { clinicalLabels, labels, formatClinicalKey };

const valueTranslations: Record<string, string> = {
  sent_to_lab: 'Enviado ao laboratório',
  in_production: 'Em confecção no laboratório',
  delivered_to_clinic: 'Entregue na clínica',
  tested_adjusted: 'Provado e ajustado',
  installed: 'Instalado em boca',
  canceled: 'Cancelado',
  planned: 'Planejado',
  approved: 'Aprovado',
  draft: 'Rascunho',
  pending: 'Pendente',
  female: 'Feminino',
  male: 'Masculino',
  completed: 'Concluído',
  healthy: 'Hígido',
  decayed: 'Cariado',
  restored: 'Restaurado',
  missing: 'Ausente',
  implant: 'Implante',
  crown: 'Coroa',
  normal: 'Normal',
  adequate: 'Adequado',
  preserved: 'Preservado',
  absent: 'Ausente',
  independent: 'Independente',
  mild: 'Leve',
  moderate: 'Moderado',
  severe: 'Intenso',
  yes: 'Sim',
  no: 'Não',
  true: 'Sim',
  false: 'Não',
  active: 'Ativo',
  exempt: 'Isento',
  FACIAL: 'Região Facial',
  CORPORAL: 'Região Corporal',
  CAPILAR: 'Região Capilar'
};

const ignoredKeys = new Set([
  'id', 'patient_id', 'patientId', 'professional_id', 'professionalId',
  'appointment_id', 'appointmentId', 'tenant_id', 'tenantId',
  'source_id', 'sourceId', 'source_type', 'sourceType',
  'is_sealed', 'isSealed', 'saveOnly', 'payment', 'attachmentIds',
  'created_at', 'updated_at', 'sealed_at', 'signature_hash', 'signed_at',
  'signer_name', 'signer_registration', 'module_type', 'moduleType'
]);

function isEmpty(val: any): boolean {
  if (val === null || val === undefined || val === '' || val === 'not_tested') return true;
  if (typeof val === 'string' && !val.trim()) return true;
  if (Array.isArray(val)) {
    if (val.length === 0) return true;
    return val.every(isEmpty);
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val).filter(k => !ignoredKeys.has(k));
    if (keys.length === 0) return true;
    return keys.every(k => isEmpty(val[k]));
  }
  return false;
}

interface ClinicalField {
  label: string;
  value: any;
}

interface ClinicalSectionDef {
  title: string;
  icon: React.ElementType;
  fields: ClinicalField[];
}

function classifySection(key: string): number {
  if (/session_?date|consultation_?date|consultation_?time|service_?name/i.test(key)) return 0;
  if (/anamnes|history|hist[oó]r|chiefComplaint|complaint|hpi|pastMedical|familyHistory|habits|systemic|allerg|anesthesia|previousSurgeries|surgeries|routine|bowel|smoking|alcohol|lifestyle/i.test(key)) return 1;
  if (/vitalSigns|bloodPressure|heartRate|temperature|physicalExam|exam[oó]n|neurological|odontogram|periodontal|endodontic|goniometry|muscleStrength|posture|functionalTests|testsData|sensory|phonemes|language|voice|orofacial|dysphagia|audiology|bioimpedance|anthropometry|composition|fitzpatrick|glogau|bodyMap|pain|sondagem|probingDepth|bleeding|suppuration|mobility|furcation|pocketDepth/i.test(key)) return 2;
  if (/diagnos|hypoth|hip[oó]tes|cidCode|cidDescription|cbdf|pulpDiagnosis|periapicalDiagnosis/i.test(key)) return 3;
  if (/conduct|treatmentResources|clinicalEvolution|evolution|soapNotes|techniques|biological_response|conductsExercises/i.test(key)) return 4;
  if (/plan|treatmentPlan|goals|objectives|mealPlan|calculations|exercises|division|budget|structure_type/i.test(key)) return 5;
  if (/procedure|toothChanges|proceduresPerformed|productName|batchLot|facialRegion|touchup/i.test(key)) return 6;
  if (/guideline|generalGuidelines|homeExercises|familyGuidance|schoolGuidance|orienta/i.test(key)) return 7;
  if (/prescription|certificate|examRequest|examsList|referral|documents|exams$/i.test(key)) return 8;
  if (/return|retorno|reassessment/i.test(key)) return 9;
  return 2; // Default to avaliação clínica
}

function formatValue(value: any): React.ReactNode {
  if (isEmpty(value)) return null;

  if (typeof value === 'boolean') {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
        value ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-50 text-slate-600 border border-slate-200'
      }`}>
        {value ? 'Sim' : 'Não'}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="font-semibold text-slate-800">{value}</span>;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (valueTranslations[trimmed]) {
      return <span className="font-medium text-slate-800">{valueTranslations[trimmed]}</span>;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      try {
        const d = new Date(trimmed.slice(0, 10) + 'T12:00:00');
        if (!isNaN(d.getTime())) {
          return <span>{d.toLocaleDateString('pt-BR')}</span>;
        }
      } catch {
        // Fallback to raw string
      }
    }
    if (trimmed.startsWith('data:image/')) {
      return (
        <img
          src={trimmed}
          alt="Registro clínico"
          className="max-h-64 rounded-xl border border-slate-200 shadow-xs my-1 object-contain"
        />
      );
    }
    if (trimmed.startsWith('data:audio/')) {
      return <audio controls src={trimmed} className="max-w-full my-1" />;
    }
    // Caso seja um JSON stringificado
    if (/^[\[{]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        return formatValue(parsed);
      } catch {
        // Segue como texto puro
      }
    }
    return <span className="whitespace-pre-wrap leading-relaxed text-slate-800">{trimmed}</span>;
  }

  if (Array.isArray(value)) {
    const validItems = value.filter(it => !isEmpty(it));
    if (validItems.length === 0) return null;

    // Se for lista de primitivos
    if (validItems.every(it => typeof it !== 'object')) {
      return (
        <div className="flex flex-wrap gap-1.5 my-1">
          {validItems.map((it, idx) => (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs bg-slate-100 text-slate-800 font-medium border border-slate-200/80"
            >
              {valueTranslations[String(it)] || String(it)}
            </span>
          ))}
        </div>
      );
    }

    // Se for lista de objetos (ex: dentes, refeições, exercícios)
    return (
      <div className="space-y-2 my-1.5">
        {validItems.map((item, idx) => (
          <div
            key={idx}
            className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70 text-xs space-y-1"
          >
            {typeof item === 'object' && item !== null ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                {Object.entries(item)
                  .filter(([k, v]) => !ignoredKeys.has(k) && !isEmpty(v))
                  .map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="font-semibold text-slate-600 mr-1.5">
                        {formatClinicalKey(k)}:
                      </span>
                      <span className="text-slate-900 font-medium">
                        {formatValue(v)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              formatValue(item)
            )}
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([k, v]) => !ignoredKeys.has(k) && !isEmpty(v));
    if (entries.length === 0) return null;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 p-3 rounded-xl bg-slate-50/70 border border-slate-200/70 text-xs my-1">
        {entries.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <span className="font-semibold text-slate-600 block text-[11px] mb-0.5">
              {formatClinicalKey(k)}
            </span>
            <div className="text-slate-900 text-xs">
              {formatValue(v)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

export function ClinicalSnapshot({ record }: { record: any }) {
  if (!record) return null;

  // Extração e consolidação de dados estruturados
  const rawData: Record<string, any> = {};

  const parseJsonField = (field: any) => {
    if (!field) return null;
    if (typeof field === 'object') return field;
    if (typeof field === 'string' && /^[\[{]/.test(field.trim())) {
      try {
        return JSON.parse(field);
      } catch {
        return null;
      }
    }
    return null;
  };

  const moduleData = parseJsonField(record.module_data_json);
  const clinicalData = parseJsonField(record.clinical_data_json);
  const technicalData = parseJsonField(record.technical_notes);

  if (moduleData && typeof moduleData === 'object') {
    Object.assign(rawData, moduleData);
  }
  if (clinicalData && typeof clinicalData === 'object') {
    Object.assign(rawData, clinicalData);
  }
  if (technicalData && typeof technicalData === 'object') {
    Object.assign(rawData, technicalData);
  }

  // Atributos de topo do registro
  if (record.procedure_name && !rawData.procedure_name && !rawData.procedure) {
    rawData.procedure_name = record.procedure_name;
  }
  if (record.conducts && !rawData.conducts && !rawData.conduct) {
    rawData.conducts = record.conducts;
  }
  if (record.technical_notes && !technicalData && !rawData.technicalNotes && record.module_type !== 'ZemdaMed') {
    rawData.technicalNotes = record.technical_notes;
  }

  // 10 Seções Clínicas Padronizadas
  const sections: ClinicalSectionDef[] = [
    { title: 'Dados do Atendimento', icon: Calendar, fields: [] },
    { title: 'Anamnese & Histórico Clínico', icon: HeartPulse, fields: [] },
    { title: 'Avaliação Clínica & Exames Físicos', icon: Stethoscope, fields: [] },
    { title: 'Diagnóstico & Impressão Clínica', icon: Activity, fields: [] },
    { title: 'Conduta & Tratamento Realizado', icon: FileCheck, fields: [] },
    { title: 'Plano Terapêutico & Metas', icon: Target, fields: [] },
    { title: 'Procedimentos Executados', icon: Wrench, fields: [] },
    { title: 'Orientações ao Paciente', icon: HelpCircle, fields: [] },
    { title: 'Documentos & Encaminhamentos', icon: FileText, fields: [] },
    { title: 'Retorno & Próximos Passos', icon: Clock, fields: [] }
  ];

  // Agrupamento recursivo inteligente nos 10 blocos clínicos
  const processKeyVal = (key: string, val: any, prefix = '') => {
    if (ignoredKeys.has(key) || isEmpty(val)) return;

    // Se for objeto aninhado que representa um bloco completo
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const childEntries = Object.entries(val).filter(([ck, cv]) => !ignoredKeys.has(ck) && !isEmpty(cv));
      if (childEntries.length === 0) return;

      const secIndex = classifySection(key);
      const friendlyLabel = formatClinicalKey(key);

      // Se for pequeno, adiciona como bloco formatado
      sections[secIndex].fields.push({
        label: prefix ? `${prefix} · ${friendlyLabel}` : friendlyLabel,
        value: val
      });
      return;
    }

    const secIndex = classifySection(key);
    const friendlyLabel = formatClinicalKey(key);
    sections[secIndex].fields.push({
      label: prefix ? `${prefix} · ${friendlyLabel}` : friendlyLabel,
      value: val
    });
  };

  Object.entries(rawData).forEach(([key, val]) => {
    processKeyVal(key, val);
  });

  // Filtra apenas as seções que realmente possuem dados preenchidos
  const activeSections = sections.filter(sec => sec.fields.length > 0);

  // Documentos anexados
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];

  if (activeSections.length === 0 && attachments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3.5 my-2 print:space-y-2">
      {activeSections.map((sec, secIdx) => {
        const IconComponent = sec.icon;
        return (
          <section
            key={secIdx}
            className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden print:border-slate-300 print:shadow-none"
          >
            {/* Cabeçalho da Seção */}
            <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100/60">
                <IconComponent className="w-3.5 h-3.5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800 tracking-tight">
                {sec.title}
              </h4>
            </div>

            {/* Conteúdo Clínico Estruturado */}
            <div className="p-3.5 sm:p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                {sec.fields.map((f, fIdx) => (
                  <div
                    key={fIdx}
                    className={`min-w-0 ${
                      typeof f.value === 'string' && f.value.length > 80 || typeof f.value === 'object'
                        ? 'sm:col-span-2'
                        : ''
                    }`}
                  >
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                      {f.label}
                    </dt>
                    <dd className="text-xs text-slate-900 leading-relaxed font-sans">
                      {formatValue(f.value)}
                    </dd>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* Bloco de Anexos Clínicos */}
      {attachments.length > 0 && (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden print:border-slate-300">
          <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100/60">
              <Paperclip className="w-3.5 h-3.5" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 tracking-tight">
              Anexos e Documentos Vinculados ({attachments.length})
            </h4>
          </div>
          <div className="p-3.5 sm:p-4 flex flex-wrap gap-2">
            {attachments.map((a: any, idx: number) => (
              <a
                key={a.id || idx}
                href={a.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100/80 text-teal-900 border border-teal-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                <span>{a.title || a.name || `Anexo ${idx + 1}`}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
