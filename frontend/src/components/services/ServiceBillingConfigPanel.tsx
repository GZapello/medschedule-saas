import React from 'react';
import { CreditCard, Info, Package as PackageIcon, Repeat } from 'lucide-react';
import {
  SERVICE_BILLING_MODE_OPTIONS,
  ServiceBillingMode,
  formatServiceBillingSummary,
  isPeriodicBillingMode
} from '../../utils/establishmentContext';

export interface ServicePackageOption {
  id: string;
  name: string;
  total_price?: number | null;
  price?: number | null;
  billing_type?: string | null;
  billing_frequency?: string | null;
  included_sessions?: number | null;
}

interface ServiceBillingConfigPanelProps {
  serviceName: string;
  billingMode: ServiceBillingMode;
  sessionPrice: number;
  periodicPrice: string;
  defaultPackageId: string;
  defaultBillingDueDay: string;
  availablePackages?: ServicePackageOption[];
  compact?: boolean;
  onChange: (next: {
    billingMode: ServiceBillingMode;
    periodicPrice: string;
    defaultPackageId: string;
    defaultBillingDueDay: string;
  }) => void;
}

export const ServiceBillingConfigPanel: React.FC<ServiceBillingConfigPanelProps> = ({
  serviceName,
  billingMode,
  sessionPrice,
  periodicPrice,
  defaultPackageId,
  defaultBillingDueDay,
  availablePackages = [],
  compact = false,
  onChange
}) => {
  const isPeriodic = isPeriodicBillingMode(billingMode);
  const selectedPkg = availablePackages.find((pkg) => pkg.id === defaultPackageId) || null;
  const parsedPeriodicPrice = periodicPrice.trim() !== '' ? Number(periodicPrice) : 0;

  const summaryText = formatServiceBillingSummary({
    serviceName: serviceName || 'Serviço',
    billingMode,
    sessionPrice,
    periodicPrice: isPeriodic ? (Number.isFinite(parsedPeriodicPrice) ? parsedPeriodicPrice : 0) : null,
    packageName: selectedPkg?.name || null
  });

  const handleModeChange = (nextMode: ServiceBillingMode) => {
    let nextPeriodicPrice = periodicPrice;
    if (isPeriodicBillingMode(nextMode) && (!nextPeriodicPrice || Number(nextPeriodicPrice) <= 0) && sessionPrice > 0) {
      nextPeriodicPrice = String(sessionPrice);
    }
    onChange({
      billingMode: nextMode,
      periodicPrice: nextPeriodicPrice,
      defaultPackageId: nextMode === 'package' ? defaultPackageId : '',
      defaultBillingDueDay
    });
  };

  return (
    <div className={`rounded-xl border border-emerald-100 bg-emerald-50/40 ${compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Configuração de Cobrança</span>
          </div>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Define o modelo comercial padrão no Studio. Não gera cobranças ao salvar e preserva contratos existentes.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Modalidade de cobrança padrão
        </label>
        <div className={`grid gap-1.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {SERVICE_BILLING_MODE_OPTIONS.map((opt) => {
            const active = billingMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleModeChange(opt.value)}
                className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white border-emerald-600 font-semibold shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                }`}
              >
                <div className="leading-tight">{opt.label}</div>
                <div className={`text-[10px] mt-0.5 ${active ? 'text-emerald-100' : 'text-gray-400'}`}>
                  {opt.shortPeriod}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {isPeriodic && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Valor por período de cobrança (R$) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={periodicPrice}
              onChange={(e) =>
                onChange({
                  billingMode,
                  periodicPrice: e.target.value,
                  defaultPackageId,
                  defaultBillingDueDay
                })
              }
              placeholder="Ex: 540.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Valor configurado por ciclo ({SERVICE_BILLING_MODE_OPTIONS.find((o) => o.value === billingMode)?.shortPeriod}), independente da quantidade de aulas na semana.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Dia padrão de vencimento (opcional)
            </label>
            <input
              type="number"
              min={1}
              max={28}
              value={defaultBillingDueDay}
              onChange={(e) =>
                onChange({
                  billingMode,
                  periodicPrice,
                  defaultPackageId,
                  defaultBillingDueDay: e.target.value
                })
              }
              placeholder="Ex: 10 (1 a 28)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Pode ser ajustado no momento da contratação do aluno.
            </p>
          </div>
        </div>
      )}

      {billingMode === 'package' && (
        <div className="pt-1">
          <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
            <PackageIcon className="w-3.5 h-3.5 text-emerald-600" />
            Pacote de Serviços sugerido (opcional)
          </label>
          <select
            value={defaultPackageId}
            onChange={(e) =>
              onChange({
                billingMode,
                periodicPrice,
                defaultPackageId: e.target.value,
                defaultBillingDueDay
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="">Selecionar automaticamente pacote compatível na agenda</option>
            {availablePackages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
                {typeof pkg.total_price === 'number'
                  ? ` — R$ ${Number(pkg.total_price).toFixed(2)}`
                  : typeof pkg.price === 'number'
                    ? ` — R$ ${Number(pkg.price).toFixed(2)}`
                    : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            Ao agendar aulas cobertas por pacote existente, nenhuma cobrança avulsa por sessão é gerada.
          </p>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-white border border-emerald-200/80 px-3 py-2 text-xs text-emerald-950">
        {isPeriodic ? (
          <Repeat className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        )}
        <div>
          <span className="font-medium">Resumo comercial: </span>
          <span>{summaryText}</span>
        </div>
      </div>
    </div>
  );
};
