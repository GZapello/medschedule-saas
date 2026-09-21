/** Conteúdo público compartilhado entre a landing e sua pré-renderização. */
export const LANDING_HERO = {
  title: 'Gestão e atendimento em saúde: do profissional solo à clínica multiprofissional.',
  description: 'Agenda, prontuário, documentos, financeiro, equipe e módulos clínicos especializados conectados em uma única plataforma.'
};

export const LANDING_MODULES = [
  { id: 'fono', name: 'ZemdaFono', profession: 'Fonoaudiologia', slug: 'sistema-para-fonoaudiologos', features: ['Fonologia e painel fonêmico', 'Linguagem, voz e gravações', 'Audiologia, disfagia e IDDSI', 'CAA, metas e histórico clínico'] },
  { id: 'psico', name: 'ZemdaPsico', profession: 'Psicologia', slug: 'sistema-para-psicologos', features: ['Sessões, evolução e autosave', 'Estado mental e avaliação de risco', 'Triagens, escalas e metas', 'Documentos psicológicos e histórico'] },
  { id: 'odonto', name: 'ZemdaOdonto', profession: 'Odontologia', slug: null, features: ['Odontograma e periodontograma', 'Endodontia e prótese', 'Harmonização orofacial (HOF)', 'Planos de tratamento e prontuário'] },
  { id: 'nutri', name: 'ZemdaNutri', profession: 'Nutrição', slug: 'sistema-para-nutricionistas', features: ['Anamnese e antropometria', 'Bioimpedância e recordatório 24h', 'Plano alimentar', 'Evolução longitudinal'] },
  { id: 'fisio', name: 'ZemdaFisio', profession: 'Fisioterapia', slug: 'sistema-para-fisioterapeutas', features: ['Avaliação funcional', 'Evolução e mapa corporal', 'Plano terapêutico', 'Histórico longitudinal'] },
  { id: 'to', name: 'ZemdaTO', profession: 'Terapia Ocupacional', slug: null, features: ['Perfil ocupacional e AVDs', 'Perfil sensorial e análise de tarefa', 'Tecnologia assistiva', 'Planos terapêuticos'] },
  { id: 'personal', name: 'ZemdaPersonal', profession: 'Educação Física', slug: null, features: ['Avaliação física, composição e TAV', 'Prescrição de treinos', 'Histórico e evolução', 'Fotos comparativas'] },
  { id: 'pp', name: 'ZemdaPP', profession: 'Psicopedagogia', slug: 'sistema-para-psicopedagogos', features: ['Perfil, anamnese e evolução', 'Avaliação psicopedagógica', 'Análise de aprendizagem e PIP', 'Histórico de acompanhamento'] }
];
export const moduleHref = (module: typeof LANDING_MODULES[number]) => module.slug ? `/${module.slug}` : `/#produto`;
export const LANDING_PLANS = [
  { name: 'Solo', price: '69,90', accesses: '1 acesso', description: 'Para quem atende individualmente.' },
  { name: 'Equipe', price: '249,90', accesses: 'Até 5 acessos', description: 'Para compartilhar a rotina da clínica.' },
  { name: 'Clínica', price: '619,90', accesses: 'Até 20 acessos', description: 'Para equipes multiprofissionais maiores.' }
];
export const LANDING_STEPS = [
  { title: 'Cadastre sua clínica ou consultório', description: 'Organize o espaço de trabalho e escolha o plano pelo número de acessos.' },
  { title: 'Adicione sua equipe e profissões', description: 'Cada pessoa se cadastra, informa sua profissão e solicita vínculo com a clínica. O responsável aprova a entrada.' },
  { title: 'Cada profissão, seu ambiente', description: 'O módulo especializado é liberado conforme a profissão e as permissões do usuário. A gestão permanece unificada.' }
];
export const LANDING_LAYERS = [
  { title: 'Gestão', description: 'Uma base para organizar a clínica.', items: ['Agenda', 'Pacientes', 'Equipe', 'Serviços', 'Financeiro', 'Estoque', 'Comissões', 'Relatórios'] },
  { title: 'Atendimento', description: 'Contexto para acompanhar cada paciente.', items: ['Prontuário', 'Evolução', 'Documentos', 'Anexos', 'Exames', 'Autosave nos módulos compatíveis', 'Histórico'] },
  { title: 'Especialidade', description: 'Ferramentas que acompanham sua prática.', items: LANDING_MODULES.map(module => module.name) }
];
export const LANDING_FAQS = [
  { question: 'O que muda de um plano para outro?', answer: 'O número de acessos: Solo tem 1, Equipe até 5 e Clínica até 20. Cada acesso corresponde a um usuário, incluindo profissionais e colaboradores. A profissão e as permissões definem as ferramentas clínicas disponíveis.' },
  { question: 'Posso reunir profissões diferentes na mesma clínica?', answer: 'Sim. A gestão permanece unificada, e cada profissional acessa o ambiente da sua área conforme sua profissão e permissões. São oito módulos profissionais, além do ZemdaBody como recurso transversal de mapa corporal.' },
  { question: 'Como a equipe entra na clínica?', answer: 'Cada usuário se cadastra, informa sua profissão e solicita vínculo com a clínica. O responsável aprova a solicitação, respeitando o limite de acessos do plano.' },
  { question: 'O atendimento é salvo automaticamente?', answer: 'Psicologia e Fonoaudiologia contam com autosave e recuperação de rascunhos. A recuperação depende de existir um rascunho salvo no navegador ou no servidor. Confira o indicador de salvamento e finalize o atendimento ao concluir. Esses recursos são projetados para reduzir o risco de perda de dados.' },
  { question: 'Como funcionam os lembretes pelo WhatsApp?', answer: 'A plataforma permite lembrete manual pelo WhatsApp. Lembretes automáticos dependem da configuração e da disponibilidade da integração na clínica. Não há promessa de confirmação automática de consultas.' },
  { question: 'A IA toma decisões clínicas?', answer: 'Não. A IA apoia a estruturação de textos, a organização e a elaboração assistida de registros. Todo conteúdo clínico gerado ou estruturado por IA exige revisão e responsabilidade do profissional.' }
];
