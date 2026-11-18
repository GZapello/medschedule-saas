import React, { useState } from 'react';
import {
  KeyRound,
  User,
  Users,
  FileCheck2,
  Clock,
  ShieldAlert,
  Plus,
  Trash2,
  Sparkles
} from 'lucide-react';
import {
  StudioServiceType,
  StudioAccessConfig,
  StudioPriceAdjustmentRule,
  DEFAULT_STUDIO_ACCESS_CONFIG
} from '../../utils/studioAccessAndCommercial';

interface StudioAccessAndAdjustmentsPanelProps {
  studioServiceType: StudioServiceType;
  onStudioServiceTypeChange: (nextType: StudioServiceType) => void;
  accessConfig: StudioAccessConfig;
  onAccessConfigChange: (nextConfig: StudioAccessConfig) => void;
  pricingAdjustments: StudioPriceAdjustmentRule[];
  onPricingAdjustmentsChange: (nextRules: StudioPriceAdjustmentRule[]) => void;
  defaultCapacity: number;
  onDefaultCapacityChange?: (nextCap: number) => void;
  allowPublicBooking?: boolean;
  onAllowPublicBookingChange?: (allow: boolean) => void;
}

const WEEKDAY_SHORT = [
  { day: 0, label: 'Dom' },
  { day: 1, label: 'Seg' },
  { day: 2, label: 'Ter' },
  { day: 3, label: 'Qua' },
  { day: 4, label: 'Qui' },
  { day: 5, label: 'Sex' },
  { day: 6, label: 'Sáb' }
];

