import React, { useState, useEffect } from 'react';
import { Activity, History, Plus, AlertCircle, TrendingUp, CheckCircle2, Save, Calendar, User } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface FoisItem {
  id?: string;
  patientId: string;
  appointmentId?: string | null;
  professionalName?: string;
  version: 'adult' | 'pediatric';
  assessmentDate: string;
  level: number;
  notes?: string;
}

interface FoisAssessmentSectionProps {
  patientId: string;
  appointmentId?: string | null;
  currentLevel?: number;
  currentVersion?: 'adult' | 'pediatric';
  currentNotes?: string;
  onChange?: (data: { level: number; version: 'adult' | 'pediatric'; notes: string }) => void;
}

export const FOIS_LEVELS_ADULT = [
  { level: 1, title: 'Nível 1: Nada por via oral (NPO)', desc: 'Nutrição enteral ou parenteral exclusiva. Nenhuma ingestão por via oral recomendada no momento.' },
  { level: 2, title: 'Nível 2: Dependente de via alternativa com ingestão oral mínima', desc: 'Uso de via alternativa principal; ingestão de pequenos volumes orais terapêuticos com fonoaudiólogo.' },
  { level: 3, title: 'Nível 3: Dependente de via alternativa com consistente ingestão oral', desc: 'Uso de via alternativa complementar; nutrição orofacial diária estruturada em consistências seguras.' },
  { level: 4, title: 'Nível 4: Dieta oral total de uma única consistência', desc: 'Toda a nutrição é realizada por via oral, mas restrita estritamente a uma consistência específica (ex.: purê/pudim IDDSI 4).' },
  { level: 5, title: 'Nível 5: Dieta oral total com múltiplas consistências com preparo especial', desc: 'Ingestão oral total com consistências variadas que exigem preparo especial, espessamento ou manobras posturais compensatórias.' },
  { level: 6, title: 'Nível 6: Dieta oral total com múltiplas consistências sem preparo especial, com restrições', desc: 'Alimentação sem necessidade de preparo especial, porém com eliminação de alimentos específicos de alto risco (ex.: fibras resistentes, duplas consistências).' },
  { level: 7, title: 'Nível 7: Dieta oral total sem restrições', desc: 'Ingestão oral funcional plena de todas as consistências alimentares e líquidos sem restrições ou manobras compensatórias.' }
];

export const FOIS_LEVELS_PEDIATRIC = [
  { level: 1, title: 'Nível 1 (Pediátrico): Nada por via oral', desc: 'Alimentação exclusiva por sonda gástrica/enteral. Ingestão oral não funcional ou contraindicada.' },
  { level: 2, title: 'Nível 2 (Pediátrico): Via alternativa com estimulação gustativa mínima', desc: 'Treino de sucção não nutritiva e pequenas pistas gustativas controladas em terapia fonoaudiológica.' },
  { level: 3, title: 'Nível 3 (Pediátrico): Via alternativa com transição consistente', desc: 'Alimentação oral complementar com monitoramento de volumes e pausas para evitar fadiga ou descompensação respiratória.' },
  { level: 4, title: 'Nível 4 (Pediátrico): Dieta oral total em textura/consistência única', desc: 'Nutrição 100% oral adaptada a uma única textura (ex.: leite com espessante padronizado ou papinha homogênea lisa).' },
  { level: 5, title: 'Nível 5 (Pediátrico): Múltiplas texturas com preparo adaptado', desc: 'Aceitação de texturas variadas com auxílio de utensílios adaptados (bicos especiais, colher dosadora) ou espessamento específico.' },
  { level: 6, title: 'Nível 6 (Pediátrico): Múltiplas texturas com restrições pontuais', desc: 'Alimentação próxima à da família, excluindo alimentos de consistência heterogênea ou texturas de risco de engasgo.' },
  { level: 7, title: 'Nível 7 (Pediátrico): Dieta oral irrestrita adequada para a idade', desc: 'Ingestão oral funcional plena, segura e eficiente para a fase do desenvolvimento neuromotor da criança.' }
];

