import React, { useState } from 'react';
import {
  Calendar,
  DollarSign,
  Receipt,
  Users,
  ShieldCheck,
  ArrowRight,
  Monitor,
  Smartphone,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  Building2,
  FileText,
  Clock,
  ChevronRight,
  TrendingUp,
  Activity,
  HeartPulse,
  Award,
  Globe
} from 'lucide-react';
import { ApiClient } from '../../api/client';

interface ZemdaLandingPageProps {
  onLogin: () => void;
  onRegisterClinic: () => void;
  onRegisterUser: () => void;
  onOpenPublicBooking?: () => void;
}

export const ZemdaLandingPage: React.FC<ZemdaLandingPageProps> = ({
  onLogin,
  onRegisterClinic,
  onRegisterUser,
  onOpenPublicBooking
}) => {
  const [activeTab, setActiveTab] = useState<'financeiro' | 'servicos' | 'recibos' | 'agenda'>('financeiro');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-white font-sans antialiased">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-teal-500/15 via-emerald-500/5 to-transparent blur-3xl rounded-full" />
        <div className="absolute top-1/3 -left-64 w-[500px] h-[500px] bg-teal-600/10 blur-3xl rounded-full" />
        <div className="absolute top-2/3 -right-64 w-[600px] h-[600px] bg-indigo-600/10 blur-3xl rounded-full" />
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <img
                src="/brand/zemda-icon.png"
                alt="Zemda"
                className="w-10 h-10 object-contain rounded-xl drop-shadow-md hover:scale-105 transition-transform"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
                Zemda
                <span className="inline-block w-2 h-2 rounded-full bg-teal-400"></span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-teal-400">
                Tecnologia em Saúde
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-slate-400">
            <a href="#solucoes" className="hover:text-teal-300 transition-colors">Soluções</a>
            <a href="#modulos" className="hover:text-teal-300 transition-colors">Módulos</a>
            <a href="#recibos-oficiais" className="hover:text-teal-300 transition-colors">Recibos Oficiais</a>
            <a href="#multi-clinicas" className="hover:text-teal-300 transition-colors">Multi-Clínicas</a>
            <a href="#aplicativos" className="hover:text-teal-300 transition-colors">Aplicativos</a>
          </nav>

          {/* Actions: Entrar & Começar */}
          <div className="flex items-center gap-3">
            <button
              onClick={onLogin}
              className="px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white rounded-xl hover:bg-slate-800/80 transition-all cursor-pointer border border-transparent hover:border-slate-700"
            >
              Entrar
            </button>
            <button
              onClick={onRegisterClinic}
              className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Cadastrar Clínica</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          {/* Floating Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/25 text-teal-300 text-xs font-semibold backdrop-blur-md animate-fade-in">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>A evolução na gestão de clínicas e consultórios de saúde</span>
          </div>

          {/* Main Hero Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.15]">
            Tecnologia que organiza{' '}
            <span className="bg-gradient-to-r from-teal-400 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
              o cuidado em saúde.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto font-normal">
            Agendas inteligentes com controle por salas, gestão financeira em tempo real, prontuários seguros e emissão instantânea de recibos oficiais numerados em um ambiente privativo de alta confiabilidade.
          </p>

          {/* Call to Actions */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button
              onClick={onLogin}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 transition-all cursor-pointer flex items-center justify-center gap-2 group"
            >
              <span>Acessar o Sistema</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={onRegisterClinic}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white font-bold text-sm border border-slate-700/80 hover:border-teal-500/50 shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Building2 className="w-4 h-4 text-teal-400" />
              <span>Criar Nova Clínica</span>
            </button>

            {onOpenPublicBooking && (
              <button
                onClick={onOpenPublicBooking}
                className="w-full sm:w-auto px-5 py-3.5 rounded-2xl text-slate-400 hover:text-teal-300 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-teal-400" />
                <span>Portal de Agendamento Online</span>
              </button>
            )}
          </div>

          {/* Trust Highlights */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-medium text-slate-400 border-t border-slate-800/60 max-w-xl mx-auto">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <span>Conforme com a LGPD</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-teal-400" />
              <span>Isolamento Multi-Clínicas</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-400" />
              <span>Disponibilidade 24/7 na Nuvem</span>
            </div>
          </div>
        </div>

        {/* Hero Interactive Showcase (Layers & Screenshots) */}
        <div className="mt-14 relative mx-auto max-w-5xl">
          <div className="relative rounded-3xl p-2 sm:p-3 bg-gradient-to-b from-slate-700/40 via-slate-800/20 to-slate-900/80 border border-slate-700/60 shadow-2xl shadow-teal-950/50 backdrop-blur-2xl">
            {/* Top Window Bar Mockup */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-800/80 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-[11px] font-mono text-slate-400">zemda.com.br / painel-gestao</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-teal-400 font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                Sistema em Operação
              </div>
            </div>

            {/* Primary Screenshot Container */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 group">
              <img
                src="/screenshots/screenshot-financeiro.png"
                alt="Painel Financeiro Zemda"
                className="w-full h-auto object-cover rounded-2xl shadow-inner transition-transform duration-700 group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />

              {/* Floating Highlight Card 1: Recibos */}
              <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 max-w-xs bg-slate-900/90 backdrop-blur-md border border-teal-500/30 rounded-2xl p-4 shadow-xl hidden sm:flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Recibos Oficiais</p>
                  <p className="text-[11px] text-slate-400">Numeração sequencial e discriminação legal em 1 clique</p>
                </div>
              </div>

              {/* Floating Highlight Card 2: Isolamento */}
              <div className="absolute top-6 right-6 max-w-xs bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-3 shadow-xl hidden md:flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-200">
                  Ambiente Exclusivo por Clínica
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions / Por Que a Zemda */}
      <section id="solucoes" className="relative z-10 py-20 bg-slate-900/50 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400">
              Desenvolvido Para a Rotina Real da Saúde
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Menos burocracia. Mais foco no paciente.
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Eliminamos o retrabalho entre atendimento, agenda, salas e prestação de contas. A Zemda une cada ponta do consultório em um ecossistema fluido.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="p-7 rounded-3xl bg-slate-900/70 border border-slate-800 hover:border-teal-500/40 transition-all hover:bg-slate-900/90 group">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-5 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Agendamento & Salas</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Organize atendimentos por profissional, serviço e sala de atendimento. Evite conflito de horários e visualize ocupações em tempo real.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-7 rounded-3xl bg-slate-900/70 border border-slate-800 hover:border-teal-500/40 transition-all hover:bg-slate-900/90 group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform">
                <DollarSign className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Financeiro Integrado</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Controle de entradas, saídas, repasses de profissionais, previsão de receitas e fluxo de caixa da clínica com relatórios claros.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-7 rounded-3xl bg-slate-900/70 border border-slate-800 hover:border-teal-500/40 transition-all hover:bg-slate-900/90 group">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Prontuário & Evolução</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Histórico clínico estruturado por paciente, evolução diária, registro de diagnósticos e privacidade total sob os parâmetros da LGPD.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Module Showcase */}
      <section id="modulos" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-400">
            Tour da Plataforma
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Cada módulo projetado para precisão
          </h2>
          <p className="text-sm text-slate-400">
            Alterne entre os módulos e veja como a Zemda se comporta no dia a dia da clínica.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          <button
            onClick={() => setActiveTab('financeiro')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'financeiro'
                ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Módulo Financeiro</span>
          </button>

          <button
            onClick={() => setActiveTab('servicos')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'servicos'
                ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Serviços & Salas</span>
          </button>

          <button
            onClick={() => setActiveTab('recibos')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'recibos'
                ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Recibos Oficiais</span>
          </button>

          <button
            onClick={() => setActiveTab('agenda')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'agenda'
                ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Agenda & Atendimento</span>
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-6 sm:p-8 backdrop-blur-xl">
          {activeTab === 'financeiro' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-500/10 text-teal-400 text-xs font-bold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Gestão Financeira Completa</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Controle total do fluxo de caixa e faturamento da sua clínica
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Acompanhe em tempo real as receitas geradas por consulta, recebimentos pendentes, saldo disponível e distribuição por profissional. Filtros rápidos para mês atual, período anterior e balanço consolidado.
                </p>
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Registro automático a cada agendamento concluído</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Lançamento de despesas operacionais da clínica</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>DRE simplificado e exportação para contabilidade</span>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-7">
                <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-teal-950/40">
                  <img
                    src="/screenshots/screenshot-financeiro.png"
                    alt="Módulo Financeiro Zemda"
                    className="w-full h-auto object-cover"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'servicos' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-500/10 text-teal-400 text-xs font-bold">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Espaços & Especialidades</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Mapeamento inteligente de serviços, procedimentos e salas
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Cadastre procedimentos com preços personalizados, tempo de duração padrão e associação a salas físicas. Cada atendimento sabe exatamente qual consultório ocupar, prevenindo duplicidades e conflitos de agenda.
                </p>
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Duração customizada por tipo de atendimento (ex: 30m, 45m, 60m)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Gestão de consultórios, salas cirúrgicas e leitos ambulatoriais</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Valores de tabela e regras de convênio ou particular</span>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-7">
                <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-teal-950/40">
                  <img
                    src="/screenshots/screenshot-servicos-salas.png"
                    alt="Módulo Serviços e Salas Zemda"
                    className="w-full h-auto object-cover"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'recibos' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-500/10 text-teal-400 text-xs font-bold">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Conformidade Fiscal & Operacional</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Emissão de Recibos Oficiais numerados com rastreabilidade total
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Gere comprovantes oficiais para declaração do paciente ou reembolso junto a convênios. Numeração sequencial contínua, identificação do profissional prestador, forma de pagamento discriminada e emissão com 1 clique.
                </p>
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Código sequencial oficial (ex: REC-000001, REC-000002)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Discriminação do tomador (paciente) e prestador (profissional)</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Opções de pagamento: PIX, Cartão de Crédito/Débito e Dinheiro</span>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-7 flex justify-center">
                <div className="max-w-md rounded-2xl overflow-hidden border border-teal-500/30 shadow-2xl shadow-teal-950/60 bg-white">
                  <img
                    src="/screenshots/screenshot-recibos.jpg"
                    alt="Modal de Emissão de Recibo Oficial Zemda"
                    className="w-full h-auto object-contain"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'agenda' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-500/10 text-teal-400 text-xs font-bold">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Agenda Multiprofissional</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  A rotina da recepção e dos médicos sincronizada
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Visualização por dia, semana ou mês com filtros dinâmicos por profissional. Status em cores (Agendado, Confirmado, Em Atendimento, Concluído, Cancelado) e envio automático de lembretes.
                </p>
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Encaixes rápidos e bloqueios de intervalo ou ausência</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Link público de agendamento 24h para pacientes da clínica</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Notificação no celular do profissional a cada novo agendamento</span>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-7">
                <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl shadow-teal-950/40">
                  <img
                    src="/screenshots/screenshot-servicos-salas.png"
                    alt="Agenda e Ambientes Zemda"
                    className="w-full h-auto object-cover"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Spotlight: Recibos Oficiais Feature Deep Dive */}
      <section id="recibos-oficiais" className="relative z-10 py-24 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-500/10 text-teal-300 text-xs font-bold border border-teal-500/20">
                <Award className="w-3.5 h-3.5 text-teal-400" />
                <span>Recurso Exclusivo</span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Emissão de Recibos Oficiais sem complicação ou planilhas.
              </h2>

              <p className="text-sm text-slate-300 leading-relaxed">
                Toda clínica precisa fornecer comprovação idônea para seus pacientes e controle contábil para seus profissionais. Com a Zemda, você emite recibos oficiais numerados em poucos cliques, garantindo conformidade e segurança jurídica.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2 text-teal-400 font-bold text-xs mb-1">
                    <Receipt className="w-4 h-4" />
                    <span>Numeração Sequencial</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Controle contínuo e rastreável gerado automaticamente pelo sistema (ex: REC-000001).
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2 text-teal-400 font-bold text-xs mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span>Múltiplas Formas</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Discriminação exata de valores pagos em Dinheiro, Cartão ou PIX instantâneo.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2 text-teal-400 font-bold text-xs mb-1">
                    <Users className="w-4 h-4" />
                    <span>Vínculo Profissional</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Associação do CRM/Conselho e nome do especialista responsável pelo atendimento.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2 text-teal-400 font-bold text-xs mb-1">
                    <Clock className="w-4 h-4" />
                    <span>Consultas ou Avulsos</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Gere recibos atrelados a uma consulta da agenda ou emita para atendimentos avulsos.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={onLogin}
                  className="px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>Experimentar Emissão na Plataforma</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Right Image Showcase: Screenshot Recibos */}
            <div className="lg:col-span-6 flex justify-center">
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-teal-500/30 to-indigo-500/30 rounded-3xl blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className="relative rounded-2xl overflow-hidden border-2 border-teal-500/40 shadow-2xl bg-white max-w-sm">
                  <img
                    src="/screenshots/screenshot-recibos.jpg"
                    alt="Demonstração do Recibo Oficial da Zemda"
                    className="w-full h-auto object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Multi-Clinics Architecture Section */}
      <section id="multi-clinicas" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-500/10 text-teal-400 text-xs font-bold">
            <Building2 className="w-3.5 h-3.5" />
            <span>Estrutura Corporativa</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Uma plataforma. Múltiplas clínicas independentes.
          </h2>
          <p className="text-sm text-slate-400">
            A Zemda foi concebida para atender tanto um consultório individual quanto grandes policlínicas e redes com múltiplas unidades.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Privacidade e Isolamento</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cada clínica possui seu próprio ambiente lógico. Nenhum paciente, prontuário ou dado financeiro é compartilhado ou visível entre diferentes unidades.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Equipes & Permissões por Papel</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Diferencie o acesso entre Gestores da Clínica, Médicos/Terapeutas e Recepcionistas. Profissionais enxergam apenas suas próprias agendas e pacientes.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Link Público Customizado</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sua clínica ganha uma página de agendamento online exclusiva com o nome fantasia da sua marca para compartilhar diretamente no WhatsApp ou redes sociais.
            </p>
          </div>
        </div>
      </section>

      {/* Downloads / Native Apps */}
      <section id="aplicativos" className="relative z-10 py-20 bg-slate-900/40 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400">
              Disponibilidade Universal
            </span>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">
              Acesse pelo computador, tablet ou celular
            </h2>
            <p className="text-sm text-slate-400">
              A plataforma Zemda está pronta para a rotina ágil da saúde, seja no balcão da recepção ou no consultório do médico.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Windows Desktop */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4 hover:border-teal-500/40 transition-all">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400">
                  <Monitor className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Aplicativo Windows</h3>
                <p className="text-xs text-slate-400">
                  Instalador nativo (.exe) para computadores da recepção e consultórios (Windows 10 e 11).
                </p>
              </div>
              <a
                href={`${ApiClient.getBaseUrl()}/v1/public/download-windows`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Baixar para Windows (.exe)</span>
              </a>
            </div>

            {/* Android Mobile */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4 hover:border-emerald-500/40 transition-all">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Aplicativo Android</h3>
                <p className="text-xs text-slate-400">
                  Arquivo (.apk) completo para celulares e tablets de profissionais e gestores.
                </p>
              </div>
              <a
                href={`${ApiClient.getBaseUrl()}/v1/public/download-android`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Baixar para Android (.apk)</span>
              </a>
            </div>

            {/* Web Browser */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition-all sm:col-span-2 lg:col-span-1">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Navegador Web</h3>
                <p className="text-xs text-slate-400">
                  Acesso imediato e seguro em qualquer dispositivo sem necessidade de instalação prévia.
                </p>
              </div>
              <button
                onClick={onLogin}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>Acessar via Web</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Manifesto (Sobre a Zemda) */}
      <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center space-y-6">
        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mx-auto">
          <HeartPulse className="w-6 h-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Sobre a Zemda
        </h2>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
          A Zemda nasceu da convicção de que profissionais de saúde devem dedicar seu tempo ao que mais importa: o cuidado com as pessoas. Construímos uma plataforma que une design moderno, estabilidade em nuvem e respeito à privacidade dos dados clínicos, transformando a rotina de consultórios em um processo ágil, elegante e confiável.
        </p>
        <div className="pt-4 flex items-center justify-center gap-4">
          <button
            onClick={onRegisterClinic}
            className="px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-lg shadow-teal-500/20"
          >
            Cadastre sua Clínica na Zemda
          </button>
          <button
            onClick={onLogin}
            className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs border border-slate-700 transition-all cursor-pointer"
          >
            Acessar com sua Conta
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950/90 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo & Copyright */}
          <div className="flex items-center gap-3">
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-8 h-8 object-contain rounded-lg"
            />
            <div>
              <p className="text-sm font-extrabold text-white">Zemda</p>
              <p className="text-xs text-slate-500">Tecnologia para Gestão em Saúde • © 2026 Todos os direitos reservados</p>
            </div>
          </div>

          {/* LGPD & Security Notice */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              LGPD Compliant
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-teal-400" />
              Criptografia de Dados
            </span>
            <span>•</span>
            <button
              onClick={onLogin}
              className="hover:text-teal-300 transition-colors cursor-pointer"
            >
              Acesso Restrito à Equipe
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
