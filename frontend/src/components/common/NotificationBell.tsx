import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Calendar as CalendarIcon, CheckCircle2, Clock, MessageCircle, User, X, AlertTriangle } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export interface InternalBookingNotification {
  id: string;
  tenantId: string;
  recipientUserId: string;
  category: string;
  establishmentMode: 'clinic' | 'studio';
  requestId: string | null;
  requestStatus: 'awaiting_confirmation' | 'confirmed' | 'conflict' | 'cancelled';
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  expiresAt: string | null;
  whatsappPhone: string | null;
  establishmentName: string | null;
  modality: string | null;
  planDurationLabel: string | null;
  weeklyFrequency: number | null;
  title: string;
  summary: string;
  studentOrPatientName: string;
  serviceOrClassName: string;
  weekdaysLabel: string | null;
  timeRangeLabel: string | null;
  startDateLabel: string | null;
  startDateIso: string | null;
  professionalNames: string | null;
  classGroupLabel: string | null;
  sessionsCount: number;
  appointmentId: string | null;
  occurrenceId: string | null;
  seriesId: string | null;
  packageContractId: string | null;
  readAt: string | null;
  createdAt: string;
  createdAtLabel: string;
}

interface BellCountsResponse {
  unreadCount: number;
  activeCount?: number;
  pendingCount?: number;
}

function modalityLabelPt(modality?: string | null): string {
  if (modality === 'online') return 'Online';
  if (modality === 'home') return 'Domiciliar';
  return 'Presencial';
}

export function normalizeWhatsAppDigits(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  let digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (!digits.startsWith('55') || digits.length < 12 || digits.length > 13) {
    return null;
  }
  const ddd = digits.slice(2, 4);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  return digits;
}

export function buildWhatsAppConfirmationUrl(
  item: InternalBookingNotification,
  fallbackEstablishmentName?: string | null
): string | null {
  const digits = normalizeWhatsAppDigits(item.whatsappPhone);
  if (!digits) return null;

  const estName = String(item.establishmentName || fallbackEstablishmentName || 'Zemda').trim();
  const modLabel = modalityLabelPt(item.modality);
  const clientName = String(item.studentOrPatientName || '').trim();
  const serviceName = String(item.serviceOrClassName || '').trim();
  const profNames = String(item.professionalNames || '').trim();
  const dateLabel = String(item.startDateLabel || '').trim();
  const timeLabel = String(item.timeRangeLabel || '').trim();

  let message: string;
  if (item.establishmentMode === 'studio') {
    const isRecurringOrPackage =
      item.sessionsCount > 1 || Boolean(item.planDurationLabel) || Boolean(item.weeklyFrequency);
    if (isRecurringOrPackage) {
      const scheduleParts = [
        item.weekdaysLabel ? `${item.weekdaysLabel}` : '',
        dateLabel ? `início em ${dateLabel}` : '',
        timeLabel ? `às ${timeLabel}` : '',
        item.weeklyFrequency ? `${item.weeklyFrequency}x/semana` : '',
        item.planDurationLabel ? `plano ${item.planDurationLabel}` : ''
      ]
        .filter(Boolean)
        .join(', ');
      message = `Olá, ${clientName}! Seu agendamento de ${serviceName} no(a) ${estName} foi confirmado: ${scheduleParts}${profNames ? `, com ${profNames}` : ''} (${modLabel}). Até lá!`;
    } else {
      message = `Olá, ${clientName}! Seu agendamento para ${serviceName} no(a) ${estName} foi confirmado para ${dateLabel}${timeLabel ? ` às ${timeLabel}` : ''}${profNames ? ` com ${profNames}` : ''} (${modLabel}). Até lá!`;
    }
  } else {
    message = `Olá, ${clientName}! Sua solicitação de atendimento (${serviceName}) na ${estName}${profNames ? ` com ${profNames}` : ''} foi confirmada para o dia ${dateLabel}${timeLabel ? ` às ${timeLabel}` : ''} (${modLabel}). Aguardamos você!`;
  }

  const normalizedMsg = message.replace(/\s+/g, ' ').trim();
  return `https://wa.me/${digits}?text=${encodeURIComponent(normalizedMsg)}`;
}

