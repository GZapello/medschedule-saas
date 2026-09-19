// Fonte Única de Verdade para Rotas SEO, Metadados e Arquitetura Pública do Zemda

export const OFFICIAL_DOMAIN = 'https://zemda.com.br';

export interface SeoRoute {
  path: string;
  slug?: string;
  title: string;
  metaDescription: string;
  keywords?: string;
  canonical: string;
  indexable: boolean;
  inSitemap: boolean;
  lastmod?: string;
  badge?: string;
  h1?: string;
  h2?: string;
  summary?: string;
  features?: {
    title: string;
    description: string;
    iconName?: string;
  }[];
  benefits?: string[];
  faqs?: {
    question: string;
    answer: string;
  }[];
  ctaHeadline?: string;
  ctaSubheadline?: string;
}

// Compatibilidade de interface com componentes legados do frontend
export interface SeoPageData {
  slug: string;
  path: string;
  title: string;
  metaDescription: string;
  keywords: string;
  badge: string;
  h1: string;
  h2: string;
  summary: string;
  features: {
    title: string;
    description: string;
    iconName?: string;
  }[];
  benefits: string[];
  faqs: {
    question: string;
    answer: string;
  }[];
  ctaHeadline: string;
  ctaSubheadline: string;
}

/**
 * Normaliza caminhos de URL:
 * - Remove query strings e hashes
 * - Remove trailing slash (exceto para a raiz '/')
 * - Converte para lowercase
 */
export function normalizePath(rawPath: string): string {
  if (!rawPath) return '/';
  const clean = rawPath.split('?')[0].split('#')[0].trim();
  if (clean === '' || clean === '/') return '/';
  return clean.replace(/\/+$/, '').toLowerCase();
}

/**
 * Constrói a URL canônica oficial estrita
 */
export function buildCanonical(rawPath: string): string {
  const norm = normalizePath(rawPath);
  if (norm === '/') {
    return `${OFFICIAL_DOMAIN}/`;
  }
  return `${OFFICIAL_DOMAIN}${norm}`;
}

