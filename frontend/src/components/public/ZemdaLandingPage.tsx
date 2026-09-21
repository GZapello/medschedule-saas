import React, { useEffect } from 'react';
import { Activity, Apple, ArrowDown, ArrowRight, Brain, CalendarDays, Check, CheckCheck, ChevronDown, CloudUpload, Crosshair, DollarSign, Dumbbell, FileText, Files, GraduationCap, Heart, Layers3, LockKeyhole, Mic, ShieldCheck, Smile, Sparkles, Users } from 'lucide-react';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { RevealSection, RevealItem } from './RevealOnScroll';
import { LANDING_MODULES, LANDING_PLANS, LANDING_STEPS, LANDING_LAYERS, LANDING_FAQS, moduleHref } from '../../../../backend/src/seo/landingContent';
import { LandingProductDemo } from './LandingProductDemo';
import './zemda-landing.css';

interface ZemdaLandingPageProps {
  onLogin: () => void;
  onRegisterClinic: (plan?: string, isTrial?: boolean) => void;
  onRegisterUser?: () => void;
  onOpenPublicBooking?: () => void;
  onNavigateSeoPage?: (slug: string) => void;
}
const moduleIcons = [Mic, Brain, Smile, Apple, Activity, Heart, Dumbbell, GraduationCap];
const Bullets = ({ items }: { items: string[] }) => <ul className="zl-bullets">{items.map(item => <li key={item}><Check aria-hidden="true" size={16} /><span>{item}</span></li>)}</ul>;
const Heading = ({ label, title, children }: { label: string; title: string; children?: React.ReactNode }) => <div className="zl-heading"><span className="zl-eyebrow">{label}</span><h2>{title}</h2>{children && <p>{children}</p>}</div>;

