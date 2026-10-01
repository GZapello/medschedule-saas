import { resolveProfessionModule, resolveCanonicalProfession, ProfessionTaxonomyCategory } from '../utils/profession-module';

export interface RegistrationProfessionOption {
  id: string;
  label: string;
  name?: string;
  canonicalId?: string;
  canonicalName: string;
  accessLabel: string;
  displayOption: string;
  boardLabel?: string;
  module?: string;
  modules: string[];
  clinicalWorkspace?: string | null;
  slug?: string;
  administrative?: boolean;
  taxonomyCategory?: ProfessionTaxonomyCategory;
  isSpecificAlias?: boolean;
}

export interface SystemRoleOption {
  id: string;
  name: string;
  description: string;
  isManager: boolean;
  isClinical: boolean;
}

export const SYSTEM_ROLE_OPTIONS: SystemRoleOption[] = [
  { id: 'professional', name: 'Profissional', description: 'Atendimento clínico a pacientes / alunos', isManager: false, isClinical: true },
  { id: 'clinic_admin', name: 'Gestor da Clínica', description: 'Administração geral, relatórios, financeiro e equipe', isManager: true, isClinical: false },
  { id: 'clinical_coordinator', name: 'Coordenação Clínica', description: 'Supervisão técnica de atendimentos e equipe', isManager: true, isClinical: true },
  { id: 'hr', name: 'Recursos Humanos', description: 'Gestão de equipe e colaboradores', isManager: false, isClinical: false },
  { id: 'receptionist', name: 'Recepcionista', description: 'Recepção, agendamentos e atendimento telefônico', isManager: false, isClinical: false },
  { id: 'secretary', name: 'Secretário(a)', description: 'Gestão de agenda e recepção', isManager: false, isClinical: false },
  { id: 'financial', name: 'Financeiro', description: 'Controle de caixa, faturamento e contas', isManager: false, isClinical: false },
  { id: 'assistant', name: 'Auxiliar Administrativo', description: 'Apoio operacional e administrativo', isManager: false, isClinical: false }
];

// Mapeamento de aliases e registros legados para sua profissão-base canônica.
// Garante compatibilidade retroativa total sem expor duplicatas no seletor principal.
export const REGISTRATION_PROFESSION_ALIASES: Record<string, string> = {
  // Odontologia
  "prof-cirurgiao-dentista": "prof-dentista",
  "prof-odontologia": "prof-dentista",
  "prof-ortodontista": "prof-dentista",
  "dentista": "prof-dentista",
  "odontologia": "prof-dentista",
  "ortodontista": "prof-dentista",

  // Enfermagem
  "prof-enfermagem": "prof-enfermeiro",
  "enfermagem": "prof-enfermeiro",

  // Fisioterapia
  "prof-fisioterapia": "prof-fisioterapeuta",
  "fisioterapia": "prof-fisioterapeuta",

  // Fonoaudiologia
  "prof-fonoaudiologia": "prof-fonoaudiologo",
  "fonoaudiologia": "prof-fonoaudiologo",

  // Medicina e Especialidades Médicas
  "prof-medicina": "prof-medico",
  "medicina": "prof-medico",
  "prof-psiquiatra": "prof-medico",
  "prof-cardiologista": "prof-medico",
  "prof-pediatra": "prof-medico",
  "prof-dermatologista": "prof-medico",
  "prof-neurologista": "prof-medico",
  "prof-geriatra": "prof-medico",
  "prof-ortopedista": "prof-medico",
  "prof-endocrinologista": "prof-medico",
  "prof-reumatologista": "prof-medico",
  "prof-clinico-geral": "prof-medico",
  "prof-ginecologista": "prof-medico",
  "prof-oftalmologista": "prof-medico",
  "prof-otorrinolaringologista": "prof-medico",
  "prof-gastroenterologista": "prof-medico",
  "prof-urologista": "prof-medico",
  "medico": "prof-medico",

  // Nutrição
  "prof-nutricao": "prof-nutricionista",
  "nutricao": "prof-nutricionista",

  // Psicologia e Especialidades/Abordagens
  "prof-psicologia": "prof-psicologo",
  "psicologia": "prof-psicologo",
  "prof-neuropsicologo": "prof-psicologo",
  "prof-psicanalista": "prof-psicologo",
  "prof-terapeuta-familiar": "prof-psicologo",

  // Psicopedagogia
  "prof-psicopedagogia": "prof-psicopedagogo",
  "psicopedagogia": "prof-psicopedagogo",

  // Terapia Ocupacional
  "prof-terapia-ocupacional": "prof-terapeuta-ocupacional",
  "terapia-ocupacional": "prof-terapeuta-ocupacional",

  // Personal Trainer / Educação Física
  "prof-educacao-fisica": "prof-personal-trainer",
  "prof-educador-fisico": "prof-personal-trainer",
  "personal_trainer": "prof-personal-trainer",
  "personal-trainer": "prof-personal-trainer",
  "educacao-fisica": "prof-personal-trainer",

  // Funções Administrativas mapeadas para fallback seguro caso enviadas como profissão
  "prof-administrador": "prof-outro-saude",
  "prof-gestor": "prof-outro-saude",
  "prof-auxiliar-adm": "prof-outro-saude",
  "prof-recepcionista": "prof-outro-saude",
  "prof-secretaria": "prof-outro-saude",
  "prof-financeiro": "prof-outro-saude",
  "prof-rh": "prof-outro-saude",
  "prof-coord-clinica": "prof-outro-saude",
  "prof-direcao-tecnica": "prof-outro-saude",

  // Outros
  "other_health": "prof-outro-saude"
};

