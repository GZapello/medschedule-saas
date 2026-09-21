import React, { useState, useEffect } from 'react';
import { Ear, AlertTriangle, Save, History, CheckCircle2, ShieldAlert } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface AuditoryScreeningRecord {
  id?: string;
  patientId: string;
  appointmentId?: string | null;
  professionalName?: string;
  screeningDate: string;
  speechInNoise: string;
  followCommands: string;
  localization: string;
  figureGround: string;
  auditoryClosure: string;
  temporalOrdering: string;
  temporalResolution: string;
  binauralIntegration: string;
  auditoryMemory: string;
  otitisHistory: string;
  schoolPerformance: string;
  familyComplaints: string;
  clinicalNotes: string;
  externalInstruments: string;
  conduct: string;
  classification: 'sem_sinais_relevantes' | 'justifica_investigacao' | 'inconclusivo';
  createdAt?: string;
}

interface AuditoryProcessingScreeningProps {
  patientId: string;
  appointmentId?: string | null;
  initialData?: any;
  onChange?: (data: any) => void;
}

export const PAC_CLASSIFICATION_OPTIONS = [
  { value: 'sem_sinais_relevantes', label: 'Sem sinais relevantes no rastreio do processamento auditivo', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'justifica_investigacao', label: 'Sinais que justificam avaliação comportamental formal do PAC', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'inconclusivo', label: 'Resultado inconclusivo / Necessita reavaliação auditiva periférica', badge: 'bg-slate-100 text-slate-800 border-slate-200' }
];

