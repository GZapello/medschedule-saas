import { resolveProfessionModule } from '../utils/profession-module';

export interface RegistrationProfessionOption {
  id: string;
  label: string;
  canonicalName: string;
  accessLabel: string;
  displayOption: string;
  boardLabel?: string;
  module?: string;
  modules: string[];
  slug?: string;
  administrative?: boolean;
}

// Existing database aliases are represented once in the public selector.
// Old IDs remain valid; no stored profession or permission is rewritten.
export const REGISTRATION_PROFESSION_ALIASES: Record<string, string> = {
  "prof-cirurgiao-dentista": "prof-dentista",
  "prof-odontologia": "prof-dentista",
  "prof-enfermagem": "prof-enfermeiro",
  "prof-fisioterapia": "prof-fisioterapeuta",
  "prof-fonoaudiologia": "prof-fonoaudiologo",
  "prof-medicina": "prof-medico",
  "prof-medicina-veterinaria": "prof-veterinario",
  "prof-nutricao": "prof-nutricionista",
  "prof-psicologia": "prof-psicologo",
  "prof-psicopedagogia": "prof-psicopedagogo",
  "prof-terapia-ocupacional": "prof-terapeuta-ocupacional",
  "prof-educacao-fisica": "prof-personal-trainer",
  "other_health": "prof-outro-saude",
  "prof-gestor": "prof-administrador"
};

