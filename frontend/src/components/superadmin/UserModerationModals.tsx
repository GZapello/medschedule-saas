import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  X,
  Shield,
  ShieldAlert,
  Lock,
  Unlock,
  Phone,
  PhoneOff,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Calendar,
  User,
  Building2,
  Eye,
  History,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  Loader2
} from 'lucide-react';

export const MODERATION_REASONS = [
  { value: 'suspected_spam', label: 'Suspeita de spam' },
  { value: 'invalid_phone', label: 'Telefone inválido' },
  { value: 'whatsapp_inaccessible', label: 'WhatsApp inexistente ou inacessível' },
  { value: 'inconsistent_data', label: 'Dados cadastrais inconsistentes' },
  { value: 'duplicate_account', label: 'Cadastro duplicado' },
  { value: 'suspicious_activity', label: 'Atividade suspeita' },
  { value: 'terms_violation', label: 'Violação dos termos de uso' },
  { value: 'other', label: 'Outros motivos' }
];

export function formatDateTimeBR(isoStr?: string | null): string {
  if (!isoStr) return 'Não disponível';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Não disponível';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d).replace(', ', ' — ');
  } catch {
    return 'Não disponível';
  }
}

export function formatLoginDate(isoStr?: string | null): { text: string; relative: string | null } {
  if (!isoStr) return { text: 'Nunca acessou', relative: null };
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return { text: 'Não disponível', relative: null };
    const text = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d).replace(', ', ' — ');

    const diffMs = Date.now() - d.getTime();
    let relative = null;
    if (diffMs > 0) {
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 60) relative = `há ${Math.max(1, diffMin)} min`;
      else {
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) relative = `há ${diffH}h`;
        else {
          const diffDays = Math.floor(diffH / 24);
          if (diffDays === 1) relative = 'há 1 dia';
          else if (diffDays < 30) relative = `há ${diffDays} dias`;
          else relative = `há ${Math.floor(diffDays / 30)} meses`;
        }
      }
    }
    return { text, relative };
  } catch {
    return { text: 'Não disponível', relative: null };
  }
}

// ============================================================================
// MODAL DE DETALHES E HISTÓRICO ADMINISTRATIVO DO USUÁRIO
// ============================================================================

interface UserModerationDetailModalProps {
  userId: string | null;
  onClose: () => void;
  onOpenAction: (type: 'flag' | 'block' | 'unblock' | 'request_whatsapp', user: any) => void;
  onClearFlag: (user: any) => void;
}

