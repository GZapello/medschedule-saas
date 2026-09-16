import React from 'react';
import {
  Activity,
  Smile,
  Apple,
  Hand,
  MessageCircle,
  Stethoscope,
  X,
  ChevronRight
} from 'lucide-react';

export interface ClinicalModuleOption {
  id: 'ZemdaFisio' | 'ZemdaFono' | 'ZemdaOdonto' | 'ZemdaNutri' | 'ZemdaTO' | 'general';
  name: string;
  badge: string;
  profession: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  colorTheme: {
    border: string;
    bg: string;
    hoverBg: string;
    text: string;
    badgeBg: string;
    badgeText: string;
    iconBg: string;
    iconColor: string;
  };
}

export const ALL_CLINICAL_MODULES: Record<string, ClinicalModuleOption> = {
  ZemdaFisio: {
    id: 'ZemdaFisio',
    name: 'ZemdaFisio',
    badge: 'Fisioterapia',
    profession: 'Fisioterapia & Reabilitação',
    description: 'Avaliação cinético-funcional, mapa corporal de dor e evolução biomecânica.',
    icon: Activity,
    colorTheme: {
      border: 'border-teal-200 hover:border-teal-500',
      bg: 'bg-white hover:bg-teal-50/50',
      hoverBg: 'hover:bg-teal-50',
      text: 'text-teal-900',
      badgeBg: 'bg-teal-100',
      badgeText: 'text-teal-800',
      iconBg: 'bg-teal-100 text-teal-700',
      iconColor: 'text-teal-600'
    }
  },
  ZemdaFono: {
    id: 'ZemdaFono',
    name: 'ZemdaFono',
    badge: 'Fonoaudiologia',
    profession: 'Fonoaudiologia & Linguagem',
    description: 'Avaliação fonêmica, motricidade orofacial, qualidade vocal e deglutição.',
    icon: MessageCircle,
    colorTheme: {
      border: 'border-blue-200 hover:border-blue-500',
      bg: 'bg-white hover:bg-blue-50/50',
      hoverBg: 'hover:bg-blue-50',
      text: 'text-blue-900',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-800',
      iconBg: 'bg-blue-100 text-blue-700',
      iconColor: 'text-blue-600'
    }
  },
  ZemdaOdonto: {
    id: 'ZemdaOdonto',
    name: 'ZemdaOdonto',
    badge: 'Odontologia',
    profession: 'Odontologia & Saúde Bucal',
    description: 'Odontograma interativo 2D/3D por faces, plano de tratamento e procedimentos.',
    icon: Smile,
    colorTheme: {
      border: 'border-sky-200 hover:border-sky-500',
      bg: 'bg-white hover:bg-sky-50/50',
      hoverBg: 'hover:bg-sky-50',
      text: 'text-sky-900',
      badgeBg: 'bg-sky-100',
      badgeText: 'text-sky-800',
      iconBg: 'bg-sky-100 text-sky-700',
      iconColor: 'text-sky-600'
    }
  },
  ZemdaNutri: {
    id: 'ZemdaNutri',
    name: 'ZemdaNutri',
    badge: 'Nutrição',
    profession: 'Nutrição Clínica & Antropometria',
    description: 'Medidas antropométricas, bioimpedância, cálculo de IMC e prescrição dietética.',
    icon: Apple,
    colorTheme: {
      border: 'border-emerald-200 hover:border-emerald-500',
      bg: 'bg-white hover:bg-emerald-50/50',
      hoverBg: 'hover:bg-emerald-50',
      text: 'text-emerald-900',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-800',
      iconBg: 'bg-emerald-100 text-emerald-700',
      iconColor: 'text-emerald-600'
    }
  },
  ZemdaTO: {
    id: 'ZemdaTO',
    name: 'ZemdaTO',
    badge: 'Terapia Ocupacional',
    profession: 'Terapia Ocupacional & AVDs',
    description: 'Independência funcional, escala MIF, perfil sensorial e ocupação humana.',
    icon: Hand,
    colorTheme: {
      border: 'border-purple-200 hover:border-purple-500',
      bg: 'bg-white hover:bg-purple-50/50',
      hoverBg: 'hover:bg-purple-50',
      text: 'text-purple-900',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-800',
      iconBg: 'bg-purple-100 text-purple-700',
      iconColor: 'text-purple-600'
    }
  },
  general: {
    id: 'general',
    name: 'Atendimento Geral',
    badge: 'Geral',
    profession: 'Clínica Geral & Outras Áreas',
    description: 'Prontuário multiprofissional com anamnese, exame físico e condutas completas.',
    icon: Stethoscope,
    colorTheme: {
      border: 'border-indigo-200 hover:border-indigo-500',
      bg: 'bg-white hover:bg-indigo-50/50',
      hoverBg: 'hover:bg-indigo-50',
      text: 'text-indigo-900',
      badgeBg: 'bg-indigo-100',
      badgeText: 'text-indigo-800',
      iconBg: 'bg-indigo-100 text-indigo-700',
      iconColor: 'text-indigo-600'
    }
  },
  ZemdaBody: {
    id: 'ZemdaBody' as any,
    name: 'ZemdaBody',
    badge: 'Mapa Corporal',
    profession: 'Avaliação Corporal & Caneta Clínica',
    description: 'Mapa anatômico interativo com caneta clínica, escala de dor EVA e marcadores por região.',
    icon: Activity,
    colorTheme: {
      border: 'border-teal-200 hover:border-teal-500',
      bg: 'bg-white hover:bg-teal-50/50',
      hoverBg: 'hover:bg-teal-50',
      text: 'text-teal-900',
      badgeBg: 'bg-teal-100',
      badgeText: 'text-teal-800',
      iconBg: 'bg-teal-100 text-teal-700',
      iconColor: 'text-teal-600'
    }
  }
};

