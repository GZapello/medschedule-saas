import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  CalendarClock,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar as CalendarIcon,
  Palmtree,
  Ban,
  Coffee,
  User,
  Save,
  ChevronRight
} from 'lucide-react';
import { Professional } from '../../types';

interface Shift {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_start?: string | null;
  break_end?: string | null;
  is_active: boolean | number;
}

interface BlockedTime {
  id: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  reason?: string;
  type?: string;
}

interface ConflictDetail {
  appointmentId: string;
  patientName: string;
  startTime: string;
  reason: string;
}

const DAYS_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

export const WorkSchedulesView: React.FC = () => {
  const { showToast } = useToast();
  const { isClinicAdmin } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<string>('');

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Tab de visualização: 'schedules' ou 'blocks'
  const [activeTab, setActiveTab] = useState<'schedules' | 'blocks'>('schedules');

  // Modal de novo bloqueio / férias
  const [showBlockModal, setShowBlockModal] = useState<boolean>(false);
  const [blockTitle, setBlockTitle] = useState<string>('');
  const [blockStart, setBlockStart] = useState<string>('');
  const [blockEnd, setBlockEnd] = useState<string>('');
  const [blockType, setBlockType] = useState<string>('vacation');

  // Carrega lista de profissionais
  useEffect(() => {
    const loadProfs = async () => {
      try {
        setLoading(true);
        const data = await ApiClient.get<Professional[]>('/v1/professionals');
        setProfessionals(data);
        if (data.length > 0 && !selectedProfId) {
          setSelectedProfId(data[0].id);
        }
      } catch (err: any) {
        showToast('Erro ao carregar profissionais', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadProfs();
  }, []);

  // Carrega escalas e bloqueios do profissional selecionado
  const loadProfessionalDetails = async (profId: string) => {
    if (!profId) return;
    try {
      setLoading(true);
      setConflicts([]);
      const res = await ApiClient.get<{ professional: Professional; schedules: Shift[]; blockedTimes: BlockedTime[] }>(
        `/v1/professionals/${profId}`
      );
      if (!res.schedules || res.schedules.length === 0) {
        const defaultShifts: Shift[] = [
          { day_of_week: 0, start_time: '08:00', end_time: '12:00', break_start: null, break_end: null, is_active: false },
          { day_of_week: 1, start_time: '08:00', end_time: '18:00', break_start: '12:00', break_end: '13:30', is_active: true },
          { day_of_week: 2, start_time: '08:00', end_time: '18:00', break_start: '12:00', break_end: '13:30', is_active: true },
          { day_of_week: 3, start_time: '08:00', end_time: '18:00', break_start: '12:00', break_end: '13:30', is_active: true },
          { day_of_week: 4, start_time: '08:00', end_time: '18:00', break_start: '12:00', break_end: '13:30', is_active: true },
          { day_of_week: 5, start_time: '08:00', end_time: '18:00', break_start: '12:00', break_end: '13:30', is_active: true },
          { day_of_week: 6, start_time: '08:00', end_time: '12:00', break_start: null, break_end: null, is_active: true },
        ];
        setShifts(defaultShifts);
      } else {
        setShifts(res.schedules);
      }
      setBlockedTimes(res.blockedTimes || []);
    } catch (err: any) {
      showToast('Erro ao carregar escala do profissional', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProfId) {
      loadProfessionalDetails(selectedProfId);
    }
  }, [selectedProfId]);

  // Manipulação de turnos
  const handleAddShift = (dayOfWeek: number) => {
    const newShift: Shift = {
      day_of_week: dayOfWeek,
      start_time: '14:00',
      end_time: '18:00',
      is_active: true
    };
    setShifts(prev => [...prev, newShift]);
  };

  const handleRemoveShift = (index: number) => {
    setShifts(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateShift = (index: number, updates: Partial<Shift>) => {
    setShifts(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const handleToggleDay = (dayOfWeek: number, currentlyHasActive: boolean) => {
    if (currentlyHasActive) {
      // Desativa todos os turnos deste dia
      setShifts(prev =>
        prev.map(s => (s.day_of_week === dayOfWeek ? { ...s, is_active: false } : s))
      );
    } else {
      // Se não há nenhum turno neste dia, adiciona um turno padrão das 08h às 18h com almoço
      const existing = shifts.filter(s => s.day_of_week === dayOfWeek);
      if (existing.length === 0) {
        setShifts(prev => [
          ...prev,
          {
            day_of_week: dayOfWeek,
            start_time: '08:00',
            end_time: '18:00',
            break_start: '12:00',
            break_end: '13:00',
            is_active: true
          }
        ]);
      } else {
        setShifts(prev =>
          prev.map(s => (s.day_of_week === dayOfWeek ? { ...s, is_active: true } : s))
        );
      }
    }
  };

  // Salvar Escala Semanal
  const handleSaveSchedules = async () => {
    if (!selectedProfId) return;
    try {
      setSaving(true);
      setConflicts([]);
      setWarningMessage(null);

      const res = await ApiClient.put<{ message: string; warning?: string; conflicts?: ConflictDetail[] }>(
        `/v1/professionals/${selectedProfId}/schedules`,
        { schedules: shifts }
      );

      if (res.warning) {
        setWarningMessage(res.warning);
        setConflicts(res.conflicts || []);
        showToast('Horários atualizados com sucesso. Conflitos detectados foram preservados com segurança.', 'info');
      } else {
        showToast(res.message || 'Horários atualizados com sucesso.', 'success');
      }
      loadProfessionalDetails(selectedProfId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar horários de trabalho', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Criar Bloqueio / Férias
  const handleCreateBlock = async () => {
    if (!blockTitle || !blockStart || !blockEnd) {
      showToast('Preencha título, início e fim do bloqueio', 'error');
      return;
    }
    try {
      await ApiClient.post('/v1/professionals/blocks', {
        professionalId: selectedProfId,
        title: blockTitle,
        startDatetime: blockStart,
        endDatetime: blockEnd,
        type: blockType
      });
      showToast('Bloqueio registrado com sucesso!', 'success');
      setShowBlockModal(false);
      setBlockTitle('');
      setBlockStart('');
      setBlockEnd('');
      loadProfessionalDetails(selectedProfId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar bloqueio', 'error');
    }
  };

  // Excluir Bloqueio
  const handleDeleteBlock = async (blockId: string) => {
    if (!confirm('Deseja realmente remover este bloqueio/férias da agenda?')) return;
    try {
      await ApiClient.delete(`/v1/professionals/blocks/${blockId}`);
      showToast('Bloqueio removido!', 'success');
      loadProfessionalDetails(selectedProfId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover bloqueio', 'error');
    }
  };

  const selectedProf = professionals.find(p => p.id === selectedProfId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <CalendarClock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Escala de Trabalho & Horários</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure turnos múltiplos, pausas, folgas e períodos de férias por profissional. Consultas existentes nunca são canceladas silenciosamente.
          </p>
        </div>

        {/* Seletor de Profissional */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 whitespace-nowrap">
            <User className="w-4 h-4 text-slate-400" />
            Profissional:
          </label>
          <select
            value={selectedProfId}
            onChange={e => setSelectedProfId(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer min-w-[220px]"
          >
            {professionals.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.specialty_name ? `• ${p.specialty_name}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerta de Perfil: Funcionários não podem editar escala (Item 1) */}
      {!isClinicAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 text-xs font-medium flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Modo de Visualização:</strong> Apenas o Gerente / Administrador da Clínica pode criar, editar ou alterar a escala de trabalho e disponibilidade.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('schedules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'schedules'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          Escala Semanal & Múltiplos Turnos
        </button>
        <button
          onClick={() => setActiveTab('blocks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'blocks'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Palmtree className="w-4 h-4" />
          Férias, Folgas & Bloqueios ({blockedTimes.length})
        </button>
      </div>

      {/* Alerta de Conflitos Detectados ao Salvar */}
      {warningMessage && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 animate-in fade-in-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <h4 className="font-bold text-amber-900 text-sm">Avisos de Conflito de Horário</h4>
              <p className="text-xs text-amber-800 leading-relaxed">{warningMessage}</p>
              {conflicts.length > 0 && (
                <div className="mt-3 bg-white/80 rounded-xl p-3 border border-amber-200 space-y-2 max-h-48 overflow-y-auto">
                  {conflicts.map((c, idx) => (
                    <div key={idx} className="text-xs border-b border-amber-100 last:border-0 pb-1.5 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <span className="font-bold text-slate-800">{c.patientName}</span>
                        <span className="text-slate-500 ml-2">({new Date(c.startTime).toLocaleString('pt-BR')})</span>
                      </div>
                      <span className="text-amber-700 font-medium text-[11px]">{c.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Escala Semanal */}
      {activeTab === 'schedules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-slate-600 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                Configure os dias em que <strong>{selectedProf?.name || 'o profissional'}</strong> atende na clínica e adicione quantos turnos forem necessários (ex: manhã, tarde, noite).
              </span>
            </div>
            {isClinicAdmin ? (
              <button
                onClick={handleSaveSchedules}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 text-xs"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Salvar Grade de Horários'}
              </button>
            ) : (
              <span className="text-xs font-bold text-slate-500 bg-slate-200/70 px-3.5 py-2 rounded-xl">
                Visualização da Escala
              </span>
            )}
          </div>

          <div className="space-y-3">
            {DAYS_NAMES.map((dayName, dayIndex) => {
              const dayShifts = shifts
                .map((shift, originalIndex) => ({ shift, originalIndex }))
                .filter(item => Number(item.shift.day_of_week) === dayIndex);

              const hasActiveShift = dayShifts.some(item => Boolean(item.shift.is_active));

              return (
                <div
                  key={dayIndex}
                  className={`bg-white rounded-2xl border transition-all ${
                    hasActiveShift ? 'border-slate-200 shadow-2xs' : 'border-slate-100 bg-slate-50/40 opacity-70'
                  }`}
                >
                  <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={hasActiveShift}
                        disabled={!isClinicAdmin}
                        onChange={() => handleToggleDay(dayIndex, hasActiveShift)}
                        className="w-4 h-4 text-indigo-600 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        id={`day-${dayIndex}`}
                      />
                      <label htmlFor={`day-${dayIndex}`} className="font-bold text-slate-800 text-sm cursor-pointer select-none">
                        {dayName}
                      </label>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        hasActiveShift ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {hasActiveShift ? `${dayShifts.filter(s => s.shift.is_active).length} turno(s) ativo(s)` : 'Sem expediente'}
                      </span>
                    </div>

                    {isClinicAdmin && hasActiveShift && (
                      <button
                        type="button"
                        onClick={() => handleAddShift(dayIndex)}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold px-3 py-1 rounded-lg hover:bg-indigo-50 transition-all cursor-pointer self-start md:self-auto"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Turno
                      </button>
                    )}
                  </div>

                  {hasActiveShift && (
                    <div className="p-4 space-y-3">
                      {dayShifts.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Nenhum turno configurado para este dia.</p>
                      ) : (
                        dayShifts.map(({ shift, originalIndex }, shiftIdx) => (
                          <div
                            key={originalIndex}
                            className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 flex flex-col lg:flex-row lg:items-center gap-3 text-xs"
                          >
                            <span className="font-bold text-slate-600 min-w-[70px]">Turno #{shiftIdx + 1}:</span>

                            {/* Horário Início / Fim */}
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 font-medium">Das</span>
                              <input
                                type="time"
                                value={shift.start_time}
                                disabled={!isClinicAdmin}
                                onChange={e => handleUpdateShift(originalIndex, { start_time: e.target.value })}
                                className="border border-slate-200 rounded-lg px-2 py-1 bg-white font-semibold text-slate-800 text-xs disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                              />
                              <span className="text-slate-500 font-medium">às</span>
                              <input
                                type="time"
                                value={shift.end_time}
                                disabled={!isClinicAdmin}
                                onChange={e => handleUpdateShift(originalIndex, { end_time: e.target.value })}
                                className="border border-slate-200 rounded-lg px-2 py-1 bg-white font-semibold text-slate-800 text-xs disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                              />
                            </div>

                            {/* Intervalo / Pausa */}
                            <div className="flex items-center gap-2">
                              <Coffee className="w-3.5 h-3.5 text-amber-600" />
                              <span className="text-slate-500 font-medium">Pausa:</span>
                              <input
                                type="time"
                                value={shift.break_start || ''}
                                disabled={!isClinicAdmin}
                                onChange={e => handleUpdateShift(originalIndex, { break_start: e.target.value || null })}
                                placeholder="--:--"
                                className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-xs disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                              />
                              <span className="text-slate-400">até</span>
                              <input
                                type="time"
                                value={shift.break_end || ''}
                                disabled={!isClinicAdmin}
                                onChange={e => handleUpdateShift(originalIndex, { break_end: e.target.value || null })}
                                placeholder="--:--"
                                className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-xs disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                              />
                            </div>

                            {/* Remover turno */}
                            {isClinicAdmin && (
                              <div className="lg:ml-auto flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveShift(originalIndex)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                  title="Remover turno"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Férias, Folgas e Bloqueios */}
      {activeTab === 'blocks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Ausências e Recessos Agendados</h3>
              <p className="text-xs text-slate-500">
                Horários ou dias inteiros bloqueados em que novos agendamentos não serão permitidos para {selectedProf?.name}.
              </p>
            </div>
            {isClinicAdmin && (
              <button
                onClick={() => setShowBlockModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Registrar Ausência / Férias
              </button>
            )}
          </div>

          {blockedTimes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
              <Palmtree className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              Nenhum período de férias ou bloqueio futuro programado para este profissional.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {blockedTimes.map(block => (
                <div key={block.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {block.type === 'vacation' ? 'Férias' : block.type === 'day_off' ? 'Folga' : 'Bloqueio'}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm mt-1">{block.title}</h4>
                    </div>
                    {isClinicAdmin && (
                      <button
                        onClick={() => handleDeleteBlock(block.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
                        title="Excluir bloqueio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700">De:</span>
                      <span>{new Date(block.start_datetime).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700">Até:</span>
                      <span>{new Date(block.end_datetime).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Novo Bloqueio / Férias */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Registrar Ausência / Férias</h3>
              <button onClick={() => setShowBlockModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de Ausência</label>
                <select
                  value={blockType}
                  onChange={e => setBlockType(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-semibold"
                >
                  <option value="vacation">Férias</option>
                  <option value="day_off">Folga Programada</option>
                  <option value="medical">Licença / Consulta Médica</option>
                  <option value="event">Congresso / Treinamento</option>
                  <option value="recess">Recesso Geral</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título / Motivo *</label>
                <input
                  type="text"
                  value={blockTitle}
                  onChange={e => setBlockTitle(e.target.value)}
                  placeholder="Ex: Férias de Verão, Congresso Paulista"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data/Hora Início *</label>
                  <input
                    type="datetime-local"
                    value={blockStart}
                    onChange={e => setBlockStart(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data/Hora Término *</label>
                  <input
                    type="datetime-local"
                    value={blockEnd}
                    onChange={e => setBlockEnd(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateBlock}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar Bloqueio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default WorkSchedulesView;
