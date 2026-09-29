import React, { useEffect, useRef, useState } from 'react';
import { Activity, CalendarDays, ClipboardList, FileText, LayoutDashboard, Layers3, Users, Wallet, X, Check } from 'lucide-react';
import { REGISTRATION_PROFESSIONS } from '../../types/professions';
import { LANDING_MODULE_PREVIEWS } from './landingModulePreviews';
import { LANDING_MODULES } from '../../../../backend/src/seo/landingContent';
import './landing-demo.css';

// Public commercial catalog, cross-checked against the real profession resolver.
const ACTIVE_PROFESSIONS = LANDING_MODULES.flatMap(module => {
  const profession = REGISTRATION_PROFESSIONS.find(p => p.module === module.name);
  return profession ? [profession] : [];
});
const DESKTOP_WIDTH = 1600;
const DESKTOP_HEIGHT = 900;

const views = [
  ['dashboard', 'Dashboard', LayoutDashboard], ['agenda', 'Agenda Interativa', CalendarDays],
  ['patients', 'Pacientes', Users], ['records', 'Prontuários & Evolução', FileText],
  ['360', 'Zemda360', Activity], ['professional', 'Módulo Profissional', Layers3],
  ['exams', 'Exames a Receber', ClipboardList], ['quotes', 'Orçamentos', Wallet]
] as const;
type ViewId = typeof views[number][0];
// Original supplied PNGs, unchanged. Only their baked-in navigation is hidden by
// the viewport; the entire content area retains its original aspect ratio.
const screenshots: Record<Exclude<ViewId, 'professional'>, { file: string; width: number; height: number; sidebar: number }> = {
  dashboard: { file: 'dashboard', width: 1905, height: 825, sidebar: 330 },
  agenda: { file: 'agenda', width: 1891, height: 832, sidebar: 309 },
  patients: { file: 'patients', width: 1930, height: 815, sidebar: 327 },
  records: { file: 'records', width: 1930, height: 815, sidebar: 328 },
  '360': { file: 'zemda360', width: 1909, height: 824, sidebar: 321 },
  exams: { file: 'exams', width: 1918, height: 820, sidebar: 328 },
  quotes: { file: 'quotes', width: 1928, height: 816, sidebar: 328 }
};