export const AuditoryProcessingScreening: React.FC<AuditoryProcessingScreeningProps> = ({
  patientId,
  appointmentId,
  initialData,
  onChange
}) => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<any>({
    screeningDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    speechInNoise: '',
    followCommands: '',
    localization: '',
    figureGround: '',
    auditoryClosure: '',
    temporalOrdering: '',
    temporalResolution: '',
    binauralIntegration: '',
    auditoryMemory: '',
    otitisHistory: '',
    schoolPerformance: '',
    familyComplaints: '',
    clinicalNotes: '',
    externalInstruments: '',
    conduct: '',
    classification: 'sem_sinais_relevantes',
    ...initialData
  });

  const [history, setHistory] = useState<AuditoryScreeningRecord[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  useEffect(() => {
    if (!patientId) return;
    setLoadingHistory(true);
    ApiClient.get<AuditoryScreeningRecord[]>(`/v1/speech-therapy/auditory-screenings/${patientId}`)
      .then(res => {
        if (Array.isArray(res)) setHistory(res);
      })
      .catch(err => console.warn('Erro ao carregar histórico de triagem PAC:', err))
      .finally(() => setLoadingHistory(false));
  }, [patientId]);

  const handleChange = (field: string, val: any) => {
    const updated = { ...formData, [field]: val };
    setFormData(updated);
    onChange?.(updated);
  };

  const handleSave = async () => {
    if (!patientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/auditory-screenings', {
        patientId,
        appointmentId,
        ...formData
      });
      showToast('Triagem do Processamento Auditivo registrada com sucesso!', 'success');
      const res = await ApiClient.get<AuditoryScreeningRecord[]>(`/v1/speech-therapy/auditory-screenings/${patientId}`);
      if (Array.isArray(res)) setHistory(res);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar triagem auditiva', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Ear className="w-4 h-4 text-sky-600" />
              Triagem do Processamento Auditivo Central (PAC)
            </h3>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
              Rastreio Comportamental & Funcional
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Sistematização de habilidades auditivas centrais e queixas ecológicas no ambiente acústico.
          </p>
        </div>
      </div>

      {/* AVISO MANDATÓRIO DE NÃO DIAGNÓSTICO AUTOMÁTICO DE TPAC */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">Vedação a Diagnóstico Automático de TPAC:</span>
          A triagem identifica sinais de alerta auditivos. O diagnóstico de Transtorno do Processamento Auditivo Central (TPAC) exige bateria comportamental padronizada em cabine acústica por fonoaudiólogo especialista. A classificação final é manual e exclusiva do profissional.
        </div>
      </div>

      {/* BLOCO 1: HABILIDADES AUDITIVAS CENTRAIS INVESTIGADAS */}
      <div className="space-y-3">
        <span className="text-xs font-bold text-slate-700 block">Habilidades Auditivas Centrais Rastreadas:</span>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Fala no Ruído:</label>
            <input
              type="text"
              placeholder="Dificuldade para compreender em ambientes ruidosos..."
              value={formData.speechInNoise}
              onChange={e => handleChange('speechInNoise', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Comandos Verbais Sequenciais:</label>
            <input
              type="text"
              placeholder="Dificuldade para reter e seguir ordens encadeadas..."
              value={formData.followCommands}
              onChange={e => handleChange('followCommands', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Localização / Lateralização Sonora:</label>
            <input
              type="text"
              placeholder="Apontamento da fonte sonora em campo livre..."
              value={formData.localization}
              onChange={e => handleChange('localization', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Figura-Fundo Auditiva:</label>
            <input
              type="text"
              placeholder="Atenção seletiva a uma mensagem competitiva..."
              value={formData.figureGround}
              onChange={e => handleChange('figureGround', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Fechamento Auditivo:</label>
            <input
              type="text"
              placeholder="Compreensão de fala degradada ou incompleta..."
              value={formData.auditoryClosure}
              onChange={e => handleChange('auditoryClosure', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Ordenação e Resolução Temporal:</label>
            <input
              type="text"
              placeholder="Discriminação de tons de frequência / duração / gaps..."
              value={formData.temporalOrdering}
              onChange={e => handleChange('temporalOrdering', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Integração / Separação Binaural:</label>
            <input
              type="text"
              placeholder="Atenção dicótica, escuta direcionada..."
              value={formData.binauralIntegration}
              onChange={e => handleChange('binauralIntegration', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Memória Auditiva de Curto Prazo:</label>
            <input
              type="text"
              placeholder="Repetição de sequências de sons, palavras e dígitos..."
              value={formData.auditoryMemory}
              onChange={e => handleChange('auditoryMemory', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Histórico de Otites / Fluência Otológica:</label>
            <input
              type="text"
              placeholder="Otites secretoras de repetição, miringotomia..."
              value={formData.otitisHistory}
              onChange={e => handleChange('otitisHistory', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
            />
          </div>
        </div>
      </div>

      {/* BLOCO 2: CONTEXTO ECOLÓGICO E QUEIXAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Desempenho Escolar / Aprendizagem:</label>
          <textarea
            rows={2}
            placeholder="Dificuldades de atenção auditiva em sala de aula, trocas fonológicas na escrita..."
            value={formData.schoolPerformance}
            onChange={e => handleChange('schoolPerformance', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Queixas Familiares e Comportamentais:</label>
          <textarea
            rows={2}
            placeholder="Diz com frequência 'o quê?', 'hã?', solicita repetição contínua..."
            value={formData.familyComplaints}
            onChange={e => handleChange('familyComplaints', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Instrumentos Externos Utilizados:</label>
          <textarea
            rows={2}
            placeholder="Ex: Questionário Fisher, SCALE, CHAPS, SAB..."
            value={formData.externalInstruments}
            onChange={e => handleChange('externalInstruments', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
      </div>

      {/* BLOCO 3: CLASSIFICAÇÃO MANUAL PELO PROFISSIONAL E CONDUTA */}
      <div className="p-4 bg-sky-50/40 border border-sky-200 rounded-xl space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Classificação Final Manual pelo Fonoaudiólogo (Obrigatório):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PAC_CLASSIFICATION_OPTIONS.map(opt => {
              const isSelected = formData.classification === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChange('classification', opt.value)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-sky-600 bg-white text-sky-950 shadow-xs ring-2 ring-sky-500/20'
                      : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-sky-600 bg-sky-600' : 'border-slate-300'}`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span>{opt.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Observações Clínicas da Triagem:</label>
            <textarea
              rows={2}
              placeholder="Anotações técnicas complementares da triagem..."
              value={formData.clinicalNotes}
              onChange={e => handleChange('clinicalNotes', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Conduta Fonoaudiológica Indicada:</label>
            <textarea
              rows={2}
              placeholder="Ex: Encaminhamento para avaliação completa de PAC em cabine; estratégias de facilitação acústica em sala..."
              value={formData.conduct}
              onChange={e => handleChange('conduct', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Registrando...' : 'Salvar Triagem do Processamento Auditivo'}</span>
        </button>
      </div>

      {/* HISTÓRICO LONGITUDINAL */}
      {history.length > 0 && (
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-sky-600" />
            Histórico de Triagens do Processamento Auditivo ({history.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map((rec, i) => (
              <div key={rec.id || i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    {new Date(rec.screeningDate).toLocaleDateString('pt-BR')}
                    {rec.professionalName && <span className="text-slate-400 font-normal"> • {rec.professionalName}</span>}
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                    PAC_CLASSIFICATION_OPTIONS.find(o => o.value === rec.classification)?.badge || 'bg-slate-100'
                  }`}>
                    {PAC_CLASSIFICATION_OPTIONS.find(o => o.value === rec.classification)?.label || rec.classification}
                  </span>
                </div>
                {rec.conduct && (
                  <p className="text-sky-800 text-[11px]"><strong>Conduta:</strong> {rec.conduct}</p>
                )}
                {rec.clinicalNotes && (
                  <p className="text-slate-500 text-[11px] line-clamp-1">{rec.clinicalNotes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
