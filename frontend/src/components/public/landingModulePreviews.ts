export interface LandingModulePreview {
  id: string;
  name: string;
  area: string;
  description: string;
  features: readonly [string, string, string, string];
  featureDescriptions: readonly [string, string, string, string];
  focus: string;
}

/** Public highlights verified against the clinical workspaces, not a feature roadmap. */
export const LANDING_MODULE_PREVIEWS: readonly LandingModulePreview[] = [
  {
    id: 'fono', name: 'ZemdaFono', area: 'Fonoaudiologia',
    description: 'Avaliação, evolução e acompanhamento fonoaudiológico.',
    features: ['Fonologia e painel fonêmico', 'Linguagem, voz e gravações', 'Audiologia e audiograma', 'Disfagia e IDDSI'],
    featureDescriptions: [
      "Registre a produção dos fonemas e acompanhe o mapeamento no painel fonêmico.",
      "Organize a avaliação de linguagem e voz, incluindo gravações de áudio para acompanhamento.",
      "Registre avaliações audiológicas e organize os resultados no audiograma.",
      "Documente a avaliação da deglutição e as consistências alimentares com referência à matriz IDDSI."
    ],
    focus: 'CAA, metas terapêuticas e histórico apoiam a continuidade entre os atendimentos.'
  },
  {
    id: 'psico', name: 'ZemdaPsico', area: 'Psicologia',
    description: 'Organize as sessões e os registros do acompanhamento psicológico.',
    features: ['Estado mental e avaliação de risco', 'Triagens e escalas', 'Metas terapêuticas', 'Testes externos e laudos'],
    featureDescriptions: [
      "Estruture o exame do estado mental e registre a avaliação de risco do paciente.",
      "Registre triagens e escalas utilizadas no acompanhamento psicológico.",
      "Defina objetivos terapêuticos e acompanhe seu progresso ao longo das sessões.",
      "Anexe testes externos, laudos e relatórios de apoio ao registro do paciente."
    ],
    focus: 'Sessões com autosave, documentos psicológicos e consulta ao SATEPSI complementam o registro clínico.'
  },
  {
    id: 'odonto', name: 'ZemdaOdonto', area: 'Odontologia',
    description: 'Avaliações e tratamentos conectados ao prontuário odontológico.',
    features: ['Odontograma', 'Periodontograma', 'Endodontia', 'Prótese e HOF'],
    featureDescriptions: [
      "Registre condições e intervenções por elemento dentário no odontograma interativo.",
      "Organize medidas de sondagem, sangramento e mobilidade na avaliação periodontal.",
      "Documente o diagnóstico e os registros de tratamento endodôntico.",
      "Acompanhe trabalhos de prótese e registre procedimentos de harmonização orofacial."
    ],
    focus: 'Registre a evolução, emita documentos e consulte o histórico do paciente.'
  },
  {
    id: 'nutri', name: 'ZemdaNutri', area: 'Nutrição',
    description: 'Da avaliação nutricional ao plano alimentar e à evolução.',
    features: ['Anamnese e antropometria', 'Bioimpedância', 'Recordatório 24h', 'Plano alimentar'],
    featureDescriptions: [
      "Reúna a anamnese nutricional e registre medidas para acompanhar o histórico antropométrico.",
      "Registre os resultados de bioimpedância utilizados na avaliação da composição corporal.",
      "Organize o relato dos alimentos e refeições consumidos nas últimas 24 horas.",
      "Monte e registre o plano alimentar do paciente com refeições e alimentos."
    ],
    focus: 'Acompanhe medições e evolução nutricional ao longo das consultas.'
  },
  {
    id: 'fisio', name: 'ZemdaFisio', area: 'Fisioterapia',
    description: 'Avaliação funcional e planejamento do acompanhamento fisioterapêutico.',
    features: ['Avaliação cinético-funcional', 'Goniometria e força muscular', 'Mapa corporal com ZemdaBody', 'Plano terapêutico'],
    featureDescriptions: [
      "Documente a avaliação do movimento e da função para orientar o acompanhamento fisioterapêutico.",
      "Registre a amplitude de movimento e a avaliação de força muscular.",
      "Localize regiões de dor e registre marcações corporais associadas ao atendimento.",
      "Organize objetivos e condutas do plano de tratamento fisioterapêutico."
    ],
    focus: 'Registre a evolução e finalize cada atendimento com vínculo ao prontuário.'
  },
  {
    id: 'to', name: 'ZemdaTO', area: 'Terapia Ocupacional',
    description: 'Avalie a rotina, a participação e as necessidades de cada pessoa.',
    features: ['Perfil ocupacional', 'AVDs e AIVDs', 'Perfil sensorial', 'Plano terapêutico singular'],
    featureDescriptions: [
      "Registre rotina, interesses, papéis ocupacionais e barreiras à participação.",
      "Avalie atividades de vida diária e instrumentais e compare a evolução funcional.",
      "Documente padrões de processamento sensorial nos sistemas avaliados.",
      "Organize o plano de cuidado com objetivos e intervenções de terapia ocupacional."
    ],
    focus: 'Compare a evolução funcional e registre recursos de tecnologia assistiva.'
  },
  {
    id: 'personal', name: 'ZemdaPersonal', area: 'Educação Física',
    description: 'Avaliações físicas e treinos organizados por aluno.',
    features: ['Avaliação física e antropometria', 'Composição corporal e TAV', 'Prescrição de treinos', 'Fichas e relatórios em PDF'],
    featureDescriptions: [
      "Registre avaliações físicas, medidas e perímetros para acompanhar cada aluno.",
      "Organize os dados de composição corporal e de tecido adiposo visceral (TAV).",
      "Monte treinos com exercícios e parâmetros de execução para cada aluno.",
      "Prepare fichas de treino e relatórios de avaliação para impressão ou salvamento em PDF."
    ],
    focus: 'Consulte o histórico de avaliações, compare resultados e acompanhe a execução dos treinos.'
  },
  {
    id: 'pp', name: 'ZemdaPP', area: 'Psicopedagogia',
    description: 'Avaliação e intervenção com foco no processo de aprendizagem.',
    features: ['Perfil e anamnese', 'Avaliação psicopedagógica', 'Análise de aprendizagem', 'Plano de intervenção (PIP)'],
    featureDescriptions: [
      "Reúna o perfil do aprendente, a demanda e o histórico na anamnese psicopedagógica.",
      "Registre a avaliação e a síntese do perfil de aprendizagem observado.",
      "Organize observações de leitura, escrita, matemática e funções executivas.",
      "Defina e registre objetivos e ações no Plano de Intervenção Psicopedagógica."
    ],
    focus: 'Registre a evolução, emita documentos e acompanhe o histórico das sessões.'
  },
  {
    id: 'body', name: 'ZemdaBody', area: 'Módulo transversal',
    description: 'Registro visual do corpo para apoiar diferentes áreas de atendimento.',
    features: ['Mapa corporal interativo', 'Vistas frontais, posteriores e laterais', 'Marcações por região e desenhos', 'Registros vinculados ao atendimento'],
    featureDescriptions: [
      "Explore regiões do corpo para organizar o registro visual da avaliação.",
      "Consulte as vistas frontal, posterior e laterais do modelo anatômico.",
      "Selecione regiões e use desenhos para registrar observações no mapa corporal.",
      "Mantenha a avaliação corporal relacionada ao paciente e ao atendimento correspondente."
    ],
    focus: 'Um recurso compartilhado entre especialidades, com acesso conforme as permissões do profissional.'
  }
];
