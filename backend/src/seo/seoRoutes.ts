import { LANDING_HERO } from './landingContent';
import { BLOG_ARTICLES } from './blogContent';
export const OFFICIAL_DOMAIN = 'https://zemda.com.br';
export interface SeoSection { heading: string; paragraphs: string[]; links?: string[] }
export interface SeoRoute {
 path: string; slug?: string; title: string; metaDescription: string; canonical: string;
 indexable: boolean; inSitemap: boolean; lastmod?: string; keywords?: string;
 badge?: string; h1?: string; h2?: string; summary?: string;
 features?: {title: string; description: string; iconName?: string}[];
 benefits?: string[]; faqs?: {question: string; answer: string}[];
 sections?: SeoSection[]; relatedLinks?: string[];
 ctaHeadline?: string; ctaSubheadline?: string;
 article?: {author: string; published: string; modified: string};
}
export interface SeoPageData extends SeoRoute {
 slug: string; keywords: string; badge: string; h1: string; h2: string; summary: string;
 features: NonNullable<SeoRoute['features']>; benefits: string[]; faqs: NonNullable<SeoRoute['faqs']>;
 ctaHeadline: string; ctaSubheadline: string;
}
export function normalizePath(rawPath: string): string {
 const clean = (rawPath || '/').split('?')[0].split('#')[0].trim();
 return !clean || clean === '/' ? '/' : clean.replace(/\/+$/, '').toLowerCase();
}
export function buildCanonical(path: string): string { return OFFICIAL_DOMAIN + normalizePath(path); }
type RouteInput = Omit<SeoRoute, 'canonical' | 'indexable' | 'inSitemap'>;
const PROFESSIONAL_PAGES: RouteInput[] = [
  {
    "slug": "sistema-para-clinicas",
    "path": "/sistema-para-clinicas",
    "title": "Sistema para Clínicas e Consultórios | Zemda",
    "metaDescription": "Organize uma clínica multiprofissional com agenda, prontuário, financeiro e equipe no Zemda. Acesso por usuário e ferramentas específicas por profissão.",
    "badge": "Gestão de clínicas",
    "h1": "Integre recepção, atendimento e gestão da clínica",
    "h2": "Coordenação entre recepção e profissionais",
    "summary": "Uma clínica multiprofissional precisa coordenar horários, profissionais e registros sem confundir responsabilidades. O Zemda reúne a operação em uma base compartilhada, com ferramentas clínicas conforme a profissão e permissões do usuário.",
    "features": [
      {
        "title": "Coordenação entre recepção e profissionais",
        "description": "Mudanças de horário, faltas e atendimentos concluídos precisam ser compreendidos por quem acompanha a agenda. A equipe pode consultar os estados dos agendamentos e organizar serviços e profissionais em um mesmo ambiente."
      },
      {
        "title": "Histórico clínico com autoria",
        "description": "O prontuário organiza registros e documentos vinculados ao paciente e ao atendimento. A consulta ao histórico deve respeitar o perfil de acesso; compartilhar a gestão não significa liberar todos os registros a toda a equipe."
      },
      {
        "title": "Gestão de receitas e despesas",
        "description": "Acompanhe entradas, despesas, caixa e repasses. Compare registros financeiros com os atendimentos concluídos para localizar pendências antes do fechamento do período."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira",
      "/sistema-para-medicos",
      "/sistema-para-psicologos",
      "/sistema-para-fonoaudiologos",
      "/sistema-para-fisioterapeutas",
      "/sistema-para-nutricionistas",
      "/sistema-para-psicopedagogos",
      "/sistema-para-dentistas",
      "/sistema-para-terapeutas-ocupacionais",
      "/sistema-para-personal-trainers"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-medicos",
    "path": "/sistema-para-medicos",
    "title": "Sistema para Médicos e Consultórios | Zemda",
    "metaDescription": "Organize o consultório médico com agenda, prontuário eletrônico, documentos e histórico de atendimentos. Conheça os recursos de gestão do Zemda.",
    "badge": "Médicos",
    "h1": "Prontuário e organização para a rotina médica",
    "h2": "Consulta e continuidade do cuidado",
    "summary": "Consultar o histórico, registrar a avaliação e emitir documentos são etapas conectadas da consulta médica. O Zemda organiza essas informações junto à agenda e ao cadastro do paciente, mantendo a decisão clínica sob responsabilidade do profissional.",
    "features": [
      {
        "title": "Consulta e continuidade do cuidado",
        "description": "Reúna a anamnese, os registros da consulta e os anexos no histórico do paciente. Diferencie o que foi relatado, observado e planejado para que a próxima consulta possa retomar o contexto."
      },
      {
        "title": "Documentos vinculados ao atendimento",
        "description": "Utilize os modelos disponíveis para receituários, atestados e pedidos de exames. Revise identificação, conteúdo e autoria antes de emitir o documento; um modelo não substitui a avaliação profissional."
      },
      {
        "title": "Agenda do consultório",
        "description": "Organize os horários por profissional e serviço, acompanhe cancelamentos e registre o atendimento. A gestão financeira complementa o acompanhamento administrativo das consultas."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-psicologos",
    "path": "/sistema-para-psicologos",
    "title": "Sistema para Psicólogos | ZemdaPsico",
    "metaDescription": "Conheça o ZemdaPsico: sessões, evolução, triagens, metas e documentos psicológicos integrados à agenda e ao histórico de atendimento do Zemda.",
    "badge": "ZemdaPsico",
    "h1": "Organização das sessões com o ZemdaPsico",
    "h2": "Sessões e evolução longitudinal",
    "summary": "A continuidade do acompanhamento psicológico exige registros úteis, objetivos e organizados. O ZemdaPsico reúne sessões, evolução, metas e documentos em um ambiente conectado ao prontuário e à agenda.",
    "features": [
      {
        "title": "Sessões e evolução longitudinal",
        "description": "Registre o acompanhamento e consulte o histórico entre sessões. O módulo dispõe de salvamento automático e recuperação de rascunhos nos fluxos disponíveis; confira o indicador de salvamento e finalize o registro ao concluir."
      },
      {
        "title": "Triagens e avaliação estruturada",
        "description": "Há áreas para estado mental, avaliação de risco, triagens e escalas. Os registros apoiam a organização da avaliação, sem substituir interpretação profissional ou autorizar o uso de instrumentos restritos."
      },
      {
        "title": "Metas e documentos psicológicos",
        "description": "Organize metas do acompanhamento e documentos conforme os recursos do módulo. Revise o conteúdo e limite os dados compartilhados à finalidade de cada documento."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-fonoaudiologos",
    "path": "/sistema-para-fonoaudiologos",
    "title": "Sistema para Fonoaudiólogos | ZemdaFono",
    "metaDescription": "ZemdaFono reúne fonologia, linguagem, voz, audiologia, disfagia e evolução clínica em um prontuário conectado à agenda e à gestão do consultório.",
    "badge": "ZemdaFono",
    "h1": "Avaliação e evolução com o ZemdaFono",
    "h2": "Fonologia, linguagem e voz",
    "summary": "A prática fonoaudiológica envolve diferentes áreas de avaliação e acompanhamento. O ZemdaFono organiza registros especializados e metas terapêuticas junto ao histórico do paciente, permitindo retomar o contexto entre atendimentos.",
    "features": [
      {
        "title": "Fonologia, linguagem e voz",
        "description": "Utilize o painel fonêmico e os registros de linguagem, voz e gravações disponíveis no módulo. Relacione as observações ao atendimento correspondente para facilitar a comparação ao longo do acompanhamento."
      },
      {
        "title": "Motricidade, disfagia e audiologia",
        "description": "O módulo dispõe de registros de motricidade orofacial, disfagia e IDDSI, além de audiologia e audiograma. Os recursos documentam a avaliação conduzida pelo profissional e não determinam diagnóstico ou conduta automaticamente."
      },
      {
        "title": "Metas e plano terapêutico",
        "description": "Organize objetivos e evolução clínica. Ao registrar a sessão, explicite a atividade realizada e a resposta observada; confira o salvamento antes de finalizar."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-fisioterapeutas",
    "path": "/sistema-para-fisioterapeutas",
    "title": "Sistema para Fisioterapeutas | ZemdaFisio",
    "metaDescription": "Organize avaliações funcionais, ADM, escalas, plano terapêutico e evolução com o ZemdaFisio. Use o ZemdaBody para complementar o registro corporal.",
    "badge": "ZemdaFisio",
    "h1": "Da avaliação funcional à evolução com o ZemdaFisio",
    "h2": "Avaliação funcional e ADM",
    "summary": "O acompanhamento fisioterapêutico compara achados funcionais e respostas ao tratamento ao longo das sessões. O ZemdaFisio reúne avaliação, plano terapêutico e evolução, com apoio do mapa corporal para localizar observações.",
    "features": [
      {
        "title": "Avaliação funcional e ADM",
        "description": "Registre força, amplitude de movimento e goniometria nos campos disponíveis. Para comparar avaliações, mantenha o mesmo contexto de medição e descreva fatores que possam influenciar o resultado."
      },
      {
        "title": "Escalas e plano terapêutico",
        "description": "Organize os instrumentos utilizados e as metas do acompanhamento. A evolução deve relacionar a intervenção, a resposta observada e as decisões do profissional, em vez de repetir somente o plano inicial."
      },
      {
        "title": "Mapa corporal com ZemdaBody",
        "description": "Complemente o texto com marcações por região e vistas anatômicas. O mapa facilita a localização visual do registro; não substitui o exame funcional nem a interpretação clínica."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira",
      "/mapa-corporal-clinico"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-nutricionistas",
    "path": "/sistema-para-nutricionistas",
    "title": "Sistema para Nutricionistas | ZemdaNutri",
    "metaDescription": "Anamnese, antropometria, bioimpedância, recordatório alimentar e plano alimentar no ZemdaNutri, com evolução longitudinal e agenda do consultório.",
    "badge": "ZemdaNutri",
    "h1": "Avaliação nutricional e acompanhamento com o ZemdaNutri",
    "h2": "Anamnese e consumo alimentar",
    "summary": "O atendimento nutricional combina história alimentar, medidas e acompanhamento das orientações. O ZemdaNutri organiza esses registros em uma sequência de consultas, permitindo consultar avaliações anteriores e o plano alimentar.",
    "features": [
      {
        "title": "Anamnese e consumo alimentar",
        "description": "Registre a história alimentar e o recordatório de 24 horas. Diferencie o relato do paciente das observações da consulta para documentar o contexto em que o plano foi elaborado."
      },
      {
        "title": "Antropometria e bioimpedância",
        "description": "Organize as medidas e os resultados registrados no módulo. A comparação ao longo do tempo depende de métodos e condições de coleta compatíveis, definidos pelo nutricionista."
      },
      {
        "title": "Plano alimentar e evolução",
        "description": "Mantenha o plano alimentar junto ao histórico de acompanhamento. Registre mudanças, dificuldades relatadas e orientações discutidas em cada retorno, sem perder a referência da avaliação anterior."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-psicopedagogos",
    "path": "/sistema-para-psicopedagogos",
    "title": "Sistema para Psicopedagogos | ZemdaPP",
    "metaDescription": "Conheça o ZemdaPP para anamnese, avaliação psicopedagógica, análise da aprendizagem, plano de intervenção e histórico organizado de acompanhamento.",
    "badge": "ZemdaPP",
    "h1": "Avaliação e intervenção psicopedagógica com o ZemdaPP",
    "h2": "Perfil e anamnese",
    "summary": "A organização do acompanhamento psicopedagógico precisa conectar história, avaliação e intervenção. O ZemdaPP reúne perfil, anamnese e evolução para documentar hipóteses de trabalho e o percurso de aprendizagem.",
    "features": [
      {
        "title": "Perfil e anamnese",
        "description": "Reúna as informações relevantes à demanda e ao contexto de aprendizagem. Registre a origem das informações para diferenciar relatos da família, da escola e observações do atendimento."
      },
      {
        "title": "Avaliação e análise da aprendizagem",
        "description": "Organize os registros da avaliação psicopedagógica e a análise da aprendizagem. A escolha e a interpretação de instrumentos dependem da formação e das atribuições do profissional."
      },
      {
        "title": "Plano de intervenção psicopedagógica",
        "description": "Use o PIP para documentar objetivos, atividades e evolução. Compare as observações das sessões e registre ajustes de planejamento, mantendo um histórico de acompanhamento."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-dentistas",
    "path": "/sistema-para-dentistas",
    "title": "Sistema para Dentistas e Clínicas Odontológicas | Zemda",
    "metaDescription": "Software odontológico com odontograma, periodontograma, plano de tratamento e prontuário. Organize a agenda e a gestão do consultório com ZemdaOdonto.",
    "badge": "ZemdaOdonto",
    "h1": "Prontuário odontológico e gestão com o ZemdaOdonto",
    "h2": "Odontograma e periodontograma",
    "summary": "O consultório odontológico precisa localizar achados por dente e região e acompanhar tratamentos em etapas. O ZemdaOdonto reúne registros especializados, plano de tratamento e histórico junto à agenda da clínica.",
    "features": [
      {
        "title": "Odontograma e periodontograma",
        "description": "Registre observações dentárias e periodontais nas ferramentas do módulo. Vincule a informação à avaliação para acompanhar mudanças sem depender apenas de descrições dispersas no prontuário."
      },
      {
        "title": "Endodontia, prótese e HOF",
        "description": "O módulo possui áreas de registro para endodontia, prótese e harmonização orofacial. A documentação deve refletir o procedimento efetivamente realizado e a responsabilidade do profissional habilitado."
      },
      {
        "title": "Plano de tratamento e retornos",
        "description": "Organize as etapas do plano de tratamento e a sequência de consultas. Consulte o histórico antes do retorno e mantenha os registros clínicos distintos das pendências administrativas e financeiras."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-terapeutas-ocupacionais",
    "path": "/sistema-para-terapeutas-ocupacionais",
    "title": "Sistema para Terapeutas Ocupacionais | ZemdaTO",
    "metaDescription": "Software para terapia ocupacional com perfil ocupacional, AVDs, análise de tarefa e plano terapêutico. Organize prontuário, evolução e agenda com ZemdaTO.",
    "badge": "ZemdaTO",
    "h1": "Perfil ocupacional e acompanhamento com o ZemdaTO",
    "h2": "Perfil ocupacional e AVDs",
    "summary": "A terapia ocupacional acompanha a participação nas atividades e sua relação com o contexto de vida. O ZemdaTO organiza o perfil ocupacional, avaliações e planos terapêuticos em um histórico de atendimentos.",
    "features": [
      {
        "title": "Perfil ocupacional e AVDs",
        "description": "Documente atividades de vida diária, demandas e prioridades do acompanhamento. Registre o contexto em que a atividade ocorre para que a evolução não seja reduzida a uma medida isolada."
      },
      {
        "title": "Perfil sensorial e análise de tarefa",
        "description": "Organize observações sensoriais e etapas da tarefa nas ferramentas disponíveis. Diferencie barreiras, recursos e respostas observadas para apoiar o planejamento profissional."
      },
      {
        "title": "Tecnologia assistiva e plano terapêutico",
        "description": "Mantenha os registros de tecnologia assistiva junto às metas e intervenções. Acompanhe a experiência de uso relatada e os ajustes realizados ao longo das sessões."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "sistema-para-personal-trainers",
    "path": "/sistema-para-personal-trainers",
    "title": "Sistema para Personal Trainer | ZemdaPersonal",
    "metaDescription": "Gestão de alunos com avaliação física, antropometria, composição corporal, TAV, treinos e histórico comparativo. Conheça o módulo ZemdaPersonal.",
    "badge": "ZemdaPersonal",
    "h1": "Avaliação física e gestão de alunos com o ZemdaPersonal",
    "h2": "Antropometria, composição corporal e TAV",
    "summary": "Acompanhar alunos exige relacionar avaliação, prescrição de treino e evolução. O ZemdaPersonal organiza medidas, fichas e registros comparativos para que o profissional consulte o histórico ao revisar o planejamento.",
    "features": [
      {
        "title": "Antropometria, composição corporal e TAV",
        "description": "Registre perímetros, composição corporal e TAV nos campos disponíveis. Preserve unidades e método de coleta; uma comparação só é útil quando o contexto das avaliações também é considerado."
      },
      {
        "title": "Avaliação neuromotora e cardiorrespiratória",
        "description": "Organize os registros de avaliação física disponíveis e as observações relevantes à prescrição. O sistema documenta os dados informados e não substitui a avaliação nem a escolha profissional dos protocolos."
      },
      {
        "title": "Treinos e histórico comparativo",
        "description": "Crie fichas de treino e consulte a evolução e fotos comparativas. Revise o planejamento com base nos registros do aluno e gere os relatórios disponíveis para acompanhamento."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira",
      "/mapa-corporal-clinico"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  },
  {
    "slug": "mapa-corporal-clinico",
    "path": "/mapa-corporal-clinico",
    "title": "Mapa Corporal Clínico | ZemdaBody",
    "metaDescription": "Mapa corporal clínico com vistas anatômicas, marcações por região e desenhos. Conheça o ZemdaBody para complementar avaliações e evolução em saúde.",
    "badge": "ZemdaBody · módulo transversal",
    "h1": "Mapa corporal clínico com o ZemdaBody",
    "h2": "Localização visual de observações",
    "summary": "O ZemdaBody é um módulo transversal para registro visual do corpo. Profissionais de diferentes áreas podem complementar o prontuário com localização de observações, marcações e desenhos, conforme os recursos e permissões disponíveis.",
    "features": [
      {
        "title": "Localização visual de observações",
        "description": "Use as vistas anatômicas para indicar regiões e registrar visualmente a localização de dor relatada ou outros achados. Explique no texto o significado das marcações e sua relação com a avaliação."
      },
      {
        "title": "Marcações e desenhos por região",
        "description": "Combine marcações e desenhos com os registros do atendimento. A representação visual ajuda a recuperar o contexto espacial, mas não corresponde a exame de imagem nem fornece diagnóstico automático."
      },
      {
        "title": "Acompanhamento entre atendimentos",
        "description": "Consulte os registros para acompanhar a evolução documentada. Em fisioterapia, o mapa pode complementar a avaliação funcional; em outras áreas, sua aplicação depende da finalidade definida pelo profissional."
      }
    ],
    "sections": [
      {
        "heading": "Prontuário e continuidade do atendimento",
        "paragraphs": [
          "Relacione cada registro ao atendimento e revise o histórico antes de iniciar uma nova sessão. Documentos e anexos complementam a informação; registre autoria e contexto para facilitar a consulta posterior."
        ],
        "links": [
          "/prontuario"
        ]
      },
      {
        "heading": "Agenda e organização administrativa",
        "paragraphs": [
          "Defina os serviços e acompanhe os horários disponíveis, confirmações, faltas e cancelamentos. Lembretes manuais e automáticos, quando configurados, apoiam a comunicação; não garantem comparecimento."
        ],
        "links": [
          "/agenda-online"
        ]
      },
      {
        "heading": "Segurança e responsabilidades de acesso",
        "paragraphs": [
          "O acesso utiliza usuários e permissões e considera o isolamento por clínica. Conceda somente os acessos necessários a cada função e consulte a política de privacidade para conhecer o tratamento de dados."
        ],
        "links": [
          "/privacidade"
        ]
      }
    ],
    "benefits": [],
    "faqs": [
      {
        "question": "O módulo substitui a avaliação profissional?",
        "answer": "Não. Os recursos organizam informações e apoiam o registro. A interpretação, a conduta e a revisão de documentos permanecem sob responsabilidade do profissional."
      },
      {
        "question": "Como os módulos se relacionam com os planos?",
        "answer": "O plano define o número de acessos. A profissão e as permissões definem as ferramentas disponíveis ao usuário. Consulte os planos e verifique os recursos adequados à sua rotina."
      }
    ],
    "relatedLinks": [
      "/sistema-para-fisioterapeutas",
      "/prontuario",
      "/sistema-para-terapeutas-ocupacionais"
    ],
    "ctaHeadline": "Conheça os recursos na sua rotina",
    "ctaSubheadline": "Consulte os planos e avalie o Zemda para organizar seus atendimentos."
  }
];
const BASE_PAGES: RouteInput[] = [
  {
    "path": "/",
    "title": "Zemda | Gestão para Clínicas e Profissionais da Saúde",
    "metaDescription": "Gestão de clínicas e profissionais da saúde com agenda, prontuário eletrônico, financeiro e módulos especializados em uma única plataforma.",
    "h1": LANDING_HERO.title,
    "summary": LANDING_HERO.description
  },
  {
    "path": "/planos",
    "title": "Planos para Profissionais e Clínicas | Zemda",
    "metaDescription": "Conheça os planos Zemda para profissionais, equipes e clínicas. Compare o número de acessos e escolha a opção adequada à organização dos seus atendimentos.",
    "h1": "Assinatura e Plano",
    "summary": "O número de acessos define o plano. A profissão e as permissões definem as ferramentas disponíveis. Consulte os valores e condições de contratação.",
    "sections": [
      {
        "heading": "Escolha conforme o tamanho da equipe",
        "paragraphs": [
          "Compare os acessos necessários para profissionais e equipe administrativa. Os planos públicos da landing ajudam a dimensionar a contratação, enquanto a página de assinatura apresenta as condições disponíveis."
        ],
        "links": [
          "/sistema-para-clinicas"
        ]
      }
    ]
  },
  {
    "path": "/termos-de-uso",
    "title": "Termos de Uso | Zemda",
    "metaDescription": "Consulte os termos de uso do Zemda, responsabilidades de usuários, condições da plataforma e orientações para utilização dos recursos de gestão em saúde.",
    "h1": "Termos de Uso da Plataforma Zemda",
    "summary": "Consulte as condições de utilização da plataforma e as responsabilidades relacionadas ao acesso e aos registros."
  },
  {
    "path": "/privacidade",
    "title": "Política de Privacidade e Proteção de Dados | Zemda",
    "metaDescription": "Conheça o tratamento de dados no Zemda, controles de acesso, preferências de cookies e canais para exercer direitos relacionados às suas informações.",
    "h1": "Política de Privacidade e Proteção de Dados — LGPD",
    "summary": "Informações sobre tratamento de dados, privacidade e escolhas de cookies no Zemda."
  },
  {
    "path": "/agenda-online",
    "slug": "agenda-online",
    "title": "Agenda Online para Clínicas e Consultórios | Zemda",
    "metaDescription": "Organize horários, profissionais, serviços e status de consultas com a agenda online do Zemda. Conheça os recursos de agendamento e comunicação.",
    "badge": "Agenda online",
    "h1": "Organize a agenda e acompanhe os agendamentos",
    "summary": "Organize horários, profissionais, serviços e status de consultas com a agenda online do Zemda. Conheça os recursos de agendamento e comunicação.",
    "features": [
      {
        "title": "Horários e serviços",
        "description": "A agenda conecta profissionais, serviços e horários para apoiar a recepção. Confira disponibilidade e duração antes de confirmar um atendimento e mantenha visíveis os estados de cada agendamento."
      },
      {
        "title": "Confirmações e lembretes",
        "description": "O acompanhamento de confirmações, faltas e cancelamentos ajuda a identificar horários que precisam de atenção. Lembretes pelo WhatsApp dependem da configuração disponível e não garantem a presença do paciente."
      },
      {
        "title": "Agendamento público",
        "description": "Os fluxos públicos de agendamento permitem consultar disponibilidade e solicitar horários conforme configuração. Essas páginas operacionais não são páginas de conteúdo SEO nem devem expor informações clínicas."
      }
    ],
    "relatedLinks": [
      "/sistema-para-clinicas",
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Organize a rotina com o Zemda"
  },
  {
    "path": "/prontuario",
    "slug": "prontuario",
    "title": "Prontuário Eletrônico para Profissionais da Saúde | Zemda",
    "metaDescription": "Organize registros, documentos, anexos e evolução clínica no prontuário eletrônico do Zemda, com ferramentas por profissão e acesso conforme permissões.",
    "badge": "Prontuário eletrônico",
    "h1": "Prontuário eletrônico e histórico de atendimento",
    "summary": "Organize registros, documentos, anexos e evolução clínica no prontuário eletrônico do Zemda, com ferramentas por profissão e acesso conforme permissões.",
    "features": [
      {
        "title": "Registros com contexto",
        "description": "Reúna os registros por atendimento e consulte o histórico do paciente. Diferencie informações relatadas, observações e condutas para tornar a evolução compreensível na próxima consulta."
      },
      {
        "title": "Documentos e anexos",
        "description": "Documentos profissionais, pedidos e anexos complementam o registro. Revise conteúdo, identificação e autoria antes de emitir ou compartilhar; o formato do documento não representa validação fiscal ou regulatória automática."
      },
      {
        "title": "Acesso e autoria",
        "description": "O Zemda utiliza perfis, permissões e registros de autoria nos fluxos disponíveis. Defina acessos de acordo com as responsabilidades da equipe e mantenha a revisão profissional dos registros."
      }
    ],
    "relatedLinks": [
      "/sistema-para-clinicas",
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Organize a rotina com o Zemda"
  },
  {
    "path": "/gestao-financeira",
    "slug": "gestao-financeira",
    "title": "Gestão Financeira para Clínicas e Consultórios | Zemda",
    "metaDescription": "Acompanhe receitas, despesas, caixa e repasses da clínica no Zemda. Organize os registros financeiros junto à rotina administrativa dos atendimentos.",
    "badge": "Gestão financeira",
    "h1": "Organize o financeiro da clínica",
    "summary": "Acompanhe receitas, despesas, caixa e repasses da clínica no Zemda. Organize os registros financeiros junto à rotina administrativa dos atendimentos.",
    "features": [
      {
        "title": "Receitas e despesas",
        "description": "Registre entradas e despesas por período e acompanhe pendências. Separe a data do atendimento da data de recebimento para interpretar o movimento de caixa sem confundir produção com pagamento."
      },
      {
        "title": "Caixa e repasses",
        "description": "Consulte movimentações e repasses nos recursos disponíveis. Confira os registros antes do fechamento e documente ajustes para facilitar a revisão pela equipe responsável."
      },
      {
        "title": "Recibos e relatórios",
        "description": "Emita os recibos disponíveis e consulte relatórios para apoiar a organização administrativa. A emissão no sistema não substitui a verificação das obrigações fiscais aplicáveis à atividade."
      }
    ],
    "relatedLinks": [
      "/sistema-para-clinicas",
      "/agenda-online",
      "/prontuario",
      "/gestao-financeira"
    ],
    "ctaHeadline": "Organize a rotina com o Zemda"
  },
  {
    "path": "/blog",
    "slug": "blog",
    "title": "Blog Zemda | Organização e Gestão em Saúde",
    "metaDescription": "Guias práticos do Zemda sobre organização da agenda, prontuários e gestão de clínicas. Leia artigos para avaliar processos e melhorar a rotina da equipe.",
    "badge": "Blog Zemda",
    "h1": "Blog Zemda: organização e gestão em saúde",
    "summary": "Guias da equipe Zemda para revisar processos de agenda, documentação e organização administrativa. Os conteúdos explicam critérios de trabalho sem prometer resultados automáticos."
  }
];
export const SEO_ROUTES: SeoRoute[] = [...BASE_PAGES, ...PROFESSIONAL_PAGES, ...BLOG_ARTICLES].map(route => ({
 ...route, canonical: buildCanonical(route.path), indexable: true, inSitemap: true,
}));
for (const route of SEO_ROUTES) {
 if (route.path.startsWith('/sistema-') || route.path === '/prontuario') {
  route.relatedLinks = [...(route.relatedLinks || []), '/blog/prontuario-eletronico-vs-papel'];
 } else if (route.path === '/agenda-online') {
  route.relatedLinks = [...(route.relatedLinks || []), '/blog/como-reduzir-faltas-de-pacientes'];
 } else if (route.path === '/gestao-financeira') {
  route.relatedLinks = [...(route.relatedLinks || []), '/blog/gestao-de-clinica-multiprofissional'];
 }
}
export const PUBLIC_NICHE_PAGES: Record<string, SeoPageData> = Object.fromEntries(
 SEO_ROUTES.filter(route => route.slug).map(route => [route.slug!, {
  keywords: '', badge: route.title, h1: route.title, h2: '', summary: route.metaDescription,
  features: [], benefits: [], faqs: [], ctaHeadline: 'Conheça o Zemda', ctaSubheadline: 'Consulte os planos para a sua equipe.',
  ...route, slug: route.slug!,
 }])
);
const VALID_INTERNAL_EXACT_PATHS = new Set<string>([
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
Disallow: /api/
Disallow: /v1/

Sitemap: ${OFFICIAL_DOMAIN}/sitemap.xml
`;
}
export function generateSitemapIndexXml(): string {
 return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${OFFICIAL_DOMAIN}/sitemap.xml</loc></sitemap></sitemapindex>`;
}