export const SEO_ROUTES: SeoRoute[] = [
  // 1. Home Principal
  {
    path: '/',
    title: 'Zemda • Sistema de Gestão para Clínicas, Consultórios e Saúde',
    metaDescription: 'Software completo para clínicas, consultórios médicos e terapêuticos. Agenda online inteligente, prontuário eletrônico seguro, gestão financeira, controle de caixa, emissão de recibos e aplicativo integrado para médicos, psicólogos, fonoaudiólogos e fisioterapeutas.',
    keywords: 'sistema para clinicas, software para clinica, prontuario eletronico, agenda medica, gestao para psicologos, fonoaudiologia, fisioterapia, recibos medicos, clinica medica, zemda',
    canonical: `${OFFICIAL_DOMAIN}/`,
    indexable: true,
    inSitemap: true,
    badge: 'Saúde e Gestão',
    h1: 'Saúde e Gestão em Harmonia',
    h2: 'Tudo o que sua clínica precisa em uma única plataforma integrada',
    summary: 'Software completo de prontuário eletrônico, agenda online com confirmação automática, gestão financeira com controle de caixa e módulos especializados para a área da saúde.'
  },

  // 2. Planos e Preços
  {
    path: '/planos',
    title: 'Planos e Preços Transparentes | Zemda',
    metaDescription: 'Conheça os planos do Zemda para consultórios, profissionais autônomos e clínicas multiprofissionais. Sem fidelidade, sem taxas ocultas e com suporte especializado.',
    keywords: 'planos zemda, precos software clinica, assinatura sistema medico, planos prontuario eletronico',
    canonical: `${OFFICIAL_DOMAIN}/planos`,
    indexable: true,
    inSitemap: true,
    badge: 'Planos e Preços',
    h1: 'Planos Transparentes para o seu Consultório ou Clínica',
    h2: 'Escolha o plano ideal para a sua prática em saúde sem surpresas ou taxas ocultas',
    summary: 'Todos os planos incluem suporte técnico humanizado, prontuário seguro em nuvem, agenda online 24h e emissão de recibos oficiais.'
  },

  // 3. Sistema para Clínicas
  {
    slug: 'sistema-para-clinicas',
    path: '/sistema-para-clinicas',
    title: 'Sistema para Clínicas e Consultórios Médicos e Terapêuticos | Zemda',
    metaDescription: 'Software completo para gestão de clínicas médicas, multiprofissionais e consultórios. Prontuário eletrônico seguro, agenda online 24h, gestão financeira e recibos oficiais.',
    keywords: 'sistema para clinicas, software para clinica medica, gestao de clinica, prontuario eletronico para clinicas, agenda clinica',
    canonical: `${OFFICIAL_DOMAIN}/sistema-para-clinicas`,
    indexable: true,
    inSitemap: true,
    badge: 'Gestão Completa de Clínicas',
    h1: 'Sistema Integrado de Gestão para Clínicas e Consultórios',
    h2: 'Centralize Recepção, Corpo Clínico, Prontuários e Faturamento em um só Lugar',
    summary: 'O Zemda foi projetado para elevar o padrão operacional da sua clínica. Conecte recepcionistas, gestores e especialistas em saúde através de uma interface intuitiva, segura e em conformidade rigorosa com a LGPD e conselhos de classe.',
    features: [
      {
        title: 'Prontuário Eletrônico Unificado e Multidisciplinar',
        description: 'Mantenha todo o histórico clínico dos pacientes organizado por data e especialidade. Anexe laudos, imagens, prescrições e exames com segurança absoluta em nuvem.'
      },
      {
        title: 'Agenda Online Inteligente com Confirmação Automática',
        description: 'Permita que seus pacientes agendem consultas 24 horas por dia com link próprio da clínica. Reduza faltas em até 45% com lembretes automáticos.'
      },
      {
        title: 'Gestão Financeira, Controle de Caixa e Emissão de Recibos',
        description: 'Fechamento de caixa por turno de atendimento, controle de repasses médicos, conciliação de pagamentos via PIX e cartão, e emissão de recibos oficiais em folha A4.'
      },
      {
        title: 'Painel Multiprofissional e Acessos Customizados',
        description: 'Defina permissões refinadas para recepcionistas, secretárias, administradores e profissionais de saúde, resguardando o sigilo de cada paciente.'
      }
    ],
    benefits: [
      'Redução comprovada do tempo de espera na recepção',
      'Eliminação de erros de prontuário em papel e perdas de ficha',
      'Total conformidade com resoluções CFM, CFP, Crefito e LGPD',
      'Acesso sincronizado no navegador web e aplicativo Desktop Windows'
    ],
    faqs: [
      {
        question: 'O Zemda suporta clínicas com múltiplas especialidades?',
        answer: 'Sim. O Zemda permite cadastrar médicos, psicólogos, fisioterapeutas, fonoaudiólogos e nutricionistas, cada um com seus parâmetros e horários dedicados.'
      },
      {
        question: 'Meus dados e fichas de pacientes estão protegidos?',
        answer: 'Absolutamente. Todas as comunicações utilizam criptografia SSL/TLS ponta a ponta e backups diários automatizados em infraestrutura de nuvem segura.'
      }
    ],
    ctaHeadline: 'Transforme a gestão da sua clínica hoje mesmo',
    ctaSubheadline: 'Conheça a plataforma Zemda e descubra como unificar recepção, corpo clínico e financeiro com máxima eficiência.'
  },

  // 4. Sistema para Médicos
  {
    slug: 'sistema-para-medicos',
    path: '/sistema-para-medicos',
    title: 'Sistema para Médicos e Consultórios Médicos | Zemda',
    metaDescription: 'Software médico intuitivo e seguro com prontuário eletrônico, prescrição digital, CID-10, atestados, pedidos de exames e agenda inteligente.',
    keywords: 'sistema para medicos, software medico, prontuario eletronico medico, receita medica, atestado medico, gestao consultorio medico',
    canonical: `${OFFICIAL_DOMAIN}/sistema-para-medicos`,
    indexable: true,
    inSitemap: true,
    badge: 'Padrão CFM & Excelência Médica',
    h1: 'Sistema para Médicos e Consultórios Médicos Particulares',
    h2: 'Eficiência Clínica, Prescrições Ágeis e Conformidade com o CFM',
    summary: 'Pensado para médicos que valorizam o tempo com o paciente. Emita receitas, atestados e pedidos de exame com formatação A4 impecável, pesquise códigos CID-10 rapidamente e mantenha a agenda do consultório sempre produtiva.',
    features: [
      {
        title: 'Prontuário Eletrônico com CID-10 e Histórico Completo',
        description: 'Busca integrada de CID-10, evolução SOAP, registro de antecedentes mórbidos, cirurgias prévias e medicamentos em uso.'
      },
      {
        title: 'Emissão de Receituários, Atestados e Pedidos de Exame',
        description: 'Geração imediata de atestados com número de dias e indicação facultativa de CID, além de receituários claros para farmácias.'
      },
      {
        title: 'Redução de Faltas com Confirmações Automáticas de Consulta',
        description: 'Disparo de lembretes automáticos para os pacientes confirmarem a presença, liberando encaixes para a recepção em caso de desistência.'
      },
      {
        title: 'Segurança Máxima de Dados com Criptografia e Backup',
        description: 'Infraestrutura blindada em nuvem para garantir a confidencialidade e a integridade de todas as informações de saúde (LGPD).'
      }
    ],
    benefits: [
      'Menos tempo digitando e mais tempo olhando para o paciente',
      'Documentos médicos gerados em folha A4 com logotipo da clínica',
      'Acesso seguro de qualquer lugar (consultório, hospital ou notebook)',
      'Organização impecável da recepção com controle de sala de espera'
    ],
    faqs: [
      {
        question: 'Os atestados e receitas gerados pelo Zemda são aceitos legalmente?',
        answer: 'Sim, os documentos contêm dados completos do médico (nome, CRM, especialidade, endereço do consultório e data) prontos para assinatura e carimbo ou certificado digital.'
      },
      {
        question: 'Posso usar minha conta médica em múltiplos computadores e navegadores?',
        answer: 'Sim, o Zemda possui aplicativo desktop dedicado para Windows e versão web moderna que se adapta com perfeição a computadores e notebooks.'
      }
    ],
    ctaHeadline: 'Mais modernidade e precisão para seu consultório médico',
    ctaSubheadline: 'Conheça a experiência clínica do Zemda em conformidade com as normas do CFM, sem perda de tempo e com total segurança.'
  },

  // 5. Sistema para Psicólogos
  {
    slug: 'sistema-para-psicologos',
    path: '/sistema-para-psicologos',
    title: 'Sistema para Psicólogos e Clínicas de Psicologia | Zemda',
    metaDescription: 'Software de gestão clínica para psicólogos e terapeutas. Prontuário psicológico sigiloso, evolução de sessões, controle de pacotes e recibos para IRPF.',
    keywords: 'sistema para psicologos, software para psicologia, prontuario psicologico, gestao consultorio psicologia, anamnese psicologica',
    canonical: `${OFFICIAL_DOMAIN}/sistema-para-psicologos`,
    indexable: true,
    inSitemap: true,
    badge: 'Especializado para Psicologia',
    h1: 'Software de Gestão e Prontuário para Psicólogos',
    h2: 'Privacidade Absoluta, Sigilo Profissional e Gestão Eficiente para sua Prática Clínica',
    summary: 'Desenvolvido sob medida para a rotina do psicólogo clínico e equipes de psicoterapia. Organize anotações de sessões, anamnese inicial, pacotes de consultas e emita recibos válidos para dedução no imposto de renda dos pacientes.',
    features: [
      {
        title: 'Evolução de Sessões e Anamnese Estruturada (CRP)',
        description: 'Registre a evolução psicológica de cada atendimento com privacidade estrita. Suas anotações clínicas ficam protegidas contra qualquer acesso não autorizado.'
      },
      {
        title: 'Gestão de Pacotes de Sessões e Mensalidades',
        description: 'Controle quantas sessões foram realizadas, quantas restam no pacote contratado e a situação financeira de cada paciente com clareza.'
      },
      {
        title: 'Lembretes Automáticos para Reduzir Faltas de Pacientes',
        description: 'Notificações antecipadas que garantem que o paciente compareça pontualmente ou avise com antecedência caso precise remarcar o atendimento.'
      },
      {
        title: 'Comprovantes e Recibos Dedutíveis no Imposto de Renda',
        description: 'Gere recibos com valor numérico e por extenso, dados do CRP, CPF do tomador e do profissional em um clique no padrão oficial da Receita Federal.'
      }
    ],
    benefits: [
      'Sigilo estrito garantido por criptografia de ponta a ponta',
      'Controle visual imediato de sessões pagas e pendentes',
      'Agenda intuitiva com bloqueio de intervalos para estudo de casos',
      'Total mobilidade e agilidade para consultar fichas no computador ou notebook'
    ],
    faqs: [
      {
        question: 'Outros usuários da clínica podem ver as anotações do prontuário psicológico?',
        answer: 'Não. O prontuário clínico é restrito ao profissional responsável pelo paciente e administradores autorizados, preservando as normas do Conselho Federal de Psicologia (CFP).'
      },
      {
        question: 'É possível emitir recibo para o paciente declarar no IRPF?',
        answer: 'Sim, os recibos emitidos pelo Zemda contêm CPF do emitente e tomador, registro profissional e valor por extenso, atendendo a todos os requisitos do Carnê-Leão e Receita Federal.'
      }
    ],
    ctaHeadline: 'Mais tempo para focar no acolhimento dos seus pacientes',
    ctaSubheadline: 'Descubra como o prontuário psicológico sigiloso e a gestão de sessões do Zemda simplificam o dia a dia do seu consultório.'
  },

  // 6. Sistema para Fonoaudiólogos
  {
    slug: 'sistema-para-fonoaudiologos',
    path: '/sistema-para-fonoaudiologos',
    title: 'Sistema para Fonoaudiólogos e Clínicas de Fonoaudiologia | Zemda',
    metaDescription: 'Plataforma especializada para fonoaudiologia. Registro de avaliações em linguagem, voz, audição, motricidade orofacial e evolução terapêutica contínua.',
    keywords: 'sistema-para-fonoaudiologos, software fonoaudiologia, prontuario fonoaudiologico, clinica fonoaudiologia, exercicios fonoaudiologia',
    canonical: `${OFFICIAL_DOMAIN}/sistema-para-fonoaudiologos`,
    indexable: true,
    inSitemap: true,
    badge: 'Especializado para Fonoaudiologia',
    h1: 'Sistema Especializado para Clínicas e Consultórios de Fonoaudiologia',
    h2: 'Acompanhamento Terapêutico Preciso em Voz, Linguagem, Audiologia e Motricidade',
    summary: 'Projetado para fonoaudiólogos que necessitam registrar minuciosamente planos terapêuticos e evolução fonoterápica. Permite acompanhar resultados de testes auditivos, histórico de fala, mastigação e desenvolvimento infantil.',
    features: [
      {
        title: 'Prontuário com Protocolos Fonoterápicos',
        description: 'Espaço dedicado para registrar avaliações de fala, audiometria, deglutição e evolução de exercícios por sessão realizada.'
      },
      {
        title: 'Anexo Rápido de Áudios, Vídeos e Relatórios',
        description: 'Guarde arquivos de gravação de voz e exames complementares direto no perfil seguro do paciente em nuvem.'
      },
      {
        title: 'Agenda de Sessões Recorrentes Sem Choque de Horários',
        description: 'Configure sessões semanais ou quinzenais fixas com facilidade, recebendo avisos de conflitos de sala ou terapeuta.'
      },
      {
        title: 'Controle de Planos e Pacotes Terapêuticos',
        description: 'Painel visual para acompanhar a quantidade de atendimentos realizados e previstos em cada plano de tratamento.'
      }
    ],
    benefits: [
      'Histórico completo do desenvolvimento de cada paciente',
      'Atendimento dentro das diretrizes éticas do CFFa',
      'Confirmação automática de presença via WhatsApp e e-mail',
      'Praticidade na emissão de declarações e recibos timbrados'
    ],
    faqs: [
      {
        question: 'Posso anexar gravações de voz ou vídeos de evolução no prontuário?',
        answer: 'Sim, o Zemda suporta anexos de arquivos de áudio, relatórios em PDF e laudos diretamente no prontuário com total criptografia.'
      },
      {
        question: 'Como funciona o agendamento de sessões com horários fixos semanais?',
        answer: 'A agenda permite criar agendamentos recorrentes com facilidade, reservando automaticamente os dias e horários para o paciente.'
      }
    ],
    ctaHeadline: 'Eleve o padrão do seu consultório de Fonoaudiologia',
    ctaSubheadline: 'Conheça as ferramentas especializadas do Zemda para acompanhamento terapêutico em voz, linguagem e motricidade.'
  },

  // 7. Sistema para Fisioterapeutas
  {
    slug: 'sistema-para-fisioterapeutas',
    path: '/sistema-para-fisioterapeutas',
    title: 'Sistema para Fisioterapeutas e Clínicas de Fisioterapia | Zemda',
    metaDescription: 'Software de gestão para clínicas de fisioterapia, pilates e reabilitação. Avaliação postural, escala de dor, evolução cinético-funcional e controle de sessões.',
    keywords: 'sistema para fisioterapeutas, software fisioterapia, prontuario fisioterapia, clinica pilates, gestao fisioterapia',
    canonical: `${OFFICIAL_DOMAIN}/sistema-para-fisioterapeutas`,
    indexable: true,
    inSitemap: true,
    badge: 'Especializado para Fisioterapia & Reabilitação',
    h1: 'Software de Gestão para Fisioterapia e Clínicas de Reabilitação',
    h2: 'Evolução Cinético-Funcional, Controle de Salas e Acompanhamento de Pacientes',
    summary: 'A ferramenta ideal para fisioterapeutas autônomos e clínicas de reabilitação motora, ortopédica, respiratória ou estúdios de pilates. Agilize o preenchimento de evoluções diárias e tenha controle transparente dos atendimentos.',
    features: [
      {
        title: 'Ficha de Avaliação Fisioterapêutica e Escala de Dor',
        description: 'Monitore a graduação de dor (EVA), amplitude de movimento e testes específicos ao longo de cada ciclo de atendimento.'
      },
      {
        title: 'Gestão Inteligente de Boxes, Salas e Aparelhos',
        description: 'Evite superlotação distribuindo pacientes entre salas de cinesioterapia, eletroterapia ou aparelhos de pilates.'
      },
      {
        title: 'Controle de Sessões Realizadas e Remarcações Rápidas',
        description: 'Saiba instantaneamente o saldo de sessões do paciente e remaneje horários com um simples clique na agenda.'
      },
      {
        title: 'Emissão de Recibos para Reembolso em Planos de Saúde',
        description: 'Imprima comprovantes com descritivo das sessões para que seu paciente solicite reembolso junto ao convênio médico.'
      }
    ],
    benefits: [
      'Agilidade no registro da evolução fisioterapêutica diária',
      'Redução de faltas em até 50% com lembretes automáticos',
      'Conformidade com os padrões do Coffito e Crefito',
      'Visão financeira consolidada dos procedimentos mais rentáveis'
    ],
    faqs: [
      {
        question: 'O sistema permite gerenciar múltiplos fisioterapeutas e salas na mesma clínica?',
        answer: 'Sim, o sistema possui controle completo de múltiplos profissionais e salas/boxes, impedindo duplicidade de agendamentos.'
      },
      {
        question: 'Os recibos emitidos servem para o paciente pedir reembolso no convênio?',
        answer: 'Sim, os recibos emitidos no Zemda contêm todas as informações fiscais e profissionais exigidas pelas operadoras de saúde.'
      }
    ],
    ctaHeadline: 'Profissionalize o atendimento da sua clínica de fisioterapia',
    ctaSubheadline: 'Veja como organizar planos de reabilitação, sessões de fisioterapia e controle de evolução em uma única interface.'
  },

  // 8. Sistema para Nutricionistas
  {
    slug: 'sistema-para-nutricionistas',
    path: '/sistema-para-nutricionistas',
    title: 'Sistema para Nutricionistas e Clínicas de Nutrição | Zemda',
    metaDescription: 'Software para nutricionistas com prontuário alimentar, recordatório 24h, avaliação antropométrica, metas e agendamento de retornos simplificado.',
    keywords: 'sistema para nutricionistas, software nutricao, prontuario nutricional, anamnese nutricional, clinica de nutricao',
    canonical: `${OFFICIAL_DOMAIN}/sistema-para-nutricionistas`,
    indexable: true,
    inSitemap: true,
    badge: 'Especializado para Nutrição',
    h1: 'Sistema Integrado para Nutricionistas e Clínicas de Nutrição',
    h2: 'Acompanhe Metas, Registre Anamneses e Fidelize seus Pacientes',
    summary: 'Apoie seus pacientes na conquista de saúde e qualidade de vida com um software ágil. Centralize fichas de hábitos alimentares, evolução de objetivos, agendamento de consultas de retorno e controle financeiro.',
    features: [
      {
        title: 'Ficha Nutricional Completa e Histórico de Hábitos',
        description: 'Registro de rotina alimentar, preferências, intolerâncias, alergias e metas traçadas para o paciente.'
      },
      {
        title: 'Controle de Retornos e Acompanhamento Periódico',
        description: 'Organize as consultas de acompanhamento para que nenhum paciente abandone o plano nutricional por falta de contato.'
      },
      {
        title: 'Agenda Online 24 Horas Integrada',
        description: 'Seus pacientes agendam consultas particulares ou de retorno pelo seu link institucional personalizado a qualquer hora do dia.'
      },
      {
        title: 'Emissão de Recibos com Dados Oficiais do CRN',
        description: 'Recibos médicos com CNPJ/CPF, número do conselho regional e detalhamento da consulta para declaração ou reembolso.'
      }
    ],
    benefits: [
      'Aumento da retenção e retorno de pacientes para acompanhamento',
      'Prontuário com visualização cronológica de toda a evolução alimentar',
      'Envio de lembretes que reduzem o esquecimento de consultas',
      'Gestão financeira com controle de pagamentos via PIX e cartão'
    ],
    faqs: [
      {
        question: 'Posso usar o Zemda para atendimentos online e presenciais?',
        answer: 'Sim, o Zemda funciona 100% em nuvem em qualquer navegador moderno, permitindo atender tanto presencialmente quanto via teleconsulta.'
      },
      {
        question: 'O paciente pode agendar sozinho pela internet?',
        answer: 'Sim! Sua clínica recebe uma página de agendamento online exclusiva onde o paciente escolhe o dia e horário disponível.'
      }
    ],
    ctaHeadline: 'Dê um salto de organização no seu consultório de Nutrição',
  },

  // 8.1 Sistema para Psicopedagogos (ZemdaPP - CBO 2394-25)
  {
    slug: 'sistema-para-psicopedagogos',
    path: '/sistema-para-psicopedagogos',
    title: 'ZemdaPP • Sistema para Psicopedagogos e Clínicas de Psicopedagogia',
    metaDescription: 'Software completo para psicopedagogos clínicos e institucionais (CBO 2394-25). Avaliação psicopedagógica, plano de intervenção (PIP), parceria escola-família e evoluções em conformidade com as diretrizes da ABPp.',
    keywords: 'sistema para psicopedagogos, software psicopedagogia, prontuario psicopedagogico, plano de intervencao psicopedagogica, avaliacao psicopedagogica, ABPp, zemda, zemdapp',
    canonical: `${OFFICIAL_DOMAIN}/sistema-para-psicopedagogos`,
    indexable: true,
    inSitemap: true,
    badge: 'ZemdaPP — Psicopedagogia',
    h1: 'O Software Definitivo para Psicopedagogia Clínica e Institucional',
    h2: 'Avaliações, plano de intervenção (PIP), escuta familiar e parceria com a escola em uma só plataforma',
    summary: 'Apoio especializado para o psicopedagogo acompanhar o desenvolvimento cognitivo e as aprendizagens com segurança, sigilo profissional e clareza metodológica (CBO 2394-25).',
    features: [
      {
        title: 'Avaliação Psicopedagógica Estruturada (Modo Clínico e Institucional)',
        description: 'Instrumentos para leitura, escrita, matemática, funções executivas e análise do clima pedagógico escolar.'
      },
      {
        title: 'Plano de Intervenção Psicopedagógica (PIP) com Metas Claras',
        description: 'Construa estratégias de mediação pedagógica com objetivos SMART e acompanhamento percentual de evolução.'
      },
      {
        title: 'Parceria com a Escola e Escuta da Família',
        description: 'Registre reuniões com a coordenação pedagógica, visitas escolares e devolutivas familiares com total rastreabilidade.'
      },
      {
        title: 'Sigilo Absoluto e Bloqueio Ético de Instrumentos',
        description: 'Isolamento de prontuário com proteção LGPD e bloqueio automático de testes privativos da Psicologia (SATEPSI/CFP).'
      }
    ],
    benefits: [
      'Registro seguro das sessões com assinatura eletrônica e selamento oficial',
      'Emissão de relatórios psicopedagógicos formatados para escolas e médicos',
      'Facilidade no acompanhamento longitudinal do aprendente',
      'Atendimento em conformidade com as boas práticas da ABPp e CBO 2394-25'
    ],
    faqs: [
      {
        question: 'O registro na ABPp é obrigatório para utilizar o ZemdaPP?',
        answer: 'Não. O registro na Associação Brasileira de Psicopedagogia (ABPp) é opcional. O profissional pode registrar seu número de associado, selecionar outro vínculo ou declarar não informado.'
      },
      {
        question: 'A Psicopedagogia já é uma profissão regulamentada por lei federal?',
        answer: 'A ocupação é formalmente reconhecida pelo Ministério do Trabalho (CBO 2394-25). O projeto de lei de regulamentação profissional (PL 1675/2023) foi aprovado pelo Congresso Nacional e aguarda os trâmites legais de sanção.'
      },
      {
        question: 'Posso emitir relatórios psicopedagógicos para encaminhamento escolar ou neurológico?',
        answer: 'Sim! O ZemdaPP permite emitir relatórios detalhados, pareceres técnicos e declarações de acompanhamento prontos para impressão ou compartilhamento seguro com assinatura eletrônica ou digital.'
      }
    ],
    ctaHeadline: 'Organize sua prática psicopedagógica com o ZemdaPP',
    ctaSubheadline: 'Experimente a plataforma pensada especificamente para as necessidades do psicopedagogo clínico e institucional.'
  },

  // 9. Agenda Online
  {
    slug: 'agenda-online',
    path: '/agenda-online',
    title: 'Agenda Online para Clínicas e Profissionais de Saúde | Zemda',
    metaDescription: 'Agenda online inteligente para área da saúde com link de agendamento 24h, bloqueio de horários, confirmação automática e redução de no-show.',
    keywords: 'agenda online clinica, marcar consulta online, agenda medica online, agendamento para pacientes, software agenda consultorio',
    canonical: `${OFFICIAL_DOMAIN}/agenda-online`,
    indexable: true,
    inSitemap: true,
    badge: 'Produtividade & Agilidade',
    h1: 'Agenda Online Inteligente para Consultórios e Clínicas de Saúde',
    h2: 'Elimine Conflitos de Horários e Permita que seus Pacientes Agendem 24 Horas por Dia',
    summary: 'A agenda do Zemda foi projetada para simplificar a vida da sua recepção e oferecer autonomia aos pacientes. Visualize compromissos por dia, semana ou profissional, bloqueie horários e evite cancelamentos de última hora.',
    features: [
      {
        title: 'Link Personalizado de Agendamento Online para a Clínica',
        description: 'Disponibilize seu link no Instagram, WhatsApp e site. Os pacientes selecionam o profissional, o serviço e o horário disponível sem intermediários.'
      },
      {
        title: 'Lembretes Automáticos via E-mail e Notificações',
        description: 'Alertas pontuais avisam o paciente no dia anterior à consulta, reduzindo drasticamente o índice de faltas e horários ociosos.'
      },
      {
        title: 'Visualização por Dia, Semana, Mês ou por Profissional',
        description: 'Alterne rapidamente a visualização da equipe inteira ou foque na sua própria escala de atendimentos com filtros claros.'
      },
      {
        title: 'Sincronização em Tempo Real entre Dispositivos',
        description: 'Qualquer agendamento realizado no balcão reflete instantaneamente no painel do profissional e na tela da recepção.'
      }
    ],
    benefits: [
      'Até 45% menos faltas com confirmações automatizadas',
      'Fim das ligações telefônicas demoradas para marcar consulta',
      'Controle de encaixes e lista de espera para preencher vagas',
      'Configuração individual de duração de consulta por procedimento'
    ],
    faqs: [
      {
        question: 'O paciente pode agendar fora do horário comercial?',
        answer: 'Sim! Com o agendamento online público do Zemda, os pacientes marcam horários mesmo durante a noite ou aos finais de semana.'
      },
      {
        question: 'Como a secretária gerencia os encaixes do dia?',
        answer: 'A agenda possui criação instantânea de consultas com preenchimento automático do paciente e alerta visual de status (confirmado, em espera, atendido).'
      }
    ],
    ctaHeadline: 'Tenha a agenda do seu consultório sempre cheia e organizada',
    ctaSubheadline: 'Conheça o sistema de agendamento online 24h e lembretes automáticos do Zemda que eliminam faltas e otimizam a recepção.'
  },

  // 10. Prontuário Eletrônico
  {
    slug: 'prontuario',
    path: '/prontuario',
    title: 'Prontuário Eletrônico Seguro e Personalizável | Zemda',
    metaDescription: 'Prontuário eletrônico completo para a saúde. Registro rápido de consultas, anamneses, histórico cronológico, anexos de exames e impressão em folha A4.',
    keywords: 'prontuario eletronico, prontuario em nuvem, PEP medicina, prontuario psicologico, registro clinico seguro, ficha de paciente',
    canonical: `${OFFICIAL_DOMAIN}/prontuario`,
    indexable: true,
    inSitemap: true,
    badge: 'Segurança & Sigilo Absoluto',
    h1: 'Prontuário Eletrônico em Nuvem com Máxima Segurança e Rapidez',
    h2: 'O Histórico Completo do seu Paciente ao seu Alcance em Poucos Cliques',
    summary: 'Acesse todo o histórico do paciente em segundos, com linha do tempo intuitiva, busca ágil e ferramentas que aceleram o registro clínico sem comprometer o cuidado humano.',
    features: [
      {
        title: 'Linha do Tempo Cronológica com Toda a Trajetória do Paciente',
        description: 'Visualize consultas anteriores, prescrições, evoluções de outras especialidades e notas clínicas em uma linha do tempo clara.'
      },
      {
        title: 'Modelos Prontos de Evolução e Campos Customizáveis',
        description: 'Adapte o prontuário para a sua especialidade com modelos estruturados que poupam digitação repetitiva no dia a dia.'
      },
      {
        title: 'Armazenamento Seguro de Laudos e Documentos Externos',
        description: 'Faça upload de PDFs de exames laboratoriais, fotos de acompanhamento clínico e laudos de imagem diretamente na ficha do paciente.'
      },
      {
        title: 'Impressão Formatada em Folha A4 com Logotipo Oficial',
        description: 'Exporte evoluções, relatórios e documentos clínicos em PDF ou imprima em folha A4 sem cortes nem desconfigurações.'
      }
    ],
    benefits: [
      'Segurança total com backups diários e criptografia ponta a ponta',
      'Agilidade no atendimento com carregamento instantâneo das fichas',
      'Total conformidade com os requisitos da LGPD para dados de saúde',
      'Fim definitivo do arquivo físico de papel e pastas empilhadas'
    ],
    faqs: [
      {
        question: 'O prontuário pode ser acessado fora da clínica?',
        answer: 'Sim, você pode acessar com suas credenciais seguras de qualquer computador ou notebook com internet.'
      },
      {
        question: 'Como funciona a exclusão ou alteração de registros?',
        answer: 'Para garantir a rastreabilidade exigida pelos conselhos profissionais, todas as inserções e alterações possuem registro de data, hora e usuário autor.'
      }
    ],
    ctaHeadline: 'Eleve o padrão dos seus registros clínicos com o Zemda',
    ctaSubheadline: 'Explore um prontuário eletrônico completo, ágil e em total conformidade com a LGPD e conselhos profissionais.'
  },

  // 11. Gestão Financeira
  {
    slug: 'gestao-financeira',
    path: '/gestao-financeira',
    title: 'Gestão Financeira e Controle de Caixa para Clínicas | Zemda',
    metaDescription: 'Controle financeiro para consultórios e clínicas: fluxo de caixa diário, controle de recebimentos em PIX e cartões, fechamento de caixa e emissão de recibos.',
    keywords: 'gestao financeira clinica, fluxo de caixa consultorio, controle de caixa saude, recibo de pagamento medico, financas para clinicas',
    canonical: `${OFFICIAL_DOMAIN}/gestao-financeira`,
    indexable: true,
    inSitemap: true,
    badge: 'Controle Financeiro Rigoroso',
    h1: 'Gestão Financeira e Controle de Fluxo de Caixa para Saúde',
    h2: 'Tenha Previsibilidade de Receita, Controle de Inadimplência e Fechamento de Caixa sem Erros',
    summary: 'Assuma o controle total das entradas e saídas da sua clínica. O Zemda oferece fechamento de caixa por operador e turno, separação de formas de pagamento (PIX, cartão e dinheiro) e relatórios claros para sua contabilidade.',
    features: [
      {
        title: 'Abertura, Movimentação e Fechamento de Caixa por Turno',
        description: 'Controle fundo de troco inicial, entradas do dia e faça a conferência de valores gaveta a gaveta ao final de cada expediente.'
      },
      {
        title: 'Separação Clara por Forma de Pagamento (PIX, Cartão, Espécie)',
        description: 'Monitore exatamente quanto entrou em transferências instantâneas, quanto está a compensar no cartão e o dinheiro físico em caixa.'
      },
      {
        title: 'Emissão Sequencial de Recibos Oficiais em Folha A4',
        description: 'Gere comprovantes fiscais com numeração sequencial atômica, valor numérico e por extenso, e espaço formal para assinatura do profissional.'
      },
      {
        title: 'Relatórios Financeiros e Exportação para Contabilidade',
        description: 'Exporte relatórios consolidados de faturamento por período, por especialidade ou por profissional para facilitar o fechamento contábil.'
      }
    ],
    benefits: [
      'Eliminação de furos e divergências de caixa na recepção',
      'Visão consolidada do faturamento diário, semanal e mensal',
      'Redução de inadimplência com status claro de pagamentos pendentes',
      'Comprovantes emitidos em segundos direto na finalização do atendimento'
    ],
    faqs: [
      {
        question: 'Posso fechar o caixa mais de uma vez ao dia se houver troca de recepcionista?',
        answer: 'Sim, o módulo de caixa suporta múltiplos turnos e operadores diários, registrando o responsável por cada abertura e fechamento.'
      },
      {
        question: 'O sistema calcula o valor por extenso nos recibos automaticamente?',
        answer: 'Sim! Ao emitir o recibo, o Zemda escreve o valor por extenso em reais e centavos para plena conformidade contábil.'
      }
    ],
    ctaHeadline: 'Tenha total clareza dos números da sua clínica',
    ctaSubheadline: 'Conheça o módulo financeiro do Zemda com fechamento de caixa por turno, controle de repasses e emissão de recibos oficiais A4.'
  },

  // 12. Blog
  {
    slug: 'blog',
    path: '/blog',
    title: 'Blog Zemda | Dicas de Gestão, Tecnologia e Produtividade em Saúde',
    metaDescription: 'Artigos, tutoriais e melhores práticas sobre gestão em saúde, redução de faltas na agenda, emissão de recibos e tecnologia para clínicas e consultórios.',
    keywords: 'blog gestao saude, dicas para clinicas, como administrar consultorio, reducao faltas pacientes, prontuario eletronico dicas',
    canonical: `${OFFICIAL_DOMAIN}/blog`,
    indexable: true,
    inSitemap: true,
    badge: 'Conteúdos Estratégicos',
    h1: 'Blog & Conteúdos Estratégicos sobre Gestão na Saúde',
    h2: 'Tendências, Inovação e Melhores Práticas para Clínicas e Profissionais Autônomos',
    summary: 'Aprenda como transformar o seu consultório em uma clínica altamente rentável, organizada e admirada pelos pacientes. Confira artigos práticos escritos por especialistas em gestão em saúde.',
    features: [
      {
        title: 'Como Reduzir o Absenteísmo e Faltas de Pacientes na Agenda',
        description: 'Descubra estratégias práticas com lembretes automáticos e políticas de cancelamento que reduzem o no-show em até 45% nos consultórios.'
      },
      {
        title: 'O Guia Completo da Emissão de Recibos para a Receita Federal',
        description: 'Tudo o que médicos, psicólogos e terapeutas precisam saber sobre campos obrigatórios, valor por extenso e conformidade com o Carnê-Leão.'
      },
      {
        title: 'Prontuário Eletrônico vs. Papel: Produtividade, Segurança e LGPD',
        description: 'Por que o prontuário em nuvem garante maior proteção jurídica, sigilo profissional e rapidez na consulta diária de históricos de pacientes.'
      },
      {
        title: 'Dicas Práticas para Aumentar a Captação de Pacientes Particulares',
        description: 'Como utilizar o agendamento online 24h e um atendimento acolhedor na recepção para fidelizar mais clientes para a sua clínica.'
      }
    ],
    benefits: [
      'Artigos com orientações práticas para a rotina clínica',
      'Dicas jurídicas e contábeis simplificadas para profissionais de saúde',
      'Metodologias comprovadas de aumento de receita e corte de desperdícios',
      'Atualizações frequentes sobre inovações tecnológicas na medicina e terapia'
    ],
    faqs: [
      {
        question: 'Com que frequência novos artigos são publicados?',
        answer: 'Publicamos novos artigos e orientações sobre gestão e tecnologia em saúde semanalmente.'
      },
      {
        question: 'Posso sugerir um tema para ser abordado no blog do Zemda?',
        answer: 'Com certeza! Envie sua dúvida ou sugestão para nossa equipe de especialistas através dos nossos canais de suporte.'
      }
    ],
    ctaHeadline: 'Aplique as melhores práticas na sua clínica com o Zemda',
    ctaSubheadline: 'Acompanhe nossos conteúdos estratégicos e conheça as melhores inovações para a gestão do seu consultório.'
  },

  // 13. Termos de Uso
  {
    path: '/termos-de-uso',
    title: 'Termos de Uso | Zemda',
    metaDescription: 'Termos e condições gerais de uso da plataforma Zemda de gestão para saúde.',
    keywords: 'termos de uso zemda, termos de servico software saude, contrato de uso clinica',
    canonical: `${OFFICIAL_DOMAIN}/termos-de-uso`,
    indexable: true,
    inSitemap: true,
    badge: 'Jurídico & Conformidade',
    h1: 'Termos de Uso',
    h2: 'Condições gerais de prestação de serviços e utilização da plataforma Zemda',
    summary: 'Conheça as regras, direitos e responsabilidades aplicáveis ao uso da plataforma Zemda para profissionais e clínicas.'
  },

  // 14. Política de Privacidade
  {
    path: '/privacidade',
    title: 'Política de Privacidade e Proteção de Dados (LGPD) | Zemda',
    metaDescription: 'Conheça nossa política de privacidade, tratamento e proteção de dados em conformidade rigorosa com a LGPD.',
    keywords: 'politica de privacidade zemda, lgpd saude, protecao de dados medicos, seguranca clinica',
    canonical: `${OFFICIAL_DOMAIN}/privacidade`,
    indexable: true,
    inSitemap: true,
    badge: 'LGPD & Privacidade',
    h1: 'Política de Privacidade e Proteção de Dados',
    h2: 'Compromisso com a segurança, sigilo clínico e conformidade com a LGPD',
    summary: 'Entenda como tratamos e protegemos seus dados e os dados de saúde dos seus pacientes com os mais elevados padrões de segurança da informação.'
  }
];

