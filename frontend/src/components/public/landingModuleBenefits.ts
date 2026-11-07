// Copy grounded in the corresponding clinical workspaces and their existing tools.
export interface ModuleBenefits {
  description: string;
  benefits: { lead: string; detail: string }[];
}
export const MODULE_BENEFITS: Record<string, ModuleBenefits> = {
  med: {
    description: 'Do registro da consulta à conduta, reúna as informações do atendimento médico em um prontuário estruturado.',
    benefits: [
      { lead: 'Anamnese e notas SOAP', detail: 'para organizar a consulta e a evolução.' },
      { lead: 'Sinais vitais e exame físico', detail: 'junto aos registros da especialidade.' },
      { lead: 'Prescrições e solicitações de exames', detail: 'integradas à conduta médica.' },
      { lead: 'Histórico longitudinal', detail: 'para consultar atendimentos anteriores.' }
    ]
  },
  estetic: {
    description: 'Organize o percurso do paciente nos cuidados faciais, corporais e capilares, do planejamento ao retorno.',
    benefits: [
      { lead: 'Avaliações por área', detail: 'para registrar as necessidades de cada atendimento.' },
      { lead: 'Planejamento de procedimentos', detail: 'com acompanhamento da execução.' },
      { lead: 'Fotografias clínicas', detail: 'organizadas no histórico do paciente.' },
      { lead: 'Evoluções e retornos', detail: 'para acompanhar a continuidade do cuidado.' }
    ]
  },
  fono: {
    description: 'Um ambiente para organizar avaliações, atendimentos e acompanhamento fonoaudiológico.',
    benefits: [
      { lead: 'Avaliações e evoluções', detail: 'reunidas no acompanhamento fonoaudiológico.' },
      { lead: 'Linguagem, voz, audiologia e disfagia', detail: 'em recursos específicos para cada área.' },
      { lead: 'Metas terapêuticas', detail: 'para acompanhar o percurso do paciente.' },
      { lead: 'Histórico clínico acessível', detail: 'para retomar registros entre as sessões.' }
    ]
  },
  psico: {
    description: 'Estruture o registro das sessões e acompanhe o processo terapêutico com informações organizadas por paciente.',
    benefits: [
      { lead: 'Sessões e evoluções', detail: 'com salvamento automático dos registros.' },
      { lead: 'Estado mental e avaliação de risco', detail: 'em formulários próprios.' },
      { lead: 'Triagens, escalas e metas', detail: 'para apoiar o acompanhamento clínico.' },
      { lead: 'Documentos psicológicos', detail: 'junto ao histórico de atendimentos.' }
    ]
  },
  odonto: {
    description: 'Conecte os registros da saúde bucal ao planejamento e à evolução do tratamento odontológico.',
    benefits: [
      { lead: 'Odontograma interativo', detail: 'para registrar dentes, faces e condições clínicas.' },
      { lead: 'Periodontograma', detail: 'para organizar as avaliações periodontais.' },
      { lead: 'Endodontia, prótese e HOF', detail: 'com registros específicos no prontuário.' },
      { lead: 'Planos e orçamentos', detail: 'para organizar as etapas do tratamento.' }
    ]
  },
  nutri: {
    description: 'Reúna a avaliação nutricional, os hábitos alimentares e o planejamento das refeições no acompanhamento do paciente.',
    benefits: [
      { lead: 'Anamnese e antropometria', detail: 'para estruturar a avaliação nutricional.' },
      { lead: 'Composição e bioimpedância', detail: 'com registros consultáveis ao longo do tempo.' },
      { lead: 'Recordatório de 24 horas', detail: 'para organizar o consumo alimentar relatado.' },
      { lead: 'Planos alimentares e evolução', detail: 'para acompanhar as orientações entre consultas.' }
    ]
  },
  fisio: {
    description: 'Documente a avaliação cinético-funcional e acompanhe a evolução do paciente durante o tratamento.',
    benefits: [
      { lead: 'Avaliação funcional', detail: 'com registros de goniometria e força muscular.' },
      { lead: 'Mapeamento anatômico', detail: 'para contextualizar os achados do atendimento.' },
      { lead: 'Plano terapêutico', detail: 'para organizar objetivos e condutas.' },
      { lead: 'Evoluções por atendimento', detail: 'para consultar o histórico da reabilitação.' }
    ]
  },
  to: {
    description: 'Acompanhe a participação e a autonomia do paciente a partir do seu perfil ocupacional e das atividades do cotidiano.',
    benefits: [
      { lead: 'Perfil ocupacional', detail: 'para reunir rotina, demandas e contexto do paciente.' },
      { lead: 'AVDs e AIVDs', detail: 'com registros dos níveis de independência funcional.' },
      { lead: 'Perfil sensorial e análise de tarefas', detail: 'para organizar as observações clínicas.' },
      { lead: 'Tecnologia assistiva e planos', detail: 'para registrar estratégias de intervenção.' }
    ]
  },
  personal: {
    description: 'Organize avaliações e treinos dos alunos e consulte sua evolução em um único acompanhamento.',
    benefits: [
      { lead: 'Avaliação física e composição', detail: 'incluindo o acompanhamento de TAV.' },
      { lead: 'Prescrição de treinos', detail: 'com exercícios e modelos reutilizáveis.' },
      { lead: 'Histórico dos alunos', detail: 'para consultar avaliações e treinos prescritos.' },
      { lead: 'Fotos comparativas', detail: 'para acompanhar visualmente a evolução.' }
    ]
  },
  pp: {
    description: 'Reúna a avaliação da aprendizagem e o planejamento da intervenção psicopedagógica no histórico do atendido.',
    benefits: [
      { lead: 'Perfil e anamnese', detail: 'para organizar o contexto de aprendizagem.' },
      { lead: 'Avaliação psicopedagógica', detail: 'com registros específicos do acompanhamento.' },
      { lead: 'Domínios de aprendizagem', detail: 'para estruturar a análise das dificuldades.' },
      { lead: 'Plano de intervenção (PIP)', detail: 'junto às evoluções e ao histórico.' }
    ]
  }
};
