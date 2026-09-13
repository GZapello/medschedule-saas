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
  Globe,
  Bot,
  FileUp,
  Bell,
  Stethoscope,
  Share2,
  Check,
  Zap,
  Printer
} from 'lucide-react';

interface ZemdaLandingPageProps {
  onLogin: () => void;
  onRegisterClinic: () => void;
  onRegisterUser: () => void;
  onOpenPublicBooking?: () => void;
  onNavigateSeoPage?: (slug: string) => void;
}

export const ZemdaLandingPage: React.FC<ZemdaLandingPageProps> = ({
  onLogin,
  onRegisterClinic,
  onRegisterUser,
  onOpenPublicBooking,
  onNavigateSeoPage
}) => {
  const [activeTab, setActiveTab] = useState<'financeiro' | 'atendimento' | 'recibos'>('financeiro');

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
                <span className="inline-block w-2 h-2 rounded-full bg-teal-400" />
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-teal-400">
                Tecnologia em Saúde
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-400">
            <a href="#fluxo" className="hover:text-teal-300 transition-colors">Fluxo Integrado</a>
            <a href="#ia" className="hover:text-teal-300 transition-colors">IA Zemda</a>
            <a href="#importacao" className="hover:text-teal-300 transition-colors">Importação</a>
            <a href="#lembretes" className="hover:text-teal-300 transition-colors">Lembretes</a>
            <a href="#telas" className="hover:text-teal-300 transition-colors">Plataforma</a>
            <a href="#personalizacao" className="hover:text-teal-300 transition-colors">Identidade</a>
          </nav>

          {/* Actions: Entrar & Começar */}
          <div className="flex items-center gap-3">
            <button
              onClick={onLogin}
              className="px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white rounded-xl hover:bg-slate-800/80 transition-all cursor-pointer border border-slate-800 hover:border-slate-700"
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

      {/* HERO SECTION — MENSAGEM PRINCIPAL */}
      <section className="relative z-10 pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-4xl mx-auto space-y-6">
          {/* Floating Pill Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/25 text-teal-300 text-xs font-semibold backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>A evolução definitiva na gestão clínica e assistencial</span>
          </div>

          {/* Mensagem Central Obrigatória */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.1]">
            Escale sua equipe.{' '}
            <span className="bg-gradient-to-r from-teal-400 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
              Obtenha melhores resultados.
            </span>
          </h1>

          {/* Subtítulo */}
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-3xl mx-auto font-normal">
            A plataforma completa que unifica recepção, agenda inteligente, prontuário eletrônico auditado e gestão de atendimentos. Menos burocracia para seus profissionais, zero perda de informações e mais tempo dedicado ao cuidado do paciente.
          </p>

          {/* Botões de Ação Direta */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={onLogin}
              className="w-full sm:w-auto px-8 py-4 text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 rounded-2xl shadow-xl shadow-teal-500/25 hover:shadow-teal-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5"
            >
              <span>Acessar Plataforma</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onRegisterClinic}
              className="w-full sm:w-auto px-8 py-4 text-sm font-bold text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Building2 className="w-4 h-4 text-teal-400" />
              <span>Criar Minha Clínica</span>
            </button>
          </div>

          {/* Badges de Confiança */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-400" /> Sigilo Profissional & LGPD
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-teal-400" /> Sem Perda de Digitação
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-teal-400" /> Multi-Clínicas Isoladas
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-teal-400" /> Web, Desktop & Android
            </span>
          </div>
        </div>

        {/* PRINTS REAIS DA PLATAFORMA EM DESTAQUE (Telas Reais) */}
        <div id="telas" className="mt-16 sm:mt-20 max-w-5xl mx-auto">
          <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-2 sm:p-4 shadow-2xl shadow-teal-950/40">
            
            {/* Abas das Telas Reais */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 px-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="text-xs font-semibold text-slate-400 ml-2">Zemda — Interface Real em Produção</span>
              </div>

              <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('financeiro')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeTab === 'financeiro' ? 'bg-teal-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Financeiro & Métricas
                </button>
                <button
                  onClick={() => setActiveTab('atendimento')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeTab === 'atendimento' ? 'bg-teal-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Atendimento Rápido
                </button>
                <button
                  onClick={() => setActiveTab('recibos')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeTab === 'recibos' ? 'bg-teal-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Recibos Oficiais
                </button>
              </div>
            </div>

            {/* Imagem Real Ativa */}
            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950">
              {activeTab === 'financeiro' && (
                <img
                  src="/screenshots/screenshot-financeiro.jpg?v=2"
                  alt="Painel Financeiro da Zemda"
                  className="w-full h-auto object-cover rounded-2xl hover:scale-[1.01] transition-transform duration-300"
                />
              )}
              {activeTab === 'atendimento' && (
                <img
                  src="/screenshots/screenshot-atendimento.jpg?v=2"
                  alt="Atendimento Rápido e Prontuário da Zemda"
                  className="w-full h-auto object-cover rounded-2xl hover:scale-[1.01] transition-transform duration-300"
                />
              )}
              {activeTab === 'recibos' && (
                <img
                  src="/screenshots/screenshot-recibos.jpg?v=2"
                  alt="Emissão de Recibos Oficiais da Zemda"
                  className="w-full h-auto object-cover rounded-2xl hover:scale-[1.01] transition-transform duration-300"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO 1: DA AGENDA AO PRONTUÁRIO, SEM QUEBRAR O FLUXO */}
      <section id="fluxo" className="relative z-10 py-20 bg-slate-900/40 border-y border-slate-800/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">
              Jornada Contínua e Sem Fricção
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Da agenda ao prontuário, sem quebrar o fluxo.
            </h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Cada etapa do atendimento foi desenhada para que médicos, psicólogos, fisioterapeutas e recepcionistas trabalhem em perfeita sincronia.
            </p>
          </div>

          {/* 5 Passos Integrados */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            
            {/* Passo 1 */}
            <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-teal-500/50 transition-all group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold text-sm mb-4 border border-teal-500/20 group-hover:scale-110 transition-transform">
                  1
                </div>
                <h3 className="font-bold text-white text-base mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-teal-400" />
                  Agenda Inteligente
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Controle horários, teleconsultas, salas físicas, bloqueios e confirmações com visão diária, semanal e mensal.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-teal-400 font-semibold">
                Status em tempo real
              </div>
            </div>

            {/* Passo 2 */}
            <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-teal-500/50 transition-all group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm mb-4 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                  2
                </div>
                <h3 className="font-bold text-white text-base mb-2 flex items-center gap-1.5">
                  <Stethoscope className="w-4 h-4 text-emerald-400" />
                  Atendimento Rápido
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Inicie a consulta com 1 clique. Alertas imediatos de alergias, medicamentos contínuos e salvamento automático sem perda de texto.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-emerald-400 font-semibold">
                Autosave contínuo
              </div>
            </div>

            {/* Passo 3 */}
            <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-teal-500/50 transition-all group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm mb-4 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                  3
                </div>
                <h3 className="font-bold text-white text-base mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  Prontuário & Evolução
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Histórico cronológico, auditoria completa de edições, lacração jurídica e sigilo restrito por profissional (LGPD).
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-indigo-400 font-semibold">
                Sigilo assistencial LGPD
              </div>
            </div>

            {/* Passo 4 */}
            <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-teal-500/50 transition-all group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-sm mb-4 border border-purple-500/20 group-hover:scale-110 transition-transform">
                  4
                </div>
                <h3 className="font-bold text-white text-base mb-2 flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-purple-400" />
                  Finalização & Docs
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Emita atestados médicos, receituários e pedidos de exame com cabeçalho timbrado da clínica e impressão A4 oficial.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-purple-400 font-semibold">
                Cidade & Logo automáticos
              </div>
            </div>

            {/* Passo 5 */}
            <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-teal-500/50 transition-all group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm mb-4 border border-blue-500/20 group-hover:scale-110 transition-transform">
                  5
                </div>
                <h3 className="font-bold text-white text-base mb-2 flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 text-blue-400" />
                  Encaminhamentos
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Transfira o paciente entre colegas da mesma clínica com histórico compartilhado, motivos claros e agendamento instantâneo.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-blue-400 font-semibold">
                Integração multidisciplinar
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SEÇÃO 2: IA AVANÇADA DA ZEMDA */}
      <section id="ia" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-semibold">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              <span>Inteligência Artificial Nativa</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight">
              Uma IA que trabalha junto com sua equipe.
            </h2>

            <p className="text-lg text-teal-300 font-medium">
              Menos tempo procurando informações. Mais tempo dedicado ao cuidado.
            </p>

            <p className="text-sm text-slate-400 leading-relaxed">
              A IA da Zemda analisa o histórico clínico, organiza evoluções anteriores, resume prontuários longos em segundos e auxilia o profissional na tomada de decisão sem interferir na sua soberania clínica.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="p-1 rounded-lg bg-teal-500/10 text-teal-400 mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Resumo Clínico Inteligente</h4>
                  <p className="text-xs text-slate-400">Síntese instantânea das últimas sessões e condutas anteriores do paciente.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1 rounded-lg bg-teal-500/10 text-teal-400 mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Busca Rápida de Histórico</h4>
                  <p className="text-xs text-slate-400">Encontre procedimentos, sintomas ou remédios prescritos há meses em segundos.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1 rounded-lg bg-teal-500/10 text-teal-400 mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Alertas Preventivos de Segurança</h4>
                  <p className="text-xs text-slate-400">Identificação automática de alergias e medicamentos de uso contínuo.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-2xl relative">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-bold text-white">Assistente Clínico Zemda IA</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300">
                <span className="text-[10px] text-teal-400 font-bold uppercase block mb-1">Comando</span>
                "Resuma a evolução dos últimos 3 meses da paciente Mariana Silva."
              </div>

              <div className="p-4 bg-teal-950/30 rounded-xl border border-teal-800/40 text-slate-200 leading-relaxed space-y-2">
                <div className="flex items-center gap-1.5 text-teal-300 font-bold">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Síntese Gerada com Precisão:</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  • 6 sessões realizadas com resposta positiva.<br />
                  • Redução de 70% nas queixas de enxaqueca crônica.<br />
                  • Alerta ativo: alergia à Dipirona confirmada.<br />
                  • Encaminhada para fisioterapia postural em 15/08.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO 3: IMPORTAÇÃO INTELIGENTE DE DADOS */}
      <section id="importacao" className="relative z-10 py-20 bg-slate-900/40 border-y border-slate-800/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-teal-400" />
                <span className="font-bold text-white text-sm">Central de Migração de Dados</span>
              </div>
              <span className="text-[11px] font-bold text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-full border border-teal-500/20">
                Mapeamento Automático
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="font-black text-teal-400 text-sm block">.XLSX</span>
                <span className="text-[10px] text-slate-400">Excel Planilhas</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="font-black text-emerald-400 text-sm block">.CSV</span>
                <span className="text-[10px] text-slate-400">Bancos de Dados</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="font-black text-indigo-400 text-sm block">.DOCX</span>
                <span className="text-[10px] text-slate-400">Word Históricos</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed pt-2">
              Seus dados são extraídos com precisão, normalizando CPFs, telefones com DDD brasileiro, datas de nascimento e notas clínicas anteriores.
            </p>
          </div>

          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/25 text-teal-300 text-xs font-semibold">
              <FileUp className="w-3.5 h-3.5 text-teal-400" />
              <span>Sem Recomeçar do Zero</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-white">
              Migre seus dados sem começar do zero.
            </h2>

            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Mudar de sistema não precisa ser traumático. A Zemda possui um motor inteligente de importação que lê suas listas de pacientes e registros antigos direto de planilhas e arquivos de texto.
            </p>

            <ul className="space-y-2.5 text-xs text-slate-300 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400" /> Importação em massa de centenas ou milhares de pacientes
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400" /> Detecção automática de duplicidades por CPF ou telefone
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400" /> Histórico preservado sem necessidade de redigitação manual
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* SEÇÃO 4: CENTRAL DE LEMBRETES AUTOMÁTICOS */}
      <section id="lembretes" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">
            Redução Drástica de No-Show
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Menos esquecimentos. Mais presença.
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Lembretes automáticos disparados estrategicamente 1 hora antes da consulta garantem que seu paciente chegue pontualmente.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 space-y-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl w-fit">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Disparo 1 Hora Antes</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              O motor em background calcula exatamente 60 minutos antes da sessão para alertar o cliente no momento certo do deslocamento.
            </p>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 space-y-3">
            <div className="p-3 bg-teal-500/10 text-teal-400 rounded-xl w-fit">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Multi-Canais (WhatsApp / SMS)</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mensagens personalizadas com o nome do paciente, horário da consulta, nome do profissional e link com mapa da clínica.
            </p>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 space-y-3">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl w-fit">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Até 3 Tentativas com Retry</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Resiliência técnica com retentativas automáticas e chave de idempotência para nunca disparar cobranças ou avisos em duplicidade.
            </p>
          </div>
        </div>
      </section>

      {/* SEÇÃO 5: SUA CLÍNICA, SUA IDENTIDADE */}
      <section id="personalizacao" className="relative z-10 py-20 bg-slate-900/40 border-t border-slate-800/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">
            Personalização Institucional
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white">
            Sua clínica, sua identidade.
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Apresente sua marca em cada detalhe. O logotipo da sua clínica, sua razão social, CNPJ oficial e cidade são aplicados automaticamente em todos os documentos impressos, atestados, receitas e recibos.
          </p>

          <div className="pt-6 flex flex-wrap justify-center gap-4 text-xs font-semibold text-slate-300">
            <span className="px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              ✓ Logotipo em Prontuários e PDFs
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              ✓ Recibos com Numeração Sequencial Própria
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              ✓ Auto-Localidade pela Cidade Cadastrada
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              ✓ Vocabulário Personalizado (Paciente, Cliente, Pet)
            </span>
          </div>
        </div>
      </section>

      {/* CALL TO ACTION FINAL */}
      <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight">
          Pronto para elevar o padrão da sua clínica?
        </h2>
        <p className="text-base text-slate-400 max-w-2xl mx-auto">
          Escale sua equipe com a tecnologia da Zemda. Entre agora mesmo ou crie a conta da sua clínica em menos de 2 minutos.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={onLogin}
            className="w-full sm:w-auto px-8 py-4 text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 rounded-2xl shadow-xl shadow-teal-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Entrar na Plataforma</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onRegisterClinic}
            className="w-full sm:w-auto px-8 py-4 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-2xl transition-all cursor-pointer"
          >
            Cadastrar Nova Clínica
          </button>
        </div>
      </section>

      {/* FOOTER & SEO LINKS DIRECTORY */}
      <footer className="relative z-10 border-t border-slate-900 py-12 bg-slate-950 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <img src="/brand/zemda-icon.png" alt="Zemda" className="w-7 h-7 object-contain rounded-lg" />
              <span className="font-bold text-white text-base tracking-tight">Zemda</span>
              <span>• Tecnologia para Gestão em Saúde</span>
            </div>

            <div className="flex items-center gap-6">
              <button onClick={onLogin} className="hover:text-teal-400 transition-colors cursor-pointer">Acessar Conta</button>
              <button onClick={onRegisterClinic} className="hover:text-teal-400 transition-colors cursor-pointer">Criar Clínica</button>
              <span className="text-slate-600">|</span>
              <span>Conformidade com a LGPD</span>
            </div>
          </div>

          {/* Diretório de Soluções por Especialidade */}
          <div className="pt-6 border-t border-slate-900/80">
            <p className="font-bold text-[11px] uppercase tracking-wider text-slate-400 mb-3">
              Soluções Especializadas para Saúde
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-[11px]">
              <button onClick={() => onNavigateSeoPage?.('sistema-para-clinicas')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Clínicas & Consultórios
              </button>
              <button onClick={() => onNavigateSeoPage?.('sistema-para-medicos')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Médicos Especialistas
              </button>
              <button onClick={() => onNavigateSeoPage?.('sistema-para-psicologos')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Psicólogos & Terapeutas
              </button>
              <button onClick={() => onNavigateSeoPage?.('sistema-para-fonoaudiologos')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Fonoaudiologia Clínica
              </button>
              <button onClick={() => onNavigateSeoPage?.('sistema-para-fisioterapeutas')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Fisioterapia & Pilates
              </button>
              <button onClick={() => onNavigateSeoPage?.('sistema-para-nutricionistas')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Nutricionistas
              </button>
              <button onClick={() => onNavigateSeoPage?.('agenda-online')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Agenda Online 24h
              </button>
              <button onClick={() => onNavigateSeoPage?.('prontuario')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Prontuário Eletrônico
              </button>
              <button onClick={() => onNavigateSeoPage?.('gestao-financeira')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Gestão Financeira & Caixa
              </button>
              <button onClick={() => onNavigateSeoPage?.('blog')} className="text-left text-slate-400 hover:text-teal-300 transition-colors cursor-pointer">
                • Blog & Dicas de Gestão
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-900 text-center text-[11px] text-slate-600">
            © {new Date().getFullYear()} Zemda — Tecnologia em Saúde. Todos os direitos reservados. Plataforma disponível para Web, Windows e Android.
          </div>
        </div>
      </footer>
    </div>
  );
};