export const ZemdaLandingPage: React.FC<ZemdaLandingPageProps> = ({ onLogin, onRegisterClinic, onNavigateSeoPage }) => {
  // Preserve direct links from SEO pages and the old public landing anchors.
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);
      if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    };
    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);
  const navigateModule = (event: React.MouseEvent<HTMLAnchorElement>, module: typeof LANDING_MODULES[number]) => {
    if (module.slug) {
      if (onNavigateSeoPage && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
        event.preventDefault();
        onNavigateSeoPage(module.slug);
      }
      return;
    }
    window.dispatchEvent(new CustomEvent('select-landing-specialty', { detail: module.id }));
  };

  return <div className="zemda-landing">
    <a className="zl-skip" href="#conteudo">Ir para o conteúdo</a>
    <PublicHeader onLogin={onLogin} onRegisterClinic={onRegisterClinic} />
    <main id="conteudo">
      <section id="inicio" className="zl-hero">
        <div className="zl-container">
          <RevealItem autoAnimate distancePx={14} durationMs={650}>
            <div className="zl-hero-top">
              <div className="zl-hero-badges">
                <span className="zl-pill"><span />Ecossistema de Saúde &amp; Gestão</span>
                <span className="zl-hero-badge"><Sparkles size={13} /> 7 dias grátis</span>
              </div>
              <span className="zl-hero-note">Profissionais solo, consultórios, equipes e clínicas.</span>
            </div>
            <div className="zl-hero-grid">
              <h1>Gestão e atendimento em saúde.<br /><span>Do profissional solo à clínica.</span></h1>
              <div className="zl-hero-copy">
                <p>O sistema completo para quem atende individualmente ou em equipe: agenda inteligente, prontuário eletrônico, emissão de documentos, controle financeiro, gestão de equipe e módulos clínicos especializados em uma única plataforma.</p>
                <div className="zl-actions">
                  <button className="zl-button" onClick={() => onRegisterClinic('SOLO', true)}>
                    Testar grátis por 7 dias <ArrowRight size={17} />
                  </button>
                  <a className="zl-link" href="#profissoes">Conhecer os módulos <ArrowDown size={16} /></a>
                </div>
                <div className="zl-hero-trial-copy">
                  <p className="zl-hero-trial-highlight">7 dias grátis no Zemda Solo. Sem compromisso.</p>
                  <p className="zl-hero-trial-sub">Precisa dos planos Equipe ou Clínica? Fale com <a href="mailto:suporte@zemda.com.br">suporte@zemda.com.br</a>.</p>
                </div>
                <p className="zl-small">Feito para consultórios individuais, equipes em crescimento e clínicas multiprofissionais.</p>
              </div>
            </div>
          </RevealItem>
          <RevealItem autoAnimate delayMs={100} distancePx={16} durationMs={700}>
            <LandingProductDemo />
            <p className="zl-preview-note">Composição ilustrativa de funcionalidades. Não representa uma captura da interface.</p>
          </RevealItem>
        </div>
      </section>

      <RevealSection id="como-funciona" className="zl-section"><div className="zl-container">
        <RevealItem distancePx={16} durationMs={550}><Heading label="Como o Zemda funciona" title="Comece individualmente ou com sua equipe." /></RevealItem>
        <div className="zl-steps">{LANDING_STEPS.map((step, index) => <RevealItem key={step.title} distancePx={18} delayMs={index * 80} durationMs={600}><article><span className="zl-step-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></article></RevealItem>)}</div>
        <RevealItem distancePx={16} delayMs={120} durationMs={550}><div className="zl-rule"><Users size={22} /><p><strong>Escolha o plano pelo número de acessos que você precisa.</strong><br />A profissão define quais ferramentas clínicas cada profissional acessa, respeitando suas permissões.</p></div></RevealItem>
      </div></RevealSection>

      <RevealSection id="profissoes" className="zl-section zl-tinted"><div className="zl-container">
        <RevealItem distancePx={16} durationMs={550}><Heading label="Ecossistema profissional" title="Ferramentas específicas para sua profissão.">Avalie, registre e acompanhe cada atendimento com os recursos da sua área.</Heading></RevealItem>
        <div className="zl-modules">{LANDING_MODULES.map((module, index) => { const Icon = moduleIcons[index]; return <RevealItem key={module.id} distancePx={18} delayMs={(index % 4) * 60} durationMs={600} className="zl-full-height"><article id={`modulo-${module.id}`} className={`zl-module zl-module-${module.id}`}><span className="zl-module-icon"><Icon size={23} /></span><p className="zl-profession">{module.profession}</p><h3>{module.name}</h3><Bullets items={module.features} /><a href={moduleHref(module)} onClick={event => navigateModule(event, module)} className="zl-module-link" aria-label={`Conhecer módulo ${module.name}`}>Conhecer módulo <ArrowRight size={16} /></a></article></RevealItem>; })}</div>
        <RevealItem distancePx={18} delayMs={100} durationMs={600}><article id="zemdabody" className="zl-body"><span className="zl-body-symbol"><Crosshair size={48} strokeWidth={1.3} /></span><div><span className="zl-eyebrow">Módulo transversal</span><h3>ZemdaBody</h3><p>Um mapa corporal para registrar marcações, explorar vistas anatômicas e acompanhar a evolução em diferentes áreas. Uma ferramenta de apoio integrada à prática profissional.</p></div><div className="zl-body-tags"><span>Mapa corporal</span><span>Vistas anatômicas</span><span>Marcações e evolução</span></div></article></RevealItem>
      </div></RevealSection>

      <RevealSection id="funcionalidades" className="zl-section"><div className="zl-container">
        <RevealItem distancePx={16} durationMs={550}><Heading label="Uma base única" title="Gestão, atendimento e especialidade.">Organize sua prática, acompanhe seus pacientes e acesse as ferramentas da sua profissão.</Heading></RevealItem>
        <div className="zl-layers">{LANDING_LAYERS.map((layer, i) => <RevealItem key={layer.title} distancePx={18} delayMs={i * 80} durationMs={600} className="zl-full-height"><article><span className="zl-layer-number">0{i + 1}</span><h3>{layer.title}</h3><p>{layer.description}</p><div className="zl-tags">{layer.items.map(item => <span key={item}>{item}</span>)}</div></article></RevealItem>)}</div>
      </div></RevealSection>

      <RevealSection id="agenda" className="zl-section zl-tinted"><div className="zl-container zl-split">
        <RevealItem distancePx={18} durationMs={600}><div><Heading label="Agenda & comunicação" title="Organize o dia. Acompanhe cada atendimento.">Organize sua agenda individual ou os horários da equipe com a Agenda Interativa e a Agenda de Hoje.</Heading><Bullets items={['Agendamento online e página própria do profissional', 'Status de atendimento, faltas e cancelamentos', 'Lembrete manual pelo WhatsApp', 'Lembretes automáticos quando configurados']} /><p className="zl-small">Integração com WhatsApp disponível conforme configuração.</p><a href="/agenda-online" className="zl-link">Conhecer a agenda <ArrowRight size={16} /></a></div></RevealItem>
        <RevealItem distancePx={20} delayMs={100} durationMs={650}><div className="zl-flow-card"><span className="zl-eyebrow">Uma jornada conectada</span>{[{ icon: CalendarDays, title: 'Agendar', text: 'Horários, profissionais e serviços.' }, { icon: FileText, title: 'Atender', text: 'Prontuário e ferramentas da especialidade.' }, { icon: CheckCheck, title: 'Acompanhar', text: 'Status, registros e continuidade do cuidado.' }].map((step, i) => <div className="zl-flow-step" key={step.title}><span><step.icon size={22} /></span><div><small>0{i + 1}</small><h3>{step.title}</h3><p>{step.text}</p></div></div>)}</div></RevealItem>
      </div></RevealSection>

      <RevealSection id="autosave" className="zl-section"><div className="zl-container zl-split">
        <RevealItem distancePx={20} durationMs={650}><div className="zl-save-card"><CloudUpload size={38} strokeWidth={1.4} /><span className="zl-eyebrow">Continuidade do atendimento</span><h3>Registrar.<br />Salvar.<br /><span>Retomar.</span></h3><div className="zl-save-line"><span /><p>Rascunho → recuperação → finalização</p></div><p>Recursos disponíveis em Psicologia e Fonoaudiologia.</p></div></RevealItem>
        <RevealItem distancePx={18} delayMs={100} durationMs={600}><div><Heading label="Autosave & histórico" title="Atendimento sem perder o contexto.">Salvamento automático e recuperação de rascunhos ajudam você a retomar o atendimento quando algo interrompe a rotina.</Heading><Bullets items={['Salvamento automático nos módulos compatíveis', 'Recuperação após queda de internet, quando houver rascunho salvo', 'Histórico e prontuários anteriores acessíveis conforme permissões', 'Revisão e finalização do atendimento']} /><p className="zl-note">Projetado para reduzir o risco de perda de dados durante o atendimento. Confira o indicador de salvamento: a recuperação depende do rascunho disponível no navegador ou no servidor.</p></div></RevealItem>
      </div></RevealSection>

      <RevealSection id="documentos" className="zl-section zl-tinted"><div className="zl-container zl-split">
        <RevealItem distancePx={18} durationMs={600}><div><Heading label="Documentos & prontuário" title="Documentos e prontuário no mesmo fluxo.">Prontuário eletrônico, documentos e anexos relacionados ao paciente e ao atendimento, com histórico, registro de autoria e auditoria.</Heading><Bullets items={['Atestados, receituários e pedidos de exames', 'Documentos profissionais conforme a área de atuação', 'Emissão em formato A4', 'Anexos, exames e histórico de atendimento']} /><a href="/prontuario" className="zl-link">Conhecer o prontuário <ArrowRight size={16} /></a></div></RevealItem>
        <RevealItem distancePx={20} delayMs={100} durationMs={650}><div className="zl-document-map"><div className="zl-document-root"><Users size={24} /><strong>Paciente</strong><span>Histórico de atendimento</span></div><div className="zl-document-branches"><div><FileText size={26} /><strong>Prontuário</strong><span>Evolução e registros</span></div><div><Files size={26} /><strong>Documentos</strong><span>Emissão e anexos</span></div></div><p>Informações conectadas, acessos definidos por permissões.</p></div></RevealItem>
      </div></RevealSection>

      <RevealSection id="gestao" className="zl-section"><div className="zl-container">
        <RevealItem distancePx={16} durationMs={550}><div className="zl-section-inline"><Heading label="Gestão & financeiro" title="Controle sua rotina e suas finanças.">Receitas, despesas, serviços e relatórios para quem atende sozinho ou gerencia uma equipe.</Heading><a href="/gestao-financeira" className="zl-link">Conhecer a gestão <ArrowRight size={16} /></a></div></RevealItem>
        <div className="zl-management">{[{ icon: DollarSign, title: 'Financeiro', items: ['Receitas, despesas e caixa', 'Comissões e relatórios'] }, { icon: Users, title: 'Equipe', items: ['Usuários e permissões', 'Profissões e serviços'] }, { icon: Layers3, title: 'Operação', items: ['Pacientes e agenda', 'Estoque e insumos'] }].map((item, i) => <RevealItem key={item.title} distancePx={18} delayMs={i * 80} durationMs={600} className="zl-full-height"><article><item.icon size={25} /><h3>{item.title}</h3><Bullets items={item.items} /></article></RevealItem>)}</div>
      </div></RevealSection>

      <RevealSection id="ia" className="zl-section zl-ai-section"><div className="zl-container"><RevealItem distancePx={18} durationMs={600}><div className="zl-ai"><span className="zl-icon"><Sparkles size={27} /></span><div><span className="zl-eyebrow">Inteligência artificial com responsabilidade</span><h2>IA como apoio, não como substituição profissional.</h2><p>Estruturação de texto, apoio à evolução, ditado, organização, sugestões e relatórios assistidos nos fluxos disponíveis.</p><p className="zl-note">Todo conteúdo clínico gerado ou estruturado por IA exige revisão e responsabilidade do profissional.</p></div></div></RevealItem></div></RevealSection>

      <RevealSection id="seguranca" className="zl-section"><div className="zl-container zl-split">
        <RevealItem distancePx={18} durationMs={600}><div><Heading label="Segurança & privacidade" title="Cada acesso tem um papel. Cada registro, uma autoria.">Controles de acesso e rastreabilidade para apoiar a proteção dos dados na rotina multiprofissional.</Heading><a href="/privacidade" className="zl-link">Privacidade e LGPD <ArrowRight size={16} /></a></div></RevealItem>
        <div className="zl-security">{[{ icon: Users, title: 'Controle por usuário', text: 'Acessos individuais e permissões por perfil.' }, { icon: LockKeyhole, title: 'Isolamento por clínica', text: 'Acesso vinculado à clínica e às permissões do usuário.' }, { icon: ShieldCheck, title: 'Acesso clínico restrito', text: 'Ferramentas e registros conforme profissão e autorização.' }, { icon: FileText, title: 'Trilha de auditoria', text: 'Registro de autoria e ações para rastreabilidade.' }].map((item, i) => <RevealItem key={item.title} distancePx={18} delayMs={i * 60} durationMs={550}><article><item.icon size={21} /><h3>{item.title}</h3><p>{item.text}</p></article></RevealItem>)}</div>
      </div></RevealSection>

      <RevealSection id="planos" className="zl-section zl-tinted"><div className="zl-container">
        <RevealItem distancePx={16} durationMs={550}><Heading label="Planos" title="Um plano para cada momento da sua prática.">O plano define o número de acessos. A profissão define o módulo clínico, respeitando as permissões de cada usuário.</Heading></RevealItem>
        <div className="zl-plans">{LANDING_PLANS.map((plan, i) => {
          const isSolo = plan.name === 'Solo';
          const planCode = isSolo ? 'SOLO' : i === 1 ? 'TEAM' : 'CLINIC';
          return (
            <RevealItem key={plan.name} distancePx={20} delayMs={i * 80} durationMs={600} className="zl-full-height">
              <article className={i === 1 ? 'zl-plan zl-plan-featured' : 'zl-plan'}>
                {isSolo && (
                  <div className="zl-trial-badge">
                    <Sparkles size={13} />
                    <span>7 dias grátis · Sem compromisso</span>
                  </div>
                )}
                <span className="zl-eyebrow">Zemda</span>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
                <div className="zl-price"><span>R$</span><strong>{plan.price}</strong><span>/mês</span></div>
                <div className="zl-accesses"><Users size={17} />{plan.accesses}</div>
                <Bullets items={['Gestão, agenda e prontuário', 'Módulo conforme a profissão', 'ZemdaBody e documentos']} />
                <button
                  onClick={() => onRegisterClinic(planCode, isSolo)}
                  className={i === 1 ? 'zl-button' : 'zl-button zl-button-secondary'}
                >
                  {plan.cta || (isSolo ? 'Testar grátis por 7 dias' : 'Começar agora')} <ArrowRight size={16} />
                </button>
              </article>
            </RevealItem>
          );
        })}</div>
        <p className="zl-plans-note">
          O teste grátis de 7 dias é exclusivo do plano <strong>Zemda Solo</strong>. Para informações ou implantação dos planos Equipe ou Clínica, entre em contato pelo <a href="mailto:suporte@zemda.com.br">suporte@zemda.com.br</a>.
        </p>
        <RevealItem distancePx={18} delayMs={100} durationMs={600}><div className="zl-comparison" role="region" aria-label="Comparação dos planos" tabIndex={0}><table><caption>Compare os recursos dos planos</caption><thead><tr><th scope="col">Recursos</th>{LANDING_PLANS.map(plan => <th scope="col" key={plan.name}>{plan.name}</th>)}</tr></thead><tbody><tr><th scope="row">Acessos</th>{LANDING_PLANS.map(plan => <td key={plan.name}>{plan.accesses}</td>)}</tr>{['Gestão', 'Prontuário', 'Agenda', 'ZemdaBody', 'Financeiro', 'Documentos'].map(item => <tr key={item}><th scope="row">{item}</th>{LANDING_PLANS.map(plan => <td key={plan.name}><Check size={16} aria-hidden="true" /><span className="sr-only">Incluído</span></td>)}</tr>)}<tr><th scope="row">Módulos profissionais</th>{LANDING_PLANS.map(plan => <td key={plan.name}>Por profissão</td>)}</tr><tr><th scope="row">Suporte</th>{LANDING_PLANS.map(plan => <td key={plan.name}>Consultar condições</td>)}</tr></tbody></table></div><p className="zl-small">Acesso às funções conforme perfil e permissões. Canais e condições de suporte devem ser consultados na contratação.</p></RevealItem>
      </div></RevealSection>

      <RevealSection id="faq" className="zl-section"><div className="zl-container zl-faq-layout"><RevealItem distancePx={16} durationMs={550}><Heading label="Dúvidas frequentes" title="Antes de começar." /></RevealItem><RevealItem distancePx={18} delayMs={80} durationMs={600}><div className="zl-faq">{LANDING_FAQS.map(item => <details key={item.question}><summary>{item.question}<ChevronDown size={19} /></summary><p>{item.answer}</p></details>)}</div></RevealItem></div></RevealSection>
      <section className="zl-final"><div className="zl-container"><RevealItem distancePx={20} durationMs={600}><span className="zl-eyebrow">Seu próximo atendimento começa aqui</span><h2>Sua gestão e seus atendimentos.<br />Em uma única plataforma.</h2><p>Comece no Solo ou organize sua equipe com ferramentas para cada profissão.</p><div className="zl-actions"><button className="zl-button" onClick={() => onRegisterClinic()}>Começar agora <ArrowRight size={17} /></button><button className="zl-button zl-button-secondary" onClick={onLogin}>Entrar no Zemda</button></div></RevealItem></div></section>
    </main>
    <PublicFooter onLogin={onLogin} onRegisterClinic={() => onRegisterClinic()} onNavigateSeoPage={onNavigateSeoPage} />
  </div>;
};
