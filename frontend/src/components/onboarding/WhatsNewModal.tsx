import React, { useState } from 'react';
import { useOnboarding } from './OnboardingContext';
import {
  Sparkles,
  MessageSquare,
  Save,
  CreditCard,
  Stethoscope,
  Sparkle,
  Activity,
  Dumbbell,
  X,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';

interface FeatureItem {
  id: string;
  badge: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  actionRoute?: string;
  actionTourId?: string;
}

const WHAT_S_NEW_FEATURES: FeatureItem[] = [
  {
    id: 'zemda_med',
    badge: 'Medicina',
    title: 'ZemdaMed: Vertical Médica Completa',
    description: 'Prontuário com SOAP, anamnese completa, exame físico segmentar, prescrições com CID-10 e suporte a especialidades.',
    icon: Stethoscope,
    iconColor: 'text-indigo-600',
    bgColor: 'bg-indigo-50 border-indigo-100',
    actionRoute: 'zemda-med'
  },
  {
    id: 'zemda_estetic',
    badge: 'Estética',
    title: 'ZemdaEstetic: Estética Integrada',
    description: 'Mapeamento fotográfico antes e depois, protocolos faciais, corporais e capilares, registro de injetáveis e TCLE.',
    icon: Sparkle,
    iconColor: 'text-pink-600',
    bgColor: 'bg-pink-50 border-pink-100',
    actionRoute: 'zemda-estetic'
  },
  {
    id: 'zemda360',
    badge: 'Anatomia Visual',
    title: 'Zemda360: Mapeamento Visual e Anatômico',
    description: 'Demarcação interativa 360°, caneta digital, borracha anatômica e associação direta de queixas e condutas aos pontos corporais.',
    icon: Activity,
    iconColor: 'text-teal-600',
    bgColor: 'bg-teal-50 border-teal-100',
    actionRoute: 'zemda-body'
  },
  {
    id: 'zemda_personal',
    badge: 'Educação Física',
    title: 'ZemdaPersonal: Prescrição e Cargas',
    description: 'Periodização de treinos, banco de exercícios biomecânicos e acompanhamento da evolução de carga por aluno.',
    icon: Dumbbell,
    iconColor: 'text-amber-600',
    bgColor: 'bg-amber-50 border-amber-100',
    actionRoute: 'zemda-personal'
  },
  {
    id: 'autosave',
    badge: 'Segurança Clínica',
    title: 'Autosave Universal Contínuo',
    description: 'Salvamento automático contínuo em segundo plano a cada digitação em prontuários, evoluções e anamneses.',
    icon: Save,
    iconColor: 'text-sky-600',
    bgColor: 'bg-sky-50 border-sky-100'
  },
  {
    id: 'whatsapp',
    badge: 'Comunicação',
    title: 'WhatsApp Business Cloud Oficial',
    description: 'Envio automático de confirmações, lembretes de consulta com antecedência e remarcação ágil.',
    icon: MessageSquare,
    iconColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50 border-emerald-100',
    actionRoute: 'calendar'
  },
  {
    id: 'asaas',
    badge: 'Financeiro',
    title: 'Integração Financeira Asaas',
    description: 'Cobranças com Pix dinâmico com QR Code, boletos bancários registrados e conciliação direta no caixa.',
    icon: CreditCard,
    iconColor: 'text-teal-600',
    bgColor: 'bg-teal-50 border-teal-100',
    actionRoute: 'financial'
  }
];

export const WhatsNewModal: React.FC = () => {
  const { isWhatsNewOpen, closeWhatsNew, startTour } = useOnboarding();
  const [activeFeature, setActiveFeature] = useState<FeatureItem | null>(null);

  if (!isWhatsNewOpen) return null;

  const handleAction = (item: FeatureItem) => {
    closeWhatsNew();
    if (item.actionRoute) {
      window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: item.actionRoute } }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200 relative">
        {/* Header com indicador de atualização */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-teal-500 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="whats-new-modal-title" className="text-sm font-bold text-slate-900 leading-tight">
                  Novidades no Zemda
                </h2>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                  Novidades Recentes
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Conheça os recursos mais recentes desenvolvidos para você
              </p>
            </div>
          </div>

          <button
            onClick={closeWhatsNew}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Fechar novidades"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de Novidades */}
        <div className="flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {WHAT_S_NEW_FEATURES.map(feat => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.id}
                className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-slate-200 hover:shadow-xs transition-all flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${feat.bgColor} ${feat.iconColor} shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                        {feat.badge}
                      </span>
                      <h3 className="text-xs font-bold text-slate-800">
                        {feat.title}
                      </h3>
                    </div>
                  </div>

                  {feat.actionRoute && (
                    <button
                      type="button"
                      onClick={() => handleAction(feat)}
                      className="px-2.5 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                    >
                      <span>Ver novidade</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed pl-10">
                  {feat.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Rodapé informativo */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>O Zemda é atualizado continuamente sem custos adicionais.</span>
          <button
            onClick={closeWhatsNew}
            className="px-4 py-1.5 font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
