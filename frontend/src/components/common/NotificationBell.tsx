import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Calendar as CalendarIcon, X, Clock, User } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export interface InternalBookingNotification {
  id: string;
  tenantId: string;
  recipientUserId: string;
  category: string;
  establishmentMode: 'clinic' | 'studio';
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
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<InternalBookingNotification[]>([]);
  const [justOpenedUnreadIds, setJustOpenedUnreadIds] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!canUseNotifications) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await ApiClient.get<{ unreadCount: number }>('/v1/internal-notifications/unread-count');
      if (typeof res?.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch {
      // Silencioso para não interferir na navegação
    }
  }, [canUseNotifications]);

  // Limpa estado ao trocar de usuário ou estabelecimento
  useEffect(() => {
    setIsOpen(false);
    setNotifications([]);
    setJustOpenedUnreadIds([]);
    setUnreadCount(0);
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
    try {
      const data = await ApiClient.get<{
        notifications: InternalBookingNotification[];
        unreadCount: number;
      }>('/v1/internal-notifications?limit=30');

      const items = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(items);

      const presentedUnreadIds = items.filter(n => !n.readAt).map(n => n.id);
      setJustOpenedUnreadIds(presentedUnreadIds);

      if (presentedUnreadIds.length > 0) {
        const markRes = await ApiClient.post<{ updated: number; unreadCount: number }>(
          '/v1/internal-notifications/mark-read',
          { notificationIds: presentedUnreadIds }
        );
        setUnreadCount(typeof markRes?.unreadCount === 'number' ? markRes.unreadCount : 0);
      } else {
        setUnreadCount(typeof data?.unreadCount === 'number' ? data.unreadCount : 0);
      }
    } catch {
      // Silencioso para não interromper o uso do sistema
    } finally {
      setLoading(false);
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

  if (!canUseNotifications) return null;

  return (
    <div ref={containerRef} className="relative flex items-center shrink-0">
      <button
        type="button"
        onClick={handleTogglePanel}
        aria-label={
          unreadCount > 0
            ? `Notificações (${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'})`
            : 'Notificações'
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Notificações de agendamentos públicos"
        data-testid="navbar-notifications-bell"
        className={`relative flex items-center justify-center p-1.5 sm:px-2 sm:py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
          isOpen
            ? 'text-slate-900 bg-slate-200/70'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
        }`}
      >
        <Bell
          className={`w-3.5 h-3.5 shrink-0 ${
            unreadCount > 0 ? 'text-teal-700' : 'text-slate-400'
          }`}
        />
        {unreadCount > 0 && (
          <span
            data-testid="navbar-notifications-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-teal-600 text-white text-[9px] font-bold leading-none flex items-center justify-center ring-2 ring-[#fafbfc]"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notificações de agendamentos públicos"
          data-testid="navbar-notifications-panel"
          className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[400px] max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl border border-slate-200 shadow-xl z-[9970] overflow-hidden flex flex-col"
        >
          {/* Cabeçalho do Painel */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs font-extrabold text-slate-900 truncate">
                Notificações
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Agendamentos concluídos pelo link público
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
          <div className="max-h-[70vh] sm:max-h-[420px] overflow-y-auto divide-y divide-slate-100 [scrollbar-width:thin]">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                Carregando notificações...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-8 text-center space-y-1.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Bell className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-slate-600">
                  Nenhuma notificação por enquanto
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Quando um {currentTenant?.establishment_profile === 'studio' ? 'aluno' : 'paciente'} concluir um agendamento pelo link público, ele aparecerá aqui.
                </p>
              </div>
            ) : (
              notifications.map(item => {
                const isHighlightedAsNew = justOpenedUnreadIds.includes(item.id) || !item.readAt;
                const isStudio = item.establishmentMode === 'studio';

                return (
                  <div
                    key={item.id}
                    data-testid={`notification-item-${item.id}`}
                    className={`p-3.5 transition-colors space-y-2 min-w-0 ${
                      isHighlightedAsNew ? 'bg-teal-50/45' : 'bg-white hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                            isStudio
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-teal-50 text-teal-700 border-teal-200'
                          }`}
                        >
                          {isStudio ? 'Novo agendamento — Studio' : 'Novo agendamento — Clínica'}
                        </span>
                        {isHighlightedAsNew && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-teal-600 text-white text-[9px] font-bold shrink-0">
                            Nova
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                        {item.createdAtLabel}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-slate-900 leading-snug break-words">
                      {item.summary}
                    </p>

                    <div className="text-[11px] text-slate-600 space-y-0.5 bg-slate-50/90 border border-slate-100 rounded-xl px-2.5 py-2">
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

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[10px] text-slate-400 truncate">
                        Solicitado em {item.createdAtLabel}
                      </span>
                      {item.appointmentId && (
                        <button
                          type="button"
                          onClick={() => handleViewOnCalendar(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200/80 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                        >
                          <CalendarIcon className="w-3 h-3 shrink-0" />
                          <span>Ver na agenda</span>
                        </button>
                      )}
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
