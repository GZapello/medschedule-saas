export type ProfessionKey = 'fono' | 'pp' | 'to';

export type ActivitySetting = 'home' | 'school' | 'community' | 'other' | 'general';

export type ActivityStatus =
  | 'active'
  | 'completed'
  | 'paused'
  | 'revised'
  | 'pending'
  | 'partially_completed'
  | 'not_completed';

export interface ActivityCategoryConfig {
  id: string;
  name: string;
  description?: string;
  iconName?: string;
  subcategories: string[];
}

export interface ProfessionLibraryConfig {
  key: ProfessionKey;
  moduleName: string;
  professionName: string;
  libraryTitle: string;
  librarySubtitle: string;
  patientSectionTitle: string;
  patientSectionSubtitle: string;
  patientNameLabel: string; // "Paciente" ou "Aprendente"
  brandColor: 'teal' | 'indigo' | 'amber';
  badgeClass: string;
  headerGradientClass: string;
  activeTabClass: string;
  categories: ActivityCategoryConfig[];
  quickSuggestionSettings: Array<{ id: ActivitySetting; label: string }>;
  defaultFrequency: string;
}

export interface ActivityTemplateItem {
  id: string;
  profession_id: ProfessionKey;
  category: string;
  subcategory?: string | null;
  title: string;
  objective: string;
  target_skill?: string | null;
  age_group?: string | null;
  setting: ActivitySetting;
  materials_needed?: string | null;
  instructions: string;
  frequency?: string | null;
  caregiver_guidance?: string | null;
  adaptations?: string | null;
  notes?: string | null;
  is_system: boolean;
  is_custom: boolean;
  is_favorite: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PatientActivityAssignmentItem {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  professional_id?: string | null;
  professional_name?: string | null;
  registration_type?: string | null;
  registration_number?: string | null;
  specialty?: string;
  module_type?: string;
  template_id?: string | null;
  category: string;
  subcategory?: string | null;
  setting: ActivitySetting;
  title: string;
  objective: string;
  instructions: string;
  target_skill?: string | null;
  materials_needed?: string | null;
  frequency?: string | null;
  responsible_person?: string | null;
  caregiver_guidance?: string | null;
  adaptations?: string | null;
  notes?: string | null;
  status: ActivityStatus;
  follow_up_notes?: string | null;
  follow_ups_count?: number;
  last_follow_up_note?: string | null;
  last_follow_up_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityFollowUpItem {
  id: string;
  tenant_id: string;
  program_id: string;
  patient_id: string;
  professional_id?: string | null;
  professional_name?: string | null;
  status: ActivityStatus;
  notes?: string | null;
  created_at: string;
}

export const SETTING_LABELS: Record<ActivitySetting, string> = {
  home: 'Casa / Família',
  school: 'Escola / Educadores',
  community: 'Comunidade / Lazer',
  other: 'Outro Ambiente',
  general: 'Geral (Todos os Ambientes)'
};

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  active: 'Em Andamento',
  completed: 'Realizada / Concluída',
  paused: 'Suspensa / Pausada',
  revised: 'Revisada',
  pending: 'Pendente',
  partially_completed: 'Parcialmente Realizada',
  not_completed: 'Não Realizada'
};

export const STATUS_BADGE_CLASSES: Record<ActivityStatus, string> = {
  active: 'bg-teal-50 text-teal-700 border-teal-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  revised: 'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  partially_completed: 'bg-orange-50 text-orange-700 border-orange-200',
  not_completed: 'bg-rose-50 text-rose-700 border-rose-200'
};

export const PROFESSION_LIBRARY_CONFIGS: Record<ProfessionKey, ProfessionLibraryConfig> = {
  fono: {
    key: 'fono',
    moduleName: 'ZemdaFono',
    professionName: 'Fonoaudiologia',
    libraryTitle: 'Biblioteca Fonoaudiológica de Atividades & Orientações',
    librarySubtitle: 'Modelos clínicos e orientações para comunicação, fala, linguagem, motricidade orofacial e rotinas',
    patientSectionTitle: 'Atividades e Orientações do Paciente (Casa & Escola)',
    patientSectionSubtitle: 'Acompanhamento do plano de orientações domiciliares e escolares em Fonoaudiologia',
    patientNameLabel: 'Paciente',
    brandColor: 'teal',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    headerGradientClass: 'from-teal-600 to-emerald-700',
    activeTabClass: 'bg-teal-600 text-white shadow-xs',
    defaultFrequency: 'Diário (10 a 15 minutos)',
    quickSuggestionSettings: [
      { id: 'home', label: 'Casa / Família' },
      { id: 'school', label: 'Escola / Educadores' },
      { id: 'community', label: 'Comunidade' },
      { id: 'general', label: 'Geral' }
    ],
    categories: [
      {
        id: 'cat-fono-lang-oral',
        name: 'Linguagem oral & expressiva',
        description: 'Vocabulário funcional, estruturação sintática e narrativa',
        subcategories: ['Vocabulário funcional', 'Estruturação frasal', 'Narrativa e relato', 'Nomeação rápida']
      },
      {
        id: 'cat-fono-lang-rec',
        name: 'Linguagem receptiva',
        description: 'Compreensão de ordens, vocabulário passivo e conceitos',
        subcategories: ['Compreensão de ordens', 'Identificação de conceitos', 'Perguntas e inferências']
      },
      {
        id: 'cat-fono-phono',
        name: 'Fonologia e fala',
        description: 'Consciência fonológica, produção articulatória e bombardeio auditivo',
        subcategories: ['Consciência fonológica', 'Pistas cinestésico-visuais', 'Bombardeio auditivo', 'Fala articulada']
      },
      {
        id: 'cat-fono-prag',
        name: 'Comunicação funcional',
        description: 'Habilidades pragmáticas, turnos de diálogo e intenção comunicativa',
        subcategories: ['Pragmática e interação', 'Comunicação funcional', 'Iniciação de diálogo']
      },
      {
        id: 'cat-fono-aac',
        name: 'Comunicação alternativa e aumentativa',
        description: 'Pranchas de comunicação, PECS e estimulação de linguagem apoiada',
        subcategories: ['Uso de prancha e cartões', 'Modelagem de símbolos', 'Comunicação no cotidiano']
      },
      {
        id: 'cat-fono-literacy',
        name: 'Leitura e escrita',
        description: 'Habilidades fonológicas preditoras e discriminação auditiva',
        subcategories: ['Habilidades de leitura e escrita', 'Rimas e aliterações', 'Discriminação de sons']
      },
      {
        id: 'cat-fono-mo',
        name: 'Motricidade orofacial',
        description: 'Postura lingual, vedamento labial, respiração e mastigação',
        subcategories: ['Postura lingual e labial', 'Mastigação e deglutição', 'Consciência orofacial']
      },
      {
        id: 'cat-fono-guidance',
        name: 'Orientações familiares e escolares',
        description: 'Diretrizes práticas para facilitação comunicativa em casa e na escola',
        subcategories: ['Orientações familiares', 'Orientações escolares', 'Adaptações em sala']
      }
    ]
  },

  pp: {
    key: 'pp',
    moduleName: 'ZemdaPP',
    professionName: 'Psicopedagogia',
    libraryTitle: 'Biblioteca Psicopedagógica de Atividades & Orientações',
    librarySubtitle: 'Estratégias de aprendizagem, funções executivas, mediação pedagógica e autonomia escolar',
    patientSectionTitle: 'Atividades e Orientações do Aprendente (Casa & Escola)',
    patientSectionSubtitle: 'Acompanhamento do plano de intervenção psicopedagógica e estratégias para família e escola',
    patientNameLabel: 'Aprendente',
    brandColor: 'indigo',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    headerGradientClass: 'from-indigo-600 to-violet-700',
    activeTabClass: 'bg-indigo-600 text-white shadow-xs',
    defaultFrequency: '3 vezes por semana (15 a 20 minutos)',
    quickSuggestionSettings: [
      { id: 'school', label: 'Escola / Sala de Aula' },
      { id: 'home', label: 'Casa / Família' },
      { id: 'general', label: 'Geral (Estudo Individual)' }
    ],
    categories: [
      {
        id: 'cat-pp-reading',
        name: 'Leitura',
        description: 'Reconhecimento de palavras, fluência leitora e estratégias de compreensão',
        subcategories: [
          'Identificação e reconhecimento de palavras',
          'Consciência fonológica aplicada à aprendizagem',
          'Compreensão leitora',
          'Sequenciamento de histórias',
          'Estratégias para leitura compartilhada'
        ]
      },
      {
        id: 'cat-pp-writing',
        name: 'Escrita',
        description: 'Planejamento pré-textual, produção textual orientada e ortografia reflexiva',
        subcategories: [
          'Planejamento da escrita',
          'Produção textual',
          'Ortografia',
          'Revisão de textos',
          'Organização de ideias'
        ]
      },
      {
        id: 'cat-pp-math',
        name: 'Matemática',
        description: 'Senso numérico, raciocínio lógico e resolução mediada de problemas',
        subcategories: [
          'Noção de quantidade',
          'Sequências numéricas',
          'Resolução de problemas',
          'Raciocínio lógico',
          'Jogos matemáticos'
        ]
      },
      {
        id: 'cat-pp-exec',
        name: 'Atenção, memória e funções executivas',
        description: 'Memória de trabalho, controle inibitório e flexibilidade cognitiva',
        subcategories: [
          'Memória operacional',
          'Atenção sustentada',
          'Controle inibitório',
          'Flexibilidade cognitiva',
          'Planejamento e organização'
        ]
      },
      {
        id: 'cat-pp-org',
        name: 'Organização escolar',
        description: 'Rotina de estudos, planejamento de tarefas e organização de materiais',
        subcategories: [
          'Rotina de estudos',
          'Divisão de atividades em etapas',
          'Organização de materiais',
          'Estratégias de revisão'
        ]
      },
      {
        id: 'cat-pp-autonomy',
        name: 'Autonomia na aprendizagem',
        description: 'Automonitoramento metacognitivo e solicitação assertiva de mediação',
        subcategories: [
          'Monitoramento da própria aprendizagem',
          'Estratégias para solicitar ajuda',
          'Identificação de dúvidas',
          'Autoavaliação formativa'
        ]
      }
    ]
  },

  to: {
    key: 'to',
    moduleName: 'ZemdaTO',
    professionName: 'Terapia Ocupacional',
    libraryTitle: 'Biblioteca de Terapia Ocupacional de Atividades & Orientações',
    librarySubtitle: 'Atividades de vida diária, integração sensorial, desenvolvimento motor e autonomia ocupacional',
    patientSectionTitle: 'Programa de Atividades Ocupacionais (Casa / Escola)',
    patientSectionSubtitle: 'Orientações estruturadas para continuidade da terapia ocupacional na rotina diária',
    patientNameLabel: 'Paciente',
    brandColor: 'amber',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    headerGradientClass: 'from-amber-600 to-teal-700',
    activeTabClass: 'bg-amber-600 text-white shadow-xs',
    defaultFrequency: 'Diário na rotina matinal/vespertina',
    quickSuggestionSettings: [
      { id: 'home', label: 'Casa / Família' },
      { id: 'school', label: 'Escola / Educadores' },
      { id: 'community', label: 'Comunidade / Lazer' },
      { id: 'other', label: 'Outro Ambiente' },
      { id: 'general', label: 'Geral' }
    ],
    categories: [
      {
        id: 'cat-to-avd',
        name: 'Atividades de vida diária (AVDs)',
        description: 'Vestuário, calçados, alimentação independente e higiene pessoal',
        subcategories: ['Vestuário e calçados', 'Alimentação independente', 'Higiene e cuidados pessoais']
      },
      {
        id: 'cat-to-aivd',
        name: 'Atividades instrumentais de vida diária (AIVDs)',
        description: 'Tarefas domésticas simples, preparo de lanche e gestão de pertences',
        subcategories: ['Tarefas domésticas simples', 'Preparo de lanche', 'Gestão de materiais']
      },
      {
        id: 'cat-to-routine',
        name: 'Autonomia e rotina',
        description: 'Quadros visuais de rotina, transição de atividades e independência',
        subcategories: ['Quadro visual de rotinas diárias', 'Transições de atividade', 'Participação comunitária']
      },
      {
        id: 'cat-to-fine-motor',
        name: 'Coordenação motora fina',
        description: 'Preensão do lápis, manuseio da tesoura, dissociação digital e pinça',
        subcategories: ['Preensão e manuseio da tesoura', 'Preensão do lápis e traçado', 'Dissociação de dedos']
      },
      {
        id: 'cat-to-gross-motor',
        name: 'Coordenação motora global',
        description: 'Circuitos motores, equilíbrio, tônus postural e planejamento corporal',
        subcategories: ['Planejamento motor e equilíbrio', 'Praxia global e circuitos', 'Coordenação bilateral']
      },
      {
        id: 'cat-to-sensory',
        name: 'Processamento sensorial',
        description: 'Pausas proprioceptivas, estratégias de autorregulação e descompressão',
        subcategories: ['Estratégias de autorregulação', 'Processamento sensorial', 'Dessensibilização tátil']
      },
      {
        id: 'cat-to-play',
        name: 'Brincar e lazer',
        description: 'Brincar exploratório, funcional, simbólico e jogos compartilhados',
        subcategories: ['Brincar exploratório e funcional', 'Brincadeiras simbólicas', 'Jogos compartilhados']
      },
      {
        id: 'cat-to-env',
        name: 'Adaptações ambientais',
        description: 'Adequação ergonômica da carteira escolar e organização de espaços',
        subcategories: ['Adaptações ambientais e escolares', 'Ergonomia postural', 'Redutores de distratores']
      },
      {
        id: 'cat-to-school-part',
        name: 'Participação escolar',
        description: 'Manejo de materiais escolares, rotinas de banheiro e participação',
        subcategories: ['Participação escolar', 'Transição entre aulas', 'Acessibilidade em sala']
      },
      {
        id: 'cat-to-assistive-tech',
        name: 'Recursos e adaptações funcionais',
        description: 'Engrossadores de baixa complexidade, antiderrapantes e apoios ergonômicos',
        subcategories: ['Recursos e adaptações funcionais', 'Engrossadores de cabo', 'Estabilização de objetos']
      }
    ]
  }
};

export function getProfessionLibraryConfig(profession: string): ProfessionLibraryConfig {
  const clean = String(profession || '').trim().toLowerCase();
  if (clean === 'fono' || clean === 'fonoaudiologia' || clean === 'speech-therapy' || clean === 'zemdafono') {
    return PROFESSION_LIBRARY_CONFIGS.fono;
  }
  if (clean === 'pp' || clean === 'psicopedagogia' || clean === 'psychopedagogy' || clean === 'zemdapp') {
    return PROFESSION_LIBRARY_CONFIGS.pp;
  }
  return PROFESSION_LIBRARY_CONFIGS.to;
}