/** Public visual presentation. No API, authentication or clinical workspace. */
export const LandingProductDemo: React.FC = () => {
  const [view, setView] = useState<ViewId>('dashboard');
  const [drawer, setDrawer] = useState(false);
  const [closingDrawer, setClosingDrawer] = useState(false);
  const [professionId, setProfessionId] = useState(ACTIVE_PROFESSIONS[0].id);
  const [imageError, setImageError] = useState(false);
  const [scale, setScale] = useState(1);
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const resize = () => {
      const fit = Math.min(screen.clientWidth / DESKTOP_WIDTH, screen.clientHeight / DESKTOP_HEIGHT);
      // The complete desktop canvas fits the physical screen at every size.
      setScale(fit);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(screen);
    return () => observer.disconnect();
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const closeRef = useRef<HTMLButtonElement>(null);
  const moduleRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const profession = ACTIVE_PROFESSIONS.find(p => p.id === professionId)!;
  const module = LANDING_MODULE_PREVIEWS.find(m => m.name === profession.module);
  const title = views.find(v => v[0] === view)![1];
  const screenshot = view === 'professional' ? null : screenshots[view];

  const changeView = (id: ViewId) => {
    clearTimeout(timer.current);
    setClosingDrawer(false);
    setDrawer(id === 'professional');
    setImageError(false);
    setView(id);
    if (viewportRef.current) viewportRef.current.scrollTo(0, 0);
  };
  const closeDrawer = () => {
    setClosingDrawer(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDrawer(false); setClosingDrawer(false); moduleRef.current?.focus();
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (drawer) closeRef.current?.focus(); }, [drawer]);
  useEffect(() => {
    const handleSelect = (event: Event) => {
      const preview = LANDING_MODULE_PREVIEWS.find(m => m.id === (event as CustomEvent<string>).detail);
      if (preview?.id === 'body') { changeView('360'); return; }
      const item = ACTIVE_PROFESSIONS.find(p => p.module === preview?.name);
      if (item) setProfessionId(item.id);
      changeView('professional');
    };
    window.addEventListener('select-landing-specialty', handleSelect);
    return () => window.removeEventListener('select-landing-specialty', handleSelect);
  }, []);

  return <section id="produto" className="zd-demo" aria-label="Demonstração visual do Zemda">
    <div className="zd-notebook">
      <img className="zd-frame" src="/landing/novo-notebook.png" alt="" width="1536" height="1024" fetchPriority="high" />
      <div className="zd-screen" ref={screenRef}>
      <div className="zd-scaled-size" style={{ width: DESKTOP_WIDTH * scale, height: DESKTOP_HEIGHT * scale }}>
      <div className="zd-display" style={{ width: DESKTOP_WIDTH, height: DESKTOP_HEIGHT, transform: `scale(${scale})` }}>
        <aside className="zd-sidebar">
          <div className="zd-brand"><img src="/brand/zemda-icon-96.webp" alt="" width="27" height="27" /><span>Zemda<small>Saúde &amp; Gestão</small></span></div>
          <span className="zd-nav-label">ATENDIMENTO &amp; GESTÃO</span>
          <nav aria-label="Menu da demonstração">
            {views.map(([id, name, Icon]) => <button key={id} ref={id === 'professional' ? moduleRef : undefined}
              aria-pressed={view === id} aria-controls="zd-view" tabIndex={drawer ? -1 : 0}
              {...(id === 'professional' ? { 'aria-expanded': drawer } : {})} onClick={() => changeView(id)}>
              <Icon size={16} aria-hidden="true" /><span>{name}</span>
            </button>)}
          </nav>
        </aside>
        <div id="zd-view" ref={viewportRef} className={`zd-viewport ${screenshot ? 'zd-print-viewport' : ''}`} role="region" aria-label={title} tabIndex={drawer ? -1 : 0}>
          {screenshot && <div key={view} className="zd-print" style={{ aspectRatio: `${screenshot.width - screenshot.sidebar} / ${screenshot.height}` }}>
            <img src={`/landing/demo/${screenshot.file}.png`} alt={`Print de demonstração do Zemda — ${title}`}
              width={screenshot.width} height={screenshot.height} decoding="async" fetchPriority={view === 'dashboard' ? 'high' : 'auto'}
              style={{ width: `${screenshot.width / (screenshot.width - screenshot.sidebar) * 100}%`, left: `${-screenshot.sidebar / (screenshot.width - screenshot.sidebar) * 100}%` }}
              onError={() => setImageError(true)} />
            {imageError && <p role="alert">Não foi possível carregar este print. Selecione a área novamente.</p>}
          </div>}
          {view === 'professional' && <article className="zd-professional">
            <span className="zd-profession-label">{profession.label}</span>
            <h2>{module?.name ?? profession.label}</h2>
            <p>{module?.description ?? 'Esta profissão utiliza os recursos compartilhados de agenda, cadastro e organização de registros disponíveis no Zemda.'}</p>
            <button className="zd-primary" tabIndex={drawer ? -1 : 0} onClick={() => setDrawer(true)}>Trocar profissão</button>
            <div className="zd-features" key={professionId}>
              {(module?.features ?? ['Agenda e acompanhamento', 'Cadastro e histórico', 'Documentos e registros']).map((feature, i) => <details key={feature}>
                <summary tabIndex={drawer ? -1 : 0}>{feature}</summary>
                <p>{module?.featureDescriptions[i] ?? ['Organize horários e retornos de atendimento.', 'Consulte cadastros e registros de acompanhamento.', 'Organize documentos vinculados aos atendimentos.'][i]}</p>
              </details>)}
            </div>
            <p>{module?.focus ?? 'Recursos compartilhados, sem módulo especializado dedicado.'}</p>
          </article>}
        </div>
        {drawer && <div className={`zd-drawer-layer ${closingDrawer ? 'zd-drawer-closing' : ''}`} onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); closeDrawer(); }
          if (e.key === 'Tab') {
            const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.zd-drawer button'));
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }}>
          <button className="zd-scrim" aria-label="Fechar seleção de profissão" tabIndex={-1} onClick={closeDrawer} />
          <section className="zd-drawer" aria-label="Selecionar profissão">
            <header><div><h3>Módulo Profissional</h3><p>Selecione sua profissão</p></div><button ref={closeRef} aria-label="Fechar painel profissional" onClick={closeDrawer}><X size={19} /></button></header>
            <div className="zd-professions">{ACTIVE_PROFESSIONS.map(p => <button key={p.id} aria-pressed={professionId === p.id} onClick={() => { setProfessionId(p.id); closeDrawer(); }}>
              <span><strong>{p.label}</strong>{p.module && <small>{p.module}</small>}</span>
              {professionId === p.id && <Check size={17} aria-label="Selecionada" />}
            </button>)}</div>
          </section>
        </div>}
      </div>
      </div>
      </div>
    </div>
    <p className="zd-demo-note">Explore as áreas pelo menu. Imagens demonstrativas do Zemda.<span> Em telas menores, deslize a imagem para ver os detalhes.</span></p>
  </section>;
};
