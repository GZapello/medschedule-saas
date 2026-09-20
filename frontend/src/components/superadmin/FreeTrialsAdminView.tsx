import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Gift,
  Plus,
  Search,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Calendar,
  Sparkles,
  X,
  ExternalLink,
  Building2,
  Mail,
  RefreshCw,
  Trash2
} from 'lucide-react';

interface FreeTrialItem {
  id: string;
  token: string;
  target_name: string;
  target_email: string | null;
  duration_days: number;
  duration_label: string;
  status: 'pending' | 'active' | 'used' | 'expired' | 'revoked';
  computed_status: 'pending' | 'active' | 'ended' | 'expired' | 'revoked';
  created_by: string;
  created_at: string;
  link_expires_at: string;
  activated_at: string | null;
  trial_end_at: string | null;
  tenant_id: string | null;
  user_id: string | null;
  notes: string | null;
  creator_name?: string;
  creator_email?: string;
  tenant_name?: string;
  tenant_slug?: string;
  activated_user_name?: string;
  activated_user_email?: string;
}

interface SummaryMetrics {
  total: number;
  pending: number;
  active: number;
  ended: number;
  expired: number;
  revoked: number;
}

export const FreeTrialsAdminView: React.FC = () => {
  const { showToast } = useToast();

  const [trials, setTrials] = useState<FreeTrialItem[]>([]);
  const [summary, setSummary] = useState<SummaryMetrics>({
    total: 0,
    pending: 0,
    active: 0,
    ended: 0,
    expired: 0,
    revoked: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'expired' | 'ended' | 'revoked'>('all');

  // Modal de Criação
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    targetName: '',
    targetEmail: '',
    durationDays: 30,
    notes: ''
  });

  // Modal de Link Gerado
  const [generatedTrial, setGeneratedTrial] = useState<any | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Modal de Revogação
  const [revokingTrial, setRevokingTrial] = useState<FreeTrialItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Modal de Exclusão Definitiva
  const [deletingTrial, setDeletingTrial] = useState<FreeTrialItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTrials = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<{ trials: FreeTrialItem[]; summary: SummaryMetrics }>('/v1/admin/free-trials');
      setTrials(res.trials || []);
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar testes grátis', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrials();
  }, []);

  const getFullTrialUrl = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zemda.com.br';
    return `${origin}/teste-gratis/${token}`;
  };

  const handleCopyLink = async (token: string) => {
    const url = getFullTrialUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      showToast('Link de teste grátis copiado para a área de transferência!', 'success');
      setTimeout(() => {
        setCopiedToken(null);
      }, 3000);
    } catch {
      showToast('Não foi possível copiar automaticamente. Copie a URL manualmente.', 'error');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.targetName.trim()) {
      showToast('Informe o nome do cliente ou clínica', 'error');
      return;
    }

    try {
      setCreating(true);
      const res = await ApiClient.post<{ success: boolean; trial: any }>('/v1/admin/free-trials', {
        targetName: formData.targetName.trim(),
        targetEmail: formData.targetEmail.trim() || undefined,
        durationDays: formData.durationDays,
        notes: formData.notes.trim() || undefined
      });

      showToast('Link de teste grátis gerado com sucesso!', 'success');
      setIsCreateModalOpen(false);
      setFormData({
        targetName: '',
        targetEmail: '',
        durationDays: 30,
        notes: ''
      });
      setGeneratedTrial(res.trial);
      await loadTrials();
    } catch (err: any) {
      showToast(err.message || 'Erro ao gerar link de teste grátis', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokingTrial) return;

    try {
      setRevoking(true);
      await ApiClient.delete(`/v1/admin/free-trials/${revokingTrial.id}/revoke`);
      showToast(`Link de teste para "${revokingTrial.target_name}" revogado com sucesso!`, 'success');
      setRevokingTrial(null);
      await loadTrials();
    } catch (err: any) {
      showToast(err.message || 'Erro ao revogar link de teste grátis', 'error');
    } finally {
      setRevoking(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTrial) return;

    try {
      setDeleting(true);
      await ApiClient.delete(`/v1/admin/free-trials/${deletingTrial.id}`);
      showToast('Teste grátis excluído com sucesso!', 'success');
      setDeletingTrial(null);
      await loadTrials();
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir teste grátis', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Filtragem
  const filteredTrials = trials.filter(t => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'ended') {
        if (t.computed_status !== 'ended' && t.status !== 'used') return false;
      } else if (t.computed_status !== statusFilter) {
        return false;
      }
    }

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.target_name.toLowerCase().includes(term) ||
      (t.target_email && t.target_email.toLowerCase().includes(term)) ||
      (t.tenant_name && t.tenant_name.toLowerCase().includes(term)) ||
      (t.tenant_slug && t.tenant_slug.toLowerCase().includes(term)) ||
      (t.activated_user_name && t.activated_user_name.toLowerCase().includes(term)) ||
      (t.token && t.token.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="flex items-start sm:items-center gap-4">
          <div className="p-3.5 bg-amber-500/20 rounded-2xl border border-amber-500/30 text-amber-400">
            <Gift className="w-8 h-8" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-1 border border-amber-500/20">
              Controle Exclusivo do SuperAdmin
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Testes Grátis da Plataforma</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
              Gere links únicos de teste grátis de 7 dias, 15 dias, 30 dias ou 3 meses. Cada link expira em 24h e o período do teste só começa após a ativação.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadTrials}
            disabled={loading}
            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all border border-white/10 flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-2xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Gerar Link de Teste Grátis
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total</span>
            <Gift className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{summary.total}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Links emitidos</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs bg-gradient-to-br from-white to-amber-50/40">
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Aguardando</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">{summary.pending}</div>
          <p className="text-[10px] text-amber-700/80 mt-0.5">Prazo de 24h</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-xs bg-gradient-to-br from-white to-emerald-50/40">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ativos</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{summary.active}</div>
          <p className="text-[10px] text-emerald-700/80 mt-0.5">Em período de teste</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-200/80 shadow-xs bg-gradient-to-br from-white to-rose-50/40">
          <div className="flex items-center justify-between text-rose-700 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Expirados</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600">{summary.expired}</div>
          <p className="text-[10px] text-rose-700/80 mt-0.5">Não ativados em 24h</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Encerrados</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-700">{summary.ended}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Período concluído</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-purple-200/80 shadow-xs bg-gradient-to-br from-white to-purple-50/40">
          <div className="flex items-center justify-between text-purple-700 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Revogados</span>
            <Ban className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-purple-600">{summary.revoked}</div>
          <p className="text-[10px] text-purple-700/80 mt-0.5">Cancelados antes do uso</p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 text-xs font-bold">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos ({summary.total})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            Aguardando ({summary.pending})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white font-bold'
                : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Ativos ({summary.active})
          </button>
          <button
            onClick={() => setStatusFilter('expired')}
            className={`px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'expired'
                ? 'bg-rose-600 text-white'
                : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            Expirados ({summary.expired})
          </button>
          <button
            onClick={() => setStatusFilter('ended')}
            className={`px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'ended'
                ? 'bg-slate-700 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Encerrados ({summary.ended})
          </button>
          <button
            onClick={() => setStatusFilter('revoked')}
            className={`px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === 'revoked'
                ? 'bg-purple-600 text-white'
                : 'text-purple-700 hover:bg-purple-50'
            }`}
          >
            Revogados ({summary.revoked})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente, e-mail..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Tabela de Testes Grátis */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Cliente / Clínica</th>
                <th className="py-3.5 px-4 text-center">Período do Teste</th>
                <th className="py-3.5 px-4">Data de Geração</th>
                <th className="py-3.5 px-4">Expiração do Link</th>
                <th className="py-3.5 px-4">Data de Ativação</th>
                <th className="py-3.5 px-4">Fim do Teste</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading && trials.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Carregando testes grátis...
                  </td>
                </tr>
              ) : filteredTrials.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhum teste grátis encontrado.
                  </td>
                </tr>
              ) : (
                filteredTrials.map(trial => {
                  const isPending = trial.computed_status === 'pending';
                  const isActive = trial.computed_status === 'active';
                  const isExpired = trial.computed_status === 'expired';
                  const isEnded = trial.computed_status === 'ended';
                  const isRevoked = trial.computed_status === 'revoked';

                  return (
                    <tr key={trial.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* 1. Cliente/Clínica */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          {trial.target_name}
                        </div>
                        {trial.target_email && (
                          <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {trial.target_email}
                          </div>
                        )}
                        {trial.tenant_name && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                              <Building2 className="w-2.5 h-2.5" />
                              {trial.tenant_name} ({trial.tenant_slug})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 2. Período do teste */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                          {trial.duration_label}
                        </span>
                      </td>

                      {/* 3. Data de geração */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        {formatDate(trial.created_at)}
                      </td>

                      {/* 4. Expiração do link (24h) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className={`font-semibold ${isExpired ? 'text-rose-600 line-through' : 'text-slate-700'}`}>
                          {formatDate(trial.link_expires_at)}
                        </div>
                        {isPending && (
                          <span className="text-[10px] text-amber-600 font-bold">Válido por 24h</span>
                        )}
                      </td>

                      {/* 5. Data de ativação */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        {trial.activated_at ? (
                          <div className="font-semibold text-emerald-700">
                            {formatDate(trial.activated_at)}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Aguardando ativação</span>
                        )}
                      </td>

                      {/* 6. Fim do teste */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        {trial.trial_end_at ? (
                          <div className={`font-semibold ${isEnded ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                            {formatDate(trial.trial_end_at)}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Inicia na ativação</span>
                        )}
                      </td>

                      {/* 7. Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isPending && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Aguardando ativação
                          </span>
                        )}
                        {isActive && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Ativo
                          </span>
                        )}
                        {isEnded && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                            Encerrado / Utilizado
                          </span>
                        )}
                        {isExpired && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            Expirado (24h)
                          </span>
                        )}
                        {isRevoked && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                            Revogado
                          </span>
                        )}
                      </td>

                      {/* 8. Ações */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleCopyLink(trial.token)}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                title="Copiar link para enviar ao cliente"
                              >
                                {copiedToken === trial.token ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copiar Link</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => setRevokingTrial(trial)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition-all cursor-pointer"
                                title="Revogar link pendente"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {!isPending && (
                            <button
                              onClick={() => handleCopyLink(trial.token)}
                              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                              title="Copiar link original"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setDeletingTrial(trial)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-all cursor-pointer"
                            title="Excluir teste grátis definitivamente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: GERAR NOVO LINK DE TESTE GRÁTIS */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30 text-amber-400">
                  <Gift className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Gerar Teste Grátis</h3>
                  <p className="text-xs text-slate-400">Link exclusivo, individual e de uso único</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {/* Cliente / Clínica */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cliente / Clínica Pretendida <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Dra. Juliana Costa / Clínica Equilíbrio"
                  value={formData.targetName}
                  onChange={e => setFormData(prev => ({ ...prev, targetName: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* E-mail pretendido */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  E-mail do Responsável (Opcional)
                </label>
                <input
                  type="email"
                  placeholder="Ex: juliana@clinicaequilibrio.com.br"
                  value={formData.targetEmail}
                  onChange={e => setFormData(prev => ({ ...prev, targetEmail: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Se informado, será pré-preenchido no formulário de ativação do cliente.
                </p>
              </div>

              {/* Período do teste */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Duração do Período de Teste <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { days: 7, label: '7 dias' },
                    { days: 15, label: '15 dias' },
                    { days: 30, label: '30 dias' },
                    { days: 90, label: '3 meses' }
                  ].map(option => (
                    <button
                      key={option.days}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, durationDays: option.days }))}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        formData.durationDays === option.days
                          ? 'border-amber-500 bg-amber-50/80 text-amber-950 font-black shadow-xs ring-2 ring-amber-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="text-sm font-extrabold">{option.label}</span>
                      <span className="text-[10px] text-slate-500">
                        {option.days === 90 ? '90 dias' : 'dias corridos'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Observações internas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Anotações Internas (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Contato via WhatsApp / Demonstração comercial"
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Alerta de Regra de Negócio */}
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-[11px] text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1 text-amber-950">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Regras de Validade e Expiração:
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-amber-900/90 text-[10.5px]">
                  <li>O link expira automaticamente em <strong>24 horas</strong> se não for ativado;</li>
                  <li>O período de teste (<strong>{formData.durationDays === 90 ? '3 meses' : `${formData.durationDays} dias`}</strong>) só começa a contar <strong>após a ativação</strong>;</li>
                  <li>O link é <strong>individual e de uso único</strong>: é bloqueado imediatamente após a ativação.</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={creating}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !formData.targetName.trim()}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer text-xs disabled:opacity-50"
                >
                  {creating ? 'Gerando...' : 'Gerar Link Agora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: LINK GERADO COM SUCESSO (CÓPIA RÁPIDA) */}
      {/* ========================================================================= */}
      {generatedTrial && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-center relative">
              <button
                onClick={() => setGeneratedTrial(null)}
                className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/30 text-white">
                <Gift className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black">Link de Teste Gerado!</h3>
              <p className="text-xs text-white/90 mt-1">
                Período de <strong>{generatedTrial.durationLabel}</strong> para <strong>{generatedTrial.targetName}</strong>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Link de Ativação do Teste Grátis:
                </label>
                <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                  <input
                    type="text"
                    readOnly
                    value={getFullTrialUrl(generatedTrial.token)}
                    className="w-full bg-transparent text-xs text-slate-800 font-mono focus:outline-none px-2"
                  />
                  <button
                    onClick={() => handleCopyLink(generatedTrial.token)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                  >
                    {copiedToken === generatedTrial.token ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <div className="font-bold flex items-center gap-1 mb-0.5 text-amber-950">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Atenção: Validade de 24 horas
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Envie este link para o cliente. Se não for ativado dentro de 24 horas (até {formatDate(generatedTrial.linkExpiresAt)}), o link será automaticamente invalidado.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setGeneratedTrial(null)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMAR REVOGAÇÃO */}
      {/* ========================================================================= */}
      {revokingTrial && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <Ban className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Revogar Link de Teste</h3>
                <p className="text-xs text-slate-500">Esta ação cancelará o link imediatamente</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Tem certeza que deseja revogar o link de teste grátis gerado para <strong>{revokingTrial.target_name}</strong>?
              O link não poderá mais ser utilizado para criar uma conta.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRevokingTrial(null)}
                disabled={revoking}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={revoking}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {revoking ? 'Revogando...' : 'Confirmar Revogação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMAR EXCLUSÃO DEFINITIVA */}
      {/* ========================================================================= */}
      {deletingTrial && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Excluir teste grátis?</h3>
                <p className="text-xs text-slate-500">Ação irreversível</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Esta ação removerá definitivamente este registro da lista de testes grátis.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTrial(null)}
                disabled={deleting}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
