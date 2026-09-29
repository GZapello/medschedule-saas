import React from 'react';
import { ClinicalFileUploader } from '../../common/ClinicalFileUploader';
import { specialtySections } from './specialtySections';
import {
  NeurologyRenderer,
  OphthalmologyRenderer,
  CardiologyRenderer,
  DermatologyRenderer,
  OrthopedicsRenderer,
  PsychiatryRenderer,
  PediatricsRenderer,
  GeriatricsRenderer,
  EndocrinologyRenderer,
  RheumatologyRenderer,
  GynecologyRenderer,
  GastroenterologyRenderer,
  OtolaryngologyRenderer,
  UrologyRenderer,
  InternalMedicineRenderer
} from './SpecialtyCustomRenderers';
import { SectionCard, CompactInput, CompactTextArea } from './SpecialtyFieldComponents';
import { Paperclip, History } from 'lucide-react';

interface Props {
  previousLesions?: Record<string, any>[];
  specialty: string;
  value: Record<string, any>;
  onChange?: (value: Record<string, any>) => void;
  patientId: string;
  appointmentId?: string;
  readOnly?: boolean;
}

export const SpecialtySectionRenderer: React.FC<Props> = ({
  previousLesions,
  specialty,
  value,
  onChange,
  patientId,
  appointmentId,
  readOnly
}) => {
  const notes = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const update = (key: string, next: unknown) => onChange?.({ ...notes, [key]: next });

  const sections = specialtySections[specialty] || [];
  const known = new Set(
    sections
      .flatMap(s => s.fields.map(([key]) => key))
      .concat([
        'lesions',
        'sharedRegional',
        'attachments',
        'orthoRegion',
        'orthoPain',
        'orthoMobility',
        'orthoStrength',
        'orthoTests',
        'orthoPalpation',
        'orthoNotes',
        'skinNotes'
      ])
  );

  const legacy = Object.entries(notes).filter(
    ([key, val]) => !known.has(key) && typeof val === 'string' && val.trim().length > 0
  );

  const rendererProps = {
    data: notes,
    update,
    readOnly,
    patientId,
    appointmentId,
    previousLesions
  };

  const renderSpecialtyContent = () => {
    switch (specialty) {
      case 'neurologia':
        return <NeurologyRenderer {...rendererProps} />;
      case 'oftalmologia':
        return <OphthalmologyRenderer {...rendererProps} />;
      case 'cardiologia':
        return <CardiologyRenderer {...rendererProps} />;
      case 'dermatologia':
        return <DermatologyRenderer {...rendererProps} />;
      case 'ortopedia':
        return <OrthopedicsRenderer {...rendererProps} />;
      case 'psiquiatria':
        return <PsychiatryRenderer {...rendererProps} />;
      case 'pediatria':
        return <PediatricsRenderer {...rendererProps} />;
      case 'geriatria':
        return <GeriatricsRenderer {...rendererProps} />;
      case 'endocrinologia':
        return <EndocrinologyRenderer {...rendererProps} />;
      case 'reumatologia':
        return <RheumatologyRenderer {...rendererProps} />;
      case 'ginecologia-obstetricia':
      case 'ginecologia':
        return <GynecologyRenderer {...rendererProps} />;
      case 'gastroenterologia':
        return <GastroenterologyRenderer {...rendererProps} />;
      case 'otorrinolaringologia':
        return <OtolaryngologyRenderer {...rendererProps} />;
      case 'urologia':
        return <UrologyRenderer {...rendererProps} />;
      case 'clinica-medica':
        return <InternalMedicineRenderer {...rendererProps} />;
      default:
        // Renderizador limpo baseado em cards compactos para qualquer seção personalizada
        return (
          <div className="space-y-4">
            {sections.map(s => (
              <SectionCard key={s.title} title={s.title}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {s.fields.map(([key, label]) => (
                    <CompactInput
                      key={key}
                      label={label}
                      fieldKey={key}
                      value={notes[key]}
                      onChange={update}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Conteúdo Estruturado da Especialidade */}
      {renderSpecialtyContent()}

      {/* Anexos de Exames para Especialidades Diagnósticas */}
      {['oftalmologia', 'cardiologia', 'otorrinolaringologia'].includes(specialty) && (
        <SectionCard
          title="Anexos & Exames Complementares da Especialidade"
          icon={<Paperclip className="w-4 h-4" />}
          description="Laudos, retinografias, ECGs, timpanometrias ou imagens registradas"
        >
          <div className="space-y-2">
            {(Array.isArray(notes.attachments) ? notes.attachments : []).filter(Boolean).map((file: any, i: number) => (
              <ClinicalFileUploader
                key={file.fileId || file.id || i}
                patientId={patientId}
                moduleType="ZemdaMed"
                isSealed
                initialFileId={file.fileId || file.id}
                initialFilename={file.originalFilename}
                initialMimeType={file.mimeType}
              />
            ))}
            {!readOnly && (
              <ClinicalFileUploader
                patientId={patientId}
                appointmentId={appointmentId}
                moduleType="ZemdaMed"
                category="exam"
                label="Adicionar Exame / Documento Recebido"
                onUploaded={file =>
                  update('attachments', [...(Array.isArray(notes.attachments) ? notes.attachments : []), file])
                }
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* Anotações Anteriores Preservadas (Se Houverem Dados Legados) */}
      {legacy.length > 0 && (
        <details className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 transition-all">
          <summary className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-2 select-none">
            <History className="w-4 h-4 text-slate-500" />
            <span>Anotações Clínicas Anteriores Preservadas ({legacy.length})</span>
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            {legacy.map(([key, val]) => (
              <CompactTextArea
                key={key}
                label={key}
                fieldKey={key}
                value={val}
                onChange={update}
                readOnly={readOnly}
                rows={2}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