// Catálogo ESTRITO de profissões-base canônicas (sem especialidades ou funções administrativas misturadas)
const OPTIONS: Omit<RegistrationProfessionOption, 'module' | 'modules' | 'accessLabel' | 'displayOption' | 'clinicalWorkspace'>[] = [
  {
    "id": "prof-medico",
    "label": "Médico(a)",
    "boardLabel": "CRM",
    "slug": "medico",
    "canonicalName": "Médico"
  },
  {
    "id": "prof-dentista",
    "label": "Cirurgião-Dentista",
    "boardLabel": "CRO",
    "slug": "dentista",
    "canonicalName": "Cirurgião-Dentista"
  },
  {
    "id": "prof-fisioterapeuta",
    "label": "Fisioterapeuta",
    "boardLabel": "CREFITO",
    "slug": "fisioterapeuta",
    "canonicalName": "Fisioterapeuta"
  },
  {
    "id": "prof-fonoaudiologo",
    "label": "Fonoaudiólogo(a)",
    "boardLabel": "CRFa",
    "slug": "fonoaudiologo",
    "canonicalName": "Fonoaudiólogo"
  },
  {
    "id": "prof-nutricionista",
    "label": "Nutricionista",
    "boardLabel": "CRN",
    "slug": "nutricionista",
    "canonicalName": "Nutricionista"
  },
  {
    "id": "prof-psicologo",
    "label": "Psicólogo(a)",
    "boardLabel": "CRP",
    "slug": "psicologo",
    "canonicalName": "Psicólogo"
  },
  {
    "id": "prof-psicanalista",
    "label": "Psicanalista",
    "boardLabel": "Registro Associação",
    "slug": "psicanalista",
    "canonicalName": "Psicólogo"
  },
  {
    "id": "prof-terapeuta-ocupacional",
    "label": "Terapeuta Ocupacional",
    "boardLabel": "CREFITO",
    "slug": "terapeuta-ocupacional",
    "canonicalName": "Terapeuta Ocupacional"
  },
  {
    "id": "prof-psicopedagogo",
    "label": "Psicopedagogo(a)",
    "boardLabel": "ABPp",
    "slug": "psicopedagogo",
    "canonicalName": "Psicopedagogo"
  },
  {
    "id": "prof-personal-trainer",
    "label": "Profissional de Educação Física / Personal Trainer",
    "boardLabel": "CREF",
    "slug": "personal-trainer",
    "canonicalName": "Profissional de Educação Física"
  },
  {
    "id": "prof-esteticista",
    "label": "Esteticista",
    "canonicalName": "Esteticista",
    "slug": "esteticista",
    "boardLabel": "Registro Técnico"
  },
  {
    "id": "prof-enfermeiro",
    "label": "Enfermeiro(a)",
    "canonicalName": "Enfermeiro",
    "slug": "enfermeiro",
    "boardLabel": "COREN"
  },
  {
    "id": "prof-tec-enfermagem",
    "label": "Técnico(a) de Enfermagem",
    "canonicalName": "Técnico de Enfermagem",
    "slug": "tecnico-enfermagem",
    "boardLabel": "COREN"
  },
  {
    "id": "prof-biomedicina",
    "label": "Biomédico(a)",
    "canonicalName": "Biomédico",
    "slug": "biomedicina",
    "boardLabel": "CRBM"
  },
  {
    "id": "prof-farmacia",
    "label": "Farmacêutico(a)",
    "canonicalName": "Farmacêutico",
    "slug": "farmacia",
    "boardLabel": "CRF"
  },
  {
    "id": "prof-servico-social",
    "label": "Assistente Social",
    "canonicalName": "Assistente Social",
    "slug": "servico-social",
    "boardLabel": "CRESS"
  },
  {
    "id": "prof-acupuntura",
    "label": "Acupunturista",
    "canonicalName": "Acupunturista",
    "slug": "acupuntura",
    "boardLabel": "Registro"
  },
  {
    "id": "prof-osteopata",
    "label": "Osteopata",
    "canonicalName": "Osteopata",
    "slug": "osteopata",
    "boardLabel": "Registro"
  },
  {
    "id": "prof-quiropraxista",
    "label": "Quiropraxista",
    "canonicalName": "Quiropraxista",
    "slug": "quiropraxista",
    "boardLabel": "ABQ"
  },
  {
    "id": "prof-podologia",
    "label": "Podólogo(a)",
    "canonicalName": "Podólogo",
    "slug": "podologia",
    "boardLabel": "Registro"
  },
  {
    "id": "prof-musicoterapia",
    "label": "Musicoterapeuta",
    "canonicalName": "Musicoterapeuta",
    "slug": "musicoterapia",
    "boardLabel": "UBAM"
  },
  {
    "id": "prof-arteterapia",
    "label": "Arteterapeuta",
    "canonicalName": "Arteterapeuta",
    "slug": "arteterapia",
    "boardLabel": "UBAAT"
  },
  {
    "id": "prof-doula",
    "label": "Doula / Consultora de Amamentação",
    "canonicalName": "Doula / Consultora de Amamentação",
    "slug": "doula",
    "boardLabel": "Certificação"
  },
  {
    "id": "prof-instrutor-pilates",
    "label": "Instrutor(a) de Pilates",
    "canonicalName": "Instrutor de Pilates",
    "slug": "instrutor-pilates",
    "boardLabel": "Certificação"
  },
  {
    "id": "prof-outro-saude",
    "label": "Outro profissional da saúde",
    "canonicalName": "Outro profissional da saúde",
    "boardLabel": "Conselho/Registro",
    "slug": "outro-profissional-da-saude"
  },
  {
    "id": "prof-outro",
    "label": "Outro profissional",
    "canonicalName": "Outro Profissional",
    "boardLabel": "Registro",
    "slug": "outro"
  }
];

export const REGISTRATION_PROFESSIONS: RegistrationProfessionOption[] = OPTIONS.map(option => {
  const resolution = resolveCanonicalProfession({
    id: option.id,
    name: option.canonicalName,
    slug: option.slug,
    registrationType: option.boardLabel
  });
  const module = resolution.commercialModule;
  const isHealthSupport = resolution.taxonomyCategory === 'HEALTH_SUPPORT';
  const modules = module 
    ? [module, 'ZemdaBody'] 
    : (isHealthSupport ? ['Atendimento Geral', 'ZemdaBody'] : ['Gestão Operacional']);
  const accessLabel = modules.join(' + ');
  return {
    ...option,
    canonicalId: resolution.canonicalId,
    canonicalName: resolution.canonicalName,
    ...(module ? { module } : {}),
    modules,
    accessLabel,
    displayOption: option.label + ' — ' + accessLabel,
    clinicalWorkspace: resolution.clinicalWorkspace,
    taxonomyCategory: resolution.taxonomyCategory,
    isSpecificAlias: resolution.isSpecificAlias
  };
});
