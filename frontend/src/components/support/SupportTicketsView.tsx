import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  LifeBuoy,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Send,
  User,
  Building,
  Laptop,
  ArrowLeft,
  Filter,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { SupportTicket, SupportTicketMessage } from '../../types';

export const SupportTicketsView: React.FC = () => {
  const { showToast } = useToast();
  const { currentUser, isSuperAdmin, isClinicAdmin } = useAuth();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<{ ticket: SupportTicket; messages: SupportTicketMessage[] } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Envio de nova resposta
  const [replyMessage, setReplyMessage] = useState<string>('');
  const [sendingReply, setSendingReply] = useState<boolean>(false);

  // Modal Novo Chamado
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('doubt');
  const [newPriority, setNewPriority] = useState<string>('medium');
  const [newDescription, setNewDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterPriority) params.append('priority', filterPriority);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await ApiClient.get<SupportTicket[]>(`/v1/support/tickets${queryString}`);
      setTickets(data);
    } catch (err: any) {
      showToast('Erro ao carregar chamados de suporte', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [filterStatus, filterPriority]);

  const loadTicketDetails = async (ticketId: string) => {
    try {
      setLoadingDetails(true);
      setSelectedTicketId(ticketId);
      const data = await ApiClient.get<{ ticket: SupportTicket; messages: SupportTicketMessage[] }>(
        `/v1/support/tickets/${ticketId}`
      );
      setTicketDetails(data);
    } catch (err: any) {
      showToast('Erro ao carregar detalhes do chamado', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicketId || !replyMessage.trim()) return;
    try {
      setSendingReply(true);
      await ApiClient.post(`/v1/support/tickets/${selectedTicketId}/messages`, {
        message: replyMessage.trim()
      });
      setReplyMessage('');
      showToast('Resposta enviada com sucesso!', 'success');
      loadTicketDetails(selectedTicketId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao enviar resposta', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const handleChangeStatus = async (newStatus: string) => {
    if (!selectedTicketId) return;
    try {
      await ApiClient.patch(`/v1/support/tickets/${selectedTicketId}/status`, {
        status: newStatus
      });
      showToast(`Status alterado para ${getStatusLabel(newStatus)}`, 'success');
      loadTicketDetails(selectedTicketId);
      fetchTickets();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
  };

  const handleCreateTicket = async () => {
    if (!newTitle.trim() || !newDescription.trim()) {
      showToast('Preencha título e mensagem do chamado', 'error');
      return;
    }
    try {
      setSubmitting(true);
      const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      const platform = (window as any).Capacitor?.isNativePlatform?.() || isMobile ? 'Mobile' : 'Web';

      await ApiClient.post('/v1/support/tickets', {
        title: newTitle.trim(),
        category: newCategory,
        priority: newPriority,
        description: newDescription.trim(),
        platform,
        appVersion: '1.1.2'
      });

      showToast('Chamado de suporte aberto com sucesso!', 'success');
      setShowNewModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewCategory('doubt');
      setNewPriority('medium');
      fetchTickets();
    } catch (err: any) {
      showToast(err.message || 'Erro ao abrir chamado', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Aberto';
      case 'in_analysis': return 'Em Análise';
      case 'in_progress': return 'Em Atendimento';
      case 'resolved': return 'Resolvido';
      case 'closed': return 'Fechado';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'in_analysis': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'resolved': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'closed': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent': return <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-200">Urgente</span>;
      case 'high': return <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-[10px] font-bold border border-orange-200">Alta</span>;
      case 'medium': return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-medium border border-blue-200">Média</span>;
      case 'low': return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-medium border border-slate-200">Baixa</span>;
      default: return null;
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.user_name && t.user_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Central de Chamados & Suporte</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Envie dúvidas, relate incidentes técnicos ou solicite suporte especializado diretamente para a equipe técnica da Zemda.
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Abrir Novo Chamado
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ticket List (Left / Mobile) */}
        <div className={`space-y-4 ${selectedTicketId ? 'hidden lg:block lg:col-span-5' : 'col-span-12'}`}>
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar chamados..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-slate-50 font-medium text-slate-700"
              >
                <option value="">Todos os Status</option>
                <option value="open">Abertos</option>
                <option value="in_analysis">Em Análise</option>
                <option value="in_progress">Em Atendimento</option>
                <option value="resolved">Resolvidos</option>
                <option value="closed">Fechados</option>
              </select>

              <select
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
                className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-slate-50 font-medium text-slate-700"
              >
                <option value="">Todas as Prioridades</option>
                <option value="urgent">Urgente</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>
          </div>

          {/* Tickets Cards */}
          <div className="space-y-2.5">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Carregando chamados...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-400">
                Nenhum chamado encontrado.
              </div>
            ) : (
              filteredTickets.map(ticket => {
                const isSelected = ticket.id === selectedTicketId;
                return (
                  <div
                    key={ticket.id}
                    onClick={() => loadTicketDetails(ticket.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50/50 border-teal-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getStatusColor(ticket.status)}`}>
                        {getStatusLabel(ticket.status)}
                      </span>
                      {getPriorityBadge(ticket.priority)}
                    </div>

                    <h4 className="font-bold text-slate-900 text-xs line-clamp-1">{ticket.title}</h4>
                    <p className="text-slate-500 text-[11px] mt-1 line-clamp-2 leading-relaxed">{ticket.description}</p>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <User className="w-3 h-3 text-slate-400" />
                        {ticket.user_name || 'Usuário'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Ticket Conversation / Details Panel (Right) */}
        {selectedTicketId && (
          <div className="col-span-12 lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-[500px]">
            {loadingDetails || !ticketDetails ? (
              <div className="p-12 text-center text-xs text-slate-400 m-auto">Carregando detalhes do chamado...</div>
            ) : (
              <>
                {/* Panel Header */}
                <div className="p-5 border-b border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => setSelectedTicketId(null)}
                      className="lg:hidden flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
                    >
                      <ArrowLeft className="w-4 h-4" /> Voltar
                    </button>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getStatusColor(ticketDetails.ticket.status)}`}>
                        {getStatusLabel(ticketDetails.ticket.status)}
                      </span>
                      {getPriorityBadge(ticketDetails.ticket.priority)}
                    </div>

                    {/* Status Changer for Admins */}
                    {(isClinicAdmin || isSuperAdmin) && (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-slate-500 hidden sm:inline">Status:</label>
                        <select
                          value={ticketDetails.ticket.status}
                          onChange={e => handleChangeStatus(e.target.value)}
                          className="text-xs border border-slate-200 rounded-xl px-2 py-1 bg-white font-semibold text-slate-800"
                        >
                          <option value="open">Aberto</option>
                          <option value="in_analysis">Em Análise</option>
                          <option value="in_progress">Em Atendimento</option>
                          <option value="resolved">Resolvido</option>
                          <option value="closed">Fechado</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900">{ticketDetails.ticket.title}</h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-500">
                      <span>Autor: <strong className="text-slate-700">{ticketDetails.ticket.user_name}</strong></span>
                      {ticketDetails.ticket.clinic_name && (
                        <span>Clínica: <strong className="text-slate-700">{ticketDetails.ticket.clinic_name}</strong></span>
                      )}
                      <span>Plataforma: <strong className="text-slate-700">{ticketDetails.ticket.platform || 'Web'}</strong></span>
                      <span>Versão: <strong className="text-slate-700">{ticketDetails.ticket.app_version || '1.1.2'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Conversation Timeline */}
                <div className="p-5 flex-1 overflow-y-auto space-y-4 max-h-[420px]">
                  {/* Original Description */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-bold text-slate-700">{ticketDetails.ticket.user_name} (Abertura)</span>
                      <span>{new Date(ticketDetails.ticket.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {ticketDetails.ticket.description}
                    </p>
                  </div>

                  {/* Messages */}
                  {ticketDetails.messages.map(msg => {
                    const isOwnMessage = msg.user_id === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
                      >
                        <div className="text-[10px] text-slate-400 mb-1 px-1">
                          <span className="font-semibold text-slate-600">{msg.sender_name}</span>
                          <span className="ml-1.5 font-normal">({new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})</span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                            isOwnMessage
                              ? 'bg-teal-600 text-white shadow-2xs rounded-tr-none'
                              : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Composer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center gap-2">
                  <input
                    type="text"
                    value={replyMessage}
                    onChange={e => setReplyMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder="Escreva uma resposta..."
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={sendingReply || !replyMessage.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal Novo Chamado */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Abrir Novo Chamado de Suporte</h3>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título / Assunto *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Ex: Dúvida sobre conciliação de pagamentos"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                  >
                    <option value="doubt">Dúvida Operacional</option>
                    <option value="technical">Problema Técnico / Erro</option>
                    <option value="feature_request">Sugestão de Recurso</option>
                    <option value="billing">Financeiro / Plano</option>
                    <option value="other">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prioridade</label>
                  <select
                    value={newPriority}
                    onChange={e => setNewPriority(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição detalhada *</label>
                <textarea
                  rows={4}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Explique o que aconteceu ou o que precisa de suporte..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateTicket}
                  disabled={submitting}
                  className="px-6 py-2 font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Enviando...' : 'Abrir Chamado'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SupportTicketsView;