// Mapa de páginas de nicho para acesso imediato via slug (compatibilidade total com SEO_PAGES)
export const PUBLIC_NICHE_PAGES: Record<string, SeoPageData> = SEO_ROUTES.reduce((acc, route) => {
  if (route.slug) {
    acc[route.slug] = {
      slug: route.slug,
      path: route.path,
      title: route.title,
      metaDescription: route.metaDescription,
      keywords: route.keywords || '',
      badge: route.badge || '',
      h1: route.h1 || '',
      h2: route.h2 || '',
      summary: route.summary || '',
      features: route.features || [],
      benefits: route.benefits || [],
      faqs: route.faqs || [],
      ctaHeadline: route.ctaHeadline || 'Conheça a plataforma Zemda',
      ctaSubheadline: route.ctaSubheadline || 'Eleve o padrão do seu atendimento com máxima segurança e agilidade.'
    };
  }
  return acc;
}, {} as Record<string, SeoPageData>);

// Rotas internas legítimas da aplicação (deep links para autenticação e painéis protegidos)
export const VALID_INTERNAL_EXACT_PATHS = new Set<string>([
  '/login',
  '/dashboard',
  '/calendar',
  '/patients',
  '/clinical-records',
  '/clinical',
  '/physiotherapy-records',
  '/dentistry-workspace',
  '/nutrition-workspace',
  '/occupational-therapy-workspace',
  '/speech-therapy-workspace',
  '/professionals',
  '/services',
  '/financial',
  '/receipts',
  '/staff',
  '/schedules',
  '/budgets',
  '/payroll',
  '/inventory',
  '/pending-exams',
  '/support-tickets',
  '/reports',
  '/settings',
  '/superadmin',
  '/billing',
  '/onboarding',
  '/audit',
  '/assinatura',
  '/cookies'
]);

