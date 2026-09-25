export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  route?: string;
  requiredPermission?: string;
  requiredRoles?: string[];
  hideIfNoTarget?: boolean;
}

export interface TourDefinition {
  id: string;
  name: string;
  description: string;
  steps: TourStep[];
}

// ----------------------------------------------------
// 1. TOURS GERAIS POR PERFIL
// ----------------------------------------------------

export const TOURS_BY_PROFILE: Record<string, TourDefinition> = {
  // PROFISSIONAL SOLO (Consultório Próprio / Autônomo)
  solo_professional: {
    id: 'solo_professional',
    name: 'Tour do Profissional Autônomo',
    description: 'Conheça o fluxo do seu dia a dia clínico e financeiro.',
    steps: [
      {
        id: 'solo_dashboard',
        target: '[data-tour="nav-dashboard"]',
        route: 'dashboard',
        title: 'Painel Geral',
        description: 'Acompanhe seus atendimentos do dia, faltas, resumo de agenda e alertas importantes em tempo real.',
        position: 'right'
      },
      {
        id: 'solo_calendar',
        target: '[data-tour="nav-calendar"]',
        route: 'calendar',
        title: 'Agenda Inteligente',
        description: 'Organize seus horários, remarque consultas, envie lembretes e inicie atendimentos diretamente da grade.',
        position: 'right'
      },
      {
        id: 'solo_patients',
        target: '[data-tour="nav-patients"]',
        route: 'patients',
        title: 'Gestão de Pacientes',
        description: 'Cadastre pacientes, visualize dados de contato, histórico de consultas e anexos.',
        position: 'right'
      },
      {
        id: 'solo_module',
        target: '[data-tour="nav-clinical-module"]',
        title: 'Seu Módulo Clínico',
        description: 'Seu ambiente especializado com ferramentas personalizadas para sua profissão e conduta clínica.',
        position: 'right'
      },
      {
        id: 'solo_financial',
        target: '[data-tour="nav-financial"]',
        route: 'financial',
        title: 'Controle Financeiro',
        description: 'Acompanhe recebimentos, emita recibos oficiais e visualize o fluxo de caixa do seu consultório.',
        position: 'right'
      },
      {
        id: 'solo_ai',
        target: '[data-tour="nav-ai-assistant"]',
        title: 'Assistente Inteligente Zemda',
        description: 'Utilize a IA para estruturar evoluções clínicas, transcrever áudios e otimizar seu tempo.',
        position: 'bottom'
      },
      {
        id: 'solo_settings',
        target: '[data-tour="nav-settings"]',
        route: 'settings',
        title: 'Configurações e Perfil',
        description: 'Personalize horários de funcionamento, logotipo, modelos de documentos e preferências de segurança.',
        position: 'right'
      }
    ]
  },

  // GERENCIADOR / ADMINISTRADOR DA CLÍNICA
  clinic_admin: {
    id: 'clinic_admin',
    name: 'Tour da Gestão da Clínica',
    description: 'Visão completa das ferramentas gerenciais, equipe, estoque e finanças.',
    steps: [
      {
        id: 'admin_dashboard',
        target: '[data-tour="nav-dashboard"]',
        route: 'dashboard',
        title: 'Visão Executiva da Clínica',
        description: 'Métricas diárias de faturamento, volume de atendimentos, taxa de ocupação e novos pacientes.',
        position: 'right'
      },
      {
        id: 'admin_calendar',
        target: '[data-tour="nav-calendar"]',
        route: 'calendar',
        title: 'Agenda Multiprofissional',
        description: 'Visualize todas as salas e profissionais simultaneamente com filtros rápidos e encaixes.',
        position: 'right'
      },
      {
        id: 'admin_patients',
        target: '[data-tour="nav-patients"]',
        route: 'patients',
        title: 'Base de Pacientes',
        description: 'Cadastros completos, convênios aceitos, pendências e históricos integrados.',
        position: 'right'
      },
      {
        id: 'admin_team',
        target: '[data-tour="nav-professionals"]',
        route: 'professionals',
        title: 'Corpo Clínico & Escalas',
        description: 'Gerencie profissionais cadastrados, horários de atendimento, comissões e especialidades.',
        position: 'right'
      },
      {
        id: 'admin_staff',
        target: '[data-tour="nav-staff"]',
        route: 'staff',
        title: 'Equipe & Permissões',
        description: 'Defina com precisão os papéis de cada colaborador (recepção, financeiro) com controle RBAC seguro.',
        position: 'right'
      },
      {
        id: 'admin_services',
        target: '[data-tour="nav-services"]',
        route: 'services',
        title: 'Serviços & Salas',
        description: 'Catalogue procedimentos, tempos médios de consulta e disponibilidade das salas físicas.',
        position: 'right'
      },
      {
        id: 'admin_financial',
        target: '[data-tour="nav-financial"]',
        route: 'financial',
        title: 'Gestão Financeira & Caixa',
        description: 'Contas a receber, controle de caixa diário, conciliação e integração com Asaas.',
        position: 'right'
      },
      {
        id: 'admin_payroll',
        target: '[data-tour="nav-payroll"]',
        route: 'payroll',
        title: 'Comissões & Repasses',
        description: 'Cálculo automático de repasses para profissionais por percentual ou valor fixo.',
        position: 'right'
      },
      {
        id: 'admin_inventory',
        target: '[data-tour="nav-inventory"]',
        route: 'inventory',
        title: 'Estoque de Insumos',
        description: 'Controle de materiais, alertas de reposição mínima e movimentações de estoque.',
        position: 'right'
      },
      {
        id: 'admin_reports',
        target: '[data-tour="nav-reports"]',
        route: 'reports',
        title: 'Relatórios & Exportação',
        description: 'Relatórios analíticos de produtividade e faturamento em planilhas ou PDF.',
        position: 'right'
      },
      {
        id: 'admin_settings',
        target: '[data-tour="nav-settings"]',
        route: 'settings',
        title: 'Configurações Globais',
        description: 'Personalize o nome da clínica, dados fiscais, logotipo e termos contratuais.',
        position: 'right'
      }
    ]
  },

  // RECEPÇÃO / SECRETARIA
  receptionist: {
    id: 'receptionist',
    name: 'Tour da Recepção',
    description: 'Focado em agendamentos rápidos, recepção de pacientes e mensagens.',
    steps: [
      {
        id: 'rec_calendar',
        target: '[data-tour="nav-calendar"]',
        route: 'calendar',
        title: 'Agenda do Dia',
        description: 'Visualize os horários marcados, marque chegadas e encaixes com rapidez.',
        position: 'right'
      },
      {
        id: 'rec_new_appt',
        target: '[data-tour="btn-new-appointment"]',
        title: 'Novo Agendamento',
        description: 'Agende uma consulta selecionando paciente, profissional, horário e serviço em poucos cliques.',
        position: 'bottom'
      },
      {
        id: 'rec_patients',
        target: '[data-tour="nav-patients"]',
        route: 'patients',
        title: 'Cadastro de Pacientes',
        description: 'Consulte contatos, cadastre novos pacientes e atualize telefones e convênios.',
        position: 'right'
      },
      {
        id: 'rec_whatsapp',
        target: '[data-tour="nav-calendar"]',
        route: 'calendar',
        title: 'Lembretes e WhatsApp',
        description: 'Envie confirmações e lembretes de consulta diretamente aos pacientes pelo WhatsApp.',
        position: 'bottom'
      },
      {
        id: 'rec_financial',
        target: '[data-tour="nav-financial"]',
        route: 'financial',
        requiredPermission: 'view_financial',
        title: 'Cobranças na Recepção',
        description: 'Registre pagamentos recebidos no balcão e emita recibos autorizados.',
        position: 'right'
      }
    ]
  },

  // FINANCEIRO
  financial: {
    id: 'financial',
    name: 'Tour do Módulo Financeiro',
    description: 'Gestão de cobranças, conciliação de recebimentos e fluxo de caixa.',
    steps: [
      {
        id: 'fin_overview',
        target: '[data-tour="nav-financial"]',
        route: 'financial',
        title: 'Visão Geral do Financeiro',
        description: 'Monitore entradas, saídas previstas e saldo consolidado do período.',
        position: 'right'
      },
      {
        id: 'fin_receipts',
        target: '[data-tour="nav-receipts"]',
        route: 'receipts',
        requiredPermission: 'view_receipts',
        title: 'Emissão de Recibos',
        description: 'Gere recibos oficiais com numeração sequencial e assinatura.',
        position: 'right'
      },
      {
        id: 'fin_budgets',
        target: '[data-tour="nav-budgets"]',
        route: 'budgets',
        title: 'Orçamentos & Planos',
        description: 'Acompanhe orçamentos apresentados, aprovados e convertidos em tratamentos.',
        position: 'right'
      },
      {
        id: 'fin_reports',
        target: '[data-tour="nav-reports"]',
        route: 'reports',
        requiredPermission: 'view_reports',
        title: 'Relatórios de Faturamento',
        description: 'Exporte relatórios financeiros detalhados por profissional, serviço ou convênio.',
        position: 'right'
      }
    ]
  },

  // PROFISSIONAL CLÍNICO
  clinical_professional: {
    id: 'clinical_professional',
    name: 'Tour do Profissional Clínico',
    description: 'Foco no atendimento ao paciente, evolução e prontuário seguro.',
    steps: [
      {
        id: 'clin_calendar',
        target: '[data-tour="nav-calendar"]',
        route: 'calendar',
        title: 'Sua Agenda',
        description: 'Consulte seus horários do dia e inicie o atendimento com um único clique.',
        position: 'right'
      },
      {
        id: 'clin_start',
        target: '[data-tour="nav-clinical-module"]',
        title: 'Espaço Clínico Especializado',
        description: 'Acesse o prontuário eletrônico completo, adaptado à sua especialidade.',
        position: 'right'
      },
      {
        id: 'clin_autosave',
        target: '[data-tour="clinical-autosave"]',
        title: 'Autosave Universal',
        description: 'Suas anotações clínicas são salvas automaticamente a cada digitação para que nada se perca.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'clin_tools',
        target: '[data-tour="clinical-tools"]',
        title: 'Ferramentas de Atendimento',
        description: 'Acesse atalhos rápidos de avaliação, testes complementares e modelos de conduta.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'clin_history',
        target: '[data-tour="clinical-previous-records"]',
        title: 'Prontuários e Histórico',
        description: 'Consulte com facilidade a linha do tempo e evoluções anteriores do paciente.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'clin_finish',
        target: '[data-tour="clinical-finish"]',
        title: 'Finalização do Atendimento',
        description: 'Conclua a consulta com registro seguro, gerando atestados ou receitas se necessário.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  }
};

// ----------------------------------------------------
// 2. TOURS ESPECÍFICOS POR MÓDULO PROFISSIONAL
// ----------------------------------------------------

export const MODULE_TOURS: Record<string, TourDefinition> = {
  // ZemdaFono
  zemda_fono: {
    id: 'zemda_fono',
    name: 'ZemdaFono • Fonoaudiologia',
    description: 'Guia prático para avaliação vocal, fala, linguagem e audiologia.',
    steps: [
      {
        id: 'fono_evo',
        target: '[data-tour="tab-phonemes"]',
        route: 'zemda-fono',
        title: 'Painel Fonêmico e Fala',
        description: 'Registre distorções, omissões e substituições fonêmicas com interface tátil.',
        position: 'bottom'
      },
      {
        id: 'fono_lang',
        target: '[data-tour="tab-language"]',
        route: 'zemda-fono',
        title: 'Linguagem e TEA',
        description: 'Avaliação compreensiva e expressiva infantil e adulta com marcadores objetivos.',
        position: 'bottom'
      },
      {
        id: 'fono_audio',
        target: '[data-tour="tab-audiology"]',
        route: 'zemda-fono',
        title: 'Audiologia & Audiograma Interativo',
        description: 'Plote limiares tonais e vocais diretamente no audiograma interativo com cálculo de perdas.',
        position: 'bottom'
      },
      {
        id: 'fono_fluency',
        target: '[data-tour="tab-fluency"]',
        route: 'zemda-fono',
        title: 'Fluência e Contador de Sílabas',
        description: 'Cronômetro e marcador de disfluências típicas e atípicas em tempo real.',
        position: 'bottom'
      },
      {
        id: 'fono_dysphagia',
        target: '[data-tour="tab-dysphagia"]',
        route: 'zemda-fono',
        title: 'Disfagia & Escala IDDSI',
        description: 'Classificação da consistência alimentar e rastreio de risco broncoaspirativo.',
        position: 'bottom'
      },
      {
        id: 'fono_voice',
        target: '[data-tour="tab-voice"]',
        route: 'zemda-fono',
        title: 'Voz & Gravação de Áudio',
        description: 'Grave amostras vocais, calcule a relação s/z e analise parâmetros de fala.',
        position: 'bottom'
      },
      {
        id: 'fono_tools',
        target: '[data-tour="clinical-tools"]',
        route: 'zemda-fono',
        title: 'Ferramentas Fonoaudiológicas',
        description: 'Menu rápido com relatórios de IA e testes complementares.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'fono_autosave',
        target: '[data-tour="clinical-autosave"]',
        route: 'zemda-fono',
        title: 'Autosave Contínuo',
        description: 'Seus apontamentos são salvos continuamente para proteger seu histórico clínico.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'fono_finish',
        target: '[data-tour="clinical-finish"]',
        route: 'zemda-fono',
        title: 'Finalização do Atendimento',
        description: 'Registre a conduta e sele o prontuário fonoaudiológico com segurança.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  },

  // ZemdaPsico
  zemda_psico: {
    id: 'zemda_psico',
    name: 'ZemdaPsico • Psicologia Clínica',
    description: 'Guia prático para sessões, estado mental, triagens e proteção ética.',
    steps: [
      {
        id: 'psico_sessions',
        target: '[data-tour="tab-sessions"]',
        route: 'zemda-psico',
        title: 'Sessões & Evolução Psicológica',
        description: 'Registro de hipóteses diagnósticas, queixa principal, intervenções e condutas.',
        position: 'bottom'
      },
      {
        id: 'psico_anamnese',
        target: '[data-tour="tab-anamnese"]',
        route: 'zemda-psico',
        title: 'Anamnese Completa',
        description: 'Histórico pessoal, familiar, hábitos, sono e fatores desencadeantes.',
        position: 'bottom'
      },
      {
        id: 'psico_eem',
        target: '[data-tour="tab-eem"]',
        route: 'zemda-psico',
        title: 'Exame do Estado Mental (EEM)',
        description: 'Avaliação sistematizada de humor, afeto, orientação, juízo crítico e pensamento.',
        position: 'bottom'
      },
      {
        id: 'psico_risk',
        target: '[data-tour="tab-risk"]',
        route: 'zemda-psico',
        title: 'Avaliação de Risco',
        description: 'Classificação de risco, fatores de proteção e plano de segurança estruturado.',
        position: 'bottom'
      },
      {
        id: 'psico_screenings',
        target: '[data-tour="tab-screenings"]',
        route: 'zemda-psico',
        title: 'Triagens & Escalas',
        description: 'Aplicação e cálculo de escalas psicológicas (ex: PHQ-9, GAD-7) com gráficos longitudinais.',
        position: 'bottom'
      },
      {
        id: 'psico_goals',
        target: '[data-tour="tab-goals"]',
        route: 'zemda-psico',
        title: 'Metas Terapêuticas',
        description: 'Metas SMART e objetivos acordados com o paciente com status de evolução.',
        position: 'bottom'
      },
      {
        id: 'psico_ai',
        target: '[data-tour="psico-ai-btn"]',
        route: 'zemda-psico',
        title: 'Assistente Ético com IA',
        description: 'Apoio na estruturação em tópicos e síntese clínica sem expor dados identificáveis.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'psico_finish',
        target: '[data-tour="clinical-finish"]',
        route: 'zemda-psico',
        title: 'Finalização & Selamento',
        description: 'Finalize a sessão clínica com assinatura digital e selamento imutável LGPD/CFP.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  },

  // ZemdaOdonto
  zemda_odonto: {
    id: 'zemda_odonto',
    name: 'ZemdaOdonto • Odontologia',
    description: 'Guia do odontograma interativo, periodontia, endo e planos de tratamento.',
    steps: [
      {
        id: 'odonto_odontogram',
        target: '[data-tour="tab-odontogram"]',
        route: 'zemda-odonto',
        title: 'Odontograma 2D Interativo',
        description: 'Clique em qualquer face dentária para marcar restaurações, cáries, próteses ou extrações.',
        position: 'bottom'
      },
      {
        id: 'odonto_plans',
        target: '[data-tour="tab-treatment_plans"]',
        route: 'zemda-odonto',
        title: 'Planos de Tratamento & Orçamentos',
        description: 'Crie propostas de tratamento com valores, parcelas e aprovação pelo paciente.',
        position: 'bottom'
      },
      {
        id: 'odonto_perio',
        target: '[data-tour="tab-perio"]',
        route: 'zemda-odonto',
        title: 'Periodontograma Clínico',
        description: 'Mapeamento de bolsas periodontais, sangramento à sondagem, supuração e mobilidade.',
        position: 'bottom'
      },
      {
        id: 'odonto_endo',
        target: '[data-tour="tab-endo"]',
        route: 'zemda-odonto',
        title: 'Endodontia',
        description: 'Registro de canais radiculares, comprimento de trabalho (CT) e instrumentos utilizados.',
        position: 'bottom'
      },
      {
        id: 'odonto_ortho',
        target: '[data-tour="tab-ortho_hof"]',
        route: 'zemda-odonto',
        title: 'Ortodontia & Harmonização (HOF)',
        description: 'Acompanhamento de alinhadores, bráquetes, pontos anatômicos e procedimentos de HOF.',
        position: 'bottom'
      },
      {
        id: 'odonto_photos',
        target: '[data-tour="tab-photos_exams"]',
        route: 'zemda-odonto',
        title: 'Fotos Clínicas & Radiografias',
        description: 'Anexe radiografias periapicais, panorâmicas e fotos intra/extraorais comparativas.',
        position: 'bottom'
      },
      {
        id: 'odonto_finish',
        target: '[data-tour="clinical-finish"]',
        route: 'zemda-odonto',
        title: 'Finalizar Consulta Odontológica',
        description: 'Atualize o dossiê do dente e registre a evolução clínica oficial.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  },

  // ZemdaNutri
  zemda_nutri: {
    id: 'zemda_nutri',
    name: 'ZemdaNutri • Nutrição Clínica',
    description: 'Guia prático para antropometria, cálculos nutricionais e planos alimentares.',
    steps: [
      {
        id: 'nutri_evo',
        target: '[data-tour="tab-evolution"]',
        route: 'zemda-nutri',
        title: 'Evolução Nutricional',
        description: 'Acompanhamento da adesão à dieta, alterações gastrointestinais e metas do paciente.',
        position: 'bottom'
      },
      {
        id: 'nutri_antropo',
        target: '[data-tour="tab-anthropometry"]',
        route: 'zemda-nutri',
        title: 'Antropometria & Dobras Cutâneas',
        description: 'Circunferências, dobras com cálculo de percentual de gordura (Pollock/Faulkner) e somatotipo.',
        position: 'bottom'
      },
      {
        id: 'nutri_bio',
        target: '[data-tour="tab-bioimpedance"]',
        route: 'zemda-nutri',
        title: 'Bioimpedância',
        description: 'Massa magra, massa gorda, água corporal total e taxa metabólica basal.',
        position: 'bottom'
      },
      {
        id: 'nutri_recalls',
        target: '[data-tour="tab-recalls"]',
        route: 'zemda-nutri',
        title: 'Recordatório 24 Horas',
        description: 'Levantamento da rotina alimentar com cálculo automático de calorias e macronutrientes.',
        position: 'bottom'
      },
      {
        id: 'nutri_meal_plans',
        target: '[data-tour="tab-meal_plans"]',
        route: 'zemda-nutri',
        title: 'Plano Alimentar & Substituições',
        description: 'Prescrição de cardápios com horários, gramaturas, lista de substitutos e tabela TACO.',
        position: 'bottom'
      },
      {
        id: 'nutri_finish',
        target: '[data-tour="clinical-finish"]',
        route: 'zemda-nutri',
        title: 'Finalização & Envio',
        description: 'Emita a dieta em PDF formatado para entrega imediata ao paciente.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  },

  // ZemdaFisio
  zemda_fisio: {
    id: 'zemda_fisio',
    name: 'ZemdaFisio • Fisioterapia',
    description: 'Guia prático para avaliação cinético-funcional, testes e prescrição de exercícios.',
    steps: [
      {
        id: 'fisio_evo',
        target: '[data-tour="tab-evolution"]',
        route: 'zemda-fisio',
        title: 'Evolução Fisioterapêutica',
        description: 'Registro de condutas, recursos eletrotermofototerápicos e resposta motora.',
        position: 'bottom'
      },
      {
        id: 'fisio_kinetic',
        target: '[data-tour="tab-kinetic_functional"]',
        route: 'zemda-fisio',
        title: 'Avaliação Cinético-Funcional',
        description: 'Diagnóstico cinesiológico funcional com classificação CIF e limitações de atividade.',
        position: 'bottom'
      },
      {
        id: 'fisio_pain',
        target: '[data-tour="tab-pain_zemdabody"]',
        route: 'zemda-fisio',
        title: 'Mapa da Dor & ZemdaBody',
        description: 'Localização anatômica precisa da dor (EVA) integrada ao mapa corporal.',
        position: 'bottom'
      },
      {
        id: 'fisio_adm',
        target: '[data-tour="tab-adm_goniometry"]',
        route: 'zemda-fisio',
        title: 'Goniometria & Amplitude (ADM)',
        description: 'Tabela comparativa bilateral com graus normativos para cada articulação.',
        position: 'bottom'
      },
      {
        id: 'fisio_strength',
        target: '[data-tour="tab-muscle_strength"]',
        route: 'zemda-fisio',
        title: 'Força Muscular (Oxford)',
        description: 'Graduação de força de 0 a 5 por grupo muscular.',
        position: 'bottom'
      },
      {
        id: 'fisio_tests',
        target: '[data-tour="tab-functional_tests"]',
        route: 'zemda-fisio',
        title: 'Testes Funcionais Ortopédicos',
        description: 'Bateria de testes ortopédicos consagrados (Lachman, Neer, Phalen, etc.).',
        position: 'bottom'
      },
      {
        id: 'fisio_home',
        target: '[data-tour="tab-home_exercises"]',
        route: 'zemda-fisio',
        title: 'Exercícios Domiciliares',
        description: 'Orientações prescritas para o paciente realizar em casa com ilustrações.',
        position: 'bottom'
      },
      {
        id: 'fisio_finish',
        target: '[data-tour="clinical-finish"]',
        route: 'zemda-fisio',
        title: 'Finalização & Conduta',
        description: 'Conclua a sessão e atualize a curva de reabilitação do paciente.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  },

  // ZemdaTO
  zemda_to: {
    id: 'zemda_to',
    name: 'ZemdaTO • Terapia Ocupacional',
    description: 'Guia para perfil ocupacional, AVDs, tecnologia assistiva e plano singular.',
    steps: [
      {
        id: 'to_profile',
        target: '[data-tour="tab-profile"]',
        route: 'zemda-to',
        title: 'Perfil Ocupacional',
        description: 'Histórico ocupacional, papéis sociais, rotina diária e prioridades do indivíduo.',
        position: 'bottom'
      },
      {
        id: 'to_adl',
        target: '[data-tour="tab-adl"]',
        route: 'zemda-to',
        title: 'AVD & AIVD',
        description: 'Avaliação da independência funcional para atividades básicas e instrumentais de vida diária.',
        position: 'bottom'
      },
      {
        id: 'to_sensory',
        target: '[data-tour="tab-sensory"]',
        route: 'zemda-to',
        title: 'Processamento Sensorial',
        description: 'Mapeamento de hiper/hiporreatividade sensorial tátil, vestibular e proprioceptiva.',
        position: 'bottom'
      },
      {
        id: 'to_assistive',
        target: '[data-tour="tab-assistive_tech"]',
        route: 'zemda-to',
        title: 'Tecnologia Assistiva & Órteses',
        description: 'Prescrição, confecção e adaptações ergonômicas ambientais e utensílios.',
        position: 'bottom'
      },
      {
        id: 'to_finish',
        target: '[data-tour="clinical-finish"]',
        route: 'zemda-to',
        title: 'Finalizar Sessão de TO',
        description: 'Registre o avanço funcional e objetivos da próxima intervenção.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  },

  // ZemdaPersonal
  zemda_personal: {
    id: 'zemda_personal',
    name: 'ZemdaPersonal • Educação Física',
    description: 'Guia para gestão de alunos, periodização, montagem de treinos e execução.',
    steps: [
      {
        id: 'personal_dashboard',
        target: '[data-tour="personal-overview"]',
        route: 'zemda-personal',
        title: 'Dashboard do Treinador',
        description: 'Alunos ativos, frequência semanal, avaliações vencendo e volume total de treino.',
        position: 'bottom'
      },
      {
        id: 'personal_students',
        target: '[data-tour="personal-students-tab"]',
        route: 'zemda-personal',
        title: 'Alunos & Fichas',
        description: 'Perfil completo do aluno, objetivos (hipertrofia, emagrecimento) e histórico.',
        position: 'bottom'
      },
      {
        id: 'personal_library',
        target: '[data-tour="personal-exercises-tab"]',
        route: 'zemda-personal',
        title: 'Biblioteca de Exercícios',
        description: 'Centenas de exercícios anatômicos com grupos musculares e fotos demonstrativas.',
        position: 'bottom'
      },
      {
        id: 'personal_templates',
        target: '[data-tour="personal-templates-tab"]',
        route: 'zemda-personal',
        title: 'Modelos de Treino (Templates)',
        description: 'Crie fichas ABC, Full Body ou Upper/Lower e aplique para múltiplos alunos com um clique.',
        position: 'bottom'
      },
      {
        id: 'personal_ai',
        target: '[data-tour="personal-ai-btn"]',
        route: 'zemda-personal',
        title: 'Assistente IA ZemdaPersonal',
        description: 'Sugestões de progressão de cargas, periodização e variações biomecânicas inteligentes.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  },

  // ZemdaPP
  zemda_pp: {
    id: 'zemda_pp',
    name: 'ZemdaPP • Psicopedagogia',
    description: 'Guia prático para avaliação da aprendizagem, leitura, escrita e plano PIP.',
    steps: [
      {
        id: 'pp_sessions',
        target: '[data-tour="tab-evolution"]',
        route: 'zemda-pp',
        title: 'Sessões Psicopedagógicas',
        description: 'Registro de objetivos, intervenções com jogos pedagógicos e respostas observadas.',
        position: 'bottom'
      },
      {
        id: 'pp_learning',
        target: '[data-tour="tab-learning"]',
        route: 'zemda-pp',
        title: 'Área de Aprendizagem',
        description: 'Rastreio de leitura, escrita, cálculo matemático e raciocínio lógico.',
        position: 'bottom'
      },
      {
        id: 'pp_plans',
        target: '[data-tour="tab-plans_goals"]',
        route: 'zemda-pp',
        title: 'Plano PIP & Metas',
        description: 'Plano de Intervenção Psicopedagógica estruturado com metas e estratégias.',
        position: 'bottom'
      },
      {
        id: 'pp_school',
        target: '[data-tour="tab-family_school"]',
        route: 'zemda-pp',
        title: 'Família & Escola',
        description: 'Comunicação orientada para coordenadores, professores e responsáveis.',
        position: 'bottom'
      },
      {
        id: 'pp_finish',
        target: '[data-tour="clinical-finish"]',
        route: 'zemda-pp',
        title: 'Finalização do Atendimento',
        description: 'Feche a sessão psicopedagógica com emissão de relatórios e relatórios escolares.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  },

  // ZemdaBody
  zemda_body: {
    id: 'zemda_body',
    name: 'ZemdaBody • Mapa Corporal Clínico',
    description: 'Guia para marcação anatômica, caneta digital, borracha e planos.',
    steps: [
      {
        id: 'body_canvas',
        target: '[data-tour="body-canvas-container"]',
        route: 'zemda-body',
        title: 'Modelo Anatômico 360°',
        description: 'Alterne entre visão anterior, posterior, lateral e modelos anatômicos masculino e feminino.',
        position: 'bottom'
      },
      {
        id: 'body_tools',
        target: '[data-tour="body-tool-selector"]',
        route: 'zemda-body',
        title: 'Seleção, Caneta e Borracha',
        description: 'Use a ferramenta de seleção para áreas anatômicas ou a caneta colorida para desenhar traços manuais.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'body_plans',
        target: '[data-tour="body-section-selector"]',
        route: 'zemda-body',
        title: 'Antropometria & Plano Terapêutico',
        description: 'Associe medidas corporais e condutas terapêuticas diretamente aos pontos selecionados.',
        position: 'bottom',
        hideIfNoTarget: true
      }
    ]
  }
};

// ----------------------------------------------------
// HELPER: FILTRAR TOUR PELAS PERMISSÕES DO USUÁRIO
// ----------------------------------------------------

export function filterTourByPermissions(
  tour: TourDefinition,
  userRole?: string,
  userPermissions: string[] = []
): TourDefinition {
  const isSuper = userRole === 'superadmin';
  const isAdmin = userRole === 'clinic_admin' || isSuper;

  const validSteps = tour.steps.filter(step => {
    // Validação de Role
    if (step.requiredRoles && step.requiredRoles.length > 0) {
      if (!userRole || (!isSuper && !step.requiredRoles.includes(userRole))) {
        return false;
      }
    }

    // Validação de Permissão Específica
    if (step.requiredPermission) {
      if (!isAdmin && !userPermissions.includes(step.requiredPermission)) {
        return false;
      }
    }

    // Filtros de Proteção de Privacidade para Recepção
    if (userRole === 'receptionist') {
      if (
        step.id.includes('clinical') ||
        step.id.includes('prontuario') ||
        step.id.includes('balance') ||
        step.id.includes('admin_')
      ) {
        return false;
      }
    }

    return true;
  });

  return {
    ...tour,
    steps: validSteps
  };
}

// ----------------------------------------------------
// 3. IDENTIFICAÇÃO CANÔNICA DE MÓDULOS CLÍNICOS DO USUÁRIO
// ----------------------------------------------------

export interface ClinicalModuleInfo {
  id: string;
  name: string;
  route: string;
  professionLabel: string;
}

export const ALL_CLINICAL_MODULES: ClinicalModuleInfo[] = [
  { id: 'zemda_fono', name: 'ZemdaFono (Fonoaudiologia)', route: 'zemda-fono', professionLabel: 'Fonoaudiologia' },
  { id: 'zemda_psico', name: 'ZemdaPsico (Psicologia)', route: 'zemda-psico', professionLabel: 'Psicologia' },
  { id: 'zemda_odonto', name: 'ZemdaOdonto (Odontologia)', route: 'zemda-odonto', professionLabel: 'Odontologia' },
  { id: 'zemda_nutri', name: 'ZemdaNutri (Nutrição)', route: 'zemda-nutri', professionLabel: 'Nutrição' },
  { id: 'zemda_fisio', name: 'ZemdaFisio (Fisioterapia)', route: 'zemda-fisio', professionLabel: 'Fisioterapia' },
  { id: 'zemda_to', name: 'ZemdaTO (Terapia Ocupacional)', route: 'zemda-to', professionLabel: 'Terapia Ocupacional' },
  { id: 'zemda_personal', name: 'ZemdaPersonal (Educação Física)', route: 'zemda-personal', professionLabel: 'Educação Física' },
  { id: 'zemda_pp', name: 'ZemdaPP (Psicopedagogia)', route: 'zemda-pp', professionLabel: 'Psicopedagogia' }
];

export interface AuthFlagsInput {
  isSpeechTherapist?: boolean;
  isPsychologist?: boolean;
  isDentist?: boolean;
  isNutritionist?: boolean;
  isPhysiotherapist?: boolean;
  isOccupationalTherapist?: boolean;
  isPersonalTrainer?: boolean;
  isPsychopedagogue?: boolean;
  [key: string]: any;
}

export function getUserAuthorizedClinicalModules(
  user?: any,
  permissions: string[] = [],
  authFlags?: AuthFlagsInput
): ClinicalModuleInfo[] {
  if (!user && !authFlags) return [];

  const authorized = new Set<string>();

  // 1. Verificação via flags de autenticação ativas (com mútua exclusividade do AuthContext)
  if (authFlags) {
    if (authFlags.isSpeechTherapist || authFlags.isZemdaFono) authorized.add('zemda_fono');
    if (authFlags.isPsychologist || authFlags.isZemdaPsico) authorized.add('zemda_psico');
    if (authFlags.isDentist || authFlags.isZemdaOdonto) authorized.add('zemda_odonto');
    if (authFlags.isNutritionist || authFlags.isZemdaNutri) authorized.add('zemda_nutri');
    if (authFlags.isPhysiotherapist || authFlags.isZemdaFisio) authorized.add('zemda_fisio');
    if (authFlags.isOccupationalTherapist || authFlags.isZemdaTO) authorized.add('zemda_to');
    if (authFlags.isPersonalTrainer || authFlags.isZemdaPersonal) authorized.add('zemda_personal');
    if (authFlags.isPsychopedagogue || authFlags.isZemdaPP) authorized.add('zemda_pp');
  }

  // 2. Flags explícitas de módulos habilitados no perfil do usuário / clínica
  if (user) {
    if (user.zemdaFonoEnabled || user.zemda_fono_enabled) authorized.add('zemda_fono');
    if (user.zemdaPsicoEnabled || user.zemda_psico_enabled) authorized.add('zemda_psico');
    if (user.zemdaOdontoEnabled || user.zemda_odonto_enabled) authorized.add('zemda_odonto');
    if (user.zemdaNutriEnabled || user.zemda_nutri_enabled) authorized.add('zemda_nutri');
    if (user.zemdaFisioEnabled || user.zemda_fisio_enabled) authorized.add('zemda_fisio');
    if (user.zemdaToEnabled || user.zemda_to_enabled) authorized.add('zemda_to');
    if (user.zemdaPersonalEnabled || user.zemda_personal_enabled) authorized.add('zemda_personal');
    if (user.zemdaPPEnabled || user.zemda_pp_enabled) authorized.add('zemda_pp');
  }

  // 3. Permissões granulares de acesso a módulos
  if (permissions && permissions.length > 0) {
    if (permissions.includes('access_zemda_fono') || permissions.includes('module_fono')) authorized.add('zemda_fono');
    if (permissions.includes('access_zemda_psico') || permissions.includes('module_psico')) authorized.add('zemda_psico');
    if (permissions.includes('access_zemda_odonto') || permissions.includes('module_odonto')) authorized.add('zemda_odonto');
    if (permissions.includes('access_zemda_nutri') || permissions.includes('module_nutri')) authorized.add('zemda_nutri');
    if (permissions.includes('access_zemda_fisio') || permissions.includes('module_fisio')) authorized.add('zemda_fisio');
    if (permissions.includes('access_zemda_to') || permissions.includes('module_to')) authorized.add('zemda_to');
    if (permissions.includes('access_zemda_personal') || permissions.includes('module_personal')) authorized.add('zemda_personal');
    if (permissions.includes('access_zemda_pp') || permissions.includes('module_pp')) authorized.add('zemda_pp');
  }

  // 4. Se ainda não há módulo autorizado por flag ou permissão direta, inspecionar profissão e conselho
  if (user && authorized.size === 0) {
    const profId = (user.professionId || user.profession_id || '').toLowerCase();
    const profSlug = (user.professionSlug || user.profession_slug || '').toLowerCase();
    const profName = (user.professionName || user.profession_name || '').toLowerCase();
    const regType = (user.registrationType || user.registration_type || '').toUpperCase();
    const practiceAreas = (
      Array.isArray(user.practiceAreas || user.practice_areas)
        ? (user.practiceAreas || user.practice_areas).join(' ')
        : (user.practiceAreas || user.practice_areas || '')
    ).toLowerCase();

    const combined = `${profId} ${profSlug} ${profName} ${practiceAreas}`.toLowerCase();

    // Psicopedagogia
    if (
      profId.includes('psicopedag') ||
      profSlug.includes('psicopedag') ||
      combined.includes('psicopedag') ||
      regType === 'ABPP'
    ) {
      authorized.add('zemda_pp');
    }
    // Fonoaudiologia
    else if (
      profId.includes('fono') ||
      profSlug.includes('fono') ||
      combined.includes('fono') ||
      regType === 'CRFA'
    ) {
      authorized.add('zemda_fono');
    }
    // Psicologia
    else if (
      profId.includes('psicolog') ||
      profId.includes('psicanal') ||
      profId.includes('neuropsicolog') ||
      profSlug.includes('psicolog') ||
      profSlug.includes('psicanal') ||
      profSlug.includes('neuropsicolog') ||
      combined.includes('psicólog') ||
      combined.includes('psicolog') ||
      combined.includes('neuropsicól') ||
      combined.includes('neuropsicol') ||
      combined.includes('psicanal') ||
      regType === 'CRP'
    ) {
      authorized.add('zemda_psico');
    }
    // Odontologia
    else if (
      profId.includes('odonto') ||
      profId.includes('dentis') ||
      profSlug.includes('odonto') ||
      profSlug.includes('dentis') ||
      combined.includes('odonto') ||
      combined.includes('dentis') ||
      regType === 'CRO'
    ) {
      authorized.add('zemda_odonto');
    }
    // Nutrição
    else if (
      profId.includes('nutri') ||
      profSlug.includes('nutri') ||
      combined.includes('nutri') ||
      regType === 'CRN'
    ) {
      authorized.add('zemda_nutri');
    }
    // Fisioterapia
    else if (
      profId.includes('fisio') ||
      profSlug.includes('fisio') ||
      combined.includes('fisio') ||
      combined.includes('fisioterap') ||
      combined.includes('physio')
    ) {
      authorized.add('zemda_fisio');
    }
    // Terapia Ocupacional
    else if (
      profId.includes('ocupacional') ||
      profSlug.includes('ocupacional') ||
      combined.includes('terapia ocupacional') ||
      combined.includes('terapeuta ocupacional') ||
      combined.includes('ocupacional')
    ) {
      authorized.add('zemda_to');
    }
    // Personal Trainer / Educação Física
    else if (
      profId.includes('personal') ||
      profId.includes('educador-fisico') ||
      profId.includes('educacao-fisica') ||
      profSlug.includes('personal') ||
      profSlug.includes('educacao-fisica') ||
      combined.includes('personal trainer') ||
      combined.includes('educação física') ||
      combined.includes('educacao fisica') ||
      regType === 'CREF'
    ) {
      authorized.add('zemda_personal');
    }
  }

  return ALL_CLINICAL_MODULES.filter(m => authorized.has(m.id));
}

export function getClinicalModuleForUser(
  user?: any,
  permissions: string[] = [],
  authFlags?: AuthFlagsInput
): ClinicalModuleInfo | null {
  const modules = getUserAuthorizedClinicalModules(user, permissions, authFlags);
  return modules.length > 0 ? modules[0] : null;
}
