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
    name: 'Tour Geral do Zemda',
    description: 'Conheça o fluxo do seu dia a dia clínico e gerencial.',
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
        title: 'Agenda Interativa',
        description: 'Organize seus horários, remarque consultas, envie lembretes e inicie atendimentos diretamente da grade.',
        position: 'right'
      },
      {
        id: 'solo_patients',
        target: '[data-tour="nav-patients"]',
        route: 'patients',
        title: 'Gestão de Pacientes',
        description: 'Cadastre pacientes, visualize dados de contato, histórico integrado de consultas e anexos.',
        position: 'right'
      },
      {
        id: 'solo_clinical',
        target: '[data-tour="nav-clinical"]',
        route: 'clinical',
        requiredRoles: ['professional', 'clinic_admin'],
        title: 'Prontuário & Evolução',
        description: 'Consulte os registros clínicos e a evolução dos seus pacientes.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'solo_module',
        target: '[data-tour="nav-clinical-module"]',
        requiredRoles: ['professional', 'clinic_admin'],
        title: 'Módulo Profissional Especializado',
        description: 'Seu ambiente exclusivo com fichas, escalas e condutas personalizadas para sua especialidade.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'solo_zemda360',
        target: '[data-tour="nav-zemda-body"]',
        route: 'zemda-body',
        requiredRoles: ['professional', 'clinic_admin'],
        title: 'Mapeamento Zemda360',
        description: 'Acesse avaliações corporais, mapas anatômicos e comparações entre registros.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'solo_exams',
        target: '[data-tour="nav-pending-exams"]',
        route: 'pending-exams',
        title: 'Documentos & Exames',
        description: 'Acompanhe laudos e exames pendentes a receber dos seus pacientes.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'solo_financial',
        target: '[data-tour="nav-financial"]',
        route: 'financial',
        requiredPermission: 'view_financial',
        title: 'Gestão Financeira',
        description: 'Controle de recebimentos, fluxo de caixa e emissão de recibos autorizados.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'solo_settings',
        target: '[data-tour="nav-settings"]',
        route: 'settings',
        title: 'Configurações da Conta',
        description: 'Acesse os ajustes e recursos disponíveis para sua conta.',
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
        description: 'Veja o resumo de atendimentos, pacientes e indicadores da clínica.',
        position: 'right'
      },
      {
        id: 'admin_calendar',
        target: '[data-tour="nav-calendar"]',
        route: 'calendar',
        title: 'Agenda Multiprofissional',
        description: 'Consulte a agenda e filtre os atendimentos por profissional.',
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
        id: 'admin_staff',
        target: '[data-tour="settings-team"]',
        route: 'settings',
        title: 'Equipe & Permissões',
        description: 'Gerencie os profissionais, colaboradores e acessos da equipe nesta seção.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'admin_services',
        target: '[data-tour="settings-services"]',
        route: 'settings',
        title: 'Serviços & Salas',
        description: 'Cadastre os serviços, valores e duração dos atendimentos nesta seção.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'admin_financial',
        target: '[data-tour="nav-financial"]',
        route: 'financial',
        title: 'Gestão Financeira & Caixa',
        description: 'Acompanhe recebimentos e movimentações financeiras.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'admin_inventory',
        target: '[data-tour="nav-inventory"]',
        route: 'inventory',
        title: 'Estoque de Insumos',
        description: 'Controle de materiais, alertas de reposição mínima e movimentações de estoque.',
        position: 'right',
        hideIfNoTarget: true
      },
      {
        id: 'admin_reports',
        target: '[data-tour="nav-reports"]',
        route: 'reports',
        title: 'Relatórios & Exportação',
        description: 'Consulte os relatórios disponíveis para sua clínica.',
        position: 'right',
        hideIfNoTarget: true
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
        route: 'calendar',
        requiredPermission: 'create_appointment',
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
        title: 'Status dos Agendamentos',
        description: 'Consulte os agendamentos e acompanhe o status dos atendimentos.',
        position: 'bottom'
      },
      {
        id: 'rec_financial',
        target: '[data-tour="nav-financial"]',
        route: 'financial',
        requiredPermission: 'view_financial',
        title: 'Cobranças na Recepção',
        description: 'Consulte as movimentações financeiras permitidas para sua conta.',
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
        description: 'Consulte os relatórios disponíveis para seu perfil.',
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
        description: 'Abra o painel de avaliação dos fonemas.',
        position: 'bottom'
      },
      {
        id: 'fono_lang',
        target: '[data-tour="tab-language"]',
        route: 'zemda-fono',
        title: 'Linguagem e TEA',
        description: 'Acesse os registros de avaliação da linguagem.',
        position: 'bottom'
      },
      {
        id: 'fono_audio',
        target: '[data-tour="tab-audiology"]',
        route: 'zemda-fono',
        title: 'Audiologia & Audiograma Interativo',
        description: 'Abra a avaliação de audiologia e o audiograma.',
        position: 'bottom'
      },
      {
        id: 'fono_fluency',
        target: '[data-tour="tab-fluency"]',
        route: 'zemda-fono',
        title: 'Fluência e Contador de Sílabas',
        description: 'Acesse os registros de avaliação da fluência da fala.',
        position: 'bottom'
      },
      {
        id: 'fono_dysphagia',
        target: '[data-tour="tab-dysphagia"]',
        route: 'zemda-fono',
        title: 'Disfagia & Escala IDDSI',
        description: 'Abra a avaliação de deglutição e consistências alimentares.',
        position: 'bottom'
      },
      {
        id: 'fono_voice',
        target: '[data-tour="tab-voice"]',
        route: 'zemda-fono',
        title: 'Voz & Gravação de Áudio',
        description: 'Acesse os registros de avaliação vocal e áudio.',
        position: 'bottom'
      },

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
        description: 'Abra as triagens e escalas disponíveis no módulo.',
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
        description: 'Abra o assistente para apoiar a organização de rascunhos clínicos. Revise o conteúdo antes de utilizá-lo.',
        position: 'bottom',
        hideIfNoTarget: true
      },

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
        description: 'Abra os planos de tratamento e seus orçamentos.',
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
        description: 'Acesse as medidas antropométricas e a avaliação corporal.',
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
        description: 'Registre o consumo alimentar do paciente no recordatório.',
        position: 'bottom'
      },
      {
        id: 'nutri_meal_plans',
        target: '[data-tour="tab-meal_plans"]',
        route: 'zemda-nutri',
        title: 'Plano Alimentar & Substituições',
        description: 'Abra o editor de plano alimentar do paciente.',
        position: 'bottom'
      },

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
        title: 'Mapa da Dor & Zemda360',
        description: 'Localização anatômica precisa da dor (EVA) integrada ao mapeamento corporal interativo.',
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
        description: 'Abra os testes funcionais disponíveis no módulo.',
        position: 'bottom'
      },
      {
        id: 'fisio_home',
        target: '[data-tour="tab-home_exercises"]',
        route: 'zemda-fisio',
        title: 'Exercícios Domiciliares',
        description: 'Acesse as orientações de exercícios para casa.',
        position: 'bottom'
      },

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
        target: '[data-tour="personal-dashboard-tab"]',
        route: 'zemda-personal',
        title: 'Painel do Treinador',
        description: 'Consulte o painel de treinamento e o resumo dos alunos.',
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
        description: 'Abra a biblioteca para consultar exercícios e suas demonstrações.',
        position: 'bottom'
      },
      {
        id: 'personal_templates',
        target: '[data-tour="personal-templates-tab"]',
        route: 'zemda-personal',
        title: 'Modelos de Treino (Templates)',
        description: 'Acesse os modelos de treino para organizar suas prescrições.',
        position: 'bottom'
      },
      {
        id: 'personal_ai',
        target: '[data-tour="personal-ai-btn"]',
        route: 'zemda-personal',
        title: 'Assistente IA ZemdaPersonal',
        description: 'Abra o assistente de apoio ao planejamento de treinos. Revise as sugestões antes de utilizá-las.',
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

    ]
  },

  // ZemdaMed
  zemda_med: {
    id: 'zemda_med',
    name: 'ZemdaMed • Medicina',
    description: 'Guia prático para atendimento médico, anamnese clínica, exame físico, SOAP e conduta.',
    steps: [
      {
        id: 'med_patient',
        target: '[data-tour="medical-patient-select"]',
        route: 'zemda-med',
        title: 'Seleção do Paciente',
        description: 'Selecione o paciente para carregar histórico, alergias, dados vitais e atendimentos anteriores.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'med_specialty',
        target: '[data-tour="tab-specialty"]',
        route: 'zemda-med',
        title: 'Módulo da Especialidade',
        description: 'Acesse campos customizados para sua especialidade médica cadastrada.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'med_anamnese',
        target: '[data-tour="tab-anamnesis"]',
        route: 'zemda-med',
        title: 'Anamnese Completa',
        description: 'Queixa principal, HMA, antecedentes pessoais, familiares, hábitos de vida e medicações em uso.',
        position: 'bottom'
      },
      {
        id: 'med_assessments',
        target: '[data-tour="tab-assessments"]',
        route: 'zemda-med',
        title: 'Avaliações Clínicas',
        description: 'Abra as avaliações disponíveis no módulo médico.',
        position: 'bottom'
      },
      {
        id: 'med_physical_exam',
        target: '[data-tour="tab-physical_exam"]',
        route: 'zemda-med',
        title: 'Exame Físico Estruturado',
        description: 'Sinais vitais (PA, FC, FR, SpO2, Temperatura, Glicemia) e exame segmentar detalhado.',
        position: 'bottom'
      },
      {
        id: 'med_soap',
        target: '[data-tour="tab-soap"]',
        route: 'zemda-med',
        title: 'Evolução SOAP',
        description: 'Acesse a evolução organizada em Subjetivo, Objetivo, Avaliação e Plano.',
        position: 'bottom'
      },
      {
        id: 'med_diagnosis',
        target: '[data-tour="tab-diagnosis"]',
        route: 'zemda-med',
        title: 'Hipótese Diagnóstica (CID-10)',
        description: 'Busca rápida de diagnósticos por código ou descrição com suporte a múltiplos CIDs.',
        position: 'bottom'
      },
      {
        id: 'med_conduct',
        target: '[data-tour="tab-conduct"]',
        route: 'zemda-med',
        title: 'Prescrição & Conduta',
        description: 'Emissão de prescrições farmacológicas, pedidos de exames complementares e atestados médicos.',
        position: 'bottom'
      },
      {
        id: 'med_history',
        target: '[data-tour="tab-history"]',
        route: 'zemda-med',
        title: 'Histórico & Linha do Tempo',
        description: 'Acompanhe a evolução longitudinal de consultas, prescrições e exames anteriores.',
        position: 'bottom'
      },

    ]
  },

  // ZemdaEstetic
  zemda_estetic: {
    id: 'zemda_estetic',
    name: 'ZemdaEstetic • Estética Integrada',
    description: 'Guia para avaliação facial, corporal, capilar, procedimentos e registro fotográfico.',
    steps: [
      {
        id: 'estetic_patient',
        target: '[data-tour="estetic-patient-select"]',
        route: 'zemda-estetic',
        title: 'Identificação do Cliente',
        description: 'Selecione um cliente para abrir avaliação, fotos, planejamento, procedimentos e histórico. O guia não abre prontuários automaticamente.',
        position: 'bottom',
        hideIfNoTarget: true
      },
      {
        id: 'estetic_area',
        target: '[data-tour="estetic-area-selector"]',
        route: 'zemda-estetic',
        title: 'Área de Atuação (Facial / Corporal / Capilar)',
        description: 'Escolha uma das áreas de atuação liberadas para sua conta.',
        position: 'bottom',
        hideIfNoTarget: true
      },

    ]
  },

  // Zemda360
  zemda_body: {
    id: 'zemda_body',
    name: 'Zemda360 • Mapeamento Visual e Anatômico Integrado',
    description: 'Conheça o acesso às avaliações e ao histórico de mapeamento corporal.',
    steps: [
      {
        id: 'body_canvas',
        target: '[data-tour="body-records-title"]',
        route: 'zemda-body',
        title: 'Avaliações Zemda360',
        description: 'Consulte avaliações e compare registros de um paciente. Selecione um paciente para iniciar uma nova avaliação.',
        position: 'bottom'
      },
      {
        id: 'body_patient',
        target: '[data-tour="body-patient-select"]',
        route: 'zemda-body',
        title: 'Selecione um paciente',
        description: 'Busque o paciente para consultar as avaliações registradas.',
      },
      {
        id: 'body_new',
        target: '[data-tour="body-new-assessment"]',
        route: 'zemda-body',
        title: 'Nova avaliação',
        description: 'Após selecionar um paciente, este botão abre o editor de avaliação e mapeamento anatômico.',
      },

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
  { id: 'zemda_med', name: 'ZemdaMed (Medicina)', route: 'zemda-med', professionLabel: 'Medicina' },
  { id: 'zemda_estetic', name: 'ZemdaEstetic (Estética)', route: 'zemda-estetic', professionLabel: 'Estética' },
  { id: 'zemda_fono', name: 'ZemdaFono (Fonoaudiologia)', route: 'zemda-fono', professionLabel: 'Fonoaudiologia' },
  { id: 'zemda_psico', name: 'ZemdaPsico (Psicologia)', route: 'zemda-psico', professionLabel: 'Psicologia' },
  { id: 'zemda_odonto', name: 'ZemdaOdonto (Odontologia)', route: 'zemda-odonto', professionLabel: 'Odontologia' },
  { id: 'zemda_nutri', name: 'ZemdaNutri (Nutrição)', route: 'zemda-nutri', professionLabel: 'Nutrição' },
  { id: 'zemda_fisio', name: 'ZemdaFisio (Fisioterapia)', route: 'zemda-fisio', professionLabel: 'Fisioterapia' },
  { id: 'zemda_to', name: 'ZemdaTO (Terapia Ocupacional)', route: 'zemda-to', professionLabel: 'Terapia Ocupacional' },
  { id: 'zemda_personal', name: 'ZemdaPersonal (Educação Física)', route: 'zemda-personal', professionLabel: 'Educação Física' },
  { id: 'zemda_pp', name: 'ZemdaPP (Psicopedagogia)', route: 'zemda-pp', professionLabel: 'Psicopedagogia' }
];