/**
 * Retorna somente as rotas públicas canônicas e indexáveis destinadas ao sitemap oficial
 */
export function getPublicIndexableRoutes(): SeoRoute[] {
  return SEO_ROUTES.filter(route => route.indexable && route.inSitemap);
}

/**
 * Busca configuração de rota pública por caminho exato normalizado
 */
export function getRouteByPath(rawPath: string): SeoRoute | undefined {
  const norm = normalizePath(rawPath);
  return SEO_ROUTES.find(r => r.path === norm);
}

/**
 * Busca página pública de nicho por slug
 */
export function getRouteBySlug(slug: string): SeoPageData | undefined {
  return PUBLIC_NICHE_PAGES[slug];
}

/**
 * Verifica se um caminho corresponde a uma rota pública indexável ou institucional
 */
export function isPublicRoute(rawPath: string): boolean {
  const norm = normalizePath(rawPath);
  return SEO_ROUTES.some(r => r.path === norm);
}

/**
 * Verifica se um caminho corresponde a uma rota interna válida da aplicação (deep links)
 */
export function isValidInternalRoute(rawPath: string): boolean {
  const norm = normalizePath(rawPath);

  if (VALID_INTERNAL_EXACT_PATHS.has(norm)) {
    return true;
  }

  // Agendamento público de profissional: /agendar/:slug
  if (/^\/agendar\/[a-zA-Z0-9_-]+$/i.test(norm)) {
    return true;
  }

  // Convites de clínica: /convite/:token ou /convite/:clinicSlug/:token
  if (/^\/convite\/[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)?$/i.test(norm)) {
    return true;
  }

  // Teste grátis: /teste-gratis/:token
  if (/^\/teste-gratis\/[a-zA-Z0-9_-]+$/i.test(norm)) {
    return true;
  }

  // Callbacks de assinatura Asaas: /assinatura/:status
  if (/^\/assinatura\/(sucesso|cancelada|expirada)$/i.test(norm)) {
    return true;
  }

  // Validação pública oficial de documentos: /verificar-documento/:token
  if (/^\/verificar-documento\/[a-zA-Z0-9_-]+$/i.test(norm)) {
    return true;
  }

  return false;
}

