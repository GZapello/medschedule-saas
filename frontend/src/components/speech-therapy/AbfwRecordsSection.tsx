import React, { useState, useEffect } from 'react';
import { BookOpen, Layers, History, Save, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface AbfwRecordItem {
  id?: string;
  patientId: string;
  appointmentId?: string | null;
  professionalName?: string;
  recordDate: string;
  version: string;
  domain: 'phonology' | 'vocabulary' | 'fluency' | 'pragmatics';
  scoresData: Record<string, any>;
  notes?: string;
  conclusion?: string;
  createdAt?: string;
}

interface AbfwRecordsSectionProps {
  patientId: string;
  appointmentId?: string | null;
  defaultDomain?: 'phonology' | 'vocabulary' | 'fluency' | 'pragmatics';
}

export const ABFW_DOMAINS = [
  { id: 'phonology', label: 'Parte A — Fonologia', desc: 'Inventário fonético, PCC (% consoantes corretas) e processos fonológicos informados' },
  { id: 'vocabulary', label: 'Parte B — Vocabulário', desc: 'Designações por vocábulos usuais (DVU), não-designações (ND) e processos de substituição (PS)' },
  { id: 'fluency', label: 'Parte C — Fluência', desc: 'Taxa de elocução, disfluências típicas e rupturas gagas informadas' },
  { id: 'pragmatics', label: 'Parte D — Pragmática', desc: 'Atos comunicativos por minuto, funções comunicativas e meio de comunicação' }
];

export const AbfwRecordsSection: React.FC<AbfwRecordsSectionProps> = ({
  patientId,
  appointmentId,
  defaultDomain = 'phonology'
}) => {
  const { showToast } = useToast();
  const [domain, setDomain] = useState<'phonology' | 'vocabulary' | 'fluency' | 'pragmatics'>(defaultDomain);
  const [version, setVersion] = useState<string>('ABFW 2ª Edição Revisada');
  const [recordDate, setRecordDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  );
  const [notes, setNotes] = useState<string>('');
  const [conclusion, setConclusion] = useState<string>('');

  // Campos informados pelo profissional por domínio
  const [domainScores, setDomainScores] = useState<Record<string, any>>({
    // Fonologia
    phonemesInventory: '',
    pccPercentage: '',
    processesObserved: '',
    // Vocabulário
    dvuPercentage: '',
    ndPercentage: '',
    psPercentage: '',
    fieldsEvaluated: 'Alimentos, animais, vestuário, brinquedos...',
    // Fluência
    speechRateWpm: '',
    typicalDisfluenciesPct: '',
    stutteringDisfluenciesPct: '',
    // Pragmática
    communicativeActsPerMin: '',
    predominantFunction: 'Interativa / Pedido de Ação',
    primaryMeans: 'Verbal oral'
  });

  const [history, setHistory] = useState<AbfwRecordItem[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  useEffect(() => {
    if (!patientId) return;
    setLoadingHistory(true);
    ApiClient.get<AbfwRecordItem[]>(`/v1/speech-therapy/abfw/${patientId}?domain=${domain}`)
      .then(res => {
        if (Array.isArray(res)) setHistory(res);
      })
      .catch(err => console.warn('Erro ao carregar registros ABFW:', err))
      .finally(() => setLoadingHistory(false));
  }, [patientId, domain]);

  const handleScoreFieldChange = (field: string, val: any) => {
    setDomainScores(prev => ({ ...prev, [field]: val }));
  };

  const handleSaveAbfw = async () => {
    if (!patientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/abfw', {
        patientId,
        appointmentId,
        recordDate,
        version,
        domain,
        scoresData: domainScores,
        notes,
        conclusion
      });
      showToast(`Registro ABFW (${ABFW_DOMAINS.find(d => d.id === domain)?.label}) salvo com sucesso!`, 'success');

      const res = await ApiClient.get<AbfwRecordItem[]>(`/v1/speech-therapy/abfw/${patientId}?domain=${domain}`);
      if (Array.isArray(res)) setHistory(res);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar registro ABFW', 'error');
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
              <Layers className="w-4 h-4 text-sky-600" />
              ABFW — Registro Estruturado de Resultados (Linguagem Infantil)
            </h3>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
              Acompanhamento Longitudinal
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ferramenta para transcrição e monitoramento de resultados informados pelo profissional fonoaudiólogo.
          </p>
        </div>

        {/* Versão do Protocolo */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-slate-500">Versão:</label>
          <input
            type="text"
            value={version}
            onChange={e => setVersion(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-xl border border-slate-200 bg-slate-50 font-semibold"
          />
        </div>
      </div>

      {/* AVISO DE CONFORMIDADE DE DIREITOS AUTORAIS */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
        <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-800">Conformidade e Propriedade Intelectual:</span> O ZemdaFono atua como software para registro, cálculo e acompanhamento longitudinal de resultados informados pelo fonoaudiólogo. Imagens, listas de palavras ou cadernos de testes proprietários não são reproduzidos neste sistema.
        </div>
      </div>

      {/* SELEÇÃO DO DOMÍNIO AVALIADO */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {ABFW_DOMAINS.map(d => {
          const isSelected = domain === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setDomain(d.id as any)}
              className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-sky-600 bg-sky-50/50 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className={`text-xs font-bold ${isSelected ? 'text-sky-900' : 'text-slate-800'}`}>
                {d.label}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{d.desc}</p>
            </button>
          );
        })}
      </div>

      {/* CAMPOS ESPECÍFICOS DO DOMÍNIO SELECIONADO */}
      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-4">
        {domain === 'phonology' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Inventário Fonético Observado:</label>
              <input
                type="text"
                placeholder="Ex: Fonemas ausentes: /r/, /s/..."
                value={domainScores.phonemesInventory}
                onChange={e => handleScoreFieldChange('phonemesInventory', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">PCC (% Consoantes Corretas):</label>
              <input
                type="text"
                placeholder="Ex: 78% (Levemente a moderadamente alterado)"
                value={domainScores.pccPercentage}
                onChange={e => handleScoreFieldChange('pccPercentage', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Processos Fonológicos Notados:</label>
              <input
                type="text"
                placeholder="Ex: Simplificação de encontro, ensurdecimento..."
                value={domainScores.processesObserved}
                onChange={e => handleScoreFieldChange('processesObserved', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
          </div>
        )}

        {domain === 'vocabulary' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">% Vocábulos Usuais (DVU):</label>
              <input
                type="text"
                placeholder="Ex: 65%"
                value={domainScores.dvuPercentage}
                onChange={e => handleScoreFieldChange('dvuPercentage', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">% Não-Designações (ND):</label>
              <input
                type="text"
                placeholder="Ex: 15%"
                value={domainScores.ndPercentage}
                onChange={e => handleScoreFieldChange('ndPercentage', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">% Processos de Substituição (PS):</label>
              <input
                type="text"
                placeholder="Ex: 20%"
                value={domainScores.psPercentage}
                onChange={e => handleScoreFieldChange('psPercentage', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Campos Conceituais:</label>
              <input
                type="text"
                placeholder="Campos testados..."
                value={domainScores.fieldsEvaluated}
                onChange={e => handleScoreFieldChange('fieldsEvaluated', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
          </div>
        )}

        {domain === 'fluency' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Taxa de Elocução (PPM / SPM):</label>
              <input
                type="text"
                placeholder="Ex: 110 PPM"
                value={domainScores.speechRateWpm}
                onChange={e => handleScoreFieldChange('speechRateWpm', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">% Disfluências Típicas:</label>
              <input
                type="text"
                placeholder="Ex: 4.5%"
                value={domainScores.typicalDisfluenciesPct}
                onChange={e => handleScoreFieldChange('typicalDisfluenciesPct', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">% Rupturas Gagas (SLD):</label>
              <input
                type="text"
                placeholder="Ex: 1.2% (Padrão típico)"
                value={domainScores.stutteringDisfluenciesPct}
                onChange={e => handleScoreFieldChange('stutteringDisfluenciesPct', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
          </div>
        )}

        {domain === 'pragmatics' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Atos Comunicativos por Minuto:</label>
              <input
                type="text"
                placeholder="Ex: 12 atos/min"
                value={domainScores.communicativeActsPerMin}
                onChange={e => handleScoreFieldChange('communicativeActsPerMin', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Funções Comunicativas Predominantes:</label>
              <input
                type="text"
                placeholder="Ex: Pedido de ação, comentário, protesto..."
                value={domainScores.predominantFunction}
                onChange={e => handleScoreFieldChange('predominantFunction', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Meio Comunicativo Mais Frequente:</label>
              <input
                type="text"
                placeholder="Ex: Verbal, vocal, gestual..."
                value={domainScores.primaryMeans}
                onChange={e => handleScoreFieldChange('primaryMeans', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </div>
          </div>
        )}

        {/* Data, Conclusão e Observações */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Data da Aplicação:</label>
            <input
              type="date"
              value={recordDate}
              onChange={e => setRecordDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">Conclusão / Interpretação do Profissional:</label>
            <input
              type="text"
              placeholder="Ex: Vocabulário expressivo adequado; presença de processos fonológicos compatíveis com 4 anos..."
              value={conclusion}
              onChange={e => setConclusion(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Observações do Domínio:</label>
          <textarea
            rows={2}
            placeholder="Anotações clínicas adicionais, contexto da coleta, cooperação..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={handleSaveAbfw}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Registrando...' : `Salvar Registro ABFW (${ABFW_DOMAINS.find(d => d.id === domain)?.label.split('—')[1]?.trim()})`}</span>
        </button>
      </div>

      {/* HISTÓRICO E COMPARAÇÃO ENTRE APLICAÇÕES DO DOMÍNIO */}
      {history.length > 0 && (
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-sky-600" />
            Histórico de Aplicações ABFW — {ABFW_DOMAINS.find(d => d.id === domain)?.label} ({history.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map((rec, i) => (
              <div key={rec.id || i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    {new Date(rec.recordDate).toLocaleDateString('pt-BR')}
                    {rec.professionalName && <span className="text-slate-400 font-normal"> • {rec.professionalName}</span>}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                    {rec.version}
                  </span>
                </div>
                {rec.conclusion && (
                  <p className="text-slate-700 text-[11px]"><strong>Conclusão:</strong> {rec.conclusion}</p>
                )}
                {rec.notes && (
                  <p className="text-slate-500 text-[11px] line-clamp-1">{rec.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
