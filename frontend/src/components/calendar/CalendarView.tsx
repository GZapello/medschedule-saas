import { TeleconsultationModal } from './TeleconsultationModal';
import { openTeleconsultation } from '../../utils/teleconsultation';
import { ConsentPendingAlert } from '../consents/ConsentPendingAlert';
import { PatientConsentsDialog } from '../consents/PatientConsentsPanel';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Appointment, Professional, Room, Service } from '../../types';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Filter,
  Clock,
  User,
  Video,
  MapPin,
  Calendar as CalendarIcon,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  Stethoscope,
  Ban,
  Phone,
  History,
  FileText,
  Settings2
} from 'lucide-react';
import { FinishConsultationModal } from '../clinical/FinishConsultationModal';
import { AppointmentConsultation } from '../clinical/AppointmentConsultation';
import { OnlineConsultationTools } from '../clinical/OnlineConsultationTools';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';
import { SelectConsultationModuleModal, getCompatibleClinicalModules, getModuleForProfession } from '../clinical/SelectConsultationModuleModal';
import { WhatsAppReminderModal, WhatsAppIcon } from '../common/WhatsAppReminderModal';
import { isValidPhoneNumber, formatPhoneDisplay, openManualWhatsApp } from '../../utils/phone.utils';
import { useMobileLayout } from '../../hooks/useMobileLayout';