export const UserModerationDetailModal: React.FC<UserModerationDetailModalProps> = ({
  userId,
  onClose,
  onOpenAction,
  onClearFlag
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    user: any;
    clinics: any[];
    whatsappRequests: any[];
    moderationLogs: any[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'whatsapp'>('overview');

  useEffect(() => {
    if (!userId) {
      setData(null);
      return;
    }

    let isMounted = true;
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await ApiClient.get<any>(`/v1/admin/users/${userId}/moderation`);
        if (isMounted) setData(res);
      } catch (err: any) {
        if (isMounted) showToast(err.message || 'Erro ao carregar detalhes de moderação', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDetails();
    return () => { isMounted = false; };
  }, [userId]);

  if (!userId) return null;

  const user = data?.user;
  const isBlocked = user?.status === 'blocked';
  const isFlagged = user?.moderationFlag && user.moderationFlag !== 'clean';
  const loginInfo = formatLoginDate(user?.lastLoginAt);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
              isBlocked ? 'bg-rose-100 text-rose-700 border border-rose-200' :
              isFlagged ? 'bg-amber-100 text-amber-700 border border-amber-200' :
              'bg-blue-100 text-blue-700 border border-blue-200'
            }`}>
              {user?.name ? user.name.slice(0, 2).toUpperCase() : <User className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-800 text-base">{user?.name || 'Carregando...'}</h3>
                {isBlocked && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    Bloqueado
                  </span>
                )}
                {user?.status === 'suspended' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    Suspenso
                  </span>
                )}
                {user?.status === 'active' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Ativo
                  </span>
                )}
                {user?.moderationFlag === 'suspected_spam' && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-purple-600" /> Spam suspeito
                  </span>
                )}
                {(user?.whatsappStatus === 'pending_correction' || user?.moderationFlag === 'invalid_phone') && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                    <PhoneOff className="w-3 h-3 text-amber-600" /> WhatsApp pendente
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{user?.email || '—'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 bg-white px-5 pt-2 gap-4 text-xs font-bold text-slate-500">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
            }`}
          >
            <User className="w-4 h-4" />
            Visão Geral & Vínculos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            Histórico Administrativo ({data?.moderationLogs?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'whatsapp' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
            }`}
          >
            <Phone className="w-4 h-4" />
            Solicitações de WhatsApp ({data?.whatsappRequests?.length || 0})
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <span>Carregando dados administrativos do usuário...</span>
            </div>
          ) : !user ? (
            <div className="py-12 text-center text-slate-500">Usuário não encontrado.</div>
          ) : (
            <>
              {/* TAB 1: VISÃO GERAL */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Alerta de Bloqueio se houver */}
                  {isBlocked && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-900 leading-relaxed">
                      <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="font-bold text-rose-950 text-xs">Conta Bloqueada pela Administração</h4>
                        <p className="text-xs"><strong>Motivo:</strong> {user.blockedReason || 'Não informado'}</p>
                        <p className="text-[11px] text-rose-700">
                          Bloqueado em: {formatDateTimeBR(user.blockedAt)} {user.blockedUntil ? `· Válido até: ${formatDateTimeBR(user.blockedUntil)}` : '· Indeterminado'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Cards de Métricas Cadastrais */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        Data do Cadastro (Plataforma Zemda)
                      </span>
                      <p className="text-sm font-bold text-slate-800">
                        {formatDateTimeBR(user.createdAt)}
                      </p>
                      <p className="text-[10px] text-slate-400">Horário oficial de Brasília (America/Sao_Paulo)</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-600" />
                        Último Acesso Bem-Sucedido
                      </span>
                      <p className="text-sm font-bold text-slate-800">
                        {loginInfo.text} {loginInfo.relative && <span className="text-xs font-normal text-slate-500">({loginInfo.relative})</span>}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {user.lastLoginProvider ? `Método: ${user.lastLoginProvider === 'google' ? 'Google OAuth' : 'Senha local'}` : 'Tentativas com erro não computadas'}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-teal-600" />
                        Telefone / WhatsApp Cadastrado
                      </span>
                      <p className="text-sm font-bold text-slate-800">
                        {user.phone || 'Nenhum número cadastrado'}
                      </p>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1">
                        Estado: {
                          user.whatsappStatus === 'invalid' ? <span className="text-rose-600 font-bold">Marcado como Inválido</span> :
                          user.whatsappStatus === 'pending_correction' ? <span className="text-amber-600 font-bold">Pendente de Atualização</span> :
                          user.phoneVerified ? <span className="text-emerald-600 font-bold">Verificado</span> :
                          <span className="text-slate-500">Não verificado</span>
                        }
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-amber-600" />
                        Papel & Permissões no SaaS
                      </span>
                      <p className="text-sm font-bold text-slate-800">
                        {({
                          clinic_admin: 'Administrador da Clínica',
                          professional: 'Profissional de Saúde',
                          receptionist: 'Recepcionista',
                          secretary: 'Secretária',
                          superadmin: 'SuperAdmin SaaS'
                        } as Record<string, string>)[user.role] || user.role}
                      </p>
                      <p className="text-[10px] text-slate-400">Status Geral: {user.status.toUpperCase()}</p>
                    </div>
                  </div>

                  {/* Vínculos com Clínicas */}
                  <div className="space-y-2 pt-2">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      Clínicas Vinculadas a este Usuário ({data?.clinics?.length || 0})
                    </h4>
                    {!data?.clinics?.length ? (
                      <p className="text-slate-400 text-xs italic">Nenhuma clínica vinculada.</p>
                    ) : (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px]">
                            <tr>
                              <th className="p-2.5">Clínica</th>
                              <th className="p-2.5">Papel</th>
                              <th className="p-2.5">Status do Vínculo</th>
                              <th className="p-2.5">Data do Vínculo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {data.clinics.map((c: any) => (
                              <tr key={c.id}>
                                <td className="p-2.5 font-medium text-slate-800">
                                  {c.clinic_name} <span className="text-[10px] text-slate-400">({c.clinic_slug})</span>
                                </td>
                                <td className="p-2.5">{c.role} {c.is_manager ? '★ Gestor' : ''}</td>
                                <td className="p-2.5">
                                  {c.status === 'active' ? (
                                    <span className="text-emerald-700 font-bold">Ativo</span>
                                  ) : (
                                    <span className="text-rose-700 font-bold">{c.status}</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-slate-500">{formatDateTimeBR(c.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: HISTÓRICO DE MODERAÇÃO */}
              {activeTab === 'history' && (
                <div className="space-y-3">
                  {!data?.moderationLogs?.length ? (
                    <div className="py-10 text-center text-slate-400">
                      Nenhum registro de moderação ou ocorrência administrativa para este usuário.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px]">
                          <tr>
                            <th className="p-2.5">Data / Hora</th>
                            <th className="p-2.5">Ação Realizada</th>
                            <th className="p-2.5">Motivo / Justificativa</th>
                            <th className="p-2.5">Responsável</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {data.moderationLogs.map((log: any) => {
                            const actionLabels: Record<string, { label: string; color: string }> = {
                              flag_spam: { label: 'Sinalização de Spam', color: 'text-purple-700 bg-purple-50' },
                              flag_invalid_phone: { label: 'Telefone Inválido', color: 'text-amber-700 bg-amber-50' },
                              flag_suspicious: { label: 'Cadastro Suspeito', color: 'text-amber-700 bg-amber-50' },
                              clear_flag: { label: 'Sinalização Removida', color: 'text-emerald-700 bg-emerald-50' },
                              block_user: { label: 'Bloqueio Global', color: 'text-rose-700 bg-rose-50' },
                              unblock_user: { label: 'Desbloqueio Global', color: 'text-emerald-700 bg-emerald-50' },
                              suspend_membership: { label: 'Suspensão de Clínica', color: 'text-rose-700 bg-rose-50' },
                              unsuspend_membership: { label: 'Reativação de Clínica', color: 'text-emerald-700 bg-emerald-50' },
                              request_whatsapp_update: { label: 'Solicitação de WhatsApp', color: 'text-blue-700 bg-blue-50' },
                              whatsapp_updated: { label: 'WhatsApp Atualizado (Usuário)', color: 'text-teal-700 bg-teal-50' }
                            };
                            const info = actionLabels[log.action] || { label: log.action, color: 'text-slate-700 bg-slate-50' };

                            return (
                              <tr key={log.id}>
                                <td className="p-2.5 text-slate-500 whitespace-nowrap">{formatDateTimeBR(log.created_at)}</td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${info.color}`}>
                                    {info.label}
                                  </span>
                                </td>
                                <td className="p-2.5 text-slate-700">
                                  <p className="font-semibold text-slate-800">
                                    {MODERATION_REASONS.find(r => r.value === log.reason_code)?.label || log.reason_code}
                                  </p>
                                  {log.reason_details && (
                                    <p className="text-[11px] text-slate-500 mt-0.5">{log.reason_details}</p>
                                  )}
                                  {log.blocked_until && (
                                    <p className="text-[10px] text-amber-700 mt-0.5">Prazo: {formatDateTimeBR(log.blocked_until)}</p>
                                  )}
                                </td>
                                <td className="p-2.5 text-slate-600 whitespace-nowrap">
                                  {log.performed_by_name || 'SuperAdmin'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SOLICITAÇÕES DE WHATSAPP */}
              {activeTab === 'whatsapp' && (
                <div className="space-y-3">
                  {!data?.whatsappRequests?.length ? (
                    <div className="py-10 text-center text-slate-400">
                      Nenhuma solicitação de WhatsApp registrada para este usuário.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px]">
                          <tr>
                            <th className="p-2.5">Data da Solicitação</th>
                            <th className="p-2.5">Status</th>
                            <th className="p-2.5">Número Anterior</th>
                            <th className="p-2.5">Novo Número</th>
                            <th className="p-2.5">Motivo</th>
                            <th className="p-2.5">Conclusão</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {data.whatsappRequests.map((req: any) => (
                            <tr key={req.id}>
                              <td className="p-2.5 text-slate-500 whitespace-nowrap">{formatDateTimeBR(req.created_at)}</td>
                              <td className="p-2.5">
                                {req.status === 'completed' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Concluída
                                  </span>
                                ) : req.status === 'pending' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Pendente
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                    {req.status}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-600">{req.previous_phone || '—'}</td>
                              <td className="p-2.5 font-bold text-slate-800">{req.new_phone || '—'}</td>
                              <td className="p-2.5 text-slate-600">{req.reason}</td>
                              <td className="p-2.5 text-slate-500">{req.resolved_at ? formatDateTimeBR(req.resolved_at) : 'Em aberto'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer with Direct Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {isFlagged && (
              <button
                type="button"
                onClick={() => onClearFlag(user)}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 transition-colors cursor-pointer"
              >
                Limpar Sinalização
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenAction('request_whatsapp', user)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-xs rounded-xl border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              Solicitar WhatsApp
            </button>
            <button
              type="button"
              onClick={() => onOpenAction('flag', user)}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Sinalizar Spam / Suspeito
            </button>
            {isBlocked ? (
              <button
                type="button"
                onClick={() => onOpenAction('unblock', user)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" />
                Desbloquear Conta
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAction('block', user)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                Bloquear Usuário
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MODAL DE AÇÕES DE MODERAÇÃO (BLOQUEIO, SINALIZAÇÃO E SOLICITAÇÃO WHATSAPP)
// ============================================================================

interface UserModerationActionModalProps {
  type: 'flag' | 'block' | 'unblock' | 'request_whatsapp' | null;
  user: any;
  clinic: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const UserModerationActionModal: React.FC<UserModerationActionModalProps> = ({
  type,
  user,
  clinic,
  onClose,
  onSuccess
}) => {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Campos do formulário
  const [scope, setScope] = useState<'global' | 'clinic'>('global');
  const [reasonCode, setReasonCode] = useState('suspected_spam');
  const [reasonDetails, setReasonDetails] = useState('');
  const [isTemporary, setIsTemporary] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState('');
  const [suspendAccess, setSuspendAccess] = useState(false);
  const [confirmSoleManager, setConfirmSoleManager] = useState(false);
  const [soleManagerWarning, setSoleManagerWarning] = useState<string | null>(null);

  useEffect(() => {
    if (type === 'flag') {
      setReasonCode('suspected_spam');
    } else if (type === 'block') {
      setReasonCode('terms_violation');
      setScope('global');
    } else if (type === 'request_whatsapp') {
      setReasonCode('invalid_phone');
      setReasonDetails('Número cadastrado não recebe mensagens ou está incompleto');
      setSuspendAccess(false);
    }
    setSoleManagerWarning(null);
    setConfirmSoleManager(false);
  }, [type, user]);

  if (!type || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (type === 'flag') {
        const flagType = reasonCode === 'suspected_spam' ? 'suspected_spam' : (reasonCode === 'invalid_phone' ? 'invalid_phone' : 'suspicious_activity');
        await ApiClient.post(`/v1/admin/users/${user.id}/flag`, {
          flag: flagType,
          reasonCode,
          reasonDetails,
          clinicId: clinic?.id
        });
        showToast('Sinalização de moderação registrada.', 'success');
      } else if (type === 'block') {
        await ApiClient.post(`/v1/admin/users/${user.id}/block`, {
          scope,
          clinicId: clinic?.id,
          reasonCode,
          reasonDetails,
          isTemporary,
          blockedUntil: isTemporary ? blockedUntil : undefined,
          confirmSoleManager
        });
        showToast(scope === 'global' ? 'Usuário bloqueado globalmente.' : 'Acesso à clínica suspenso.', 'success');
      } else if (type === 'unblock') {
        await ApiClient.post(`/v1/admin/users/${user.id}/unblock`, {
          scope,
          clinicId: clinic?.id,
          reasonDetails
        });
        showToast('Usuário desbloqueado com sucesso.', 'success');
      } else if (type === 'request_whatsapp') {
        if (!reasonDetails.trim()) {
          showToast('Informe o motivo da solicitação de WhatsApp', 'error');
          setSubmitting(false);
          return;
        }
        await ApiClient.post(`/v1/admin/users/${user.id}/request-whatsapp-update`, {
          reason: reasonDetails.trim(),
          suspendAccess,
          clinicId: clinic?.id,
          confirmSoleManager
        });
        showToast('Solicitação de WhatsApp registrada.', 'success');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.code === 'SOLE_MANAGER_CONFIRMATION_REQUIRED' || err?.message?.includes('único administrador/gestor')) {
        setSoleManagerWarning(err.message || 'Este usuário é o único gestor ativo desta clínica. O bloqueio deixará a clínica sem gestor ativo.');
      } else {
        showToast(err.message || 'Erro ao processar ação de moderação', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titles = {
    flag: 'Sinalizar Cadastro / Spam / Telefone Inválido',
    block: 'Bloquear Acesso do Usuário',
    unblock: 'Desbloquear Usuário',
    request_whatsapp: 'Solicitar Atualização de WhatsApp'
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              {type === 'block' ? <Lock className="w-4 h-4 text-rose-600" /> :
               type === 'unblock' ? <Unlock className="w-4 h-4 text-emerald-600" /> :
               type === 'request_whatsapp' ? <Phone className="w-4 h-4 text-blue-600" /> :
               <AlertTriangle className="w-4 h-4 text-amber-600" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">{titles[type]}</h3>
              <p className="text-[11px] text-slate-500">{user.name} ({user.email})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Card com identificação do usuário e clínica */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 text-slate-600">
            <p><strong>Usuário:</strong> {user.name}</p>
            <p><strong>E-mail:</strong> {user.email}</p>
            <p><strong>Telefone atual:</strong> {user.phone || 'Nenhum'}</p>
            {clinic?.name && <p><strong>Clínica ativa:</strong> {clinic.name}</p>}
          </div>

          {/* ALERTA DE ÚNICO GESTOR */}
          {soleManagerWarning && (
            <div className="p-3.5 bg-amber-50 border-2 border-amber-200 rounded-2xl space-y-2 text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="font-semibold text-xs leading-relaxed">{soleManagerWarning}</span>
              </div>
              <label className="flex items-center gap-2 pt-1 font-bold text-amber-950 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={confirmSoleManager}
                  onChange={e => setConfirmSoleManager(e.target.checked)}
                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                />
                Confirmo que desejo prosseguir mesmo deixando a clínica sem gestor
              </label>
            </div>
          )}

          {/* ESCOPO: GLOBAL VS CLÍNICA (para Bloqueio e Desbloqueio) */}
          {(type === 'block' || type === 'unblock') && (
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">Abrangência da Ação *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className={`p-2.5 rounded-xl border flex items-start gap-2 cursor-pointer transition-colors ${
                  scope === 'global' ? 'border-blue-500 bg-blue-50/50 text-blue-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <input
                    type="radio"
                    name="scope"
                    value="global"
                    checked={scope === 'global'}
                    onChange={() => setScope('global')}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="block text-xs">Bloqueio Global</span>
                    <span className="text-[10px] text-slate-500 font-normal">Impede acesso total à plataforma Zemda</span>
                  </div>
                </label>

                <label className={`p-2.5 rounded-xl border flex items-start gap-2 cursor-pointer transition-colors ${
                  scope === 'clinic' ? 'border-blue-500 bg-blue-50/50 text-blue-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <input
                    type="radio"
                    name="scope"
                    value="clinic"
                    checked={scope === 'clinic'}
                    onChange={() => setScope('clinic')}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="block text-xs">Apenas nesta Clínica</span>
                    <span className="text-[10px] text-slate-500 font-normal">Preserva vínculos em outros estabelecimentos</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* MOTIVO PREDEFINIDO */}
          {type !== 'unblock' && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Motivo Principal *</label>
              <select
                value={reasonCode}
                onChange={e => setReasonCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium text-slate-800"
              >
                {MODERATION_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* JUSTIFICATIVA ADMINISTRATIVA */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {type === 'request_whatsapp' ? 'Motivo informado ao profissional *' : 'Justificativa Administrativa (opcional)'}
            </label>
            <textarea
              required={type === 'request_whatsapp' || type === 'block'}
              rows={3}
              value={reasonDetails}
              onChange={e => setReasonDetails(e.target.value)}
              placeholder={
                type === 'request_whatsapp' ? 'Ex: O número informado não possui WhatsApp ativo. Por favor informe seu DDD e número atualizados.' :
                'Descreva detalhes para o log de auditoria...'
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* OPÇÃO DE SUSPENSÃO NA SOLICITAÇÃO DE WHATSAPP */}
          {type === 'request_whatsapp' && (
            <div className="space-y-1.5 pt-1">
              <label className="block font-bold text-slate-700">Comportamento de Acesso</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="wa_mode"
                    checked={!suspendAccess}
                    onChange={() => setSuspendAccess(false)}
                  />
                  <span><strong>Somente solicitar atualização:</strong> o usuário continua acessando o Zemda normalmente</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="wa_mode"
                    checked={suspendAccess}
                    onChange={() => setSuspendAccess(true)}
                  />
                  <span><strong>Solicitar e suspender acesso:</strong> suspende a conta até regularização</span>
                </label>
              </div>
            </div>
          )}

          {/* BLOQUEIO TEMPORÁRIO VS INDETERMINADO */}
          {type === 'block' && (
            <div className="space-y-2 pt-1">
              <label className="block font-bold text-slate-700">Duração do Bloqueio</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="temp_mode"
                    checked={!isTemporary}
                    onChange={() => setIsTemporary(false)}
                  />
                  <span>Tempo Indeterminado</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="temp_mode"
                    checked={isTemporary}
                    onChange={() => setIsTemporary(true)}
                  />
                  <span>Temporário (com data de revisão)</span>
                </label>
              </div>

              {isTemporary && (
                <div className="pt-1">
                  <label className="block font-bold text-slate-700 mb-1">Data limite para revisão *</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={blockedUntil}
                    onChange={e => setBlockedUntil(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium text-slate-800"
                  />
                </div>
              )}
            </div>
          )}

          {/* Botões do Rodapé */}
          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                type === 'block' ? 'bg-rose-600 hover:bg-rose-700' :
                type === 'unblock' ? 'bg-emerald-600 hover:bg-emerald-700' :
                'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {type === 'block' ? 'Confirmar Bloqueio' :
               type === 'unblock' ? 'Confirmar Desbloqueio' :
               type === 'request_whatsapp' ? 'Enviar Solicitação' :
               'Salvar Sinalização'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
