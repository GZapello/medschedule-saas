export interface ProfessionItem {
  id: string;
  label: string;
  category: string;
  defaultDurationMinutes?: number;
  bufferMinutes?: number;
}

export interface ProfessionCategory {
  id: string;
  name: string;
  icon: string;
  professions: ProfessionItem[];
}

export const PROFESSION_CATEGORIES: ProfessionCategory[] = [
  {
    id: 'health_wellness',
    name: 'Saúde e Bem-estar',
    icon: 'Stethoscope',
    professions: [
      { id: 'med_general', label: 'Médico(a) - Todas as Especialidades', category: 'health_wellness', defaultDurationMinutes: 30, bufferMinutes: 0 },
      { id: 'psychology', label: 'Psicólogo(a) / Psicoterapeuta', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
      { id: 'speech_therapy', label: 'Fonoaudiólogo(a)', category: 'health_wellness', defaultDurationMinutes: 40, bufferMinutes: 5 },
      { id: 'nutrition', label: 'Nutricionista', category: 'health_wellness', defaultDurationMinutes: 45, bufferMinutes: 5 },
      { id: 'physiotherapy', label: 'Fisioterapeuta', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 5 },
      { id: 'dentistry', label: 'Odontologista / Dentista', category: 'health_wellness', defaultDurationMinutes: 45, bufferMinutes: 10 },
      { id: 'occupational_therapy', label: 'Terapeuta Ocupacional', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
      { id: 'acupuncture', label: 'Acupunturista', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
      { id: 'psychoanalysis', label: 'Psicanalista', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 }
    ]
  },
  {
    id: 'law_business',
    name: 'Direito e Negócios',
    icon: 'Briefcase',
    professions: [
      { id: 'lawyer', label: 'Advogado(a)', category: 'law_business', defaultDurationMinutes: 60, bufferMinutes: 10 },
      { id: 'financial_consultant', label: 'Consultor(a) Financeiro(a)', category: 'law_business', defaultDurationMinutes: 60, bufferMinutes: 0 },
      { id: 'accountant', label: 'Contador(a)', category: 'law_business', defaultDurationMinutes: 45, bufferMinutes: 0 },
      { id: 'real_estate_agent', label: 'Corretor(a) de Imóveis', category: 'law_business', defaultDurationMinutes: 60, bufferMinutes: 15 },
      { id: 'startup_mentor', label: 'Mentor(a) de Startups / Negócios', category: 'law_business', defaultDurationMinutes: 60, bufferMinutes: 10 }
    ]
  },
  {
    id: 'beauty_aesthetics',
    name: 'Estética e Beleza',
    icon: 'Sparkles',
    professions: [
      { id: 'hairdresser', label: 'Cabeleireiro(a)', category: 'beauty_aesthetics', defaultDurationMinutes: 60, bufferMinutes: 10 },
      { id: 'barber', label: 'Barbeiro(a)', category: 'beauty_aesthetics', defaultDurationMinutes: 40, bufferMinutes: 5 },
      { id: 'manicure_pedicure', label: 'Manicure / Pedicure', category: 'beauty_aesthetics', defaultDurationMinutes: 50, bufferMinutes: 5 },
      { id: 'esthetician', label: 'Esteticista', category: 'beauty_aesthetics', defaultDurationMinutes: 60, bufferMinutes: 10 },
      { id: 'makeup_artist', label: 'Maquiador(a)', category: 'beauty_aesthetics', defaultDurationMinutes: 60, bufferMinutes: 10 },
      { id: 'eyebrow_designer', label: 'Designer de Sobrancelha', category: 'beauty_aesthetics', defaultDurationMinutes: 30, bufferMinutes: 5 }
    ]
  },
  {
    id: 'education',
    name: 'Educação',
    icon: 'GraduationCap',
    professions: [
      { id: 'private_teacher', label: 'Professor(a) Particular', category: 'education', defaultDurationMinutes: 60, bufferMinutes: 10 },
      { id: 'tutor', label: 'Tutor(a) Acadêmico(a)', category: 'education', defaultDurationMinutes: 50, bufferMinutes: 10 },
      { id: 'language_instructor', label: 'Instrutor(a) de Idiomas', category: 'education', defaultDurationMinutes: 60, bufferMinutes: 5 },
      { id: 'personal_trainer', label: 'Personal Trainer', category: 'education', defaultDurationMinutes: 60, bufferMinutes: 10 }
    ]
  },
  {
    id: 'pets',
    name: 'Pets',
    icon: 'PawPrint',
    professions: [
      { id: 'veterinarian', label: 'Médico(a) Veterinário(a)', category: 'pets', defaultDurationMinutes: 40, bufferMinutes: 10 },
      { id: 'dog_trainer', label: 'Adestrador(a) Comportamental', category: 'pets', defaultDurationMinutes: 60, bufferMinutes: 15 },
      { id: 'pet_groomer', label: 'Especialista em Banho e Tosa', category: 'pets', defaultDurationMinutes: 60, bufferMinutes: 10 }
    ]
  },
  {
    id: 'technical_residential',
    name: 'Serviços Residenciais e Técnicos',
    icon: 'Wrench',
    professions: [
      { id: 'electrician', label: 'Eletricista', category: 'technical_residential', defaultDurationMinutes: 90, bufferMinutes: 30 },
      { id: 'plumber', label: 'Encanador(a)', category: 'technical_residential', defaultDurationMinutes: 90, bufferMinutes: 30 },
      { id: 'it_technician', label: 'Técnico(a) de Informática / Suporte', category: 'technical_residential', defaultDurationMinutes: 60, bufferMinutes: 15 },
      { id: 'personal_organizer', label: 'Personal Organizer', category: 'technical_residential', defaultDurationMinutes: 120, bufferMinutes: 30 }
    ]
  }
];

export function findProfessionById(id: string): ProfessionItem | undefined {
  for (const cat of PROFESSION_CATEGORIES) {
    const item = cat.professions.find(p => p.id === id);
    if (item) return item;
  }
  return undefined;
}

export interface RegistrationProfessionOption {
  id: string;
  label: string;
  boardLabel?: string;
  module?: string;
  slug?: string;
}

export const REGISTRATION_PROFESSIONS: RegistrationProfessionOption[] = [
  { id: 'prof-fonoaudiologo', label: 'Fonoaudiólogo(a)', boardLabel: 'CRFa', module: 'ZemdaFono', slug: 'fonoaudiologo' },
  { id: 'prof-fisioterapeuta', label: 'Fisioterapeuta', boardLabel: 'CREFITO', module: 'ZemdaFisio', slug: 'fisioterapeuta' },
  { id: 'prof-psicologo', label: 'Psicólogo(a)', boardLabel: 'CRP', module: 'ZemdaPsico', slug: 'psicologo' },
  { id: 'prof-nutricionista', label: 'Nutricionista', boardLabel: 'CRN', module: 'ZemdaNutri', slug: 'nutricionista' },
  { id: 'prof-terapeuta-ocupacional', label: 'Terapeuta Ocupacional', boardLabel: 'CREFITO', module: 'ZemdaTO', slug: 'terapeuta-ocupacional' },
  { id: 'prof-dentista', label: 'Dentista', boardLabel: 'CRO', module: 'ZemdaOdonto', slug: 'dentista' },
  { id: 'prof-personal-trainer', label: 'Personal Trainer', boardLabel: 'CREF', module: 'ZemdaPersonal', slug: 'personal-trainer' },
  { id: 'prof-psicopedagogo', label: 'Psicopedagogo(a)', boardLabel: 'ABPp', module: 'ZemdaPP', slug: 'psicopedagogo' },
  { id: 'prof-medico', label: 'Médico(a)', boardLabel: 'CRM', slug: 'medico' },
  { id: 'other_health', label: 'Outra profissão da saúde', boardLabel: 'Conselho/Registro', slug: 'outra-profissao-da-saude' }
];
