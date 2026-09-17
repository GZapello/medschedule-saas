import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Plus, Save, History, CheckCircle2, User, Layers, Sparkles } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface AACRecord {
  id?: string;
  systemUsed: string;
  modality: string;
  accessMethod: string;
  symbolsType: string;
  vocabularyDetails: string;
  communicativeIntention: string;
  supportLevel: string;
  communicationPartners: string;
  environments: string;
  evolutionLevel: 'emergent' | 'context_dependent' | 'independent';
  notes: string;
}

export interface AACManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

export const AACManagerModal: React.FC<AACManagerModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<AACRecord>({
    systemUsed: 'Prancha de Comunicação Temática com Símbolos ARASAAC',
    modality: 'Baixa Tecnologia (Prancha plastificada)',
    accessMethod: 'Apontar direto com o indicador',
    symbolsType: 'Pictogramas coloridos com legenda escrita',
    vocabularyDetails: 'Alimentação, Brincadeiras, Sentimentos e Pedidos de Ajuda',
    communicativeIntention: 'Expressa recusa, solicita itens de interesse e escolhe brinquedos',
    supportLevel: 'Pista verbal ou modelo físico leve',
    communicationPartners: 'Cuidadores, Professora de apoio e Fonoaudióloga',
    environments: 'Casa, Sala de Aula e Consultório',
    evolutionLevel: 'context_dependent',
    notes: 'Boa motivação para uso do recurso durante atividades lúdicas estruturadas.'
  });

  useEffect(() => {
    if (isOpen && patientId) {
      loadRecords();
    }
  }, [isOpen, patientId]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any[]>(`/v1/speech-therapy/aac/${patientId}`);
      if (Array.isArray(res)) setRecords(res);
    } catch (err) {
      console.warn('Erro ao carregar registros de CAA:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!form.systemUsed.trim()) {
      showToast('Informe o sistema de CAA utilizado', 'info');
      return;
    }

    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/aac', {
        patientId,
        ...form
      });
      showToast('Registro de CAA salvo com sucesso!', 'success');
      loadRecords();
      setActiveTab('history');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar registro de CAA', 'error');
    } finally {
      setSaving(false);
    }
  };

  const evolutionLevelBadge = (lvl: string) => {
    switch (lvl) {
      case 'emergent':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Comunicador Emergente</span>;
      case 'context_dependent':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">Dependente do Contexto</span>;
      case 'independent':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Comunicador Independente</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{lvl}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Comunicação Aumentativa e Alternativa (CAA / AAC)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sistemas de comunicação de baixa e alta tecnologia, repertório de símbolos e parceiros {patientName ? `• ${patientName}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex gap-4">
          <button
            onClick={() => setActiveTab('create')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'create'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Novo Registro de CAA
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Histórico Evolutivo ({records.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'create' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Sistema / Recurso Utilizado *
                  </label>
                  <input
                    type="text"
                    value={form.systemUsed}
                    onChange={e => setForm({ ...form, systemUsed: e.target.value })}
                    placeholder="Ex: Prancha temática plastificada, PECS, App Livox, Proloquo2Go..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nível Evolutivo do Comunicador
                  </label>
                  <select
                    value={form.evolutionLevel}
                    onChange={e => setForm({ ...form, evolutionLevel: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                  >
                    <option value="emergent">1. Comunicador Emergente (Início da intencionalidade)</option>
                    <option value="context_dependent">2. Dependente do Contexto (Comunica em rotinas familiares)</option>
                    <option value="independent">3. Comunicador Independente (Comunica qualquer mensagem)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Método de Acesso / Forma de Acionamento
                  </label>
                  <input
                    type="text"
                    value={form.accessMethod}
                    onChange={e => setForm({ ...form, accessMethod: e.target.value })}
                    placeholder="Ex: Toque direto, apontar, varredura com acionador mecânico, eye-tracking..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Representação Simbólica
                  </label>
                  <input
                    type="text"
                    value={form.symbolsType}
                    onChange={e => setForm({ ...form, symbolsType: e.target.value })}
                    placeholder="Ex: Fotos reais, pictogramas ARASAAC, miniaturas, símbolos PCS..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Vocabulário Central e Específico Disponível
                  </label>
                  <input
                    type="text"
                    value={form.vocabularyDetails}
                    onChange={e => setForm({ ...form, vocabularyDetails: e.target.value })}
                    placeholder="Ex: 30 itens (Eu quero, Mais, Acabou, Água, Banheiro, Não, Brinquedos)..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Funções Comunicativas Expressas
                  </label>
                  <input
                    type="text"
                    value={form.communicativeIntention}
                    onChange={e => setForm({ ...form, communicativeIntention: e.target.value })}
                    placeholder="Ex: Pedir itens desejados, recusar, saudar, protestar, relatar fatos..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Parceiros de Comunicação Treinados
                  </label>
                  <input
                    type="text"
                    value={form.communicationPartners}
                    onChange={e => setForm({ ...form, communicationPartners: e.target.value })}
                    placeholder="Ex: Mãe, pai, professora da sala regular, mediadora..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ambientes de Utilização Ativa
                  </label>
                  <input
                    type="text"
                    value={form.environments}
                    onChange={e => setForm({ ...form, environments: e.target.value })}
                    placeholder="Ex: Em casa, na escola, durante as refeições, passeios..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações Clínicas e Próximas Metas de Expansão de Vocabulário
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Orientações de modelagem (Aided Language Stimulation), novos campos semânticos a inserir..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-400">Carregando registros...</div>
              ) : records.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/20 rounded-2xl">
                  Nenhum registro de CAA para este paciente ainda.
                </div>
              ) : (
                records.map(r => (
                  <div
                    key={r.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-purple-900 dark:text-purple-300">
                        {r.system_used}
                      </h4>
                      <div className="flex items-center gap-2">
                        {evolutionLevelBadge(r.evolution_level)}
                        <span className="text-[11px] text-slate-400">
                          {new Date(r.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl">
                      <div><strong>Acesso:</strong> {r.access_method || '-'}</div>
                      <div><strong>Símbolos:</strong> {r.symbols_type || '-'}</div>
                      <div><strong>Parceiros:</strong> {r.communication_partners || '-'}</div>
                    </div>

                    {r.notes && <p className="text-xs text-slate-700 dark:text-slate-300">{r.notes}</p>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'create' && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Registro de CAA'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
