import React, { useState } from 'react';
import {
  Activity, Apple, ArrowRight, Brain, CalendarDays, ChevronDown, CircleDot, Crosshair,
  DollarSign, Dumbbell, FileText, GraduationCap, Heart, LayoutDashboard,
  Layers3, Mic, Network, Smile, Users, type LucideIcon
} from 'lucide-react';
import { LANDING_MODULE_PREVIEWS, type LandingModulePreview } from './landingModulePreviews';

const moduleIcons: Record<string, LucideIcon> = {
  fono: Mic, psico: Brain, odonto: Smile, nutri: Apple, fisio: Activity,
  to: Heart, personal: Dumbbell, pp: GraduationCap, body: Crosshair
};
const views = [
  {
    id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard,
    heading: 'Sua rotina de trabalho, organizada.',
    description: 'Acompanhe a agenda e acesse as áreas de gestão e atendimento.',
    items: ['Agenda de Hoje', 'Pacientes', 'Equipe e acessos', 'Gestão financeira']
  },
  {
    id: 'agenda', name: 'Agenda', icon: CalendarDays,
    heading: 'Do agendamento ao atendimento.',
    description: 'Organize horários e acompanhe o dia com a Agenda Interativa.',
    items: ['Página de agendamento online', 'Status de atendimento', 'Faltas e cancelamentos', 'Lembrete manual pelo WhatsApp']
  },
  {
    id: 'records', name: 'Prontuário', icon: FileText,
    heading: 'O histórico de cada paciente, reunido.',
    description: 'Relacione registros e documentos ao paciente e ao atendimento.',
    items: ['Evolução clínica', 'Documentos e exames', 'Anexos', 'Histórico de atendimento']
  },
  {
    id: 'specialty', name: 'Especialidade', icon: Layers3,
    heading: 'Ferramentas para sua profissão.', description: '', items: []
  },
  {
    id: 'financial', name: 'Financeiro', icon: DollarSign,
    heading: 'Controle financeiro da sua prática.',
    description: 'Organize receitas, despesas e recebimentos em um só lugar.',
    items: ['Receitas e despesas', 'Controle de caixa', 'Comissões', 'Relatórios']
  }
];

const ModuleFeatureList = ({ module }: { module: LandingModulePreview }) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <ul className="zl-resource-map" aria-label="Funcionalidades em destaque">
      {module.features.map((feature, index) => {
        const isExpanded = expandedIndex === index;
        const buttonId = `feature-${module.id}-${index}`;
        const panelId = `${buttonId}-description`;
        return (
          <li key={feature} className="zl-feature-item">
            <button type="button" id={buttonId} className="zl-feature-trigger"
              aria-expanded={isExpanded} aria-controls={panelId}
              onClick={() => setExpandedIndex(isExpanded ? null : index)}>
              <span aria-hidden="true">0{index + 1}</span>
              <strong>{feature}</strong>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            <p id={panelId} hidden={!isExpanded} className="zl-feature-explanation">
              {module.featureDescriptions[index]}
            </p>
          </li>
        );
      })}
    </ul>
  );
};

/** Local-only product exploration: never loads patient data or clinical modules. */
export const LandingProductDemo: React.FC = () => {
  const [activeViewId, setActiveViewId] = useState('specialty');
  const [activeModuleId, setActiveModuleId] = useState('fono');
  const view = views.find(item => item.id === activeViewId) ?? views[3];
  const module = LANDING_MODULE_PREVIEWS.find(item => item.id === activeModuleId) ?? LANDING_MODULE_PREVIEWS[0];
  const isSpecialty = view.id === 'specialty';
  const Icon = isSpecialty ? moduleIcons[module.id] : view.icon;
  const features = isSpecialty ? module.features : view.items;

  React.useEffect(() => {
    const handleSelectSpecialty = (event: Event) => {
      const customEv = event as CustomEvent<string>;
      setActiveViewId('specialty');
      if (customEv.detail) {
        setActiveModuleId(customEv.detail);
      }
    };
    window.addEventListener('select-landing-specialty', handleSelectSpecialty);
    return () => window.removeEventListener('select-landing-specialty', handleSelectSpecialty);
  }, []);

  return (
    <div id="produto" className="zl-product">
      <div className="zl-product-bar">
        <span><img src="/brand/zemda-icon.png" alt="" width="24" height="24" /> O ecossistema Zemda</span>
        <span className="zl-caption">Visão esquemática dos recursos</span>
      </div>
      <div className="zl-product-layout">
        <div className="zl-view-picker" role="group" aria-label="Explorar áreas do produto">
          {views.map(item => {
            const ViewIcon = item.icon;
            return (
              <button key={item.id} type="button" aria-pressed={activeViewId === item.id}
                aria-controls="product-view" onClick={() => setActiveViewId(item.id)}>
                <ViewIcon size={18} aria-hidden="true" />{item.name}<ArrowRight size={14} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="zl-product-stage">
          {isSpecialty && (
            <div className="zl-module-selector-wrap">
              <div className="zl-module-selector-header">
                <label htmlFor="zemda-module-select">Escolha sua área</label>
                <div className="zl-module-selector">
                  <select
                    id="zemda-module-select"
                    value={activeModuleId}
                    aria-controls="product-view"
                    onChange={event => setActiveModuleId(event.target.value)}
                  >
                    {LANDING_MODULE_PREVIEWS.map(item => (
                      <option key={item.id} value={item.id}>{item.name} — {item.area}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="zl-module-chips" role="tablist" aria-label="Módulos especializados">
                {LANDING_MODULE_PREVIEWS.map(item => {
                  const ChipIcon = moduleIcons[item.id];
                  const isSelected = activeModuleId === item.id;
                  const isTransversal = item.id === 'body';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={`zl-module-chip ${isTransversal ? 'zl-module-chip-transversal' : ''}`}
                      onClick={() => setActiveModuleId(item.id)}
                      title={`${item.name} (${item.area})`}
                    >
                      <ChipIcon size={14} aria-hidden="true" />
                      <span>{item.name}</span>
                      {isTransversal && <span className="zl-chip-badge">Transversal</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div id="product-view" key={`${activeViewId}-${isSpecialty ? activeModuleId : ''}`} className="zl-product-content zl-fade-swap" role="region"
            aria-label="Recursos da área selecionada" aria-live="polite" aria-atomic="true">
            <div className="zl-product-copy">
              <span className="zl-icon"><Icon size={25} aria-hidden="true" /></span>
              <span className="zl-eyebrow">{isSpecialty ? module.area : view.name}</span>
              <h2>{isSpecialty ? module.name : view.heading}</h2>
              <p>{isSpecialty ? module.description : view.description}</p>
            </div>
            {isSpecialty ? <ModuleFeatureList key={module.id} module={module} /> : (
              <ul className="zl-resource-map" aria-label="Funcionalidades em destaque">
                {features.map((item, index) => (
                  <li key={item}><span>0{index + 1}</span><strong>{item}</strong><CircleDot size={18} aria-hidden="true" /></li>
                ))}
              </ul>
            )}
            {isSpecialty && <p className="zl-module-focus">{module.focus}</p>}
          </div>
        </div>
      </div>
      <div className="zl-product-bottom">
        <span><Network size={16} aria-hidden="true" /> Gestão e atendimento</span>
        <span><Users size={16} aria-hidden="true" /> Do Solo à equipe</span>
        <span><Layers3 size={16} aria-hidden="true" /> Ferramentas por profissão</span>
      </div>
    </div>
  );
};
