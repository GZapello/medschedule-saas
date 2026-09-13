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

export const SEO_PAGES: Record<string, SeoPageData> = {
  'sistema-para-clinicas': {
    slug: 'sistema-para-clinicas',
    path: '/sistema-para-clinicas',
    title: 'Sistema para Clínicas e Consultórios Médicos e Terapêuticos | Zemda',
    metaDescription: 'Software completo para gestão de clínicas médicas, multiprofissionais e consultórios. Prontuário eletrônico seguro, agenda online 24h, gestão financeira e recibos oficiais.',
    keywords: 'sistema para clinicas, software para clinica medica, gestao de clinica, prontuario eletronico para clinicas, agenda clinica',
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
      'Acesso sincronizado no navegador web, Windows e aplicativo Android'
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
    ctaSubheadline: 'Cadastre sua clínica gratuitamente no Zemda e experimente uma operação sem fricção.'
  },

  'sistema-para-psicologos': {
    slug: 'sistema-para-psicologos',
    path: '/sistema-para-psicologos',
    title: 'Sistema para Psicólogos e Clínicas de Psicologia | Zemda',
    metaDescription: 'Software de gestão clínica para psicólogos e terapeutas. Prontuário psicológico sigiloso, evolução de sessões, controle de pacotes e recibos para IRPF.',
    keywords: 'sistema para psicologos, software para psicologia, prontuario psicologico, gestao consultorio psicologia, anamnese psicologica',
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
      'Total mobilidade para consultar fichas pelo celular ou computador'
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
    ctaSubheadline: 'Inicie seu consultório no Zemda com prontuário psicológico seguro e sem complicação.'
  },

  'sistema-para-fonoaudiologos': {
    slug: 'sistema-para-fonoaudiologos',
    path: '/sistema-para-fonoaudiologos',
    title: 'Sistema para Fonoaudiólogos e Clínicas de Fonoaudiologia | Zemda',
    metaDescription: 'Plataforma especializada para fonoaudiologia. Registro de avaliações em linguagem, voz, audição, motricidade orofacial e evolução terapêutica contínua.',
    keywords: 'sistema para fonoaudiologos, software fonoaudiologia, prontuario fonoaudiologico, clinica fonoaudiologia, exercicios fonoaudiologia',
    badge: 'Especializado para Fonoaudiologia',
    h1: 'Sistema Especializado para Clínicas e Consultórios de Fonoaudiologia',
    h2: 'Acompanhamento Terapêutico Preciso em Voz, Linguagem, Audiologia e Motricidade',
    summary: 'A fonoaudiologia exige continuidade, metas claras e acompanhamento minucioso de cada fase do tratamento. O Zemda oferece o ambiente ideal para documentar diagnósticos fonoaudiológicos e registrar a evolução de cada sessão.',
    features: [
      {
        title: 'Fichas Clínicas de Avaliação e Triagem Terapêutica',
        description: 'Modelos rápidos para avaliação de motricidade orofacial, disfagia, fala, linguagem e acompanhamento auditivo de pacientes pediátricos e adultos.'
      },
      {
        title: 'Registro de Exercícios e Evolução Terapêutica Contínua',
        description: 'Documente os treinos recomendados para casa, avanços na articulação e respostas aos estímulos aplicados ao longo do plano terapêutico.'
      },
      {
        title: 'Controle de Frequência e Relatórios de Desempenho',
        description: 'Acompanhe a assiduidade dos pacientes em terapias semanais ou quinzenais, com emissão de relatórios para escolas, médicos e famílias.'
      },
      {
        title: 'Agendamento Recorrente para Terapias Periódicas',
        description: 'Reserve o mesmo horário semanal automaticamente para o paciente sem precisar recriar compromissos manualmente a cada mês.'
      }
    ],
    benefits: [
      'Agilidade no registro das sessões terapêuticas semanais',
      'Histórico completo para emissão de relatórios multidisciplinares',
      'Facilidade de anexo de exames audiométricos e relatórios médicos',
      'Disponível no computador do consultório e no aplicativo mobile'
    ],
    faqs: [
      {
        question: 'Posso agendar sessões que se repetem toda semana?',
        answer: 'Sim, a agenda do Zemda permite agendamentos recorrentes automáticos para tratamentos fonoaudiológicos continuados.'
      },
      {
        question: 'Consigo anexar exames auditivos na ficha do paciente?',
        answer: 'Sim, você pode anexar arquivos em PDF, imagens de exames e laudos diretamente no prontuário do paciente.'
      }
    ],
    ctaHeadline: 'Eleve o padrão do seu consultório de Fonoaudiologia',
    ctaSubheadline: 'Junte-se a fonoaudiólogos de todo o Brasil que usam o Zemda para organizar seus atendimentos.'
  },

  'sistema-para-fisioterapeutas': {
    slug: 'sistema-para-fisioterapeutas',
    path: '/sistema-para-fisioterapeutas',
    title: 'Sistema para Fisioterapeutas e Clínicas de Fisioterapia | Zemda',
    metaDescription: 'Software de gestão para fisioterapia, pilates e reabilitação motora. Avaliação postural, evolução de sessões, controle de pacotes e recibos para reembolso.',
    keywords: 'sistema para fisioterapeutas, software fisioterapia, prontuario fisioterapia, gestao de clinica de fisioterapia, pilates',
    badge: 'Especializado para Fisioterapia & Reabilitação',
    h1: 'Software para Fisioterapeutas e Centros de Reabilitação',
    h2: 'Controle Clínico de Evolução Motora, Sessões de Fisioterapia e Pilates',
    summary: 'Gerencie pacientes de ortopedia, neurologia, fisioterapia respiratória e estúdios de pilates com facilidade. Registre a evolução do quadro clínico, amplitudes de movimento e mantenha o faturamento em dia.',
    features: [
      {
        title: 'Anamnese Fisioterapêutica e Registro de Exames',
        description: 'Estrutura completa para registrar queixa principal, inspeção, palpação, testes ortopédicos e histórico traumato-ortopédico.'
      },
      {
        title: 'Evolução Dinâmica de Tratamento e Metas do Paciente',
        description: 'Acompanhe a melhora da dor e da mobilidade a cada sessão através de anotações ágeis pensadas para o ritmo dinâmico da fisioterapia.'
      },
      {
        title: 'Gestão de Pacotes de Fisioterapia e Planos de Pilates',
        description: 'Controle de saldo de sessões em pacotes contratados (ex: 10 sessões), com aviso automático de renovação ao final do ciclo.'
      },
      {
        title: 'Emissão de Declarações e Comprovantes para Reembolso',
        description: 'Gere declarações de comparecimento e recibos formatados no padrão aceito pelos principais planos de saúde para reembolso.'
      }
    ],
    benefits: [
      'Controle rigoroso de sessões realizadas e restantes por paciente',
      'Agilidade para registrar atendimentos sem atrasar a próxima sessão',
      'Emissão de atestados e relatórios de alta em formato A4 perfeito',
      'Interface limpa e rápida que funciona em qualquer dispositivo'
    ],
    faqs: [
      {
        question: 'O sistema atende tanto fisioterapia individual quanto estúdios de pilates?',
        answer: 'Sim, o Zemda se adapta perfeitamente a atendimentos individuais de fisioterapia e a horários de pilates com gestão de pacotes.'
      },
      {
        question: 'Como funciona o controle de sessões do paciente?',
        answer: 'Ao lançar o atendimento na agenda ou prontuário, o saldo do pacote do paciente é atualizado automaticamente com transparência total.'
      }
    ],
    ctaHeadline: 'Profissionalize o atendimento da sua clínica de fisioterapia',
    ctaSubheadline: 'Comece a usar o Zemda hoje e ganhe tempo para focar na reabilitação dos seus pacientes.'
  },

  'sistema-para-nutricionistas': {
    slug: 'sistema-para-nutricionistas',
    path: '/sistema-para-nutricionistas',
    title: 'Sistema para Nutricionistas e Consultórios de Nutrição | Zemda',
    metaDescription: 'Plataforma para nutricionistas com registro de anamnese alimentar, evolução de metas nutricionais, gestão de retornos e recibos para reembolso.',
    keywords: 'sistema para nutricionistas, software nutricao, prontuario nutricional, gestao consultorio nutricao, anamnese alimentar',
    badge: 'Especializado para Nutrição',
    h1: 'Sistema para Nutricionistas e Clínicas de Nutrição',
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
        answer: 'Sim, o Zemda funciona em nuvem em qualquer navegador ou celular, permitindo atender tanto presencialmente quanto via teleconsulta.'
      },
      {
        question: 'O paciente pode agendar sozinho pela internet?',
        answer: 'Sim! Sua clínica recebe uma página de agendamento online exclusiva onde o paciente escolhe o dia e horário disponível.'
      }
    ],
    ctaHeadline: 'Dê um salto de organização no seu consultório de Nutrição',
    ctaSubheadline: 'Cadastre-se no Zemda e aproveite a plataforma de gestão mais completa para a área da saúde.'
  },

  'sistema-para-medicos': {
    slug: 'sistema-para-medicos',
    path: '/sistema-para-medicos',
    title: 'Sistema para Médicos e Consultórios Médicos | Zemda',
    metaDescription: 'Software médico intuitivo e seguro com prontuário eletrônico, prescrição digital, CID-10, atestados, pedidos de exames e agenda inteligente.',
    keywords: 'sistema para medicos, software medico, prontuario eletronico medico, receita medica, atestado medico, gestao consultorio medico',
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
      'Acesso seguro de qualquer lugar (consultório, hospital ou smartphone)',
      'Organização impecável da recepção com controle de sala de espera'
    ],
    faqs: [
      {
        question: 'Os atestados e receitas gerados pelo Zemda são aceitos legalmente?',
        answer: 'Sim, os documentos contêm dados completos do médico (nome, CRM, especialidade, endereço do consultório e data) prontos para assinatura e carimbo ou certificado digital.'
      },
      {
        question: 'Posso usar minha conta médica no tablet ou celular Android?',
        answer: 'Sim, o Zemda possui aplicativo Android dedicado e versão web responsiva que se adapta com perfeição a tablets e notebooks.'
      }
    ],
    ctaHeadline: 'Mais modernidade e precisão para seu consultório médico',
    ctaSubheadline: 'Crie sua conta médica no Zemda e modernize sua rotina de consultas agora mesmo.'
  },

  'agenda-online': {
    slug: 'agenda-online',
    path: '/agenda-online',
    title: 'Agenda Online para Clínicas e Profissionais de Saúde | Zemda',
    metaDescription: 'Agenda online inteligente para área da saúde com link de agendamento 24h, bloqueio de horários, confirmação automática e redução de no-show.',
    keywords: 'agenda online clinica, marcar consulta online, agenda medica online, agendamento para pacientes, software agenda consultorio',
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
        title: 'Lembretes Automáticos via E-mail e Celular',
        description: 'Alertas pontuais avisam o paciente no dia anterior à consulta, reduzindo drasticamente o índice de faltas e horários ociosos.'
      },
      {
        title: 'Visualização por Dia, Semana, Mês ou por Profissional',
        description: 'Alterne rapidamente a visualização da equipe inteira ou foque na sua própria escala de atendimentos com filtros claros.'
      },
      {
        title: 'Sincronização em Tempo Real entre Dispositivos',
        description: 'Qualquer agendamento realizado no balcão reflete instantaneamente no aplicativo do profissional e na tela da recepção.'
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
    ctaSubheadline: 'Ative sua agenda online no Zemda e libere sua equipe da marcação manual de horários.'
  },

  'prontuario': {
    slug: 'prontuario',
    path: '/prontuario',
    title: 'Prontuário Eletrônico Seguro e Personalizável | Zemda',
    metaDescription: 'Prontuário eletrônico completo para a saúde. Registro rápido de consultas, anamneses, histórico cronológico, anexos de exames e impressão em folha A4.',
    keywords: 'prontuario eletronico, prontuario em nuvem, PEP medicina, prontuario psicologico, registro clinico seguro, ficha de paciente',
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
        answer: 'Sim, você pode acessar com suas credenciais seguras de qualquer computador ou celular com internet.'
      },
      {
        question: 'Como funciona a exclusão ou alteração de registros?',
        answer: 'Para garantir a rastreabilidade exigida pelos conselhos profissionais, todas as inserções e alterações possuem registro de data, hora e usuário autor.'
      }
    ],
    ctaHeadline: 'Eleve o padrão dos seus registros clínicos com o Zemda',
    ctaSubheadline: 'Cadastre-se agora e descubra um prontuário eletrônico ágil, moderno e seguro.'
  },

  'gestao-financeira': {
    slug: 'gestao-financeira',
    path: '/gestao-financeira',
    title: 'Gestão Financeira e Controle de Caixa para Clínicas | Zemda',
    metaDescription: 'Controle financeiro para consultórios e clínicas: fluxo de caixa diário, controle de recebimentos em PIX e cartões, fechamento de caixa e emissão de recibos.',
    keywords: 'gestao financeira clinica, fluxo de caixa consultorio, controle de caixa saude, recibo de pagamento medico, financas para clinicas',
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
    ctaSubheadline: 'Comece a usar o módulo financeiro do Zemda e potencialize a lucratividade do seu negócio.'
  },

  'blog': {
    slug: 'blog',
    path: '/blog',
    title: 'Blog Zemda | Dicas de Gestão, Tecnologia e Produtividade em Saúde',
    metaDescription: 'Artigos, tutoriais e melhores práticas sobre gestão em saúde, redução de faltas na agenda, emissão de recibos e tecnologia para clínicas e consultórios.',
    keywords: 'blog gestao saude, dicas para clinicas, como administrar consultorio, reducao faltas pacientes, prontuario eletronico dicas',
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
      'Artigos 100% gratuitos com orientações práticas para a rotina clínica',
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
    ctaSubheadline: 'Crie sua conta agora e una o conhecimento do nosso blog à melhor plataforma de gestão.'
  }
};