export const StudioAccessAndAdjustmentsPanel: React.FC<StudioAccessAndAdjustmentsPanelProps> = ({
  studioServiceType,
  onStudioServiceTypeChange,
  accessConfig,
  onAccessConfigChange,
  pricingAdjustments,
  onPricingAdjustmentsChange,
  defaultCapacity,
  onDefaultCapacityChange,
  allowPublicBooking = true,
  onAllowPublicBookingChange
}) => {
  const [newWindowStart, setNewWindowStart] = useState('06:00');
  const [newWindowEnd, setNewWindowEnd] = useState('22:00');
  const [showAdjustments, setShowAdjustments] = useState(pricingAdjustments.length > 0);

  const cfg = accessConfig || DEFAULT_STUDIO_ACCESS_CONFIG;

  const updateCfg = (patch: Partial<StudioAccessConfig>) => {
    onAccessConfigChange({
      ...cfg,
      ...patch
    });
  };

  const toggleAllowedWeekday = (day: number) => {
    const current = Array.isArray(cfg.allowedWeekdays) ? cfg.allowedWeekdays : [0, 1, 2, 3, 4, 5, 6];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b);
    updateCfg({ allowedWeekdays: next.length > 0 ? next : [day] });
  };

  const addTimeWindow = () => {
    if (!newWindowStart || !newWindowEnd || newWindowStart >= newWindowEnd) return;
    const next = [
      ...(cfg.allowedTimeWindows || []),
      { startTime: newWindowStart, endTime: newWindowEnd }
    ];
    updateCfg({ allowedTimeWindows: next });
  };

  const removeTimeWindow = (idx: number) => {
    const next = (cfg.allowedTimeWindows || []).filter((_, i) => i !== idx);
    updateCfg({ allowedTimeWindows: next });
  };

  const addAdjustmentRule = () => {
    const nextRule: StudioPriceAdjustmentRule = {
      id: `adj-${Date.now()}`,
      label: 'Horário de Pico (Noite)',
      adjustmentType: 'surcharge',
      valueType: 'fixed',
      amount: 15,
      incidence: 'per_student',
      weekdays: [1, 2, 3, 4, 5],
      startTime: '18:00',
      endTime: '21:00',
      modality: null,
      professionalId: null,
      sessionType: null,
      active: true
    };
    onPricingAdjustmentsChange([...pricingAdjustments, nextRule]);
    setShowAdjustments(true);
  };

  const updateAdjustmentRule = (idx: number, patch: Partial<StudioPriceAdjustmentRule>) => {
    const next = pricingAdjustments.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onPricingAdjustmentsChange(next);
  };

  const removeAdjustmentRule = (idx: number) => {
    onPricingAdjustmentsChange(pricingAdjustments.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Seletor de Natureza Operacional do Serviço (Academia & Studio) */}
      <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              Natureza Operacional (Academia &amp; Studio)
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Defina como este serviço funciona na rotina da academia, studio ou personal trainer.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onStudioServiceTypeChange('facility_access')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
              studioServiceType === 'facility_access'
                ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-2xs'
                : 'border-slate-200 bg-white/80 hover:bg-white'
            }`}
          >
            <KeyRound className={`w-4 h-4 mt-0.5 shrink-0 ${studioServiceType === 'facility_access' ? 'text-teal-600' : 'text-slate-400'}`} />
            <div>
              <div className="font-bold text-slate-900">Tipo A — Acesso ao Estabelecimento</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Musculação, academia livre ou limitada (2x, 3x, 5x/sem). Não ocupa agenda de instrutores.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onStudioServiceTypeChange('individual')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
              studioServiceType === 'individual'
                ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-2xs'
                : 'border-slate-200 bg-white/80 hover:bg-white'
            }`}
          >
            <User className={`w-4 h-4 mt-0.5 shrink-0 ${studioServiceType === 'individual' ? 'text-teal-600' : 'text-slate-400'}`} />
            <div>
              <div className="font-bold text-slate-900">Tipo B — Atendimento Individual</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Personal trainer individual, Pilates individual, avaliação física com hora marcada.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onStudioServiceTypeChange('group')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
              studioServiceType === 'group'
                ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-2xs'
                : 'border-slate-200 bg-white/80 hover:bg-white'
            }`}
          >
            <Users className={`w-4 h-4 mt-0.5 shrink-0 ${studioServiceType === 'group' ? 'text-teal-600' : 'text-slate-400'}`} />
            <div>
              <div className="font-bold text-slate-900">Tipo C — Turma ou Dupla Compartilhada</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Personal em dupla (2 vagas), Pilates em grupo, Funcional, Dança, Yoga, Zumba, Artes marciais.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onStudioServiceTypeChange('non_scheduled')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
              studioServiceType === 'non_scheduled'
                ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-2xs'
                : 'border-slate-200 bg-white/80 hover:bg-white'
            }`}
          >
            <FileCheck2 className={`w-4 h-4 mt-0.5 shrink-0 ${studioServiceType === 'non_scheduled' ? 'text-teal-600' : 'text-slate-400'}`} />
            <div>
              <div className="font-bold text-slate-900">Tipo D — Serviço Entregável</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Montagem de treino ou consultoria sem necessidade de reservar horário na agenda.
              </div>
            </div>
          </button>
        </div>

        {/* Atalho rápido para Dupla (2 vagas) vs Turma quando Tipo C */}
        {studioServiceType === 'group' && onDefaultCapacityChange && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-slate-700">Formato rápido de vagas:</span>
            {[
              { label: 'Dupla (2 alunos)', cap: 2 },
              { label: 'Trio (3 alunos)', cap: 3 },
              { label: 'Studio (6 vagas)', cap: 6 },
              { label: 'Turma (12 vagas)', cap: 12 },
              { label: 'Coletiva (20 vagas)', cap: 20 }
            ].map(preset => (
              <button
                key={preset.cap}
                type="button"
                onClick={() => onDefaultCapacityChange(preset.cap)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                  Number(defaultCapacity) === preset.cap
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Painel completo de Acesso ao Estabelecimento (quando Tipo A) */}
      {studioServiceType === 'facility_access' && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-bold text-indigo-950 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                Regras do Plano de Acesso (Catraca / Recepção / QR Code)
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Este serviço não ocupa horários na agenda de profissionais. As entradas são validadas em Controle de Acesso.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => updateCfg({ accessMode: 'unlimited', maxEntriesPerWeek: null, maxEntriesPerMonth: null })}
              className={`p-3 rounded-xl border text-left cursor-pointer ${
                cfg.accessMode === 'unlimited'
                  ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20'
                  : 'border-slate-200 bg-white/70 hover:bg-white'
              }`}
            >
              <div className="font-bold text-slate-900">Acesso Livre (Ilimitado)</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Aluno pode frequentar todos os dias e horários permitidos durante a vigência.
              </div>
            </button>

            <button
              type="button"
              onClick={() => updateCfg({ accessMode: 'limited', maxEntriesPerWeek: cfg.maxEntriesPerWeek || 3 })}
              className={`p-3 rounded-xl border text-left cursor-pointer ${
                cfg.accessMode === 'limited'
                  ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20'
                  : 'border-slate-200 bg-white/70 hover:bg-white'
              }`}
            >
              <div className="font-bold text-slate-900">Acesso Limitado por Frequência</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Ex: 2x, 3x ou 5x por semana, ou 12x por mês (controlado no check-in).
              </div>
            </button>
          </div>

          {cfg.accessMode === 'limited' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Entradas por semana</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  placeholder="Ex: 3"
                  value={cfg.maxEntriesPerWeek ?? ''}
                  onChange={e => updateCfg({ maxEntriesPerWeek: e.target.value ? Number(e.target.value) : null })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                />
                <div className="flex gap-1 mt-1">
                  {[2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateCfg({ maxEntriesPerWeek: n, countPeriod: 'weekly' })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        cfg.maxEntriesPerWeek === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {n}x/sem
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Entradas por mês (opcional)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  placeholder="Ex: 12"
                  value={cfg.maxEntriesPerMonth ?? ''}
                  onChange={e => updateCfg({ maxEntriesPerMonth: e.target.value ? Number(e.target.value) : null })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Início da semana</label>
                <select
                  value={cfg.weekStartDay}
                  onChange={e => updateCfg({ weekStartDay: Number(e.target.value) === 0 ? 0 : 1 })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value={1}>Segunda-feira</option>
                  <option value={0}>Domingo</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Limite por dia</label>
              <input
                type="number"
                min={1}
                max={10}
                placeholder="Ilimitado"
                value={cfg.maxEntriesPerDay ?? ''}
                onChange={e => updateCfg({ maxEntriesPerDay: e.target.value ? Number(e.target.value) : null })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
              <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.allowSameDayReentry}
                  onChange={e => updateCfg({ allowSameDayReentry: e.target.checked })}
                />
                Permitir reentrada no mesmo dia
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Lotação simultânea máx.</label>
              <input
                type="number"
                min={1}
                max={5000}
                placeholder="Sem limite fixo"
                value={cfg.maxSimultaneousCapacity ?? ''}
                onChange={e => updateCfg({ maxSimultaneousCapacity: e.target.value ? Number(e.target.value) : null })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
              <span className="block text-[10px] text-slate-400 mt-1">
                Controla ocupação ativa na academia
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Regra em feriados</label>
              <select
                value={cfg.holidayPolicy}
                onChange={e => updateCfg({ holidayPolicy: e.target.value as any })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
              >
                <option value="normal">Acesso normal</option>
                <option value="ignore_limit">Liberar sem descontar limite</option>
                <option value="block">Bloquear entrada no feriado</option>
              </select>
            </div>
          </div>

          {/* Dias permitidos */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
            <label className="block font-semibold text-slate-700">Dias da semana permitidos para acesso</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map(w => {
                const active = (cfg.allowedWeekdays || []).includes(w.day);
                return (
                  <button
                    key={w.day}
                    type="button"
                    onClick={() => toggleAllowedWeekday(w.day)}
                    className={`px-3 py-1 rounded-lg border font-bold text-xs cursor-pointer ${
                      active
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Janelas de horário permitidas */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Faixas horárias permitidas (vazio = qualquer horário de funcionamento)
              </label>
            </div>
            {(cfg.allowedTimeWindows || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {cfg.allowedTimeWindows.map((win, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold"
                  >
                    {win.startTime} às {win.endTime}
                    <button
                      type="button"
                      onClick={() => removeTimeWindow(idx)}
                      className="text-indigo-500 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={newWindowStart}
                onChange={e => setNewWindowStart(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
              />
              <span className="text-slate-500">até</span>
              <input
                type="time"
                value={newWindowEnd}
                onChange={e => setNewWindowEnd(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={addTimeWindow}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar faixa (ex: Horário Econômico)
              </button>
            </div>
          </div>

          {/* Bloqueio por inadimplência e Contratação Pública */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.blockOnOverdue}
                  onChange={e => updateCfg({ blockOnOverdue: e.target.checked })}
                />
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                Bloquear acesso se houver parcela vencida
              </label>
              {cfg.blockOnOverdue && (
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-[11px] text-slate-600">Dias de tolerância após vencimento:</span>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={cfg.overdueGraceDays}
                    onChange={e => updateCfg({ overdueGraceDays: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center"
                  />
                </div>
              )}
            </div>

            {onAllowPublicBookingChange && (
              <div className="flex items-center">
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowPublicBooking}
                    onChange={e => onAllowPublicBookingChange(e.target.checked)}
                  />
                  Permitir contratação deste plano pelo Link Público (sem exigir horário)
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regras de Adicional ou Desconto por Horário / Turno / Dia (Seção 8) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-800">Adicionais ou Descontos por Horário / Turno</h4>
            <p className="text-[11px] text-slate-500">
              Opcional: configure horário de pico, horário econômico, adicional noturno ou fim de semana.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (pricingAdjustments.length === 0) addAdjustmentRule();
              else setShowAdjustments(!showAdjustments);
            }}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer shrink-0"
          >
            {pricingAdjustments.length === 0
              ? '+ Criar regra de horário'
              : showAdjustments
                ? 'Ocultar regras'
                : `Ver regras (${pricingAdjustments.length})`}
          </button>
        </div>

        {showAdjustments && (
          <div className="space-y-2.5 pt-1">
            {pricingAdjustments.map((rule, idx) => (
              <div key={rule.id || idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={rule.label}
                    onChange={e => updateAdjustmentRule(idx, { label: e.target.value })}
                    placeholder="Nome (ex: Horário de Pico)"
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white font-semibold"
                  />
                  <select
                    value={rule.adjustmentType}
                    onChange={e => updateAdjustmentRule(idx, { adjustmentType: e.target.value as any })}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="surcharge">Adicional (+)</option>
                    <option value="discount">Desconto (-)</option>
                  </select>
                  <select
                    value={rule.valueType}
                    onChange={e => updateAdjustmentRule(idx, { valueType: e.target.value as any })}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="fixed">Valor fixo (R$)</option>
                    <option value="percentage">Percentual (%)</option>
                  </select>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={rule.amount}
                      onChange={e => updateAdjustmentRule(idx, { amount: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => removeAdjustmentRule(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg bg-white border border-slate-200 cursor-pointer"
                      title="Remover regra"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-slate-600 font-medium">Horário:</span>
                  <input
                    type="time"
                    value={rule.startTime || ''}
                    onChange={e => updateAdjustmentRule(idx, { startTime: e.target.value || null })}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                  />
                  <span>às</span>
                  <input
                    type="time"
                    value={rule.endTime || ''}
                    onChange={e => updateAdjustmentRule(idx, { endTime: e.target.value || null })}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                  />
                  <select
                    value={rule.incidence}
                    onChange={e => updateAdjustmentRule(idx, { incidence: e.target.value as any })}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                  >
                    <option value="per_student">Por aluno</option>
                    <option value="per_session">Por sessão/turma</option>
                  </select>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addAdjustmentRule}
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar outra regra de horário/turno
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