/**
 * Detecta diretamente qual módulo clínico corresponde à profissão do profissional logado.
 */
export function getModuleForProfession(auth: {
  isPhysiotherapist?: boolean;
  isSpeechTherapist?: boolean;
  isDentist?: boolean;
  isNutritionist?: boolean;
  isOccupationalTherapist?: boolean;
  currentUser?: any;
  currentTenant?: any;
}): 'ZemdaFisio' | 'ZemdaFono' | 'ZemdaOdonto' | 'ZemdaNutri' | 'ZemdaTO' | 'general' {
  if (auth.isSpeechTherapist) return 'ZemdaFono';
  if (auth.isPhysiotherapist) return 'ZemdaFisio';
  if (auth.isOccupationalTherapist) return 'ZemdaTO';
  if (auth.isNutritionist) return 'ZemdaNutri';
  if (auth.isDentist) return 'ZemdaOdonto';
  return 'general';
}

/**
 * Retorna os módulos compatíveis com a atuação do usuário logado.
 */
export function getCompatibleClinicalModules(auth: {
  isPhysiotherapist?: boolean;
  isSpeechTherapist?: boolean;
  isDentist?: boolean;
  isNutritionist?: boolean;
  isOccupationalTherapist?: boolean;
  isClinicAdmin?: boolean;
  currentUser?: any;
  currentTenant?: any;
}): ClinicalModuleOption[] {
  const modId = getModuleForProfession(auth);
  return [ALL_CLINICAL_MODULES[modId] || ALL_CLINICAL_MODULES.general];
}

interface SelectConsultationModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  modules: ClinicalModuleOption[];
  patientName?: string;
  serviceName?: string;
  onSelectModule: (moduleId: string) => void;
}

export const SelectConsultationModuleModal: React.FC<SelectConsultationModuleModalProps> = ({
  isOpen,
  onClose,
  modules,
  patientName,
  serviceName,
  onSelectModule
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="select-module-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 id="select-module-title" className="text-lg font-bold text-slate-900 tracking-tight">
              Iniciar Atendimento • Escolha o Módulo
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecione o prontuário especializado compatível com seu atendimento {patientName ? `para ${patientName}` : ''}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informações do Agendamento */}
        {(patientName || serviceName) && (
          <div className="px-6 py-3 bg-indigo-50/50 border-b border-indigo-100/60 flex items-center justify-between text-xs text-indigo-950">
            {patientName && (
              <div>
                <span className="text-indigo-600 font-semibold">Paciente:</span>{' '}
                <span className="font-bold">{patientName}</span>
              </div>
            )}
            {serviceName && (
              <div>
                <span className="text-indigo-600 font-semibold">Serviço:</span>{' '}
                <span className="font-medium text-slate-700">{serviceName}</span>
              </div>
            )}
          </div>
        )}

        {/* Lista de Módulos Compatíveis */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Módulos compatíveis com sua atuação:
          </p>

          <div className="grid gap-2.5">
            {modules.map(mod => {
              const Icon = mod.icon;
              const theme = mod.colorTheme;
              return (
                <button
                  key={mod.id}
                  onClick={() => onSelectModule(mod.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between group cursor-pointer shadow-xs hover:shadow-md ${theme.border} ${theme.bg}`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${theme.iconBg}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 group-hover:text-indigo-900 transition-colors">
                          {mod.name}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText}`}>
                          {mod.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                        {mod.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center text-slate-400 group-hover:text-indigo-600 transition-transform group-hover:translate-x-1 pl-2">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 text-center pt-2">
            O atendimento ficará vinculado exclusivamente ao módulo selecionado para garantir a integridade dos registros.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
};