/**
 * Determina se uma URL é válida na arquitetura do Zemda (pública ou interna legítima)
 */
export function isValidApplicationRoute(rawPath: string): boolean {
  return isPublicRoute(rawPath) || isValidInternalRoute(rawPath);
}

/**
 * Gera o Sitemap oficial padronizado (sem priority, sem changefreq, apenas URLs 200 canônicas públicas)
 */
export function generateSitemapXml(): string {
  const urls = getPublicIndexableRoutes()
    .map(route => {
      const lastmodTag = route.lastmod ? `\n    <lastmod>${route.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>${route.canonical}</loc>${lastmodTag}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

/**
 * Gera o Robots.txt oficial autoritativo
 */
export function generateRobotsTxt(): string {
  return `User-agent: *
Allow: /
Allow: /planos
Allow: /sistema-para-clinicas
Allow: /sistema-para-medicos
Allow: /sistema-para-psicologos
Allow: /sistema-para-fonoaudiologos
Allow: /sistema-para-fisioterapeutas
Allow: /sistema-para-nutricionistas
Allow: /sistema-para-psicopedagogos
Allow: /agenda-online
Allow: /prontuario
Allow: /gestao-financeira
Allow: /blog
Allow: /termos-de-uso
Allow: /privacidade
Allow: /verificar-documento

# APIs
Disallow: /api/
Disallow: /v1/

Sitemap: ${OFFICIAL_DOMAIN}/sitemap.xml
`.trim();
}
