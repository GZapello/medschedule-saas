import React, { useState, useEffect } from 'react';
import { BookOpen, AlertTriangle, Save, History, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface ReadingScreeningRecord {
  id?: string;
  patientId: string;
  appointmentId?: string | null;
  professionalName?: string;
  screeningDate: string;
  referralReason: string;
  schoolHistory: string;
  familyHistory: string;
  readingNotes: string;
  writingNotes: string;
  phonologicalAwareness: string;
  phonologicalMemory: string;
  rapidNaming: string;
  graphemePhoneme: string;
  fluencyAccuracy: string;
  comprehension: string;
  observedErrors: string;
  clinicalNotes: string;
  externalInstruments: string;
  professionalConclusion: string;
  classification: 'indicadores_nao_evidenciados' | 'indicadores_presentes' | 'inconclusivo' | 'necessita_avaliacao_ampliada';
  conduct: string;
  createdAt?: string;
}

interface ReadingWritingScreeningProps {
  patientId: string;
  appointmentId?: string | null;
  initialData?: any;
  onChange?: (data: any) => void;
}

export const CLASSIFICATION_OPTIONS = [
  { value: 'indicadores_nao_evidenciados', label: 'Indicadores não evidenciados no rastreio', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'indicadores_presentes', label: 'Indicadores de risco presentes (sinais de alerta)', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'inconclusivo', label: 'Resultado inconclusivo / Necessita reavaliação pontual', badge: 'bg-slate-100 text-slate-800 border-slate-200' },
  { value: 'necessita_avaliacao_ampliada', label: 'Necessita avaliação fonoaudiológica e multidisciplinar ampliada', badge: 'bg-purple-100 text-purple-800 border-purple-200' }
];

export const ReadingWritingScreening: React.FC<ReadingWritingScreeningProps> = ({
  patientId,
  appointmentId,
  initialData,
  onChange
}) => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<any>({
    screeningDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    referralReason: '',
    schoolHistory: '',
    familyHistory: '',
    readingNotes: '',
    writingNotes: '',
    phonologicalAwareness: '',
    phonologicalMemory: '',
    rapidNaming: '',
    graphemePhoneme: '',
    fluencyAccuracy: '',
    comprehension: '',
    observedErrors: '',
    clinicalNotes: '',
    externalInstruments: '',
    professionalConclusion: '',
    classification: 'indicadores_nao_evidenciados',
    conduct: '',
    ...initialData
  });

  const [history, setHistory] = useState<ReadingScreeningRecord[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  useEffect(() => {
    if (!patientId) return;
    setLoadingHistory(true);
    ApiClient.get<ReadingScreeningRecord[]>(`/v1/speech-therapy/reading-screenings/${patientId}`)
      .then(res => {
        if (Array.isArray(res)) setHistory(res);
      })
      .catch(err => console.warn('Erro ao carregar histórico de rastreio de leitura:', err))
      .finally(() => setLoadingHistory(false));
  }, [patientId]);

  const handleChange = (field: string, value: any) => {
    const updated = { ...formData, [field]: value };
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
      await ApiClient.post('/v1/speech-therapy/reading-screenings', {
        patientId,
        appointmentId,
        ...formData
      });
      showToast('Rastreio de Leitura e Escrita registrado com sucesso!', 'success');
      const res = await ApiClient.get<ReadingScreeningRecord[]>(`/v1/speech-therapy/reading-screenings/${patientId}`);
      if (Array.isArray(res)) setHistory(res);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar rastreio', 'error');
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
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Rastreio de Leitura, Escrita e Aprendizagem (Indicadores de Risco)
            </h3>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
              Fonoaudiologia Educacional / Clínica
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Identificação precoce de fragilidades em processamento fonológico, decodificação grafofonêmica e fluência leitora.
          </p>
        </div>
      </div>

      {/* AVISO MANDATÓRIO DE NÃO DIAGNÓSTICO AUTOMÁTICO */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">Vedação a Diagnóstico Automático:</span>
          O Zemda não gera diagnóstico automático de dislexia ou distúrbios de aprendizagem. Este rastreio sistematiza a investigação clínica e a classificação final manual é de competência exclusiva do profissional fonoaudiólogo.
        </div>
      </div>

      {/* BLOCO 1: HISTÓRICO E DEMANDA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Motivo do Encaminhamento:</label>
          <input
            type="text"
            placeholder="Ex: Queixa escolar de lentidão leitora e trocas ortográficas..."
            value={formData.referralReason}
            onChange={e => handleChange('referralReason', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Histórico Escolar:</label>
          <input
            type="text"
            placeholder="Ex: Ano escolar, retenções, apoio pedagógico especializado..."
            value={formData.schoolHistory}
            onChange={e => handleChange('schoolHistory', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Histórico Familiar de Dificuldades:</label>
          <input
            type="text"
            placeholder="Ex: Pais ou irmãos com histórico de trocas na leitura/escrita..."
            value={formData.familyHistory}
            onChange={e => handleChange('familyHistory', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
      </div>

      {/* BLOCO 2: PILARES COGNITIVO-LINGUÍSTICOS (CONSCIÊNCIA, MEMÓRIA E NOMEAÇÃO) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Consciência Fonológica:</label>
          <textarea
            rows={2}
            placeholder="Rima, aliteração, segmentação silábica, manipulação fonêmica..."
            value={formData.phonologicalAwareness}
            onChange={e => handleChange('phonologicalAwareness', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
          />
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">Memória Fonológica / Verbal:</label>
          <textarea
            rows={2}
            placeholder="Repetição de não-palavras, span de dígitos em ordem direta/inversa..."
            value={formData.phonologicalMemory}
            onChange={e => handleChange('phonologicalMemory', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
          />
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">Nomeação Rápida (RAN):</label>
          <textarea
            rows={2}
            placeholder="Velocidade e automatização na nomeação de cores, dígitos, objetos..."
            value={formData.rapidNaming}
            onChange={e => handleChange('rapidNaming', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
          />
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">Correspondência Grafema-Fonema:</label>
          <textarea
            rows={2}
            placeholder="Reconhecimento letra-som, conversão grafofonêmica, rota fonológica..."
            value={formData.graphemePhoneme}
            onChange={e => handleChange('graphemePhoneme', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
          />
        </div>
      </div>

      {/* BLOCO 3: LEITURA, ESCRITA E ERROS OBSERVADOS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Fluência e Precisão de Leitura:</label>
          <textarea
            rows={2}
            placeholder="Palavras lidas por minuto (PPM), hesitações, recusas, autocorreções..."
            value={formData.fluencyAccuracy}
            onChange={e => handleChange('fluencyAccuracy', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Compreensão Leitora:</label>
          <textarea
            rows={2}
            placeholder="Respostas a perguntas literais e inferenciais sobre o texto..."
            value={formData.comprehension}
            onChange={e => handleChange('comprehension', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Erros Observados na Escrita:</label>
          <textarea
            rows={2}
            placeholder="Trocas surda/sonora (p/b, t/d, f/v), omissões, aglutinações, inversões..."
            value={formData.observedErrors}
            onChange={e => handleChange('observedErrors', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
      </div>

      {/* BLOCO 4: INSTRUMENTOS EXTERNOS E OBSERVAÇÕES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Instrumentos Externos Utilizados (se aplicável):</label>
          <input
            type="text"
            placeholder="Ex: TENA, PROLEC, CONFIAS, Teste de Desempenho Escolar (TDE-II)..."
            value={formData.externalInstruments}
            onChange={e => handleChange('externalInstruments', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Observações Clínicas Gerais:</label>
          <input
            type="text"
            placeholder="Postura, fadiga atencional, cooperação durante a testagem..."
            value={formData.clinicalNotes}
            onChange={e => handleChange('clinicalNotes', e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
          />
        </div>
      </div>

      {/* BLOCO 5: CLASSIFICAÇÃO FINAL MANUAL PELO PROFISSIONAL & CONDUTA */}
      <div className="p-4 bg-indigo-50/40 border border-indigo-200 rounded-xl space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Classificação Final Manual pelo Profissional (Obrigatório):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CLASSIFICATION_OPTIONS.map(opt => {
              const isSelected = formData.classification === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChange('classification', opt.value)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-white text-indigo-950 shadow-xs ring-2 ring-indigo-500/20'
                      : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
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
            <label className="block text-xs font-bold text-slate-700 mb-1">Conclusão Profissional:</label>
            <textarea
              rows={2}
              placeholder="Síntese técnica da avaliação de leitura e escrita..."
              value={formData.professionalConclusion}
              onChange={e => handleChange('professionalConclusion', e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Conduta Fonoaudiológica Indicada:</label>
            <textarea
              rows={2}
              placeholder="Intervenção fonoaudiológica, orientação escolar, encaminhamentos..."
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
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Registrando...' : 'Salvar Rastreio de Leitura/Escrita'}</span>
        </button>
      </div>

      {/* HISTÓRICO LONGITUDINAL */}
      {history.length > 0 && (
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-indigo-600" />
            Histórico de Rastreios de Leitura e Escrita ({history.length} aplicações)
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
                    CLASSIFICATION_OPTIONS.find(o => o.value === rec.classification)?.badge || 'bg-slate-100'
                  }`}>
                    {CLASSIFICATION_OPTIONS.find(o => o.value === rec.classification)?.label || rec.classification}
                  </span>
                </div>
                {rec.professionalConclusion && (
                  <p className="text-slate-600 text-[11px] line-clamp-2">{rec.professionalConclusion}</p>
                )}
                {rec.conduct && (
                  <p className="text-indigo-800 text-[11px]"><strong>Conduta:</strong> {rec.conduct}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