interface CalendarViewProps {
  onOpenNewAppointment: (prefill?: { date?: string; time?: string; professionalId?: string }) => void;
  onNavigate?: (view: string, subId?: string | null) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onOpenNewAppointment }) => {
  const mobile = useMobileLayout();
  const [consentPatientId, setConsentPatientId] = useState<string | null>(null);
  const auth = useAuth();
  const { currentTenant, clientTermLabel } = auth;
  const { showToast } = useToast();

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'));
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  useEffect(() => { if (mobile) setViewMode('day'); }, [mobile]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Identifica o ID do profissional vinculado ao usuário logado (se role="professional")
  const userProfessionalId = useMemo(() => {
    if (!auth.isProfessional) return null;
    if (auth.currentUser?.professionalId) return auth.currentUser.professionalId;
    if (auth.currentUser?.id && professionals.length > 0) {
      const match = professionals.find(p => (p as any).user_id === auth.currentUser?.id);
      if (match) return match.id;
    }
    return null;
  }, [auth.isProfessional, auth.currentUser?.professionalId, auth.currentUser?.id, professionals]);

  // Filtros: profissional logado assume automaticamente a própria agenda; clinic_admin inicia em 'all'
  const [selectedProf, setSelectedProf] = useState<string>(() => {
    if (auth.isProfessional && auth.currentUser?.professionalId) {
      return auth.currentUser.professionalId;
    }
    return 'all';
  });
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedProfSchedule, setSelectedProfSchedule] = useState<{ schedules: any[]; blockedTimes: any[] } | null>(null);

  // Sincroniza selectedProf se o usuário for profissional e o ID for resolvido assincronamente
  useEffect(() => {
    if (auth.isProfessional && userProfessionalId) {
      setSelectedProf(prev => (prev === 'all' ? userProfessionalId : prev));
    }
  }, [auth.isProfessional, userProfessionalId]);

  const fetchSelectedProfSchedule = useCallback((profId: string) => {
    if (profId && profId !== 'all') {
      ApiClient.get<any>(`/v1/professionals/${profId}`)
        .then(res => {
          setSelectedProfSchedule({
            schedules: (res.schedules || []).map((s: any) => ({
              ...s,
              day_of_week: Number(s.day_of_week),
              is_active: Boolean(s.is_active)
            })),
            blockedTimes: res.blockedTimes || []
          });
        })
        .catch(err => {
          console.warn('[CalendarView] Erro ao carregar escala do profissional:', err);
          setSelectedProfSchedule(null);
        });
    } else {
      setSelectedProfSchedule(null);
    }
  }, []);

  useEffect(() => {
    fetchSelectedProfSchedule(selectedProf);
  }, [selectedProf, fetchSelectedProfSchedule]);

  const selectedProfRef = React.useRef(selectedProf);
  useEffect(() => {
    selectedProfRef.current = selectedProf;
  }, [selectedProf]);

  const getSlotAvailability = useCallback((dateStr: string, timeSlot: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayOfWeek = dateObj.getUTCDay();

    const parseMin = (t: string) => {
      if (!t || t.length < 5) return 0;
      return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10);
    };

    const slotMinutes = parseMin(timeSlot);
    const slotDuration = 30;
    const slotEndMinutes = slotMinutes + slotDuration;
    const slotDateTimeStr = `${dateStr}T${timeSlot}:00`;

    // Função interna: avalia a disponibilidade de um profissional para este slot
    const evalProf = (pScheds: any[], pBlocked: any[]) => {
      const activeScheds = (pScheds || []).filter(
        (s: any) => Number(s.day_of_week) === Number(dayOfWeek) && Boolean(s.is_active)
      );

      // Dia sem expediente deste profissional
      if (activeScheds.length === 0) {
        return {
          hasSchedule: false,
          working: false,
          inBreak: false,
          isBlocked: false,
          reason: 'Folga / Sem escala'
        };
      }

      let earliestStart = 24 * 60;
      let latestEnd = 0;
      for (const s of activeScheds) {
        if (s.start_time) {
          const sm = parseMin(s.start_time);
          if (sm < earliestStart) earliestStart = sm;
        }
        if (s.end_time) {
          const em = parseMin(s.end_time);
          if (em > latestEnd) latestEnd = em;
        }
      }

      // Horário antes de start_time ou depois de end_time
      if (slotMinutes < earliestStart || slotMinutes >= latestEnd) {
        return {
          hasSchedule: true,
          working: false,
          inBreak: false,
          isBlocked: false,
          reason: 'Fora da escala'
        };
      }

      // Bloqueios pontuais (férias, atestado, bloqueio de agenda)
      let isBlocked = false;
      if (Array.isArray(pBlocked)) {
        isBlocked = pBlocked.some((b: any) => {
          const bStart = (b.start_datetime || '').slice(0, 19);
          const bEnd = (b.end_datetime || '').slice(0, 19);
          return slotDateTimeStr >= bStart && slotDateTimeStr < bEnd;
        });
      }

      if (isBlocked) {
        return {
          hasSchedule: true,
          working: false,
          inBreak: false,
          isBlocked: true,
          reason: 'Bloqueado'
        };
      }

      let inWorkingShift = false;
      let inBreak = false;

      for (const sched of activeScheds) {
        if (!sched.start_time || !sched.end_time) continue;
        const startMin = parseMin(sched.start_time);
        const endMin = parseMin(sched.end_time);

        if (slotMinutes >= startMin && slotEndMinutes <= endMin) {
          if (sched.break_start && sched.break_end) {
            const bStart = parseMin(sched.break_start);
            const bEnd = parseMin(sched.break_end);
            if (slotMinutes < bEnd && slotEndMinutes > bStart) {
              inBreak = true;
            } else {
              inWorkingShift = true;
            }
          } else {
            inWorkingShift = true;
          }
        }
      }

      // Intervalo entre turnos no mesmo dia (ex: turno manhã até 12:00 e turno tarde a partir de 13:30)
      if (!inWorkingShift && !inBreak && slotMinutes >= earliestStart && slotMinutes < latestEnd) {
        inBreak = true;
      }

      if (inWorkingShift) {
        return {
          hasSchedule: true,
          working: true,
          inBreak: false,
          isBlocked: false,
          reason: 'Disponível'
        };
      }

      if (inBreak) {
        return {
          hasSchedule: true,
          working: false,
          inBreak: true,
          isBlocked: false,
          reason: 'Intervalo'
        };
      }

      return {
        hasSchedule: true,
        working: false,
        inBreak: false,
        isBlocked: false,
        reason: 'Fora da escala'
      };
    };

    // Caso 1: Profissional Específico
    if (selectedProf && selectedProf !== 'all') {
      const profFromList = professionals.find(p => p.id === selectedProf);
      const schedules = (selectedProfSchedule?.schedules && selectedProfSchedule.schedules.length > 0)
        ? selectedProfSchedule.schedules
        : (profFromList as any)?.schedules || [];
      const blockedTimes = (selectedProfSchedule?.blockedTimes && selectedProfSchedule.blockedTimes.length > 0)
        ? selectedProfSchedule.blockedTimes
        : (profFromList as any)?.blockedTimes || [];

      if (schedules.length === 0 && !selectedProfSchedule) {
        return { available: true };
      }

      const st = evalProf(schedules, blockedTimes);
      if (st.working) {
        return { available: true };
      }

      return {
        available: false,
        reason: st.reason,
        isBreak: st.inBreak,
        isBlocked: st.isBlocked
      };
    }

    // Caso 2: Modo "Todos os Profissionais"
    const activeProfs = professionals.filter(p => p.active === 1 || (p.active as any) === true);
    if (activeProfs.length === 0) return { available: true };

    let anyWorking = false;
    let anyInBreak = false;
    let anyBlocked = false;
    let anyHasScheduleOnDay = false;

    for (const p of activeProfs) {
      const pScheds = (p as any).schedules || [];
      const pBlocked = (p as any).blockedTimes || [];

      const st = evalProf(pScheds, pBlocked);

      if (st.hasSchedule) {
        anyHasScheduleOnDay = true;
      }
      if (st.working) {
        anyWorking = true;
        break; // Pelo menos um profissional trabalhando -> horário disponível
      }
      if (st.inBreak) {
        anyInBreak = true;
      }
      if (st.isBlocked) {
        anyBlocked = true;
      }
    }

    // - se pelo menos UM profissional estiver trabalhando -> disponível
    if (anyWorking) {
      return { available: true };
    }

    // - dia sem expediente -> "Folga / Sem escala"
    if (!anyHasScheduleOnDay) {
      return { available: false, reason: 'Folga / Sem escala' };
    }

    // - se nenhum estiver trabalhando, mas houver profissionais em intervalo -> "Intervalo"
    if (anyInBreak) {
      return { available: false, reason: 'Intervalo', isBreak: true };
    }

    // - blockedTimes -> "Bloqueado"
    if (anyBlocked) {
      return { available: false, reason: 'Bloqueado', isBlocked: true };
    }

    // - somente mostrar “Fora da escala” quando realmente estiver fora de todos os turnos
    return { available: false, reason: 'Fora da escala' };
  }, [selectedProf, selectedProfSchedule, professionals]);

  // Modal de Detalhes
  const [teleAppt, setTeleAppt] = useState<Appointment | null>(null);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [showManageMenu, setShowManageMenu] = useState<boolean>(false);
  const [showCommsHistory, setShowCommsHistory] = useState<boolean>(false);
  const [viewingRecordsAppt, setViewingRecordsAppt] = useState<Appointment | null>(null);
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('');
  const [rescheduleSlots, setRescheduleSlots] = useState<any[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState<boolean>(false);

  // Ajuste de Horário Real do Atendimento
  const [isEditingAttendanceTime, setIsEditingAttendanceTime] = useState<boolean>(false);
  const [editAttendanceDate, setEditAttendanceDate] = useState<string>('');
  const [editAttendanceStartTime, setEditAttendanceStartTime] = useState<string>('');
  const [editAttendanceExpectedEndTime, setEditAttendanceExpectedEndTime] = useState<string>('');
  const [editAttendanceEndTime, setEditAttendanceEndTime] = useState<string>('');
  const [savingAttendanceTime, setSavingAttendanceTime] = useState<boolean>(false);

  const extractDateFromIso = (iso?: string | null): string => {
    if (!iso) return '';
    return String(iso).trim().replace(' ', 'T').split('T')[0] || '';
  };

  const extractTimeFromIso = (iso?: string | null): string => {
    if (!iso) return '';
    const trimmed = String(iso).trim();
    if (/^\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 5);
    const parts = trimmed.replace(' ', 'T').split('T');
    return parts[1] ? parts[1].slice(0, 5) : '';
  };

  const addMinutesToTimeStr = (timeStr: string, minutesToAdd: number): string => {
    if (!timeStr || !/^\d{2}:\d{2}/.test(timeStr)) return '';
    const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
    const total = ((h * 60 + m + (Number(minutesToAdd) || 50)) % (24 * 60) + 24 * 60) % (24 * 60);
    const outH = String(Math.floor(total / 60)).padStart(2, '0');
    const outM = String(total % 60).padStart(2, '0');
    return `${outH}:${outM}`;
  };

  const openAttendanceTimeEditor = (appt: Appointment) => {
    const duration = Number(appt.duration_minutes) > 0 ? Number(appt.duration_minutes) : 50;
    const baseDate = extractDateFromIso(appt.attendance_start_at) || extractDateFromIso(appt.start_time);
    const startT = extractTimeFromIso(appt.attendance_start_at) || extractTimeFromIso(appt.start_time) || '14:00';
    const expectedEndT = extractTimeFromIso(appt.attendance_expected_end_at) || addMinutesToTimeStr(startT, duration);
    const actualEndT = extractTimeFromIso(appt.attendance_end_at);

    setEditAttendanceDate(baseDate);
    setEditAttendanceStartTime(startT);
    setEditAttendanceExpectedEndTime(expectedEndT);
    setEditAttendanceEndTime(actualEndT);
    setIsEditingAttendanceTime(true);
  };

  const handleSaveAttendanceTime = async () => {
    if (!selectedAppt || !editAttendanceDate || !editAttendanceStartTime) {
      showToast('Informe a data e o horário real de início do atendimento', 'error');
      return;
    }
    try {
      setSavingAttendanceTime(true);
      const res = await ApiClient.put<any>(`/v1/appointments/${selectedAppt.id}/attendance-time`, {
        attendanceDate: editAttendanceDate,
        attendanceStartTime: editAttendanceStartTime,
        attendanceExpectedEndTime: editAttendanceExpectedEndTime || undefined,
        attendanceEndTime: (selectedAppt.status === 'completed' || selectedAppt.attendance_end_at) ? (editAttendanceEndTime || null) : undefined
      });
      const updatedFields = {
        attendance_start_at: res.attendance_start_at,
        attendance_expected_end_at: res.attendance_expected_end_at,
        attendance_end_at: res.attendance_end_at
      };
      setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? { ...a, ...updatedFields } : a));
      setSelectedAppt(prev => prev ? { ...prev, ...updatedFields } : null);
      setIsEditingAttendanceTime(false);
      showToast('Horário real do atendimento salvo!', 'success');
      notifyAppointmentChange();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar horário do atendimento', 'error');
    } finally {
      setSavingAttendanceTime(false);
    }
  };

  useEffect(() => {
    if (isRescheduling && selectedAppt && rescheduleDate) {
      setLoadingRescheduleSlots(true);
      ApiClient.get<any>(`/v1/slots/available?professionalId=${selectedAppt.professional_id}&serviceId=${selectedAppt.service_id}&date=${rescheduleDate}`)
        .then(data => {
          setRescheduleSlots(data.slots || []);
        })
        .catch(() => {
          setRescheduleSlots([]);
        })
        .finally(() => setLoadingRescheduleSlots(false));
    } else {
      setRescheduleSlots([]);
    }
  }, [isRescheduling, selectedAppt, rescheduleDate]);

  // Modais de Atendimento Rápido, Finalização e Cancelamento Estruturado
  const [activeConsultationAppt, setActiveConsultationAppt] = useState<any | null>(null);
  const [activeConsultationModule, setActiveConsultationModule] = useState<string | undefined>(undefined);
  const [selectingModuleAppt, setSelectingModuleAppt] = useState<Appointment | null>(null);
  const [compatibleModules, setCompatibleModules] = useState<any[]>([]);
  const [finishingAppt, setFinishingAppt] = useState<any | null>(null);
  const [cancellingAppt, setCancellingAppt] = useState<any | null>(null);
  const [cancellationCategory, setCancellationCategory] = useState<string>('Desistência do paciente');
  const [cancellationReason, setCancellationReason] = useState<string>('');

  // Lembrete manual pelo WhatsApp e histórico de comunicações
  const [whatsappReminderAppt, setWhatsappReminderAppt] = useState<Appointment | null>(null);
  const [communications, setCommunications] = useState<any[]>([]);
  const [loadingComms, setLoadingComms] = useState<boolean>(false);

  const handleManualWhatsApp = (appt: Appointment | null) => {
    if (!appt) return;
    openManualWhatsApp({
      appointment: appt,
      clinicName: currentTenant?.trade_name || currentTenant?.name || 'Clínica',
      onError: (msg) => showToast(msg, 'error')
    });
  };

  // Bloqueio do scroll da página enquanto qualquer modal da agenda estiver aberto
  const isAnyModalOpen = Boolean(
    selectedAppt ||
    cancellingAppt ||
    selectingModuleAppt ||
    activeConsultationAppt ||
    finishingAppt ||
    whatsappReminderAppt
  );

  useEffect(() => {
    if (!isAnyModalOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isAnyModalOpen]);

  const refreshCommunications = (apptId: string) => {
    setLoadingComms(true);
    ApiClient.get<any[]>(`/v1/appointments/${apptId}/communications`)
      .then((data) => setCommunications(Array.isArray(data) ? data : []))
      .catch((err) => console.warn('[CalendarView] Erro ao buscar histórico de comunicações:', err))
      .finally(() => setLoadingComms(false));
  };

  useEffect(() => {
    if (selectedAppt) {
      refreshCommunications(selectedAppt.id);
    } else {
      setCommunications([]);
      setShowManageMenu(false);
      setShowCommsHistory(false);
      setIsEditingAttendanceTime(false);
    }
  }, [selectedAppt]);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      const [apptsData, profsData, roomsData] = await Promise.all([
        ApiClient.get<Appointment[]>('/v1/appointments'),
        ApiClient.get<Professional[]>('/v1/professionals'),
        ApiClient.get<Room[]>('/v1/rooms')
      ]);
      setAppointments(apptsData);
      setSelectedAppt(prev => {
        if (!prev) return null;
        return apptsData.find(a => a.id === prev.id) || prev;
      });
      setActiveConsultationAppt((prev: any) => {
        if (!prev) return null;
        const updated = apptsData.find(a => a.id === prev.id);
        return updated ? { ...prev, ...updated, status: prev.status || updated.status, clinical_module: prev.clinical_module || updated.clinical_module } : prev;
      });
      setProfessionals(profsData);
      setRooms(roomsData);

      const pendingRetroRaw = sessionStorage.getItem('zemda_open_retroactive_appt');
      if (pendingRetroRaw) {
        sessionStorage.removeItem('zemda_open_retroactive_appt');
        try {
          const parsedRetro = JSON.parse(pendingRetroRaw);
          const targetAppt = apptsData.find(a => a.id === parsedRetro?.id) || parsedRetro;
          if (targetAppt) {
            const rawDate = targetAppt.start_time || targetAppt.attendance_start_at;
            if (rawDate) {
              const datePart = String(rawDate).slice(0, 10);
              const [y, m, d] = datePart.split('-').map(Number);
              if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                setCurrentDate(new Date(y, m - 1, d, 12, 0, 0));
              }
            }
            const autoModule = getModuleForProfession(auth);
            const chosenModule = targetAppt.service_clinical_module || targetAppt.clinical_module || (autoModule && autoModule !== 'general' ? autoModule : 'general');
            setActiveConsultationModule(chosenModule);
            setActiveConsultationAppt({
              ...targetAppt,
              status: 'in_progress',
              clinical_module: chosenModule
            });
          }
        } catch (_) {}
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar dados da agenda', 'error');
    } finally {
      setLoading(false);
    }
  };

  const notifyAppointmentChange = () => {
    window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
  };

  useEffect(() => {
    fetchCalendarData();
    if (selectedProfRef.current && selectedProfRef.current !== 'all') {
      fetchSelectedProfSchedule(selectedProfRef.current);
    }

    const handleRemoteUpdate = (e?: any) => {
      fetchCalendarData();
      if (selectedProfRef.current && selectedProfRef.current !== 'all') {
        fetchSelectedProfSchedule(selectedProfRef.current);
      }
      const rawDate = e?.detail?.startTime || e?.detail?.date;
      if (rawDate) {
        const datePart = String(rawDate).slice(0, 10);
        const [y, m, d] = datePart.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          setCurrentDate(new Date(y, m - 1, d, 12, 0, 0));
        }
      }
    };

    window.addEventListener('zemda-appointment-updated', handleRemoteUpdate);
    window.addEventListener('zemda-schedule-updated', handleRemoteUpdate);

    return () => {
      window.removeEventListener('zemda-appointment-updated', handleRemoteUpdate);
      window.removeEventListener('zemda-schedule-updated', handleRemoteUpdate);
    };
  }, [fetchSelectedProfSchedule]);

  // Atualização automática na virada do dia (23:59 -> 00:00)
  useEffect(() => {
    let lastDateStr = new Date().toDateString();
    const interval = setInterval(() => {
      const now = new Date();
      const nowDateStr = now.toDateString();
      if (nowDateStr !== lastDateStr) {
        lastDateStr = nowDateStr;
        setCurrentDate(prev => {
          // Se estava visualizando o dia de ontem ou hoje, sincroniza para hoje
          const isViewingTodayOrPast = prev.toDateString() === new Date(now.getTime() - 86400000).toDateString() ||
                                       prev.toDateString() === nowDateStr;
          if (isViewingTodayOrPast) {
            return new Date();
          }
          return prev;
        });
        fetchCalendarData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Navegação temporal
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 6);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 6);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleUpdateStatus = async (apptId: string, status: string, reason?: string, category?: string) => {
    try {
      await ApiClient.put(`/v1/appointments/${apptId}/status`, {
        status,
        reason: reason || null,
        cancellationReasonCategory: category || null
      });
      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: status as any } : a));
      showToast(`Status atualizado para ${status}`, 'success');
      setSelectedAppt(null);
      setCancellingAppt(null);
      fetchCalendarData();
      notifyAppointmentChange();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
  };

  const handleResolveDivergence = async (apptId: string, action: 'apply_google' | 'keep_zemda') => {
    try {
      const res = await ApiClient.post<{ success: boolean; message: string }>(`/v1/integrations/google-calendar/divergence/${apptId}/resolve`, { action });
      showToast(res.message || 'Divergência resolvida com sucesso', 'success');
      fetchCalendarData();
      setSelectedAppt(prev => prev ? { ...prev, google_sync_status: 'synced' } : null);
    } catch (err: any) {
      showToast(err.message || 'Erro ao resolver divergência', 'error');
    }
  };

  const executeStartConsultation = async (appointment: Appointment, selectedModule?: string) => {
    try {
      const payload: any = { status: 'in_progress' };
      if (selectedModule) {
        payload.clinicalModule = selectedModule;
      }
      const statusRes = await ApiClient.put<any>(`/v1/appointments/${appointment.id}/status`, payload);
      const nextRealStart = statusRes?.attendance_start_at || appointment.attendance_start_at || null;
      const nextExpectedEnd = statusRes?.attendance_expected_end_at || appointment.attendance_expected_end_at || null;
      const chosenModule = selectedModule || (appointment as any).service_clinical_module || (appointment as any).clinical_module || 'general';
      setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'in_progress' as any, clinical_module: chosenModule, attendance_start_at: nextRealStart, attendance_expected_end_at: nextExpectedEnd } : a));
      setActiveConsultationModule(chosenModule);
      setActiveConsultationAppt({
        ...appointment,
        status: 'in_progress',
        clinical_module: chosenModule,
        attendance_start_at: nextRealStart,
        attendance_expected_end_at: nextExpectedEnd
      });
      setSelectedAppt(null);
      setSelectingModuleAppt(null);
      fetchCalendarData();
      notifyAppointmentChange();
    } catch (err: any) {
      showToast(err.message || 'Erro ao iniciar atendimento', 'error');
    }
  };

  const startConsultation = async (appointment: Appointment) => {
    if (['completed', 'cancelled', 'no_show'].includes(appointment.status)) {
      showToast('Abra o prontuário para consultar um atendimento encerrado.', 'info');
      return;
    }

    const autoModule = getModuleForProfession(auth);
    const serviceModule = (appointment as any).service_clinical_module;
    const existingModule = (appointment as any).clinical_module;

    // 1. Prioridade máxima: módulo clínico do serviço vinculado
    if (serviceModule && serviceModule !== 'general' && serviceModule !== 'ZemdaBody' && serviceModule !== 'Zemda360') {
      executeStartConsultation(appointment, serviceModule);
      return;
    }

    // 2. Se já tiver módulo PRIMÁRIO gravado e válido, mantém o módulo para respeitar a imutabilidade
    if (existingModule && existingModule !== 'general' && existingModule !== 'ZemdaBody' && existingModule !== 'Zemda360') {
      executeStartConsultation(appointment, existingModule);
      return;
    }

    // 3. Fallback: promove com segurança para o módulo da profissão do usuário logado
    const chosenModule = (autoModule && autoModule !== 'general') ? autoModule : (existingModule || autoModule || 'general');
    executeStartConsultation(appointment, chosenModule);
  };

  const handleConfirmReschedule = async () => {
    if (!selectedAppt || !rescheduleDate || !rescheduleTime) {
      showToast('Selecione a nova data e horário', 'error');
      return;
    }

    try {
      const startTime = `${rescheduleDate}T${rescheduleTime}:00`;
      const duration = selectedAppt.duration_minutes || 50;
      const [h, m] = rescheduleTime.split(':').map(Number);
      const endTotal = h * 60 + m + duration;
      const endH = Math.floor(endTotal / 60).toString().padStart(2, '0');
      const endM = (endTotal % 60).toString().padStart(2, '0');
      const endTime = `${rescheduleDate}T${endH}:${endM}:00`;

      await ApiClient.put(`/v1/appointments/${selectedAppt.id}/reschedule`, {
        startTime,
        endTime,
        reason: 'Remarcado pelo painel da agenda'
      });

      setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? { ...a, start_time: startTime, end_time: endTime, status: 'rescheduled' } : a));
      showToast('Atendimento remarcado com sucesso!', 'success');
      setIsRescheduling(false);
      setSelectedAppt(null);
      fetchCalendarData();
      notifyAppointmentChange();
    } catch (err: any) {
      showToast(err.message || 'Erro ao remarcar', 'error');
    }
  };

  // Cores por status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-emerald-500 text-white border-emerald-600';
      case 'in_progress':
        return 'bg-purple-600 text-white border-purple-700 animate-pulse';
      case 'completed':
        return 'bg-teal-600 text-white border-teal-700';
      case 'no_show':
        return 'bg-amber-500 text-white border-amber-600';
      case 'cancelled':
        return 'bg-rose-500 text-white border-rose-600 opacity-60';
      case 'rescheduled':
        return 'bg-orange-500 text-white border-orange-600';
      default:
        return 'bg-blue-600 text-white border-blue-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Agendado';
      case 'confirmed':
        return 'Confirmado';
      case 'in_progress':
        return 'Em atendimento';
      case 'completed':
        return 'Concluído';
      case 'no_show':
        return 'Faltou';
      case 'cancelled':
        return 'Cancelado';
      case 'rescheduled':
        return 'Remarcado';
      default:
        return status;
    }
  };

  // Filtra agendamentos
  const filteredAppointments = appointments.filter(a => {
    if (selectedProf !== 'all' && a.professional_id !== selectedProf) return false;
    if (selectedStatus !== 'all' && a.status !== selectedStatus) return false;
    return true;
  });

  // Cálculo dos dias da semana: inicia SEMPRE a partir da data base (HOJE como primeiro dia exibido)
  const getWeekDays = (baseDate: Date) => {
    const days: Date[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const formatDateLocal = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const weekDays = getWeekDays(currentDate);

  // Horário dinâmico da agenda: calcula início e fim com base na escala real dos profissionais naquele dia,
  // exceções cadastradas (bloqueios) e agendamentos existentes, sem limite fixo de 18:00.
  const timeSlots = useMemo(() => {
    const daysInView = viewMode === 'day' ? [currentDate] : weekDays;

    const targetProfs = (selectedProf && selectedProf !== 'all')
      ? professionals.filter(p => p.id === selectedProf)
      : professionals.filter(p => p.active === 1 || (p.active as any) === true);

    let minHour = 8;
    let maxHour = 18;

    for (const d of daysInView) {
      const dayOfWeek = d.getDay();
      const dayStr = formatDateLocal(d);

      for (const prof of targetProfs) {
        const profSchedules = (prof.id === selectedProf && selectedProfSchedule?.schedules)
          ? selectedProfSchedule.schedules
          : (prof as any).schedules || [];

        const activeScheds = profSchedules.filter((s: any) =>
          Number(s.day_of_week) === Number(dayOfWeek) && Boolean(s.is_active)
        );

        for (const s of activeScheds) {
          if (s.start_time) {
            const h = parseInt(s.start_time.slice(0, 2), 10);
            if (!isNaN(h) && h < minHour) minHour = Math.max(0, h);
          }
          if (s.end_time) {
            const h = parseInt(s.end_time.slice(0, 2), 10);
            const m = parseInt(s.end_time.slice(3, 5), 10) || 0;
            // profissional trabalha até 18:00 -> agenda até 18:00;
            // trabalha até 19:00 -> agenda até 19:00;
            // trabalha até 20:30 -> agenda até pelo menos 20:30 (exibe até 21:00);
            const effectiveEnd = m > 0 ? h + 1 : h;
            if (!isNaN(effectiveEnd) && effectiveEnd > maxHour) {
              maxHour = Math.min(23, effectiveEnd);
            }
          }
        }

        const profBlocked = (prof.id === selectedProf && selectedProfSchedule?.blockedTimes)
          ? selectedProfSchedule.blockedTimes
          : (prof as any).blockedTimes || [];

        for (const b of profBlocked) {
          const bStart = b.start_datetime || '';
          const bEnd = b.end_datetime || '';
          if (bStart.startsWith(dayStr) || bEnd.startsWith(dayStr)) {
            if (bStart.startsWith(dayStr) && bStart.length >= 13) {
              const h = parseInt(bStart.slice(11, 13), 10);
              if (!isNaN(h) && h < minHour) minHour = Math.max(0, h);
            }
            if (bEnd.startsWith(dayStr) && bEnd.length >= 13) {
              const h = parseInt(bEnd.slice(11, 13), 10);
              const m = parseInt(bEnd.slice(14, 16), 10) || 0;
              const effectiveEnd = m > 0 ? h + 1 : h;
              if (!isNaN(effectiveEnd) && effectiveEnd > maxHour) {
                maxHour = Math.min(23, effectiveEnd);
              }
            }
          }
        }
      }

      const dayAppts = filteredAppointments.filter(a => (a.start_time || '').replace(' ', 'T').startsWith(dayStr));
      for (const appt of dayAppts) {
        const sTime = (appt.start_time || '').replace(' ', 'T');
        const eTime = (appt.end_time || '').replace(' ', 'T');
        if (sTime.length >= 13) {
          const h = parseInt(sTime.slice(11, 13), 10);
          if (!isNaN(h) && h < minHour) minHour = Math.max(0, h);
        }
        if (eTime.length >= 13) {
          const h = parseInt(eTime.slice(11, 13), 10);
          const m = parseInt(eTime.slice(14, 16), 10) || 0;
          const effectiveEnd = m > 0 ? h + 1 : h;
          if (!isNaN(effectiveEnd) && effectiveEnd > maxHour) {
            maxHour = Math.min(23, effectiveEnd);
          }
        }
      }
    }

    const slots: string[] = [];
    for (let hour = minHour; hour <= maxHour; hour++) {
      slots.push(`${String(hour).padStart(2, '0')}:00`);
    }
    return slots;
  }, [viewMode, currentDate, weekDays, selectedProf, professionals, selectedProfSchedule, filteredAppointments]);

  return (
    <div data-tour-loading={loading} className="space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        {/* Navigation buttons */}
        <div className="flex items-center justify-between sm:justify-start gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Hoje
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrev}
                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Período anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Próximo período"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <span className="text-sm sm:text-base font-bold text-slate-800 ml-1 sm:ml-2">
            {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Seletor de Profissional */}
          <select
            value={selectedProf}
            onChange={e => setSelectedProf(e.target.value)}
            className="w-full sm:w-auto flex-1 sm:flex-initial text-xs font-medium border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 min-h-[38px]"
          >
            <option value="all">Todos os Profissionais</option>
            {professionals.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Seletor de Status */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="w-full sm:w-auto flex-1 sm:flex-initial text-xs font-medium border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 min-h-[38px]"
          >
            <option value="all">Todos os Status</option>
            <option value="scheduled">Agendado</option>
            <option value="confirmed">Confirmado</option>
            <option value="in_progress">Em Atendimento</option>
            <option value="completed">Concluído</option>
            <option value="no_show">Faltou</option>
            <option value="cancelled">Cancelado</option>
          </select>

          {/* Modos de visualização */}
          <div className="hidden lg:flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'day' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Dia
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Semana
            </button>
          </div>

          <button
            data-tour="btn-new-appointment"
            onClick={() => onOpenNewAppointment(selectedProf !== 'all' ? { professionalId: selectedProf } : undefined)}
            className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer min-h-[38px]"
          >
            <Plus className="w-4 h-4" />
            Agendar
          </button>
        </div>
      </div>

      {/* Calendar Grid (Week Mode) */}
      {viewMode === 'week' && !mobile && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
          <div className="min-w-0 lg:min-w-[800px]">
            {/* Week Header */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-700">
              <div className="py-3 border-r border-slate-200 text-slate-400">Horário</div>
              {weekDays.map((d, i) => {
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={i}
                    className={`py-3 border-r border-slate-200 last:border-r-0 ${
                      isToday ? 'bg-indigo-50/70 text-indigo-700 font-bold' : ''
                    }`}
                  >
                    <div>{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                    <div className="text-sm mt-0.5">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Time Grid Rows */}
            <div className="divide-y divide-slate-100">
              {timeSlots.map(timeSlot => (
                <div key={timeSlot} className="grid grid-cols-7 min-h-[75px]">
                  {/* Time label */}
                  <div className="border-r border-slate-200 p-2 text-[11px] font-semibold text-slate-400 text-right pr-3">
                    {timeSlot}
                  </div>

                  {/* Day Columns */}
                  {weekDays.map((dayDate, dayIdx) => {
                    const dayStr = formatDateLocal(dayDate);
                    const slotStartPrefix = `${dayStr}T${timeSlot}`;
                    const availability = getSlotAvailability(dayStr, timeSlot);

                    // Filtra agendamentos nesta data e hora
                    const slotAppts = filteredAppointments.filter(a => {
                      return (a.start_time || '').replace(' ', 'T').startsWith(slotStartPrefix.slice(0, 13)); // Match no início da hora
                    });

                    const isAvailable = availability.available;
                    const hasAppointments = slotAppts.length > 0;
                    const canSchedule = isAvailable && !hasAppointments;

                    return (
                      <div
                        key={dayIdx}
                        onClick={() => {
                          if (!canSchedule) return;
                          onOpenNewAppointment({
                            date: dayStr,
                            time: timeSlot,
                            professionalId: selectedProf !== 'all' ? selectedProf : undefined
                          });
                        }}
                        className={`border-r border-slate-100 last:border-r-0 p-1 relative transition-colors min-h-[75px] bg-white ${
                          !canSchedule
                            ? (hasAppointments ? 'cursor-default' : 'cursor-default select-none')
                            : 'hover:bg-indigo-50/40 group/slot cursor-pointer'
                        }`}
                        title={
                          hasAppointments
                            ? undefined
                            : availability.isBlocked
                            ? `Horário Bloqueado (${dayDate.toLocaleDateString('pt-BR')} às ${timeSlot})`
                            : isAvailable
                            ? `Clique para agendar às ${timeSlot} (${dayDate.toLocaleDateString('pt-BR')})`
                            : undefined
                        }
                      >
                        {slotAppts.map(appt => (
                          <div
                            key={appt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppt(appt);
                            }}
                            className={`p-1.5 rounded-lg text-xs cursor-pointer shadow-xs border transition-transform hover:scale-[1.02] mb-1 ${getStatusColor(
                              appt.status
                            )}`}
                          >
                            <div className="font-bold truncate leading-tight">{appt.patient_name}</div>
                            {appt.modality === 'online' && <span className="text-[10px] inline-flex items-center gap-1"><Video className="w-3 h-3" /> Online</span>}
                            <div className="text-[10px] opacity-90 truncate leading-tight mt-0.5">
                              {appt.service_name}
                              {(() => {
                                const amt = appt.display_amount !== null && appt.display_amount !== undefined
                                  ? appt.display_amount
                                  : (appt.payment_amount !== null && appt.payment_amount !== undefined
                                      ? appt.payment_amount
                                      : (appt.service_price !== null && appt.service_price !== undefined ? appt.service_price : null));
                                return (amt !== null && amt !== undefined)
                                  ? ` · ${Number(amt).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                                  : '';
                              })()}
                            </div>
                            <div className="text-[10px] opacity-80 flex items-center justify-between gap-1 mt-1">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {((appt.start_time || '').replace(' ', 'T').split('T')[1] || '').slice(0, 5)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {appt.google_sync_status === 'synced' && (
                                  <span title="Sincronizado com Google Agenda" className="text-emerald-700 inline-flex items-center gap-0.5 font-bold">
                                    <CalendarIcon className="w-2.5 h-2.5 text-emerald-600" /> ✓
                                  </span>
                                )}
                                {appt.google_sync_status === 'pending' && (
                                  <span title="Sincronização pendente com Google Agenda" className="text-amber-700 inline-flex items-center gap-0.5 font-bold">
                                    <CalendarIcon className="w-2.5 h-2.5 text-amber-600" /> ⟳
                                  </span>
                                )}
                                {appt.google_sync_status === 'error' && (
                                  <span title="Erro na sincronização com Google Agenda" className="text-rose-700 inline-flex items-center gap-0.5 font-bold">
                                    <CalendarIcon className="w-2.5 h-2.5 text-rose-600" /> !
                                  </span>
                                )}
                                {appt.google_sync_status === 'divergent' && (
                                  <span title="Horário alterado no Google Agenda" className="text-amber-800 bg-amber-200/80 px-1 py-0.2 rounded inline-flex items-center gap-0.5 font-bold">
                                    <AlertCircle className="w-2.5 h-2.5 text-amber-700" /> !
                                  </span>
                                )}
                                {appt.status === 'in_progress' && <span className="font-semibold">Em atendimento</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                        {!hasAppointments && (
                          !isAvailable ? (
                            availability.isBlocked ? (
                              <div className="h-full w-full min-h-[50px] flex items-center justify-center p-1 text-center">
                                <span className="text-[10px] font-bold text-rose-800 bg-rose-100/80 border border-rose-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Ban className="w-3 h-3 text-rose-700" /> Bloqueado
                                </span>
                              </div>
                            ) : null
                          ) : (
                            <div className="h-full w-full min-h-[60px] flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenNewAppointment({
                                    date: dayStr,
                                    time: timeSlot,
                                    professionalId: selectedProf !== 'all' ? selectedProf : undefined
                                  });
                                }}
                                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 bg-white hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 rounded-lg shadow-xs transition-all cursor-pointer pointer-events-auto"
                              >
                                <Plus className="w-3.5 h-3.5 pointer-events-none shrink-0" />
                                <span className="pointer-events-none">{timeSlot}</span>
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Day View */}
      {(viewMode === 'day' || mobile) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-slate-900 text-base sm:text-lg">
              Atendimentos para {currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <button
              onClick={() => onOpenNewAppointment({
                date: formatDateLocal(currentDate),
                time: '09:00',
                professionalId: selectedProf !== 'all' ? selectedProf : undefined
              })}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl cursor-pointer self-start sm:self-auto min-h-[36px]"
            >
              <Plus className="w-4 h-4" /> Novo neste dia
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {mobile && <label className="block mb-4 text-sm font-semibold">Data da agenda
              <input type="date" aria-label="Data da agenda" value={formatDateLocal(currentDate)} onChange={e => {
                if (e.target.value) setCurrentDate(new Date(`${e.target.value}T12:00:00`));
              }} className="mt-2 block w-full border border-slate-300 rounded-xl p-3" />
            </label>}
            {timeSlots.map(timeSlot => {
              const currentDateStr = formatDateLocal(currentDate);
              const availability = getSlotAvailability(currentDateStr, timeSlot);
              const slotAppts = filteredAppointments.filter(a =>
                (a.start_time || '').replace(' ', 'T').startsWith(`${currentDateStr}T${timeSlot.slice(0, 2)}`)
              );
              const isAvailable = availability.available;
              const hasAppointments = slotAppts.length > 0;
              const canSchedule = isAvailable && !hasAppointments;

              return (
                <div
                  key={timeSlot}
                  onClick={() => {
                    if (!canSchedule) return;
                    onOpenNewAppointment({
                      date: currentDateStr,
                      time: timeSlot,
                      professionalId: selectedProf !== 'all' ? selectedProf : undefined
                    });
                  }}
                  className={`mobile-day-slot py-2.5 px-3 flex items-start gap-4 rounded-xl transition-colors bg-white min-h-[52px] ${
                    !canSchedule
                      ? (hasAppointments ? 'cursor-default' : 'cursor-default select-none')
                      : 'hover:bg-indigo-50/40 cursor-pointer group'
                  }`}
                  title={
                    hasAppointments
                      ? undefined
                      : availability.isBlocked
                      ? `Horário Bloqueado às ${timeSlot}`
                      : isAvailable
                      ? `Clique para agendar às ${timeSlot}`
                      : undefined
                  }
                >
                  <div className={`w-16 text-xs font-bold pt-1 transition-colors ${
                    canSchedule ? 'text-slate-400 group-hover:text-indigo-600' : 'text-slate-400'
                  }`}>
                    {timeSlot}
                  </div>
                  <div className="flex-1">
                    {hasAppointments ? (
                      <div className="space-y-2">
                        {slotAppts.map(appt => (
                          <div
                            key={appt.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppt(appt);
                            }}
                            className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-xs cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white"
                          >
                            <div className="flex items-center gap-4">
                              <div className="text-center font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs">
                                {((appt.start_time || '').replace(' ', 'T').split('T')[1] || '').slice(0, 5)}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900 text-sm">{appt.patient_name}</h4>
                                {appt.modality === 'online' && <span className="text-xs inline-flex items-center gap-1 text-indigo-600"><Video className="w-3 h-3" /> Online</span>}
                                {(() => {
                                  const amt = appt.display_amount !== null && appt.display_amount !== undefined
                                    ? appt.display_amount
                                    : (appt.payment_amount !== null && appt.payment_amount !== undefined
                                        ? appt.payment_amount
                                        : (appt.service_price !== null && appt.service_price !== undefined ? appt.service_price : null));
                                  const formatted = (amt !== null && amt !== undefined)
                                    ? Number(amt).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                    : null;
                                  return (
                                    <p className="text-xs text-slate-500">
                                      {appt.service_name}{formatted ? ` · ${formatted}` : ''} • Profissional: {appt.professional_name}
                                    </p>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {appt.google_sync_status === 'synced' && (
                                <span title="Sincronizado com Google Agenda" className="text-emerald-700 inline-flex items-center gap-1 text-[11px] font-bold">
                                  <CalendarIcon className="w-3 h-3 text-emerald-600" /> ✓
                                </span>
                              )}
                              {appt.google_sync_status === 'pending' && (
                                <span title="Sincronização pendente com Google Agenda" className="text-amber-700 inline-flex items-center gap-1 text-[11px] font-bold">
                                  <CalendarIcon className="w-3 h-3 text-amber-600" /> ⟳
                                </span>
                              )}
                              {appt.google_sync_status === 'error' && (
                                <span title="Erro na sincronização com Google Agenda" className="text-rose-700 inline-flex items-center gap-1 text-[11px] font-bold">
                                  <CalendarIcon className="w-3 h-3 text-rose-600" /> !
                                </span>
                              )}
                              {appt.google_sync_status === 'divergent' && (
                                <span title="Horário alterado no Google Agenda" className="text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded inline-flex items-center gap-1 text-[10px] font-bold">
                                  <AlertCircle className="w-3 h-3 text-amber-700" /> Horário alterado no Google
                                </span>
                              )}
                              <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(appt.status)}`}>
                                {getStatusLabel(appt.status)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : !isAvailable ? (
                      availability.isBlocked ? (
                        <div className="text-xs font-medium py-1">
                          <span className="inline-flex items-center gap-1.5 font-bold text-rose-800 bg-rose-100/80 border border-rose-300 px-2 py-0.5 rounded-md">
                            <Ban className="w-3.5 h-3.5 text-rose-700" /> Bloqueado
                          </span>
                        </div>
                      ) : null
                    ) : (
                      <div className="py-0.5 flex items-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenNewAppointment({
                              date: currentDateStr,
                              time: timeSlot,
                              professionalId: selectedProf !== 'all' ? selectedProf : undefined
                            });
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-white hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 rounded-lg shadow-xs cursor-pointer pointer-events-auto"
                        >
                          <Plus className="w-3.5 h-3.5 pointer-events-none shrink-0" />
                          <span className="pointer-events-none">{timeSlot}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appointment Detail & Actions Modal */}
      {teleAppt && <TeleconsultationModal key={teleAppt.id} appointment={teleAppt} onClose={() => { setTeleAppt(null); }} onSaved={(meeting_url, modality) => {
        const update = (appt: Appointment): Appointment => appt.id === teleAppt.id ? { ...appt, meeting_url, modality: modality as Appointment['modality'] } : appt;
        setAppointments(previous => previous.map(update));
        setSelectedAppt(previous => previous ? update(previous) : null);
        setActiveConsultationAppt((previous: Appointment | null) => previous ? update(previous) : null);
        setTeleAppt(previous => previous ? update(previous) : null);
        notifyAppointmentChange();
      }} />}
      {selectedAppt && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          {/* Backdrop cobrindo 100vw/100vh */}
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs mobile-modal"
            onClick={() => {
              setSelectedAppt(null);
              setIsRescheduling(false);
            }}
            aria-hidden="true"
          />

          {/* Modal clean centralizado (760px-900px no desktop) */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Detalhes do agendamento ${selectedAppt.appointment_number || ''}`}
            className="relative z-10 bg-white rounded-3xl max-w-[860px] w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 shadow-xl border border-slate-200/90 animate-in fade-in zoom-in-95 duration-200 my-auto space-y-4"
          >
            {/* CABEÇALHO CLARO */}
            <header className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-teal-50 border border-teal-200/80 text-teal-700 flex items-center justify-center font-bold text-sm sm:text-base shrink-0 shadow-2xs">
                  {(selectedAppt.patient_name || 'PA').slice(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {selectedAppt.appointment_number}
                    </span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${getStatusColor(selectedAppt.status)}`}>
                      {getStatusLabel(selectedAppt.status)}
                    </span>
                    {selectedAppt.google_sync_status === 'synced' && (
                      <span title="Sincronizado com Google Agenda" className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CalendarIcon className="w-3 h-3 text-emerald-600" />
                        Google Agenda ✓
                      </span>
                    )}
                    {selectedAppt.google_sync_status === 'pending' && (
                      <span title="Sincronização pendente com Google Agenda" className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <CalendarIcon className="w-3 h-3 text-amber-600" />
                        Google Agenda ⟳
                      </span>
                    )}
                    {selectedAppt.google_sync_status === 'error' && (
                      <span title="Erro na sincronização com Google Agenda" className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                        <CalendarIcon className="w-3 h-3 text-rose-600" />
                        Google Agenda !
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {selectedAppt.modality === 'online' ? (
                        <>
                          <Video className="w-3 h-3 text-indigo-600" />
                          <span>Online</span>
                        </>
                      ) : selectedAppt.modality === 'home' ? (
                        <>
                          <MapPin className="w-3 h-3 text-teal-600" />
                          <span>Domiciliar</span>
                        </>
                      ) : (
                        <>
                          <MapPin className="w-3 h-3 text-teal-600" />
                          <span>Presencial</span>
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-500 hover:text-teal-700 underline underline-offset-2 cursor-pointer"
                      onClick={() => setTeleAppt(selectedAppt)}
                    >
                      Editar modalidade
                    </button>
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug truncate">
                    {selectedAppt.patient_name}
                  </h3>

                  <div className="flex items-center gap-3 flex-wrap text-xs text-slate-600 pt-0.5">
                    {selectedAppt.patient_phone ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatPhoneDisplay(selectedAppt.patient_phone)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleManualWhatsApp(selectedAppt)}
                          title="Abrir conversa no WhatsApp com lembrete preenchido"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-200/90 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          <WhatsAppIcon className="w-3 h-3 fill-emerald-600 shrink-0" />
                          <span>WhatsApp</span>
                        </button>
                      </>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        <span className="text-slate-400 italic text-xs">Paciente sem telefone cadastrado</span>
                        <button
                          type="button"
                          onClick={() => handleManualWhatsApp(selectedAppt)}
                          title="Paciente sem telefone cadastrado"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          <WhatsAppIcon className="w-3 h-3 fill-slate-400 shrink-0" />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                aria-label="Fechar"
                onClick={() => {
                  setSelectedAppt(null);
                  setIsRescheduling(false);
                }}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {!isRescheduling ? (
              <div className="space-y-3.5">
                {/* 5. RESUMO PRINCIPAL EM UMA FAIXA HORIZONTAL */}
                {(() => {
                  const amt = selectedAppt.display_amount !== null && selectedAppt.display_amount !== undefined
                    ? selectedAppt.display_amount
                    : (selectedAppt.payment_amount !== null && selectedAppt.payment_amount !== undefined
                        ? selectedAppt.payment_amount
                        : (selectedAppt.service_price !== null && selectedAppt.service_price !== undefined ? selectedAppt.service_price : null));
                  const formattedAmount = (amt !== null && amt !== undefined)
                    ? Number(amt).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : 'R$ 0,00';

                  const rawDate = (selectedAppt.start_time || '').split('T')[0];
                  const formattedDate = rawDate
                    ? new Date(rawDate + 'T12:00:00').toLocaleDateString('pt-BR')
                    : '-';
                  const formattedTime = ((selectedAppt.start_time || '').replace(' ', 'T').split('T')[1] || '').slice(0, 5);
                  const matchedProf = professionals.find(p => p.id === selectedAppt.professional_id);
                  const profSpecialty = (matchedProf as any)?.specialty || (matchedProf as any)?.profession_name || '';

                  return (
                    <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-0 sm:divide-x sm:divide-slate-200/80">
                      <div className="sm:pr-3.5 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Serviço
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 truncate" title={selectedAppt.service_name}>
                          {selectedAppt.service_name || 'Consulta'}
                        </p>
                      </div>

                      <div className="sm:px-3.5 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Valor da Consulta
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-emerald-700 mt-0.5 truncate">
                          {formattedAmount}
                        </p>
                      </div>

                      <div className="sm:px-3.5 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          {selectedAppt.attendance_start_at ? 'Data e Horário Agendado' : 'Data e Horário'}
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 truncate">
                          {formattedDate}
                        </p>
                        <p className="text-[11px] font-semibold text-teal-700">
                          {formattedTime ? `às ${formattedTime}` : ''}
                        {!selectedAppt.attendance_start_at && !['cancelled', 'no_show'].includes(selectedAppt.status) && !isEditingAttendanceTime && (
                          <button
                            type="button"
                            onClick={() => openAttendanceTimeEditor(selectedAppt)}
                            className="mt-1 text-[10px] font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2 cursor-pointer block text-left"
                          >
                            Ajustar horário do atendimento
                          </button>
                        )}
                        </p>
                      </div>

                      <div className="sm:px-3.5 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Profissional
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 truncate" title={selectedAppt.professional_name}>
                          {selectedAppt.professional_name}
                        </p>
                        {profSpecialty && (
                          <p className="text-[11px] text-slate-500 truncate">{profSpecialty}</p>
                        )}
                      </div>

                      <div className="sm:pl-3.5 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Modalidade
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 truncate">
                          {selectedAppt.modality === 'online'
                            ? 'Online'
                            : selectedAppt.modality === 'home'
                              ? 'Domiciliar'
                              : 'Presencial'}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {selectedAppt.modality === 'online' ? 'Teleconsulta' : 'Consultório'}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* FAIXA COMPACTA DE ATENDIMENTO REAL E EDITOR CONTEXTUAL DE HORÁRIO */}
                {selectedAppt.attendance_start_at && !isEditingAttendanceTime && (() => {
                  const realDateRaw = extractDateFromIso(selectedAppt.attendance_start_at);
                  const schedDateRaw = extractDateFromIso(selectedAppt.start_time);
                  const realDateFormatted = realDateRaw && realDateRaw !== schedDateRaw
                    ? new Date(realDateRaw + 'T12:00:00').toLocaleDateString('pt-BR') + ' • '
                    : '';
                  const realStartT = extractTimeFromIso(selectedAppt.attendance_start_at);
                  const expectedEndT = extractTimeFromIso(selectedAppt.attendance_expected_end_at);
                  const realEndT = extractTimeFromIso(selectedAppt.attendance_end_at);
                  return (
                    <div className="bg-teal-50/70 border border-teal-200/80 rounded-xl px-3.5 py-2 flex items-center justify-between gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-100/80 px-2 py-0.5 rounded-md">
                          Atendimento Real
                        </span>
                        <span className="font-semibold text-slate-800">
                          {realDateFormatted}Início: <strong className="text-teal-800">{realStartT || '-'}</strong>
                          {expectedEndT && !realEndT ? (
                            <> • Previsão: <strong className="text-slate-700">{expectedEndT}</strong></>
                          ) : null}
                          {realEndT ? (
                            <> • Término: <strong className="text-teal-800">{realEndT}</strong></>
                          ) : null}
                        </span>
                      </div>
                      {!['cancelled', 'no_show'].includes(selectedAppt.status) && (
                        <button
                          type="button"
                          onClick={() => openAttendanceTimeEditor(selectedAppt)}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2 cursor-pointer"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  );
                })()}

                {isEditingAttendanceTime && (
                  <div className="bg-slate-50 border border-teal-200 rounded-2xl p-3.5 space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Ajustar horário real do atendimento
                      </span>
                      <span className="text-[11px] text-slate-500">
                        O horário agendado ({((selectedAppt.start_time || '').replace(' ', 'T').split('T')[1] || '').slice(0, 5)}) será preservado no histórico
                      </span>
                    </div>
                    <div className={`grid grid-cols-1 ${selectedAppt.status === 'completed' || selectedAppt.attendance_end_at ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-2.5 text-xs`}>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Data do atendimento real
                        </label>
                        <input
                          type="date"
                          value={editAttendanceDate}
                          onChange={e => setEditAttendanceDate(e.target.value)}
                          className="w-full border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Horário real de início
                        </label>
                        <input
                          type="time"
                          value={editAttendanceStartTime}
                          onChange={e => {
                            const newStart = e.target.value;
                            setEditAttendanceStartTime(newStart);
                            const dur = Number(selectedAppt.duration_minutes) > 0 ? Number(selectedAppt.duration_minutes) : 50;
                            if (newStart) {
                              setEditAttendanceExpectedEndTime(addMinutesToTimeStr(newStart, dur));
                            }
                          }}
                          className="w-full border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Previsão de término
                        </label>
                        <input
                          type="time"
                          value={editAttendanceExpectedEndTime}
                          onChange={e => setEditAttendanceExpectedEndTime(e.target.value)}
                          className="w-full border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-xs"
                        />
                      </div>
                      {(selectedAppt.status === 'completed' || selectedAppt.attendance_end_at) && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Horário real de término
                          </label>
                          <input
                            type="time"
                            value={editAttendanceEndTime}
                            onChange={e => setEditAttendanceEndTime(e.target.value)}
                            className="w-full border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-xs"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingAttendanceTime(false)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={savingAttendanceTime}
                        onClick={handleSaveAttendanceTime}
                        className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {savingAttendanceTime ? 'Salvando...' : 'Salvar horário'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 8-11. ATENDIMENTO ONLINE (Apenas se modality === 'online') */}
                {selectedAppt.modality === 'online' && (
                  <OnlineConsultationTools
                    appointment={selectedAppt}
                    onMeetingUrlSaved={newUrl => {
                      const update = (appt: Appointment): Appointment =>
                        appt.id === selectedAppt.id ? { ...appt, meeting_url: newUrl } : appt;
                      setAppointments(prev => prev.map(update));
                      setSelectedAppt(prev => (prev ? update(prev) : null));
                      notifyAppointmentChange();
                    }}
                    onDriveUrlSaved={newDriveUrl => {
                      const update = (appt: Appointment): Appointment =>
                        appt.id === selectedAppt.id ? ({ ...appt, google_drive_url: newDriveUrl } as Appointment) : appt;
                      setAppointments(prev => prev.map(update));
                      setSelectedAppt(prev => (prev ? update(prev) : null));
                      notifyAppointmentChange();
                    }}
                  />
                )}

                {/* 6. TERMOS DE CONSENTIMENTO — OPCIONAL (Nunca bloqueia o atendimento) */}
                {auth.canAccessConsents && selectedAppt.patient_id && (
                  <ConsentPendingAlert
                    variant="optional-card"
                    patientId={selectedAppt.patient_id}
                    serviceId={selectedAppt.service_id}
                    onOpen={() => {
                      setConsentPatientId(selectedAppt.patient_id);
                    }}
                  />
                )}

                {/* 7. OBSERVAÇÕES DO CLIENTE (Apenas se existir observação) */}
                {selectedAppt.patient_notes && (
                  <div className="text-xs bg-amber-50/80 text-amber-950 px-3.5 py-2.5 rounded-xl border border-amber-200/80">
                    <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-800 mb-0.5">
                      Observações do cliente
                    </span>
                    <p className="leading-relaxed">{selectedAppt.patient_notes}</p>
                  </div>
                )}

                {/* 13-14. AÇÃO PRINCIPAL BASEADA NO STATUS + AÇÕES SECUNDÁRIAS */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  {selectedAppt.status === 'completed' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setViewingRecordsAppt(selectedAppt);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-sm transition-all cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Ver evolução</span>
                    </button>
                  ) : selectedAppt.status === 'cancelled' || selectedAppt.status === 'no_show' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setViewingRecordsAppt(selectedAppt);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Ver prontuário do paciente</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        startConsultation(selectedAppt);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-sm shadow-teal-600/15 transition-all cursor-pointer"
                    >
                      <Stethoscope className="w-4 h-4" />
                      <span>
                        {selectedAppt.status === 'in_progress' ? 'Continuar atendimento' : 'Iniciar atendimento'}
                      </span>
                    </button>
                  )}

                  {/* Linha de Ações Secundárias: Enviar pelo WhatsApp + Gerenciar agendamento */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleManualWhatsApp(selectedAppt)}
                      title="Abrir WhatsApp com lembrete preenchido"
                      className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50/80 active:bg-emerald-100 border border-emerald-200/90 hover:border-emerald-300 shadow-2xs transition-all cursor-pointer"
                    >
                      <WhatsAppIcon className="w-4 h-4 fill-emerald-600 shrink-0" />
                      <span>Enviar pelo WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowManageMenu(prev => !prev)}
                      aria-expanded={showManageMenu}
                      className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all cursor-pointer"
                    >
                      <Settings2 className="w-4 h-4 text-slate-500" />
                      <span>Gerenciar agendamento</span>
                      {showManageMenu ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>
                  </div>

                  {/* 15-17. MENU COLAPSÁVEL: GERENCIAR AGENDAMENTO + HISTÓRICO DE COMUNICAÇÕES */}
                  {showManageMenu && (
                    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-3 animate-in fade-in duration-150">
                      <div className="flex flex-wrap items-center gap-2">
                        {(selectedAppt.status === 'scheduled' || selectedAppt.status === 'rescheduled') && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(selectedAppt.id, 'confirmed')}
                            className="px-3 py-1.5 text-xs font-semibold bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
                          >
                            Confirmar presença
                          </button>
                        )}

                        {['scheduled', 'confirmed', 'rescheduled'].includes(selectedAppt.status) && (
                          <button
                            type="button"
                            onClick={() => startConsultation(selectedAppt)}
                            className="px-3 py-1.5 text-xs font-semibold bg-white text-teal-700 hover:bg-teal-50 border border-teal-200 rounded-xl transition-colors cursor-pointer"
                          >
                            Iniciar atendimento
                          </button>
                        )}

                        {['in_progress', 'confirmed', 'scheduled', 'rescheduled'].includes(selectedAppt.status) && (
                          <button
                            type="button"
                            onClick={() => {
                              setFinishingAppt(selectedAppt);
                              setSelectedAppt(null);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold bg-white text-teal-800 hover:bg-teal-50 border border-teal-300 rounded-xl transition-colors cursor-pointer"
                          >
                            Concluir atendimento
                          </button>
                        )}

                        {!['completed', 'cancelled'].includes(selectedAppt.status) && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsRescheduling(true);
                              setRescheduleDate(selectedAppt.start_time.split('T')[0]);
                              setRescheduleTime(selectedAppt.start_time.split('T')[1].slice(0, 5));
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-xl transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Remarcar</span>
                          </button>
                        )}

                        {!['completed', 'cancelled', 'no_show'].includes(selectedAppt.status) && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(selectedAppt.id, 'no_show')}
                            className="px-3 py-1.5 text-xs font-semibold bg-white text-amber-800 hover:bg-amber-50 border border-amber-200 rounded-xl transition-colors cursor-pointer"
                          >
                            Marcar falta
                          </button>
                        )}

                        {!['completed', 'cancelled'].includes(selectedAppt.status) && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancellingAppt(selectedAppt);
                              setCancellationReason('');
                              setCancellationCategory('Desistência do paciente');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold bg-white text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                          >
                            Cancelar agendamento
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setShowCommsHistory(prev => !prev)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer ml-auto"
                        >
                          <History className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Histórico de comunicações{communications.length > 0 ? ` (${communications.length})` : ''}
                          </span>
                          {showCommsHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {showCommsHistory && (
                        <div className="pt-2.5 border-t border-slate-200/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Histórico de Comunicações & Lembretes
                            </h4>
                            {loadingComms && (
                              <span className="text-[10px] text-slate-400">Carregando...</span>
                            )}
                          </div>

                          {communications.length === 0 && !loadingComms ? (
                            <p className="text-[11px] text-slate-400 italic">
                              Nenhum lembrete registrado para este agendamento até o momento.
                            </p>
                          ) : (
                            <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                              {communications.map((comm) => {
                                const sentDate = comm.sent_at || comm.created_at;
                                const dateFormatted = sentDate
                                  ? new Date(sentDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                                  : '';
                                const isManual = comm.mode === 'manual' || comm.type === 'reminder_manual';

                                return (
                                  <div
                                    key={comm.id}
                                    className="bg-white border border-slate-200/80 rounded-lg p-2 text-[11px] flex items-center justify-between gap-2"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600 shrink-0" />
                                      <div className="truncate">
                                        <span className="font-semibold text-slate-700">
                                          {isManual ? 'WhatsApp Manual' : 'WhatsApp Automático'}
                                        </span>
                                        {comm.sent_by_name && (
                                          <span className="text-slate-500 ml-1">por {comm.sent_by_name}</span>
                                        )}
                                        <span className="text-slate-400 ml-1">• {dateFormatted}</span>
                                      </div>
                                    </div>
                                    <span
                                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        comm.delivery_status === 'delivered' || comm.status === 'sent'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : comm.delivery_status === 'manual_opened'
                                          ? 'bg-blue-100 text-blue-800'
                                          : comm.status === 'failed'
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {comm.delivery_status === 'delivered'
                                        ? 'Enviado'
                                        : comm.delivery_status === 'manual_opened'
                                        ? 'Aberto'
                                        : comm.status === 'failed'
                                        ? 'Falhou'
                                        : 'Pendente'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Sub-view: Remarcar */
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-sm">Remarcar Atendimento</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nova Data</label>
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={e => {
                        setRescheduleDate(e.target.value);
                        setRescheduleTime('');
                      }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Horários de Trabalho Disponíveis</label>
                    {loadingRescheduleSlots ? (
                      <div className="text-xs text-slate-400 py-2">Carregando horários do profissional...</div>
                    ) : rescheduleSlots.length > 0 ? (
                      <div className="grid grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
                        {rescheduleSlots.map((slot: any) => {
                          const timeStr = (slot.start || slot.time || '').slice(11, 16) || slot.time;
                          const isSelected = rescheduleTime === timeStr;
                          return (
                            <button
                              key={timeStr}
                              type="button"
                              onClick={() => setRescheduleTime(timeStr)}
                              className={`py-1.5 px-2 text-xs rounded-lg font-semibold transition-all ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-white hover:bg-indigo-50 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {timeStr}
                            </button>
                          );
                        })}
                      </div>
                    ) : rescheduleDate ? (
                      <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                        Nenhum horário disponível para esta data (fora do expediente, folga ou agenda cheia).
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Selecione uma data para ver os horários de trabalho.</p>
                    )}
                  </div>
                  {rescheduleTime && (
                    <div className="text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center justify-between">
                      <span><span className="font-semibold">Horário selecionado:</span> {rescheduleTime}</span>
                      <button
                        type="button"
                        onClick={() => setRescheduleTime('')}
                        className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setIsRescheduling(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleConfirmReschedule}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                  >
                    Confirmar Remarcação
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Cancelamento Estruturado com Motivo Obrigatório (Item 10) */}
      {cancellingAppt && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto mobile-modal">
          {/* Backdrop cobrindo 100vw/100vh */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs mobile-modal"
            onClick={() => setCancellingAppt(null)}
            aria-hidden="true"
          />

          {/* Modal posicionado acima do backdrop */}
          <div className="relative z-10 bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-rose-600 uppercase">Cancelamento Obrigatório</span>
                <h3 className="text-base font-bold text-slate-900">Confirmar Cancelamento</h3>
              </div>
              <button aria-label="Fechar"
                onClick={() => setCancellingAppt(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              O cancelamento preservará o registro no histórico do paciente e na auditoria do sistema sem excluir os dados.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Categoria do Motivo *</label>
                <select
                  value={cancellationCategory}
                  onChange={e => setCancellationCategory(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-medium"
                >
                  <option value="Desistência do paciente">Desistência do paciente</option>
                  <option value="Imprevisto médico">Imprevisto médico</option>
                  <option value="Problema técnico">Problema técnico</option>
                  <option value="Erro de agendamento">Erro de agendamento</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Justificativa Detalhada (Opcional)</label>
                <textarea
                  rows={3}
                  value={cancellationReason}
                  onChange={e => setCancellationReason(e.target.value)}
                  placeholder="Informe detalhes adicionais sobre o cancelamento..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                onClick={() => setCancellingAppt(null)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Voltar
              </button>
              <button
                onClick={() => handleUpdateStatus(cancellingAppt.id, 'cancelled', cancellationReason, cancellationCategory)}
                className="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs cursor-pointer"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Seleção de Módulo Clínico (quando profissional possui múltiplas especialidades compatíveis) */}
      {selectingModuleAppt && createPortal(
        <div className="relative z-[9999]">
          <SelectConsultationModuleModal
            isOpen={!!selectingModuleAppt}
            onClose={() => setSelectingModuleAppt(null)}
            modules={compatibleModules}
            patientName={selectingModuleAppt.patient_name}
            serviceName={selectingModuleAppt.service_name}
            onSelectModule={(moduleId) => executeStartConsultation(selectingModuleAppt, moduleId)}
          />
        </div>,
        document.body
      )}

      {/* Modal de Atendimento Rápido */}
      {activeConsultationAppt && createPortal(
        <div className="relative z-[9999]">
          <AppointmentConsultation
            appointment={{
              ...activeConsultationAppt,
              clinical_module: activeConsultationAppt.clinical_module || activeConsultationModule
            }}
            initialModuleType={activeConsultationModule || activeConsultationAppt.clinical_module}
            onClose={() => setActiveConsultationAppt(null)}
            onFinished={() => {
              setActiveConsultationAppt(null);
              fetchCalendarData();
              notifyAppointmentChange();
            }}
          />
        </div>,
        document.body
      )}

      {/* Modal de Finalização de Consulta (Item 5) */}
      {finishingAppt && createPortal(
        <div className="relative z-[9999]">
          <FinishConsultationModal
            appointment={{
              ...finishingAppt
            }}
            onClose={() => setFinishingAppt(null)}
            onFinished={() => {
              setFinishingAppt(null);
              fetchCalendarData();
              notifyAppointmentChange();
            }}
          />
        </div>,
        document.body
      )}

      {/* Modal de Envio Manual de Lembrete pelo WhatsApp */}
      {whatsappReminderAppt && createPortal(
        <div className="relative z-[9999]">
          <WhatsAppReminderModal
            isOpen={Boolean(whatsappReminderAppt)}
            onClose={() => setWhatsappReminderAppt(null)}
            appointment={whatsappReminderAppt}
            clinicName={currentTenant?.name || 'Clínica'}
            onSuccess={() => {
              refreshCommunications(whatsappReminderAppt.id);
              fetchCalendarData();
              notifyAppointmentChange();
            }}
          />
        </div>,
        document.body
      )}
      {consentPatientId && <PatientConsentsDialog patientId={consentPatientId} onClose={() => setConsentPatientId(null)} />}
      {viewingRecordsAppt && createPortal(
        <div className="relative z-[10050]">
          <PatientPreviousRecordsModal
            isOpen={Boolean(viewingRecordsAppt)}
            onClose={() => setViewingRecordsAppt(null)}
            patientId={viewingRecordsAppt.patient_id}
            patientName={viewingRecordsAppt.patient_name || 'Paciente'}
          />
        </div>,
        document.body
      )}
    </div>
  );
};