export const FoisAssessmentSection: React.FC<FoisAssessmentSectionProps> = ({
  patientId,
  appointmentId,
  currentLevel = 7,
  currentVersion = 'adult',
  currentNotes = '',
  onChange
}) => {
  const { showToast } = useToast();
  const [version, setVersion] = useState<'adult' | 'pediatric'>(currentVersion);
  const [selectedLevel, setSelectedLevel] = useState<number>(currentLevel);
  const [notes, setNotes] = useState<string>(currentNotes);
  const [history, setHistory] = useState<FoisItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Carrega histórico longitudinal de FOIS
  useEffect(() => {
    if (!patientId) return;
    setLoadingHistory(true);
    ApiClient.get<FoisItem[]>(`/v1/speech-therapy/fois/${patientId}?version=${version}`)
      .then(res => {
        if (Array.isArray(res)) setHistory(res);
      })
      .catch(err => console.warn('Erro ao carregar histórico FOIS:', err))
      .finally(() => setLoadingHistory(false));
  }, [patientId, version]);

  const handleLevelChange = (lvl: number) => {
    setSelectedLevel(lvl);
    onChange?.({ level: lvl, version, notes });
  };

  const handleNotesChange = (txt: string) => {
    setNotes(txt);
    onChange?.({ level: selectedLevel, version, notes: txt });
  };

  const handleVersionChange = (newVer: 'adult' | 'pediatric') => {
    setVersion(newVer);
    onChange?.({ level: selectedLevel, version: newVer, notes });
  };

  const handleSaveToHistory = async () => {
    if (!patientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/fois', {
        patientId,
        appointmentId,
        version,
        level: selectedLevel,
        notes
      });
      showToast('Avaliação FOIS registrada no histórico!', 'success');
      // Recarrega histórico
      const res = await ApiClient.get<FoisItem[]>(`/v1/speech-therapy/fois/${patientId}?version=${version}`);
      if (Array.isArray(res)) setHistory(res);
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar FOIS', 'error');
    } finally {
      setSaving(false);
    }
  };

  const levelsList = version === 'adult' ? FOIS_LEVELS_ADULT : FOIS_LEVELS_PEDIATRIC;

  // Comparação Longitudinal (Primeira x Anterior x Atual)
  const initialAssessment = history[0];
  const previousAssessment = history.length > 1 ? history[history.length - 1] : null;

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-600" />
              FOIS — Functional Oral Intake Scale (Ingestão Oral Funcional)
            </h3>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Escala Níveis 1 a 7
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Classificação funcional da via de ingestão oral e dieta prescrita em disfagia orofaríngea.
          </p>
        </div>

        {/* SELETOR DE VERSÃO (ADULTO VS PEDIÁTRICO - NÃO MISTURAR) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
          <button
            type="button"
            onClick={() => handleVersionChange('adult')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              version === 'adult' ? 'bg-white text-amber-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Adulto (Crary et al.)
          </button>
          <button
            type="button"
            onClick={() => handleVersionChange('pediatric')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              version === 'pediatric' ? 'bg-white text-amber-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Pediátrico (FOIS-P)
          </button>
        </div>
      </div>

      {/* AVISO IMPORTANTE DE NÃO DIAGNÓSTICO AUTOMÁTICO */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">Critério Clínico do Fonoaudiólogo:</span>
          A escala FOIS reflete o nível funcional de ingestão oral e a tolerância a consistências e matriz IDDSI. O ZemdaFono não gera diagnóstico automático; a classificação é soberana do profissional.
        </div>
      </div>

      {/* SELEÇÃO DOS 7 NÍVEIS FOIS */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-700">Selecione o Nível Funcional Atual do Paciente:</span>
        <div className="grid grid-cols-1 gap-2">
          {levelsList.map(item => {
            const isSelected = selectedLevel === item.level;
            return (
              <button
                key={item.level}
                type="button"
                onClick={() => handleLevelChange(item.level)}
                className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/50 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0 mt-0.5 ${
                    isSelected ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.level}
                </div>
                <div>
                  <div className={`text-xs font-bold ${isSelected ? 'text-amber-950' : 'text-slate-800'}`}>
                    {item.title}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* OBSERVAÇÕES CLÍNICAS */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Observações Clínicas e Manobras Compensatórias Associadas ao Nível FOIS:
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Ex: Paciente tolera dieta pastosa com auxílio de deglutição múltipla; sem sinais clínicos de aspiração laringotraqueal nas consistências IDDSI 4 e 5..."
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-amber-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-slate-500">
          Nível selecionado: <strong className="text-amber-800">FOIS {selectedLevel}</strong> ({version === 'adult' ? 'Adulto' : 'Pediátrico'})
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={handleSaveToHistory}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Registrando...' : 'Registrar no Histórico FOIS'}</span>
        </button>
      </div>

      {/* COMPARATIVO E HISTÓRICO LONGITUDINAL */}
      {history.length > 0 && (
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-amber-600" />
              Histórico Longitudinal da Escala FOIS ({version === 'adult' ? 'Adulto' : 'Pediátrico'})
            </h4>
            <span className="text-[11px] text-slate-400">{history.length} registro(s)</span>
          </div>

          {/* Comparativo Inicial x Última Avaliação */}
          {initialAssessment && previousAssessment && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Avaliação Inicial:</span>
                <div className="font-extrabold text-slate-800">Nível FOIS {initialAssessment.level}</div>
                <div className="text-[10px] text-slate-500">{new Date(initialAssessment.assessmentDate).toLocaleDateString('pt-BR')}</div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Última Reavaliação:</span>
                <div className="font-extrabold text-slate-800">Nível FOIS {previousAssessment.level}</div>
                <div className="text-[10px] text-slate-500">{new Date(previousAssessment.assessmentDate).toLocaleDateString('pt-BR')}</div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Evolução do Paciente:</span>
                <div className={`font-black ${previousAssessment.level > initialAssessment.level ? 'text-emerald-700' : previousAssessment.level < initialAssessment.level ? 'text-rose-700' : 'text-slate-700'}`}>
                  {previousAssessment.level > initialAssessment.level ? `Ganho de +${previousAssessment.level - initialAssessment.level} nível(is)` : previousAssessment.level === initialAssessment.level ? 'Estabilidade funcional' : `Queda de ${previousAssessment.level - initialAssessment.level} nível(is)`}
                </div>
                <div className="text-[10px] text-slate-500">Acompanhamento longitudinal</div>
              </div>
            </div>
          )}

          {/* Linha do Tempo de Avaliações */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map((rec, i) => (
              <div key={rec.id || i} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-3">
                  <div className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-extrabold">
                    FOIS {rec.level}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">
                      {new Date(rec.assessmentDate).toLocaleDateString('pt-BR')}
                      {rec.professionalName && <span className="text-slate-400 font-normal"> • {rec.professionalName}</span>}
                    </div>
                    {rec.notes && <div className="text-slate-500 text-[11px] truncate max-w-md">{rec.notes}</div>}
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-400">
                  {rec.version === 'adult' ? 'Adulto' : 'Ped'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
