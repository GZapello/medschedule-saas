export interface LandingModulePreview {
  id: string;
  name: string;
  area: string;
  description: string;
  features: readonly [string, string, string, string];
  focus: string;
}

/** Public highlights verified against the clinical workspaces, not a feature roadmap. */
export const LANDING_MODULE_PREVIEWS: readonly LandingModulePreview[] = [
  {
    id: 'fono', name: 'ZemdaFono', area: 'Fonoaudiologia',
    description: 'Avaliação, evolução e acompanhamento fonoaudiológico.',
    features: ['Fonologia e painel fonêmico', 'Linguagem, voz e gravações', 'Audiologia e audiograma', 'Disfagia e IDDSI'],
    focus: 'CAA, metas terapêuticas e histórico apoiam a continuidade entre os atendimentos.'
  },
  {
    id: 'psico', name: 'ZemdaPsico', area: 'Psicologia',
    description: 'Organize as sessões e os registros do acompanhamento psicológico.',
    features: ['Estado mental e avaliação de risco', 'Triagens e escalas', 'Metas terapêuticas', 'Testes externos e laudos'],
    focus: 'Sessões com autosave, documentos psicológicos e consulta ao SATEPSI complementam o registro clínico.'
  },
  {
    id: 'odonto', name: 'ZemdaOdonto', area: 'Odontologia',
    description: 'Avaliações e tratamentos conectados ao prontuário odontológico.',
    features: ['Odontograma', 'Periodontograma', 'Endodontia', 'Prótese e HOF'],
    focus: 'Registre a evolução, emita documentos e consulte o histórico do paciente.'
  },
  {
    id: 'nutri', name: 'ZemdaNutri', area: 'Nutrição',
    description: 'Da avaliação nutricional ao plano alimentar e à evolução.',
    features: ['Anamnese e antropometria', 'Bioimpedância', 'Recordatório 24h', 'Plano alimentar'],
    focus: 'Acompanhe medições e evolução nutricional ao longo das consultas.'
  },
  {
    id: 'fisio', name: 'ZemdaFisio', area: 'Fisioterapia',
    description: 'Avaliação funcional e planejamento do acompanhamento fisioterapêutico.',
    features: ['Avaliação cinético-funcional', 'Goniometria e força muscular', 'Mapa corporal com ZemdaBody', 'Plano terapêutico'],
    focus: 'Registre a evolução e finalize cada atendimento com vínculo ao prontuário.'
  },
  {
    id: 'to', name: 'ZemdaTO', area: 'Terapia Ocupacional',
    description: 'Avalie a rotina, a participação e as necessidades de cada pessoa.',
    features: ['Perfil ocupacional', 'AVDs e AIVDs', 'Perfil sensorial', 'Plano terapêutico singular'],
    focus: 'Compare a evolução funcional e registre recursos de tecnologia assistiva.'
  },
  {
    id: 'personal', name: 'ZemdaPersonal', area: 'Educação Física',
    description: 'Avaliações físicas e treinos organizados por aluno.',
    features: ['Avaliação física e antropometria', 'Composição corporal e TAV', 'Prescrição de treinos', 'Fichas e relatórios em PDF'],
    focus: 'Consulte o histórico de avaliações, compare resultados e acompanhe a execução dos treinos.'
  },
  {
    id: 'pp', name: 'ZemdaPP', area: 'Psicopedagogia',
    description: 'Avaliação e intervenção com foco no processo de aprendizagem.',
    features: ['Perfil e anamnese', 'Avaliação psicopedagógica', 'Análise de aprendizagem', 'Plano de intervenção (PIP)'],
    focus: 'Registre a evolução, emita documentos e acompanhe o histórico das sessões.'
  },
  {
    id: 'body', name: 'ZemdaBody', area: 'Módulo transversal',
    description: 'Registro visual do corpo para apoiar diferentes áreas de atendimento.',
    features: ['Mapa corporal interativo', 'Vistas frontais, posteriores e laterais', 'Marcações por região e desenhos', 'Registros vinculados ao atendimento'],
    focus: 'Um recurso compartilhado entre especialidades, com acesso conforme as permissões do profissional.'
  }
];
