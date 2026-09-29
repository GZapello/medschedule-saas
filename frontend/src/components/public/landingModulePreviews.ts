export interface LandingModulePreview {
  id: string;
  name: string;
  area: string;
  description: string;
  features: readonly string[];
  featureDescriptions: readonly string[];
  focus: string;
}

/** Public highlights verified against the clinical workspaces, not a feature roadmap. */
export const LANDING_MODULE_PREVIEWS: readonly LandingModulePreview[] = [
  {
    id: 'med', name: 'ZemdaMed', area: 'Medicina',
    description: 'Prontuário médico, acompanhamento clínico, exames, prescrições e recursos adaptados às diferentes áreas médicas.',
    features: [
      'Prontuário médico e anamnese',
      'Sinais vitais e acompanhamento clínico',
      'Exames, medicamentos e prescrições',
      'Especialidades e acompanhamento longitudinal',
      'Documentos médicos e encaminhamentos',
      'Integração com Zemda360'
    ],
    featureDescriptions: [
      'Estruture a anamnese, hipóteses diagnósticas e histórico clínico completo do paciente com rapidez e segurança.',
      'Acompanhe pressão arterial, frequência cardíaca, peso, saturação e histórico longitudinal dos sinais vitais.',
      'Organize prescrições medicamentosas, pedidos de exames laboratoriais e controle de laudos no prontuário.',
      'Recursos adaptados para Neurologia, Psiquiatria, Pediatria, Clínica Geral e diversas especialidades médicas.',
      'Emita atestados, receituários, relatórios e guias de encaminhamento com rastreabilidade e registro de autoria.',
      'Mapeie achados clínicos, dores, dermatologia e procedimentos diretamente no mapa anatômico interativo Zemda360.'
    ],
    focus: 'Prontuário médico longitudinal, prescrições, documentos e integração com mapa anatômico no mesmo ambiente.'
  },
  {
    id: 'body', name: 'Zemda360', area: 'Mapeamento Anatômico',
    description: 'Mapeamento anatômico visual integrado ao atendimento.',
    features: [
      'Mapeamento corporal',
      'Mapeamento facial',
      'Seleção de regiões anatômicas',
      'Marcações com caneta e borracha',
      'Observações por região',
      'Histórico de avaliações'
    ],
    featureDescriptions: [
      'Explore regiões do corpo para registrar achados clínicos e acompanhar a evolução visualmente.',
      'Mapeamento facial detalhado com sobreposições anatômicas para estética, odontologia e procedimentos.',
      'Selecione regiões anatômicas específicas em vistas anterior, posterior e lateral.',
      'Desenhe com caneta colorida ou limpe com a borracha diretamente sobre o modelo anatômico.',
      'Adicione notas e observações clínicas estruturadas por região anatômica.',
      'Acompanhe a linha do tempo com o histórico comparativo das avaliações do paciente.'
    ],
    focus: 'Mapeamento anatômico visual integrado ao atendimento, compartilhado entre medicina e especialidades.'
  },
  {
    id: 'estetic', name: 'ZemdaEstetic', area: 'Estética',
    description: 'Estética facial, corporal e capilar em um só ambiente.',
    features: [
      'Avaliação estética',
      'Estética facial, corporal e capilar',
      'Fotografias e acompanhamento',
      'Planejamento e procedimentos',
      'Evolução e retornos',
      'Antes e depois',
      'Integração com Zemda360'
    ],
    featureDescriptions: [
      'Ficha de avaliação estética e anamnese estruturada para procedimentos faciais, corporais e capilares.',
      'Prontuário unificado para protocolos personalizados de estética facial, corporal e terapia capilar.',
      'Armazene fotos clínicas padronizadas com registro seguro de datas, ângulos e iluminação.',
      'Planeje sessões, selecione produtos com rastreabilidade de lote e registre procedimentos realizados.',
      'Documente a resposta aos tratamentos, condutas domiciliares e agende retornos de acompanhamento.',
      'Compare fotos de evolução lado a lado para demonstrar resultados clínicos aos pacientes.',
      'Mapeie pontos de aplicação, regiões anatômicas e procedimentos diretamente no Zemda360.'
    ],
    focus: 'Protocolos de estética facial, corporal e capilar com registros fotográficos, evolução clínica e mapeamento anatômico integrado.'
  },
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
    focus: 'Metas terapêuticas e histórico apoiam a continuidade entre os atendimentos.'
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
    features: ['Avaliação cinético-funcional', 'Goniometria e força muscular', 'Mapeamento anatômico com Zemda360', 'Plano terapêutico'],
    featureDescriptions: [
      "Documente a avaliação do movimento e da função para orientar o acompanhamento fisioterapêutico.",
      "Registre a amplitude de movimento e a avaliação de força muscular.",
      "Localize regiões de dor e registre marcações anatômicas associadas ao atendimento no Zemda360.",
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
    features: ['Avaliação física e antropometria', 'Composição corporal e TAV', 'Prescrição de treinos', 'Fichas e relatórios em PDF', 'Avaliação postural', 'Histórico e comparações'],
    featureDescriptions: [
      "Registre avaliações físicas, medidas e perímetros para acompanhar cada aluno.",
      "Organize os dados de composição corporal e de tecido adiposo visceral (TAV).",
      "Monte treinos com exercícios e parâmetros de execução para cada aluno.",
      "Prepare fichas de treino e relatórios de avaliação para impressão ou salvamento em PDF.",
      "Registre observações de postura por região e vista, vinculadas à avaliação física.",
      "Compare medidas, composição corporal e registros posturais entre avaliações."
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
  }
];