function isConfirmedExpired(item: InternalBookingNotification, nowMs: number): boolean {
  if (item.requestStatus !== 'confirmed' || !item.expiresAt) return false;
  const expMs = Date.parse(item.expiresAt);
  return !Number.isNaN(expMs) && nowMs >= expMs;
}

function formatRemainingVisibility(expiresAt: string | null, nowMs: number): string | null {
  if (!expiresAt) return null;
  const expMs = Date.parse(expiresAt);
  if (Number.isNaN(expMs)) return null;
  const diffSec = Math.max(0, Math.ceil((expMs - nowMs) / 1000));
  if (diffSec <= 0) return null;
  const mins = Math.ceil(diffSec / 60);
  return mins <= 1 ? 'Visível por menos de 1 min' : `Visível por mais ${mins} min`;
}

interface NotificationBellProps {
  onNavigate: (view: string, subId?: string | null) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onNavigate }) => {
  const {
    currentUser,
    currentTenant,
    isClinicAdmin,
    isProfessional,
    isReceptionist,
    isSuperAdmin,
    isSandboxSession
  } = useAuth();

  const canUseNotifications =
    Boolean(currentUser) &&
    Boolean(currentTenant?.id) &&
    (isClinicAdmin || isProfessional) &&
    !(isReceptionist && !isClinicAdmin && !isProfessional) &&
    (!isSuperAdmin || isSandboxSession);

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<InternalBookingNotification[]>([]);
  const [justOpenedUnreadIds, setJustOpenedUnreadIds] = useState<string[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmErrors, setConfirmErrors] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!canUseNotifications) {
      setUnreadCount(0);
      setActiveCount(0);
      setPendingCount(0);
      return;
    }
    try {
      const res = await ApiClient.get<BellCountsResponse>('/v1/internal-notifications/unread-count');
      const nextUnread = typeof res?.unreadCount === 'number' ? res.unreadCount : 0;
      const nextActive = typeof res?.activeCount === 'number' ? res.activeCount : nextUnread;
      const nextPending = typeof res?.pendingCount === 'number' ? res.pendingCount : 0;
      setUnreadCount(nextUnread);
      setActiveCount(nextActive);
      setPendingCount(nextPending);
    } catch {
      // Silencioso para não interferir na navegação
    }
  }, [canUseNotifications]);

  // Limpa estado ao trocar de usuário ou estabelecimento
  useEffect(() => {
    setIsOpen(false);
    setNotifications([]);
    setJustOpenedUnreadIds([]);
    setConfirmingId(null);
    setConfirmErrors({});
    setUnreadCount(0);
    setActiveCount(0);
    setPendingCount(0);
    if (canUseNotifications) {
      fetchUnreadCount();
    }
  }, [currentTenant?.id, currentUser?.id, canUseNotifications, fetchUnreadCount]);

  // Polling discreto compatível com a arquitetura atual + atualização em foco
  useEffect(() => {
    if (!canUseNotifications) return;

    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    }, 15000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    };
    const handleRefreshEvent = () => {
      fetchUnreadCount();
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('zemda-internal-notifications-refresh', handleRefreshEvent);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('zemda-internal-notifications-refresh', handleRefreshEvent);
    };
  }, [canUseNotifications, fetchUnreadCount]);

  // Atualiza relógio local para remover automaticamente confirmadas após 10 min exatos
  useEffect(() => {
    const hasConfirmedTimed = notifications.some(n => n.requestStatus === 'confirmed' && Boolean(n.expiresAt));
    if (!isOpen && !hasConfirmedTimed && activeCount <= 0) return;

    const interval = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      setNotifications(prev => {
        const filtered = prev.filter(item => !isConfirmedExpired(item, current));
        if (filtered.length !== prev.length) {
          fetchUnreadCount();
        }
        return filtered;
      });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [isOpen, notifications, activeCount, fetchUnreadCount]);

  // Fecha o painel ao clicar fora ou pressionar Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleTogglePanel = async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    setLoading(true);
    setNowMs(Date.now());
    try {
      const data = await ApiClient.get<{
        notifications: InternalBookingNotification[];
        unreadCount: number;
        activeCount?: number;
        pendingCount?: number;
      }>('/v1/internal-notifications?limit=30');

      const items = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(items);

      const presentedUnreadIds = items.filter(n => !n.readAt).map(n => n.id);
      setJustOpenedUnreadIds(presentedUnreadIds);

      if (presentedUnreadIds.length > 0) {
        const markRes = await ApiClient.post<{
          updated: number;
          unreadCount: number;
          activeCount?: number;
          pendingCount?: number;
        }>('/v1/internal-notifications/mark-read', { notificationIds: presentedUnreadIds });
        setUnreadCount(typeof markRes?.unreadCount === 'number' ? markRes.unreadCount : 0);
        if (typeof markRes?.activeCount === 'number') setActiveCount(markRes.activeCount);
        if (typeof markRes?.pendingCount === 'number') setPendingCount(markRes.pendingCount);
      } else {
        setUnreadCount(typeof data?.unreadCount === 'number' ? data.unreadCount : 0);
        if (typeof data?.activeCount === 'number') setActiveCount(data.activeCount);
        if (typeof data?.pendingCount === 'number') setPendingCount(data.pendingCount);
      }
    } catch {
      // Silencioso para não interromper o uso do sistema
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRequest = async (item: InternalBookingNotification) => {
    if (confirmingId) return;
    setConfirmingId(item.id);
    setConfirmErrors(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    try {
      const res = await ApiClient.post<{
        success: boolean;
        notification: InternalBookingNotification | null;
        unreadCount?: number;
        activeCount?: number;
        pendingCount?: number;
      }>(`/v1/internal-notifications/${encodeURIComponent(item.id)}/confirm`, {});

      setNowMs(Date.now());
      if (res?.notification) {
        setNotifications(prev => prev.map(n => (n.id === item.id ? res.notification! : n)));
      }
      if (typeof res?.unreadCount === 'number') setUnreadCount(res.unreadCount);
      if (typeof res?.activeCount === 'number') setActiveCount(res.activeCount);
      if (typeof res?.pendingCount === 'number') setPendingCount(res.pendingCount);

      window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
    } catch (err: any) {
      setConfirmErrors(prev => ({
        ...prev,
        [item.id]: err?.message || 'Não foi possível confirmar esta solicitação. Verifique a disponibilidade na agenda.'
      }));
    } finally {
      setConfirmingId(null);
    }
  };

  const handleViewOnCalendar = (item: InternalBookingNotification) => {
    const focusPayload = {
      appointmentId: item.appointmentId || null,
      startTime: item.startDateIso || null,
      date: item.startDateIso || null
    };
    try {
      sessionStorage.setItem('zemda_focus_appointment', JSON.stringify(focusPayload));
    } catch {}

    setIsOpen(false);
    onNavigate('calendar');
    window.dispatchEvent(new CustomEvent('zemda-focus-appointment', { detail: focusPayload }));
  };

  const visibleNotifications = notifications.filter(item => !isConfirmedExpired(item, nowMs));
  const badgeNumber = unreadCount > 0 ? unreadCount : pendingCount > 0 ? pendingCount : 0;

  if (!canUseNotifications || (activeCount <= 0 && unreadCount <= 0 && !isOpen)) return null;

  return (
    <div ref={containerRef} className="relative flex items-center shrink-0">
      <button
        type="button"
        onClick={handleTogglePanel}
        aria-label={
          badgeNumber > 0
            ? `Notificações (${badgeNumber} pendente${badgeNumber === 1 ? '' : 's'})`
            : 'Notificações'
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Notificações de solicitações pelo link público"
        data-testid="navbar-notifications-bell"
        className={`relative flex items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
          isOpen
            ? 'text-slate-900 bg-slate-200/70'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
        }`}
      >
        <Bell
          className={`w-3.5 h-3.5 shrink-0 ${
            pendingCount > 0 ? 'text-amber-600' : unreadCount > 0 || activeCount > 0 ? 'text-teal-700' : 'text-slate-400'
          }`}
        />
        {badgeNumber > 0 && (
          <span
            data-testid="navbar-notifications-badge"
            className={`absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full text-white text-[9px] font-bold leading-none flex items-center justify-center ring-2 ring-[#fafbfc] ${
              pendingCount > 0 ? 'bg-amber-600' : 'bg-teal-600'
            }`}
          >
            {badgeNumber > 99 ? '99+' : badgeNumber}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notificações de agendamentos públicos"
          data-testid="navbar-notifications-panel"
          className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[420px] max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl border border-slate-200 shadow-xl z-[9970] overflow-hidden flex flex-col"
        >
          {/* Cabeçalho do Painel */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs font-extrabold text-slate-900 truncate">
                Notificações
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Solicitações recebidas pelo link público
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Fechar notificações"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Lista de Notificações */}
          <div className="max-h-[70vh] sm:max-h-[440px] overflow-y-auto divide-y divide-slate-100 [scrollbar-width:thin]">
            {loading && visibleNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                Carregando notificações...
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="px-5 py-8 text-center space-y-1.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Bell className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-slate-600">
                  Nenhuma solicitação pendente ou recente
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Quando um {currentTenant?.establishment_profile === 'studio' ? 'aluno' : 'paciente'} solicitar um agendamento pelo link público, ele aparecerá aqui para confirmação.
                </p>
              </div>
            ) : (
              visibleNotifications.map(item => {
                const isHighlightedAsNew = justOpenedUnreadIds.includes(item.id) || !item.readAt;
                const isStudio = item.establishmentMode === 'studio';
                const isPending = item.requestStatus === 'awaiting_confirmation';
                const isConfirmed = item.requestStatus === 'confirmed';
                const isConfirmingThis = confirmingId === item.id;
                const cardError = confirmErrors[item.id];
                const whatsappUrl = isConfirmed
                  ? buildWhatsAppConfirmationUrl(item, currentTenant?.trade_name || currentTenant?.name)
                  : null;
                const remainingVisibility = isConfirmed
                  ? formatRemainingVisibility(item.expiresAt, nowMs)
                  : null;

                return (
                  <div
                    key={item.id}
                    data-testid={`notification-item-${item.id}`}
                    className={`p-3.5 transition-colors space-y-2 min-w-0 ${
                      isPending && isHighlightedAsNew
                        ? 'bg-amber-50/45'
                        : isConfirmed
                        ? 'bg-emerald-50/30'
                        : 'bg-white hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span
                          data-testid={`notification-status-${item.id}`}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                            isPending
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {isPending ? 'Aguardando confirmação' : 'Confirmado'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                            isStudio
                              ? 'bg-emerald-50/60 text-emerald-700 border-emerald-200/70'
                              : 'bg-teal-50/60 text-teal-700 border-teal-200/70'
                          }`}
                        >
                          {isStudio ? 'Studio' : 'Clínica'}
                        </span>
                        {isPending && isHighlightedAsNew && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-teal-600 text-white text-[9px] font-bold shrink-0">
                            Nova
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                        {item.createdAtLabel}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-extrabold text-slate-900 leading-snug break-words">
                        {item.title}
                      </p>
                      <p className="text-[11px] font-medium text-slate-600 leading-snug break-words mt-0.5">
                        {item.summary}
                      </p>
                    </div>

                    <div className="text-[11px] text-slate-600 space-y-0.5 bg-slate-50/90 border border-slate-100 rounded-xl px-2.5 py-2">
                      <p className="break-words">
                        <span className="font-semibold text-slate-700">
                          {isStudio ? 'Aluno:' : 'Paciente:'}
                        </span>{' '}
                        {item.studentOrPatientName}
                      </p>
                      <p className="break-words">
                        <span className="font-semibold text-slate-700">
                          {isStudio ? 'Aula / Plano:' : 'Serviço:'}
                        </span>{' '}
                        {item.serviceOrClassName}
                      </p>
                      {item.establishmentName && (
                        <p className="break-words">
                          <span className="font-semibold text-slate-700">Estabelecimento:</span>{' '}
                          {item.establishmentName}
                        </p>
                      )}
                      {item.modality && (
                        <p className="break-words">
                          <span className="font-semibold text-slate-700">Modalidade:</span>{' '}
                          {modalityLabelPt(item.modality)}
                        </p>
                      )}
                      {isStudio ? (
                        <>
                          {item.weekdaysLabel && (
                            <p className="break-words">
                              <span className="font-semibold text-slate-700">Dias:</span> {item.weekdaysLabel}
                            </p>
                          )}
                          {item.timeRangeLabel && (
                            <p className="break-words">
                              <span className="font-semibold text-slate-700">Horário:</span> {item.timeRangeLabel}
                            </p>
                          )}
                          {item.weeklyFrequency && (
                            <p className="break-words">
                              <span className="font-semibold text-slate-700">Frequência:</span>{' '}
                              {item.weeklyFrequency}x por semana
                            </p>
                          )}
                          {item.planDurationLabel && (
                            <p className="break-words">
                              <span className="font-semibold text-slate-700">Duração do plano:</span>{' '}
                              {item.planDurationLabel}
                            </p>
                          )}
                          {item.professionalNames && (
                            <p className="break-words flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>
                                <strong className="font-semibold text-slate-700">Instrutor:</strong>{' '}
                                {item.professionalNames}
                              </span>
                            </p>
                          )}
                          {item.startDateLabel && (
                            <p className="break-words">
                              <span className="font-semibold text-slate-700">Início:</span> {item.startDateLabel}
                            </p>
                          )}
                          {item.classGroupLabel && (
                            <p className="break-words">
                              <span className="font-semibold text-slate-700">Turma / Sessões:</span>{' '}
                              {item.classGroupLabel}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {item.startDateLabel && (
                            <p className="break-words">
                              <span className="font-semibold text-slate-700">Data:</span> {item.startDateLabel}
                            </p>
                          )}
                          {item.timeRangeLabel && (
                            <p className="break-words flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>
                                <strong className="font-semibold text-slate-700">Horário:</strong>{' '}
                                {item.timeRangeLabel}
                              </span>
                            </p>
                          )}
                          {item.professionalNames && (
                            <p className="break-words flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>
                                <strong className="font-semibold text-slate-700">Profissional:</strong>{' '}
                                {item.professionalNames}
                              </span>
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {cardError && (
                      <div
                        role="alert"
                        data-testid={`notification-error-${item.id}`}
                        className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] font-medium text-rose-800"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span>{cardError}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 truncate">
                        {isConfirmed && remainingVisibility
                          ? remainingVisibility
                          : `Solicitado em ${item.createdAtLabel}`}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {isPending && (
                          <button
                            type="button"
                            disabled={Boolean(confirmingId)}
                            onClick={() => handleConfirmRequest(item)}
                            data-testid={`notification-confirm-${item.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{isConfirmingThis ? 'Confirmando...' : 'Confirmar'}</span>
                          </button>
                        )}

                        {isConfirmed && item.appointmentId && (
                          <button
                            type="button"
                            onClick={() => handleViewOnCalendar(item)}
                            data-testid={`notification-calendar-${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200/80 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                          >
                            <CalendarIcon className="w-3 h-3 shrink-0" />
                            <span>Ver na agenda</span>
                          </button>
                        )}

                        {isConfirmed && whatsappUrl && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`notification-whatsapp-${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors shrink-0"
                          >
                            <MessageCircle className="w-3 h-3 shrink-0" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