const OPTIONS: Omit<RegistrationProfessionOption, 'module' | 'modules' | 'accessLabel' | 'displayOption'>[] = [
  {
    "id": "prof-fonoaudiologo",
    "label": "Fonoaudiólogo(a)",
    "boardLabel": "CRFa",
    "slug": "fonoaudiologo",
    "canonicalName": "Fonoaudiólogo"
  },
  {
    "id": "prof-fisioterapeuta",
    "label": "Fisioterapeuta",
    "boardLabel": "CREFITO",
    "slug": "fisioterapeuta",
    "canonicalName": "Fisioterapeuta"
  },
  {
    "id": "prof-psicologo",
    "label": "Psicólogo(a)",
    "boardLabel": "CRP",
    "slug": "psicologo",
    "canonicalName": "Psicólogo"
  },
  {
    "id": "prof-nutricionista",
    "label": "Nutricionista",
    "boardLabel": "CRN",
    "slug": "nutricionista",
    "canonicalName": "Nutricionista"
  },
  {
    "id": "prof-terapeuta-ocupacional",
    "label": "Terapeuta Ocupacional",
    "boardLabel": "CREFITO",
    "slug": "terapeuta-ocupacional",
    "canonicalName": "Terapeuta Ocupacional"
  },
  {
    "id": "prof-dentista",
    "label": "Cirurgião-Dentista",
    "boardLabel": "CRO",
    "slug": "cirurgiao-dentista",
    "canonicalName": "Cirurgião-Dentista"
  },
  {
    "id": "prof-personal-trainer",
    "label": "Personal Trainer / Profissional de Educação Física",
    "boardLabel": "CREF",
    "slug": "personal-trainer",
    "canonicalName": "Personal Trainer"
  },
  {
    "id": "prof-psicopedagogo",
    "label": "Psicopedagogo(a)",
    "boardLabel": "ABPp",
    "slug": "psicopedagogo",
    "canonicalName": "Psicopedagogo"
  },
  {
    "id": "prof-medico",
    "label": "Médico(a)",
    "boardLabel": "CRM",
    "slug": "medico",
    "canonicalName": "Médico"
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
    "id": "prof-servico-social",
    "label": "Assistente Social",
    "canonicalName": "Serviço Social",
    "slug": "servico-social",
    "boardLabel": "CRESS"
  },
  {
    "id": "prof-farmacia",
    "label": "Farmacêutico(a)",
    "canonicalName": "Farmácia",
    "slug": "farmacia",
    "boardLabel": "CRF"
  },
  {
    "id": "prof-biomedicina",
    "label": "Biomédico(a)",
    "canonicalName": "Biomedicina",
    "slug": "biomedicina",
    "boardLabel": "CRBM"
  },
  {
    "id": "prof-musicoterapia",
    "label": "Musicoterapeuta",
    "canonicalName": "Musicoterapia",
    "slug": "musicoterapia",
    "boardLabel": "UBAM"
  },
  {
    "id": "prof-arteterapia",
    "label": "Arteterapeuta",
    "canonicalName": "Arteterapia",
    "slug": "arteterapia",
    "boardLabel": "UBAAT"
  },
  {
    "id": "prof-podologia",
    "label": "Podólogo(a)",
    "canonicalName": "Podologia",
    "slug": "podologia",
    "boardLabel": "Registro"
  },
  {
    "id": "prof-acupuntura",
    "label": "Acupunturista",
    "canonicalName": "Acupuntura",
    "slug": "acupuntura",
    "boardLabel": "Registro"
  },
  {
    "id": "prof-veterinario",
    "label": "Médico(a) Veterinário(a)",
    "canonicalName": "Médico Veterinário",
    "slug": "veterinario",
    "boardLabel": "CRMV"
  },
  {
    "id": "prof-administrador",
    "label": "Administrador da Clínica",
    "canonicalName": "Administrador",
    "slug": "administrador",
    "boardLabel": "CRA",
    "administrative": true
  },
  {
    "id": "prof-adestrador",
    "label": "Adestrador / Comportamentalista Animal",
    "canonicalName": "Adestrador / Comportamentalista Animal",
    "slug": "adestrador"
  },
  {
    "id": "prof-advogado",
    "label": "Advogado",
    "canonicalName": "Advogado",
    "slug": "advogado",
    "boardLabel": "OAB"
  },
  {
    "id": "prof-auxiliar-adm",
    "label": "Auxiliar Administrativo",
    "canonicalName": "Auxiliar Administrativo",
    "slug": "auxiliar-administrativo",
    "administrative": true
  },
  {
    "id": "prof-cabeleireiro",
    "label": "Cabeleireiro / Barbeiro",
    "canonicalName": "Cabeleireiro / Barbeiro",
    "slug": "cabeleireiro-barbeiro"
  },
  {
    "id": "prof-cardiologista",
    "label": "Cardiologista",
    "canonicalName": "Cardiologista",
    "slug": "cardiologista",
    "boardLabel": "CRM"
  },
  {
    "id": "prof-coach",
    "label": "Coach / Mentor de Carreira",
    "canonicalName": "Coach / Mentor de Carreira",
    "slug": "coach-mentor"
  },
  {
    "id": "prof-consultor",
    "label": "Consultor Empresarial",
    "canonicalName": "Consultor Empresarial",
    "slug": "consultor"
  },
  {
    "id": "prof-contador",
    "label": "Contador",
    "canonicalName": "Contador",
    "slug": "contador",
    "boardLabel": "CRC"
  },
  {
    "id": "prof-coord-clinica",
    "label": "Coordenação Clínica",
    "canonicalName": "Coordenação Clínica",
    "slug": "coordenacao-clinica",
    "administrative": true
  },
  {
    "id": "prof-dermatologista",
    "label": "Dermatologista",
    "canonicalName": "Dermatologista",
    "slug": "dermatologista",
    "boardLabel": "CRM"
  },
  {
    "id": "prof-direcao-tecnica",
    "label": "Direção Técnica",
    "canonicalName": "Direção Técnica",
    "slug": "direcao-tecnica",
    "administrative": true
  },
  {
    "id": "prof-doula",
    "label": "Doula / Consultora de Amamentação",
    "canonicalName": "Doula / Consultora de Amamentação",
    "slug": "doula",
    "boardLabel": "Certificação"
  },
  {
    "id": "prof-esteticista",
    "label": "Esteticista",
    "canonicalName": "Esteticista",
    "slug": "esteticista",
    "boardLabel": "Registro Técnico"
  },
  {
    "id": "prof-financeiro",
    "label": "Financeiro",
    "canonicalName": "Financeiro",
    "slug": "financeiro",
    "administrative": true
  },
  {
    "id": "prof-instrutor-pilates",
    "label": "Instrutor de Pilates",
    "canonicalName": "Instrutor de Pilates",
    "slug": "instrutor-pilates",
    "boardLabel": "Certificação"
  },
  {
    "id": "prof-lash-designer",
    "label": "Lash Designer / Sobrancelhas",
    "canonicalName": "Lash Designer / Sobrancelhas",
    "slug": "lash-designer"
  },
  {
    "id": "prof-neuropsicologo",
    "label": "Neuropsicólogo",
    "canonicalName": "Neuropsicólogo",
    "slug": "neuropsicologo",
    "boardLabel": "CRP"
  },
  {
    "id": "prof-osteopata",
    "label": "Osteopata",
    "canonicalName": "Osteopata",
    "slug": "osteopata",
    "boardLabel": "Registro"
  },
  {
    "id": "prof-outro",
    "label": "Outro",
    "canonicalName": "Outro",
    "slug": "outro"
  },
  {
    "id": "prof-pediatra",
    "label": "Pediatra",
    "canonicalName": "Pediatra",
    "slug": "pediatra",
    "boardLabel": "CRM"
  },
  {
    "id": "prof-professor-particular",
    "label": "Professor Particular",
    "canonicalName": "Professor Particular",
    "slug": "professor-particular"
  },
  {
    "id": "prof-psicanalista",
    "label": "Psicanalista",
    "canonicalName": "Psicanalista",
    "slug": "psicanalista",
    "boardLabel": "Registro Associação"
  },
  {
    "id": "prof-psiquiatra",
    "label": "Psiquiatra",
    "canonicalName": "Psiquiatra",
    "slug": "psiquiatra",
    "boardLabel": "CRM"
  },
  {
    "id": "prof-quiropraxista",
    "label": "Quiropraxista",
    "canonicalName": "Quiropraxista",
    "slug": "quiropraxista",
    "boardLabel": "ABQ"
  },
  {
    "id": "prof-recepcionista",
    "label": "Recepcionista",
    "canonicalName": "Recepcionista",
    "slug": "recepcionista",
    "administrative": true
  },
  {
    "id": "prof-rh",
    "label": "Recursos Humanos",
    "canonicalName": "Recursos Humanos",
    "slug": "recursos-humanos",
    "administrative": true
  },
  {
    "id": "prof-secretaria",
    "label": "Secretário(a)",
    "canonicalName": "Secretário(a)",
    "slug": "secretaria",
    "administrative": true
  },
  {
    "id": "prof-terapeuta-familiar",
    "label": "Terapeuta Familiar e de Casal",
    "canonicalName": "Terapeuta Familiar e de Casal",
    "slug": "terapeuta-familiar",
    "boardLabel": "Registro"
  },
  {
    "id": "prof-tutor-escolar",
    "label": "Tutor / Mentor de Aprendizagem",
    "canonicalName": "Tutor / Mentor de Aprendizagem",
    "slug": "tutor-escolar"
  },
  {
    "id": "prof-outro-saude",
    "label": "Outro profissional da saúde",
    "canonicalName": "Outro profissional da saúde",
    "boardLabel": "Conselho/Registro",
    "slug": "outro-profissional-da-saude"
  }
];

export const REGISTRATION_PROFESSIONS: RegistrationProfessionOption[] = OPTIONS.map(option => {
  // Descriptive only. The server continues to enforce actual access independently.
  const { module } = resolveProfessionModule({id:option.id, name:option.canonicalName, slug:option.slug, registrationType:option.boardLabel});
  const modules = [module || 'Recursos gerais do Zemda', 'ZemdaBody'];
  const accessLabel = modules.join(' + ');
  return {...option, ...(module ? {module} : {}), modules, accessLabel, displayOption:option.label + ' — ' + accessLabel};
});
