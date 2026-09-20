import React, { useState } from 'react';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { RevealSection, RevealItem } from './RevealOnScroll';
import {
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Calendar,
  FileText,
  DollarSign,
  Files,
  Users,
  Boxes,
  Sparkles,
  ShieldCheck,
  Clock,
  Activity,
  Award,
  Zap,
  Check,
  Heart,
  Stethoscope,
  Smile,
  Dumbbell,
  Apple,
  Brain,
  Mic,
  Eye,
  Crosshair,
  GraduationCap
} from 'lucide-react';

interface ZemdaLandingPageProps {
  onLogin: () => void;
  onRegisterClinic: () => void;
  onRegisterUser?: () => void;
  onOpenPublicBooking?: () => void;
  onNavigateSeoPage?: (slug: string) => void;
}

export const ZemdaLandingPage: React.FC<ZemdaLandingPageProps> = ({
  onLogin,
  onRegisterClinic,
  onNavigateSeoPage
}) => {
  // Estado para acordeão do FAQ
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Módulos profissionais especificados
  const professionalAreas = [
    {
      id: 'fono',
      brand: 'ZemdaFono',
      area: 'Fonoaudiologia',
      desc: 'Registro, evolução e ferramentas para o seu atendimento.',
      icon: Mic,
      color: 'bg-rose-50 text-rose-600 border-rose-100',
      badgeColor: 'text-rose-600 bg-rose-50',
      seoSlug: 'sistema-para-fonoaudiologos'
    },
    {
      id: 'pp',
      brand: 'ZemdaPP',
      area: 'Psicopedagogia',
      desc: 'Avaliação da aprendizagem, PIP, funções executivas e sessões com sigilo.',
      icon: GraduationCap,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      badgeColor: 'text-indigo-600 bg-indigo-50',
      seoSlug: 'sistema-para-psicopedagogos'
    },
    {
      id: 'psico',
      brand: 'ZemdaPsico',
      area: 'Psicologia',
      desc: 'Organize seus atendimentos e acompanhe a evolução dos seus pacientes.',
      icon: Brain,
      color: 'bg-purple-50 text-purple-600 border-purple-100',
      badgeColor: 'text-purple-600 bg-purple-50',
      seoSlug: 'sistema-para-psicologos'
    },
    {
      id: 'to',
      brand: 'ZemdaTO',
      area: 'Terapia Ocupacional',
      desc: 'Recursos pensados para o seu método de trabalho.',
      icon: Heart,
      color: 'bg-amber-50 text-amber-600 border-amber-100',
      badgeColor: 'text-amber-600 bg-amber-50',
      seoSlug: 'sistema-para-clinicas'
    },
    {
      id: 'nutri',
      brand: 'ZemdaNutri',
      area: 'Nutrição',
      desc: 'Planejamento, evolução e acompanhamento nutricional completo.',
      icon: Apple,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      badgeColor: 'text-emerald-600 bg-emerald-50',
      seoSlug: 'sistema-para-nutricionistas'
    },
    {
      id: 'fisio',
      brand: 'ZemdaFisio',
      area: 'Fisioterapia',
      desc: 'Avaliações, planos de tratamento e evolução funcional.',
      icon: Activity,
      color: 'bg-sky-50 text-sky-600 border-sky-100',
      badgeColor: 'text-sky-600 bg-sky-50',
      seoSlug: 'sistema-para-fisioterapeutas'
    },
    {
      id: 'personal',
      brand: 'ZemdaPersonal',
      area: 'Educação Física',
      desc: 'Acompanhe treinos, resultados e mantenha seus alunos motivados.',
      icon: Dumbbell,
      color: 'bg-teal-50 text-teal-600 border-teal-100',
      badgeColor: 'text-teal-600 bg-teal-50',
      seoSlug: 'sistema-para-clinicas'
    },
    {
      id: 'odonto',
      brand: 'ZemdaOdonto',
      area: 'Odontologia',
      desc: 'Registro clínico, planos de tratamento e acompanhamento.',
      icon: Smile,
      color: 'bg-blue-50 text-blue-600 border-blue-100',
      badgeColor: 'text-blue-600 bg-blue-50',
      seoSlug: 'sistema-para-clinicas'
    },
    {
      id: 'body',
      brand: 'ZemdaBody',
      area: 'Avaliação Corporal',
      desc: 'Mapeamento, avaliação e evolução em um só lugar.',
      icon: Crosshair,
      color: 'bg-teal-50 text-teal-700 border-teal-200',
      badgeColor: 'text-teal-700 bg-teal-50',
      seoSlug: 'zemdabody'
    }
  ];

  // 8 Módulos de gestão completa
  const managementFeatures = [
    {
      title: 'Agenda inteligente',
      desc: 'Organize sua rotina com mais eficiência e evite conflitos de horário.',
      icon: Calendar,
      side: 'left'
    },
    {
      title: 'Prontuário eletrônico',
      desc: 'Registros completos, seguros e sempre acessíveis a qualquer momento.',
      icon: FileText,
      side: 'left'
    },
    {
      title: 'Financeiro',
      desc: 'Controle de receitas, despesas e relatórios em tempo real.',
      icon: DollarSign,
      side: 'left'
    },
    {
      title: 'Documentos',
      desc: 'Emita atestados, relatórios e outros documentos com poucos cliques.',
      icon: Files,
      side: 'left'
    },
    {
      title: 'Equipe e permissões',
      desc: 'Gerencie sua equipe com acessos personalizados e mais segurança.',
      icon: Users,
      side: 'right'
    },
    {
      title: 'Estoque',
      desc: 'Controle seus produtos e insumos de forma simples e eficiente.',
      icon: Boxes,
      side: 'right'
    },
    {
      title: 'Inteligência artificial',
      desc: 'Mais agilidade no dia a dia com o apoio da IA para resumos, sugestões e mais.',
      icon: Sparkles,
      side: 'right'
    },
    {
      title: 'Agendamento online',
      desc: 'Permita que seus pacientes agendem consultas pela internet, 24 horas por dia.',
      icon: Clock,
      side: 'right'
    }
  ];

  // FAQ
  const faqItems = [
    {
      question: 'Como funcionam os acessos?',
      answer:
        'Cada acesso corresponde a um usuário com login individual na plataforma. O plano contratado define o limite de membros cadastrados simultaneamente na sua clínica (por exemplo, 1 acesso no Solo, até 5 acessos no Equipe e até 20 acessos no Clínica). Cada profissional ou colaborador tem seu próprio perfil com permissões de acesso sob medida.'
    },
    {
      question: 'Quais áreas estão disponíveis?',
      answer:
        'O Zemda disponibiliza módulos dedicados para Fonoaudiologia (ZemdaFono), Psicologia (ZemdaPsico), Terapia Ocupacional (ZemdaTO), Nutrição (ZemdaNutri), Fisioterapia (ZemdaFisio), Educação Física (ZemdaPersonal), Odontologia (ZemdaOdonto) e Avaliação Corporal (ZemdaBody), além de suporte para consultórios e clínicas médicas gerais.'
    },
    {
      question: 'Tenho uma clínica. Qual plano devo escolher?',
      answer:
        'Se você atende de forma individual em consultório próprio, o plano Zemda Solo (1 acesso) é perfeito. Se você possui até 5 profissionais ou precisa incluir recepcionista e sócios, o plano Zemda Equipe (5 acessos) é o mais vantajoso e o mais escolhido. Para clínicas consolidadas, centros integrados ou redes com até 20 profissionais, o plano Zemda Clínica é a escolha indicada. Você pode alterar seu plano a qualquer momento conforme sua clínica cresce.'
    },
    {
      question: 'Posso ter profissionais de áreas diferentes?',
      answer:
        'Sim, com certeza! Esse é um dos maiores pontos fortes do Zemda. Em uma mesma clínica com o plano Equipe ou Clínica, você pode reunir, por exemplo, um psicólogo, um nutricionista, um fisioterapeuta e um fonoaudiólogo. A gestão de pacientes e a agenda ficam centralizadas, mas cada profissional tem as ferramentas, fichas e módulos específicos da sua especialidade liberados automaticamente.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-800 font-sans antialiased selection:bg-teal-500 selection:text-white">
      {/* Top Header */}
      <PublicHeader onLogin={onLogin} onRegisterClinic={onRegisterClinic} />

      {/* 2. HERO SECTION */}
      <section
        id="inicio"
        className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 overflow-hidden"
      >
        {/* Ambient light glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-teal-50/70 via-emerald-50/40 to-transparent blur-3xl -z-10 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            {/* Pill Badge */}
            <RevealItem autoAnimate delayMs={0}>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-semibold shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>SaaS Especializado em Saúde • Web & Desktop</span>
              </div>
            </RevealItem>

            {/* Título Principal */}
            <RevealItem autoAnimate delayMs={90}>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 leading-[1.15]">
                Um sistema.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600">
                  Toda a sua clínica.
                </span>{' '}
                <br className="hidden sm:inline" />
                Uma experiência feita para a sua profissão.
              </h1>
            </RevealItem>

            {/* Subtítulo */}
            <RevealItem autoAnimate delayMs={180}>
              <p className="text-base sm:text-xl text-slate-600 font-normal leading-relaxed max-w-3xl mx-auto">
                Gestão, prontuário, agenda, financeiro e ferramentas clínicas especializadas em uma única plataforma.
              </p>
            </RevealItem>

            {/* Botões de Ação */}
            <RevealItem autoAnimate delayMs={270}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={onRegisterClinic}
                  className="w-full sm:w-auto px-8 py-4 text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 rounded-2xl shadow-lg shadow-teal-600/25 hover:shadow-xl hover:shadow-teal-600/35 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Começar agora</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('funcionalidades')}
                  className="w-full sm:w-auto px-8 py-4 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl shadow-xs hover:border-slate-300 transition-all cursor-pointer"
                >
                  Ver funcionalidades
                </button>
              </div>
            </RevealItem>

            {/* Badges de Confiança */}
            <RevealItem autoAnimate delayMs={360}>
              <div className="pt-6 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  Fácil de usar
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  Seguro e confiável
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  Suporte humanizado
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" />
                  Mais tempo para seus pacientes
                </span>
              </div>
            </RevealItem>
          </div>

          {/* Realistic Desktop / Laptop Mockup Frame (NO mobile/cellphone!) */}
          <div className="mt-14 max-w-5xl mx-auto">
            <RevealItem autoAnimate delayMs={220} scale distancePx={40}>
              <div className="relative rounded-3xl p-2 sm:p-3 bg-gradient-to-b from-slate-200/90 via-slate-100 to-slate-200/60 shadow-2xl shadow-slate-300/60 border border-slate-300/80">
                {/* Laptop Screen Bezel */}
                <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner">
                  {/* Top Camera Notch / Bar */}
                  <div className="h-6 bg-slate-900/95 flex items-center justify-center px-4 border-b border-slate-800 relative">
                    <div className="flex items-center gap-1.5 absolute left-4">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
                  </div>

                  {/* Dashboard Image Display */}
                  <div className="relative bg-white aspect-[16/10] sm:aspect-[16/9.5] overflow-hidden">
                    <img
                      src="/landing/gestao-completa-mockup.jpg"
                      alt="Zemda Dashboard Desktop"
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                </div>

                {/* Laptop Base Stand / Hinge */}
                <div className="h-3 sm:h-4 bg-gradient-to-b from-slate-300 to-slate-400 rounded-b-2xl mx-12 sm:mx-20 shadow-md flex items-center justify-center">
                  <div className="w-16 sm:w-24 h-1 bg-slate-400/80 rounded-full" />
                </div>
              </div>
            </RevealItem>
          </div>
        </div>
      </section>

      {/* 3. ÁREAS PROFISSIONAIS */}
      <RevealSection
        id="profissoes"
        className="py-20 sm:py-28 bg-white border-y border-slate-100 relative"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Header da Seção */}
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <RevealItem delayMs={0}>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                O Zemda entende a sua profissão
              </h2>
            </RevealItem>

            <RevealItem delayMs={60}>
              <p className="text-base text-slate-600 leading-relaxed">
                Soluções personalizadas para diferentes áreas da saúde, com as ferramentas que você realmente precisa.
              </p>
            </RevealItem>

            {/* Badges de Destaque */}
            <RevealItem delayMs={120}>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold">
                <span className="px-3.5 py-1.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200/70 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-teal-600" />
                  Feito para a sua rotina
                </span>
                <span className="px-3.5 py-1.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200/70 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-teal-600" />
                  Evolui com a sua área
                </span>
                <span className="px-3.5 py-1.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200/70 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-teal-600" />
                  Mais tempo para o que importa
                </span>
              </div>
            </RevealItem>
          </div>

          {/* Grid de Cards das 8 Áreas Profissionais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {professionalAreas.map((area, idx) => {
              const IconComp = area.icon;
              const cardHref = area.id === 'body' ? '/#zemdabody' : `/${area.seoSlug}`;
              return (
                <RevealItem
                  key={area.id}
                  delayMs={(idx % 4) * 80}
                  scale
                  className="h-full"
                >
                  <a
                    href={cardHref}
                    onClick={(e) => {
                      if (area.id === 'body') {
                        e.preventDefault();
                        scrollToSection('zemdabody');
                      } else if (onNavigateSeoPage) {
                        e.preventDefault();
                        onNavigateSeoPage(area.seoSlug);
                      }
                    }}
                    className="group relative bg-white border border-slate-200/80 hover:border-teal-400/80 rounded-3xl p-6 shadow-xs hover:shadow-xl hover:shadow-teal-600/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between h-full"
                  >
                    <div className="space-y-4">
                      {/* Icon Box */}
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-transform group-hover:scale-110 ${area.color}`}>
                        <IconComp className="w-6 h-6" />
                      </div>

                      <div>
                        <h3 className="text-lg font-black text-slate-900 group-hover:text-teal-700 transition-colors">
                          {area.brand}
                        </h3>
                        <p className="text-xs font-bold text-teal-700 mt-0.5">
                          {area.area}
                        </p>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed">
                        {area.desc}
                      </p>
                    </div>

                    <div className="pt-6 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 group-hover:text-teal-600 transition-colors">
                        Ver recursos
                      </span>
                      <div className="w-8 h-8 rounded-full bg-slate-50 group-hover:bg-teal-600 text-slate-400 group-hover:text-white flex items-center justify-center transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </a>
                </RevealItem>
              );
            })}
          </div>

          {/* Destaque Obrigatório: Regra de Plano e Profissão */}
          <RevealItem delayMs={0} scale>
            <div className="max-w-3xl mx-auto rounded-2xl bg-gradient-to-r from-teal-50 via-emerald-50/50 to-teal-50 border border-teal-200/70 p-5 text-center shadow-xs">
              <p className="text-sm sm:text-base font-bold text-teal-950">
                O plano define a quantidade de acessos e a profissão de cada usuário define o módulo liberado.
              </p>
              <p className="text-xs text-teal-800 mt-1">
                Diferentes profissões na mesma clínica? Cada membro acessa os recursos específicos de sua área mantendo a gestão unificada.
              </p>
            </div>
          </RevealItem>

          {/* Slogan Inferior */}
          <RevealItem delayMs={0}>
            <div className="text-center pt-4">
              <p className="text-xs uppercase tracking-widest font-bold text-slate-400">
                Diferentes profissões. A mesma essência. Mais saúde para todos.
              </p>
            </div>
          </RevealItem>
        </div>
      </RevealSection>

      {/* 4. GESTÃO COMPLETA */}
      <RevealSection
        id="funcionalidades"
        className="py-20 sm:py-28 bg-[#fafbfc] relative overflow-hidden"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <RevealItem delayMs={0}>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600">
                Gestão Completa
              </span>
            </RevealItem>

            <RevealItem delayMs={60}>
              <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
                Toda a sua clínica em um só lugar
              </h2>
            </RevealItem>

            <RevealItem delayMs={120}>
              <p className="text-base text-slate-600 leading-relaxed">
                Do atendimento ao financeiro, o Zemda centraliza tudo o que você precisa para uma gestão mais simples, organizada e eficiente.
              </p>
            </RevealItem>
          </div>

          {/* Grid com Laptop Desktop no Centro e Features nas laterais (Como na imagem 1) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Coluna Esquerda: 4 Features */}
            <div className="lg:col-span-3 space-y-4">
              {managementFeatures
                .filter(f => f.side === 'left')
                .map((feature, idx) => {
                  const IconComp = feature.icon;
                  return (
                    <RevealItem key={idx} delayMs={idx * 80}>
                      <div
                        className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-teal-300 hover:shadow-md transition-all space-y-2 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 group-hover:scale-105 transition-transform">
                            <IconComp className="w-5 h-5" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">
                            {feature.title}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed pl-12">
                          {feature.desc}
                        </p>
                      </div>
                    </RevealItem>
                  );
                })}
            </div>

            {/* Centro: Laptop Mockup Desktop */}
            <div className="lg:col-span-6">
              <RevealItem delayMs={120} scale distancePx={40}>
                <div className="relative rounded-3xl p-2 sm:p-3 bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200/80 shadow-2xl shadow-teal-900/10 border border-slate-300/80">
                  <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner">
                    {/* Top Laptop Bezel Bar */}
                    <div className="h-5 bg-slate-900/90 flex items-center justify-center relative px-3">
                      <div className="w-2 h-2 rounded-full bg-slate-800 border border-slate-700" />
                    </div>

                    {/* Desktop Interface */}
                    <div className="relative bg-white aspect-[16/10] overflow-hidden">
                      <img
                        src="/landing/gestao-completa-mockup.jpg"
                        alt="Zemda Gestão Completa Desktop"
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  </div>

                  {/* Laptop Base Hinge */}
                  <div className="h-3 bg-gradient-to-b from-slate-300 to-slate-400 rounded-b-2xl mx-16 shadow-md flex items-center justify-center">
                    <div className="w-20 h-1 bg-slate-400/80 rounded-full" />
                  </div>
                </div>
              </RevealItem>
            </div>

            {/* Coluna Direita: 4 Features */}
            <div className="lg:col-span-3 space-y-4">
              {managementFeatures
                .filter(f => f.side === 'right')
                .map((feature, idx) => {
                  const IconComp = feature.icon;
                  return (
                    <RevealItem key={idx} delayMs={idx * 80}>
                      <div
                        className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-teal-300 hover:shadow-md transition-all space-y-2 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 group-hover:scale-105 transition-transform">
                            <IconComp className="w-5 h-5" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">
                            {feature.title}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed pl-12">
                          {feature.desc}
                        </p>
                      </div>
                    </RevealItem>
                  );
                })}
            </div>
          </div>

          {/* CTA & Badges da Seção */}
          <RevealItem delayMs={0} scale>
            <div className="text-center space-y-4 pt-4">
              <button
                type="button"
                onClick={onRegisterClinic}
                className="inline-flex items-center gap-2 px-8 py-4 text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 rounded-2xl shadow-lg shadow-teal-600/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Começar agora</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  Fácil de usar
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  Seguro e confiável
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  Suporte humanizado
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  Mais tempo para seus pacientes
                </span>
              </div>

              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 pt-2">
                Zemda • Saúde e Gestão em Harmonia
              </p>
            </div>
          </RevealItem>
        </div>
      </RevealSection>

      {/* 5. ZEMDABODY */}
      <RevealSection
        id="zemdabody"
        className="py-20 sm:py-28 bg-white border-y border-slate-100 relative overflow-hidden"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Texto & Destaques */}
            <div className="lg:col-span-5 space-y-6">
              <RevealItem delayMs={0}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-bold uppercase tracking-wider">
                  <Crosshair className="w-3.5 h-3.5 text-teal-600" />
                  <span>ZemdaBody</span>
                </div>

                <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight mt-4">
                  Seu paciente, visualizado de outra forma.
                </h2>
              </RevealItem>

              <RevealItem delayMs={60}>
                <p className="text-base text-slate-600 leading-relaxed">
                  Avaliação corporal completa, de forma simples e visual. Registre, acompanhe e mostre a evolução dos seus pacientes com o ZemdaBody.
                </p>
              </RevealItem>

              <div className="space-y-4 pt-4">
                {/* 1. Mapas corporais interativos */}
                <RevealItem delayMs={0}>
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 shadow-xs">
                      <Crosshair className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Mapas corporais interativos
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Registre avaliações de forma visual e intuitiva diretamente na anatomia humana.
                      </p>
                    </div>
                  </div>
                </RevealItem>

                {/* 2. Histórico e evolução */}
                <RevealItem delayMs={80}>
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 shadow-xs">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Histórico e evolução do paciente
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Compare avaliações ao longo do tempo e comprove os resultados do tratamento.
                      </p>
                    </div>
                  </div>
                </RevealItem>

                {/* 3. Acompanhamento do paciente */}
                <RevealItem delayMs={160}>
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 shadow-xs">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Análises profissionais e acompanhamento
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Mais embasamento para sua conduta clínica, laudos e orientações pós-atendimento.
                      </p>
                    </div>
                  </div>
                </RevealItem>

                {/* 4. Recursos para diferentes áreas */}
                <RevealItem delayMs={240}>
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 shadow-xs">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Recursos para diferentes áreas
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Ideal para Fisioterapia, Avaliação Postural, Terapia Ocupacional, Medicina e Educação Física.
                      </p>
                    </div>
                  </div>
                </RevealItem>
              </div>

              {/* Botão & Badges */}
              <RevealItem delayMs={0} scale>
                <div className="pt-6 space-y-4">
                  <button
                    type="button"
                    onClick={onRegisterClinic}
                    className="px-8 py-4 text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 rounded-2xl shadow-lg shadow-teal-600/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
                  >
                    <span>Conhecer o ZemdaBody</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      Fácil de usar
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      Seguro e confiável
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      Suporte humanizado
                    </span>
                  </div>
                </div>
              </RevealItem>
            </div>

            {/* Desktop Mockup do ZemdaBody (Notebook / Desktop) */}
            <div className="lg:col-span-7">
              <RevealItem delayMs={120} scale distancePx={40}>
                <div className="relative rounded-3xl p-2 sm:p-3 bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200/80 shadow-2xl shadow-teal-950/10 border border-slate-300/80">
                  <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner">
                    {/* Top Bar */}
                    <div className="h-5 bg-slate-900/90 flex items-center justify-center px-3">
                      <div className="w-2 h-2 rounded-full bg-slate-800 border border-slate-700" />
                    </div>

                    {/* ZemdaBody Desktop Interface View */}
                    <div className="relative bg-white aspect-[16/10] overflow-hidden">
                      <img
                        src="/landing/zemdabody-mockup.jpg"
                        alt="ZemdaBody Avaliação Corporal Desktop"
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  </div>

                  {/* Laptop Base */}
                  <div className="h-3 bg-gradient-to-b from-slate-300 to-slate-400 rounded-b-2xl mx-16 shadow-md flex items-center justify-center">
                    <div className="w-20 h-1 bg-slate-400/80 rounded-full" />
                  </div>
                </div>
              </RevealItem>

              {/* Card Destaque Inferior */}
              <RevealItem delayMs={0} scale>
                <div className="mt-6 bg-white border border-teal-100 rounded-2xl p-4 shadow-sm flex items-center gap-4 max-w-lg mx-auto">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-200/50">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-slate-900">
                      Visualize. Acompanhe. Evolua.
                    </h5>
                    <p className="text-xs text-slate-500">
                      Mais resultados e clareza para você e seus pacientes.
                    </p>
                  </div>
                </div>
              </RevealItem>
            </div>
          </div>
        </div>
      </RevealSection>

      {/* 6. PLANOS */}
      <RevealSection
        id="planos"
        className="py-20 sm:py-28 bg-[#fafbfc] relative overflow-hidden"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
          {/* Header da Seção de Planos */}
          <RevealItem delayMs={0}>
            <div className="text-center max-w-3xl mx-auto space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600">
                Valores e Assinaturas
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
                Planos transparentes para cada momento
              </h2>
              <p className="text-base text-slate-600 leading-relaxed">
                Sem taxas ocultas, sem contratos de fidelidade. Cancele quando quiser.
              </p>
            </div>
          </RevealItem>

          {/* Banner: Todos os planos incluem */}
          <RevealItem delayMs={0} scale>
            <div className="max-w-5xl mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-teal-200/80 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-teal-700 block mb-0.5">
                    Recursos Globais da Plataforma
                  </span>
                  <h3 className="text-base sm:text-xl font-black text-slate-900">
                    Todos os planos do Zemda incluem:
                  </h3>
                </div>
                <span className="px-3.5 py-1 rounded-xl bg-teal-50 text-teal-800 text-xs font-bold border border-teal-200/60">
                  9 ferramentas essenciais inclusas
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700 font-semibold pt-1">
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Agenda Interativa</span></div>
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Prontuário eletrônico</span></div>
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Financeiro</span></div>
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Documentos</span></div>
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Estoque</span></div>
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Equipe e permissões</span></div>
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Agendamento online</span></div>
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>Inteligência Artificial</span></div>
                <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /><span>ZemdaBody (Mapa Corporal)</span></div>
              </div>

              <div className="p-4 bg-gradient-to-r from-teal-50 via-emerald-50/60 to-teal-50 rounded-2xl border border-teal-200/70 text-xs text-teal-950 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  <strong>Módulo Especializado Automático:</strong> Cada profissional recebe automaticamente seu módulo específico (<strong>ZemdaFono</strong>, <strong>ZemdaPsico</strong>, <strong>ZemdaTO</strong>, <strong>ZemdaNutri</strong>, <strong>ZemdaFisio</strong>, <strong>ZemdaPersonal</strong> ou <strong>ZemdaOdonto</strong>) de acordo com sua profissão cadastrada.
                </span>
              </div>
            </div>
          </RevealItem>

          {/* Cards dos 3 Planos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
            {/* PLANO 1: Zemda Solo */}
            <RevealItem delayMs={0} scale className="h-full flex flex-col">
              <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xs hover:shadow-lg transition-all flex flex-col justify-between space-y-8 h-full">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">
                      Zemda Solo
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Ideal para profissionais autônomos e atendimentos individuais.
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-bold text-slate-500">R$</span>
                    <span className="text-4xl font-black text-slate-900">69,90</span>
                    <span className="text-xs text-slate-500 font-medium">/mês</span>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold">
                    <Users className="w-3.5 h-3.5 text-slate-600" />
                    <span>1 acesso</span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>1 acesso completo ao sistema</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Módulo clínico específico incluso</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>ZemdaBody (Mapa Corporal) liberado</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Agenda Interativa e agendamento online</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Prontuário, Financeiro, Documentos e IA</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onRegisterClinic}
                  className="w-full py-3.5 px-4 text-xs font-bold text-slate-700 hover:text-teal-700 bg-slate-100 hover:bg-slate-200/70 rounded-2xl transition-all cursor-pointer"
                >
                  Começar agora
                </button>
              </div>
            </RevealItem>

            {/* PLANO 2: Zemda Equipe (MAIS ESCOLHIDO) */}
            <RevealItem delayMs={80} scale className="h-full flex flex-col z-10">
              <div className="relative bg-white rounded-3xl p-8 border-2 border-teal-500 shadow-xl shadow-teal-600/10 hover:shadow-2xl hover:shadow-teal-600/15 transition-all flex flex-col justify-between space-y-8 h-full scale-[1.02] sm:scale-105">
                {/* Badge Mais Escolhido */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-[11px] font-black uppercase tracking-wider rounded-full shadow-md">
                  Mais escolhido
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">
                      Zemda Equipe
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Para consultórios e pequenas clínicas em expansão.
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-bold text-slate-500">R$</span>
                    <span className="text-4xl font-black text-teal-700">249,90</span>
                    <span className="text-xs text-slate-500 font-medium">/mês</span>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-50 text-teal-900 text-xs font-bold border border-teal-200/60">
                    <Users className="w-3.5 h-3.5 text-teal-600" />
                    <span>5 acessos</span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Até 5 acessos profissionais e colaboradores</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Módulos liberados pela profissão de cada usuário</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>ZemdaBody (Mapa Corporal) para toda a equipe</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Controle de permissões e gestão de equipe</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Inteligência artificial para resumos e evoluções</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onRegisterClinic}
                  className="w-full py-4 px-4 text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 rounded-2xl shadow-md shadow-teal-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Começar agora</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </RevealItem>

            {/* PLANO 3: Zemda Clínica */}
            <RevealItem delayMs={160} scale className="h-full flex flex-col">
              <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xs hover:shadow-lg transition-all flex flex-col justify-between space-y-8 h-full">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">
                      Zemda Clínica
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Para centros consolidados e equipes multidisciplinares.
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-bold text-slate-500">R$</span>
                    <span className="text-4xl font-black text-slate-900">619,90</span>
                    <span className="text-xs text-slate-500 font-medium">/mês</span>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold">
                    <Users className="w-3.5 h-3.5 text-slate-600" />
                    <span>20 acessos</span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Até 20 profissionais e colaboradores ativos</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Todos os módulos profissionais integrados</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>ZemdaBody (Mapa Corporal) para todos os profissionais</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Relatórios avançados e controle de estoque</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>Treinamento e gerente de conta dedicado</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onRegisterClinic}
                  className="w-full py-3.5 px-4 text-xs font-bold text-slate-700 hover:text-teal-700 bg-slate-100 hover:bg-slate-200/70 rounded-2xl transition-all cursor-pointer"
                >
                  Começar agora
                </button>
              </div>
            </RevealItem>
          </div>

          {/* Destaque Obrigatório de Planos */}
          <RevealItem delayMs={0} scale>
            <div className="max-w-3xl mx-auto rounded-2xl bg-white border border-teal-200/70 p-5 text-center shadow-xs">
              <p className="text-sm sm:text-base font-bold text-teal-950">
                O plano define a quantidade de acessos. A profissão de cada usuário define o módulo especializado liberado automaticamente.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Todos os planos contam com ZemdaBody, Agenda Interativa, Prontuário, Financeiro, Documentos, Estoque, Equipe, Agendamento online e IA.
              </p>
            </div>
          </RevealItem>
        </div>
      </RevealSection>

      {/* 7. COMO FUNCIONA */}
      <RevealSection
        id="como-funciona"
        className="py-20 sm:py-28 bg-white border-y border-slate-100 relative"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <RevealItem delayMs={0}>
            <div className="text-center max-w-3xl mx-auto space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600">
                Simplicidade em 3 Passos
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
                Uma plataforma. Múltiplas áreas.
              </h2>
              <p className="text-base text-slate-600 leading-relaxed">
                O Zemda foi construído para se adaptar ao jeito que você e seus profissionais atendem.
              </p>
            </div>
          </RevealItem>

          {/* 3 Passos Explicativos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Passo 1 */}
            <RevealItem delayMs={0} scale className="h-full">
              <div className="bg-[#fafbfc] border border-slate-200/80 rounded-3xl p-8 space-y-4 shadow-xs hover:border-teal-300 transition-all text-center sm:text-left h-full">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-black text-lg border border-teal-200/60">
                  1
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  O usuário se cadastra e informa sua profissão.
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ao criar a conta da clínica ou cadastrar um novo profissional, é informado o nicho de atuação (Psicologia, Fonoaudiologia, Nutrição, Fisioterapia, etc.).
                </p>
              </div>
            </RevealItem>

            {/* Passo 2 */}
            <RevealItem delayMs={80} scale className="h-full">
              <div className="bg-[#fafbfc] border border-slate-200/80 rounded-3xl p-8 space-y-4 shadow-xs hover:border-teal-300 transition-all text-center sm:text-left h-full">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-black text-lg border border-teal-200/60">
                  2
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  O Zemda identifica a área profissional.
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  A inteligência da plataforma ajusta automaticamente as fichas clínicas, termos de consentimento, histórico e ferramentas pertinentes.
                </p>
              </div>
            </RevealItem>

            {/* Passo 3 */}
            <RevealItem delayMs={160} scale className="h-full">
              <div className="bg-[#fafbfc] border border-slate-200/80 rounded-3xl p-8 space-y-4 shadow-xs hover:border-teal-300 transition-all text-center sm:text-left h-full">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-black text-lg border border-teal-200/60">
                  3
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  O módulo correspondente é liberado automaticamente.
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Sem complicação ou chamados de suporte. O usuário já acessa sua experiência dedicada pronta para uso imediato.
                </p>
              </div>
            </RevealItem>
          </div>
        </div>
      </RevealSection>

      {/* 8. FAQ */}
      <RevealSection
        id="faq"
        className="py-20 sm:py-28 bg-[#fafbfc] relative"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <RevealItem delayMs={0}>
            <div className="text-center space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600">
                Dúvidas Frequentes
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                Perguntas frequentes
              </h2>
              <p className="text-base text-slate-600">
                Tudo o que você precisa saber sobre o funcionamento do Zemda.
              </p>
            </div>
          </RevealItem>

          <div className="space-y-4">
            {faqItems.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <RevealItem key={index} delayMs={(index % 4) * 70}>
                  <div
                    className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(index)}
                      className="w-full p-6 text-left flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors cursor-pointer"
                    >
                      <span className="text-sm sm:text-base font-bold text-slate-900">
                        {item.question}
                      </span>
                      <div className={`w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 transition-transform ${isOpen ? 'rotate-180 bg-teal-50 text-teal-700' : 'text-slate-500'}`}>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-6 pb-6 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                        {item.answer}
                      </div>
                    )}
                  </div>
                </RevealItem>
              );
            })}
          </div>
        </div>
      </RevealSection>

      {/* 9. CTA FINAL */}
      <RevealSection className="py-20 sm:py-28 bg-white border-t border-slate-100 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-teal-50/40 via-emerald-50/20 to-white -z-10 pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <RevealItem delayMs={0} scale durationMs={650}>
            <div className="space-y-4 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
                Sua rotina pode ser mais simples.
              </h2>
              <p className="text-base text-slate-600 leading-relaxed">
                Junte-se à nova geração de clínicas e profissionais de saúde que transformaram sua gestão com o Zemda.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
              <button
                type="button"
                onClick={onRegisterClinic}
                className="w-full sm:w-auto px-8 py-4 text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 rounded-2xl shadow-xl shadow-teal-600/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Começar agora</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onLogin}
                className="w-full sm:w-auto px-8 py-4 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl shadow-xs transition-all cursor-pointer"
              >
                Já tenho uma conta
              </button>
            </div>
          </RevealItem>
        </div>
      </RevealSection>

      {/* 10. FOOTER */}
      <PublicFooter
        onLogin={onLogin}
        onRegisterClinic={onRegisterClinic}
        onNavigateSeoPage={onNavigateSeoPage}
      />
    </div>
  );
};
