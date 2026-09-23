/**
 * Centralizador Único de Resolução: Profissão -> Módulo Clínico Zemda
 * 
 * Regra:
 * A fonte primária de verdade é o profession_id / profession_name do profissional.
 * Apenas UM módulo profissional primário pode estar ativo por vez.
 * ZemdaBody é complementar universal e não concorre com os módulos de nicho.
 */

export type ZemdaModule =
  | 'ZemdaFono'
  | 'ZemdaTO'
  | 'ZemdaNutri'
  | 'ZemdaPsico'
  | 'ZemdaPP'
  | 'ZemdaFisio'
  | 'ZemdaOdonto'
  | 'ZemdaPersonal'
  | 'ZemdaMed';

export interface ModuleFlags {
  zemda_fono_enabled: number;
  zemda_to_enabled: number;
  zemda_nutri_enabled: number;
  zemda_psico_enabled: number;
  zemda_pp_enabled: number;
  zemda_fisio_enabled: number;
  zemda_odonto_enabled: number;
  zemda_personal_enabled: number;
  zemda_med_enabled?: number;
}

export interface ResolveProfessionInput {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  registrationType?: string | null;
}

export type ProfessionTaxonomyCategory =
  | 'CANONICAL'            // Profissão canônica genérica (Médico, Fisioterapeuta, etc.)
  | 'SPECIALTY_ALIAS'      // Título que é uma especialidade direta (Cardiologista, etc.)
  | 'APPROACH_ALIAS'       // Título que é uma abordagem clínica direta (Psicanalista, etc.)
  | 'GENERAL_ALIAS'        // Título sinônimo geral (Medicina, Fisioterapia, etc.)
  | 'HEALTH_SUPPORT'       // Profissão de apoio / outra área de saúde sem módulo clínico dedicado (Enfermeiro, etc.)
  | 'ADMINISTRATIVE'       // Função administrativa / gestão
  | 'NON_CLINICAL';        // Outras áreas não clínicas (Advogado, etc.)

export interface CanonicalProfessionResolution {
  canonicalId: string;
  canonicalName: string;
  commercialModule: ZemdaModule | null;
  flags: ModuleFlags;
  taxonomyCategory: ProfessionTaxonomyCategory;
  isSpecificAlias: boolean;
  inferredAreaId?: string;
  inferredAreaName?: string;
  automaticPracticeAreaId?: string;
  automaticPracticeAreaName?: string;
  boardLabel?: string;
}

/**
 * Resolução Centralizada e Canônica: Alias/Título -> Profissão Canônica + Área + Módulo + Capabilities
 */
export function resolveCanonicalProfession(input: string | ResolveProfessionInput): CanonicalProfessionResolution {
  const normInput: ResolveProfessionInput = typeof input === 'string'
    ? { id: input, name: input, slug: input }
    : (input || {});

  const pId = (normInput.id || '').trim().toLowerCase();
  const pName = (normInput.name || '').trim().toLowerCase();
  const pSlug = (normInput.slug || '').trim().toLowerCase();
  const regType = (normInput.registrationType || '').trim().toUpperCase();

  const combined = `${pId} ${pName} ${pSlug}`.toLowerCase();

  // =========================================================================
  // 1. ÁREAS DE SAÚDE DE APOIO & OUTRAS (Verificadas antes para evitar falsos positivos)
  // =========================================================================

  // 1.1 Biomedicina (DEVE ser verificada antes de Medicina para não colidir com 'medic')
  if (
    pId === 'prof-biomedicina' ||
    pSlug === 'biomedicina' ||
    combined.includes('biomedic') ||
    regType === 'CRBM'
  ) {
    return {
      canonicalId: 'prof-biomedicina',
      canonicalName: 'Biomédico(a)',
      commercialModule: null,
      boardLabel: 'CRBM',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  // 1.2 Medicina Veterinária (DEVE ser verificada antes de Medicina para não colidir com 'médic')
  if (
    pId === 'prof-veterinario' ||
    pId === 'prof-medicina-veterinaria' ||
    pSlug === 'veterinario' ||
    pSlug === 'medicina-veterinaria' ||
    combined.includes('veterin') ||
    regType === 'CRMV'
  ) {
    return {
      canonicalId: 'prof-veterinario',
      canonicalName: 'Médico(a) Veterinário(a)',
      commercialModule: null,
      boardLabel: 'CRMV',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  // 1.3 Enfermagem e Técnico de Enfermagem
  if (
    pId === 'prof-tec-enfermagem' ||
    pSlug === 'tecnico-enfermagem' ||
    combined.includes('tec-enfermagem') ||
    combined.includes('técnico de enfermagem') ||
    combined.includes('tecnico de enfermagem') ||
    combined.includes('tecnico enfermagem')
  ) {
    return {
      canonicalId: 'prof-tec-enfermagem',
      canonicalName: 'Técnico(a) de Enfermagem',
      commercialModule: null,
      boardLabel: 'COREN',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  if (
    pId === 'prof-enfermeiro' ||
    pId === 'prof-enfermagem' ||
    pSlug === 'enfermeiro' ||
    pSlug === 'enfermagem' ||
    combined.includes('enferm') ||
    regType === 'COREN'
  ) {
    return {
      canonicalId: 'prof-enfermeiro',
      canonicalName: 'Enfermeiro(a)',
      commercialModule: null,
      boardLabel: 'COREN',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  // 1.4 Farmácia
  if (
    pId === 'prof-farmacia' ||
    pSlug === 'farmacia' ||
    combined.includes('farmac') ||
    regType === 'CRF'
  ) {
    return {
      canonicalId: 'prof-farmacia',
      canonicalName: 'Farmacêutico(a)',
      commercialModule: null,
      boardLabel: 'CRF',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  // 1.5 Serviço Social
  if (
    pId === 'prof-servico-social' ||
    pSlug === 'servico-social' ||
    combined.includes('serviço social') ||
    combined.includes('servico social') ||
    combined.includes('assistente social') ||
    regType === 'CRESS'
  ) {
    return {
      canonicalId: 'prof-servico-social',
      canonicalName: 'Assistente Social',
      commercialModule: null,
      boardLabel: 'CRESS',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  // 1.6 Terapias Complementares / Apoio
  if (pId === 'prof-musicoterapia' || combined.includes('musicoterap')) {
    return {
      canonicalId: 'prof-musicoterapia',
      canonicalName: 'Musicoterapeuta',
      commercialModule: null,
      boardLabel: 'UBAM',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  if (pId === 'prof-arteterapia' || combined.includes('arteterap')) {
    return {
      canonicalId: 'prof-arteterapia',
      canonicalName: 'Arteterapeuta',
      commercialModule: null,
      boardLabel: 'UBAAT',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  if (pId === 'prof-podologia' || combined.includes('podolog')) {
    return {
      canonicalId: 'prof-podologia',
      canonicalName: 'Podólogo(a)',
      commercialModule: null,
      boardLabel: 'Registro',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  if (pId === 'prof-acupuntura' || combined.includes('acupuntur')) {
    return {
      canonicalId: 'prof-acupuntura',
      canonicalName: 'Acupunturista',
      commercialModule: null,
      boardLabel: 'Registro',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  if (pId === 'prof-esteticista' || combined.includes('esteticist') || combined.includes('estética facial')) {
    return {
      canonicalId: 'prof-esteticista',
      canonicalName: 'Esteticista',
      commercialModule: null,
      boardLabel: 'Registro Técnico',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  if (pId === 'prof-doula' || combined.includes('doula') || combined.includes('amamentação')) {
    return {
      canonicalId: 'prof-doula',
      canonicalName: 'Doula / Consultora de Amamentação',
      commercialModule: null,
      boardLabel: 'Certificação',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  if (pId === 'prof-instrutor-pilates' || combined.includes('pilates')) {
    return {
      canonicalId: 'prof-instrutor-pilates',
      canonicalName: 'Instrutor de Pilates',
      commercialModule: null,
      boardLabel: 'Certificação',
      taxonomyCategory: 'HEALTH_SUPPORT',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  // =========================================================================
  // 2. FUNÇÕES ADMINISTRATIVAS E GESTÃO
  // =========================================================================
  if (
    pId === 'prof-administrador' ||
    pId === 'prof-gestor' ||
    pId === 'prof-auxiliar-adm' ||
    pId === 'prof-recepcionista' ||
    pId === 'prof-secretaria' ||
    pId === 'prof-financeiro' ||
    pId === 'prof-rh' ||
    pId === 'prof-coord-clinica' ||
    pId === 'prof-direcao-tecnica' ||
    pSlug === 'administrador' ||
    pSlug === 'gestor' ||
    pSlug === 'recepcionista' ||
    pSlug === 'secretaria' ||
    pSlug === 'financeiro' ||
    pSlug === 'recursos-humanos' ||
    pSlug === 'coordenacao-clinica' ||
    pSlug === 'direcao-tecnica' ||
    combined.includes('recepcionista') ||
    combined.includes('secretári') ||
    combined.includes('secretari') ||
    combined.includes('financeiro') ||
    combined.includes('recursos humanos') ||
    combined.includes('coordenação clínica') ||
    combined.includes('direção técnica') ||
    combined.includes('auxiliar administrativo')
  ) {
    let name = 'Administrador da Clínica';
    let board = 'CRA';
    if (pId === 'prof-recepcionista' || combined.includes('recepcionista')) {
      name = 'Recepcionista';
      board = undefined as any;
    } else if (pId === 'prof-secretaria' || combined.includes('secretar')) {
      name = 'Secretário(a)';
      board = undefined as any;
    } else if (pId === 'prof-auxiliar-adm' || combined.includes('auxiliar')) {
      name = 'Auxiliar Administrativo';
      board = undefined as any;
    } else if (pId === 'prof-financeiro' || combined.includes('financeiro')) {
      name = 'Financeiro';
      board = undefined as any;
    } else if (pId === 'prof-rh' || combined.includes('recursos humanos')) {
      name = 'Recursos Humanos';
      board = undefined as any;
    } else if (pId === 'prof-coord-clinica' || combined.includes('coordena')) {
      name = 'Coordenação Clínica';
      board = undefined as any;
    } else if (pId === 'prof-direcao-tecnica' || combined.includes('direção') || combined.includes('direcao')) {
      name = 'Direção Técnica';
      board = undefined as any;
    }

    return {
      canonicalId: pId || 'prof-administrador',
      canonicalName: name,
      commercialModule: null,
      boardLabel: board,
      taxonomyCategory: 'ADMINISTRATIVE',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  // =========================================================================
  // 3. ÁREAS NÃO CLÍNICAS (Outros domínios)
  // =========================================================================
  if (
    pId === 'prof-advogado' ||
    pId === 'prof-contador' ||
    pId === 'prof-consultor' ||
    pId === 'prof-coach' ||
    pId === 'prof-cabeleireiro' ||
    pId === 'prof-lash-designer' ||
    pId === 'prof-adestrador' ||
    pId === 'prof-professor-particular' ||
    pId === 'prof-tutor-escolar' ||
    pId === 'prof-outro' ||
    combined.includes('advogad') ||
    combined.includes('contador') ||
    combined.includes('consultor') ||
    combined.includes('coach') ||
    combined.includes('cabeleireir') ||
    combined.includes('barbeiro') ||
    combined.includes('lash') ||
    combined.includes('sobrancelha') ||
    combined.includes('adestrador') ||
    combined.includes('professor particular') ||
    combined.includes('tutor')
  ) {
    let board: string | undefined = undefined;
    if (combined.includes('advogad') || regType === 'OAB') board = 'OAB';
    else if (combined.includes('contador') || regType === 'CRC') board = 'CRC';

    return {
      canonicalId: pId || 'prof-outro',
      canonicalName: normInput.name || 'Outro Profissional',
      commercialModule: null,
      boardLabel: board,
      taxonomyCategory: 'NON_CLINICAL',
      isSpecificAlias: false,
      flags: makeFlags(null)
    };
  }

  // =========================================================================
  // 4. PSICOPEDAGOGIA (Verificado antes de Psicologia para não colidir com 'psico')
  // =========================================================================
  if (
    pId === 'prof-psicopedagogo' ||
    pId === 'prof-psicopedagogia' ||
    pSlug === 'psicopedagogo' ||
    pSlug === 'psicopedagogia' ||
    combined.includes('psicopedag') ||
    regType === 'ABPP'
  ) {
    const isGeneralAlias = pId === 'prof-psicopedagogia' || pSlug === 'psicopedagogia';
    return {
      canonicalId: 'prof-psicopedagogo',
      canonicalName: 'Psicopedagogo',
      commercialModule: 'ZemdaPP',
      boardLabel: 'ABPp',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaPP')
    };
  }

  // =========================================================================
  // 5. PERSONAL TRAINER / EDUCAÇÃO FÍSICA
  // =========================================================================
  if (
    pId === 'prof-personal-trainer' ||
    pId === 'prof-educacao-fisica' ||
    pId === 'prof-educador-fisico' ||
    pId === 'personal_trainer' ||
    pSlug === 'personal-trainer' ||
    pSlug === 'educacao-fisica' ||
    combined.includes('personal') ||
    combined.includes('educação física') ||
    combined.includes('educacao fisica') ||
    combined.includes('educador físico') ||
    combined.includes('educador fisico') ||
    combined.includes('treinamento físico') ||
    combined.includes('musculação') ||
    combined.includes('musculacao') ||
    regType === 'CREF'
  ) {
    const isGeneralAlias = pId === 'prof-educacao-fisica' || pSlug === 'educacao-fisica';
    return {
      canonicalId: 'prof-personal-trainer',
      canonicalName: 'Personal Trainer / Profissional de Educação Física',
      commercialModule: 'ZemdaPersonal',
      boardLabel: 'CREF',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaPersonal')
    };
  }

  // =========================================================================
  // 6. MEDICINA E ESPECIALIDADES MÉDICAS (CRM)
  // =========================================================================
  // A. Aliases de Especialidade Específica
  if (
    pId === 'prof-cardiologista' || pSlug === 'cardiologista' || combined.includes('cardiolog') ||
    pId === 'prof-dermatologista' || pSlug === 'dermatologista' || combined.includes('dermatolog') ||
    pId === 'prof-psiquiatra' || pSlug === 'psiquiatra' || combined.includes('psiquiatr') ||
    pId === 'prof-neurologista' || pSlug === 'neurologista' || combined.includes('neurolog') ||
    pId === 'prof-pediatra' || pSlug === 'pediatra' || combined.includes('pediatr') ||
    pId === 'prof-geriatra' || pSlug === 'geriatra' || combined.includes('geriatr') ||
    pId === 'prof-endocrinologista' || pSlug === 'endocrinologista' || combined.includes('endocrin') ||
    pId === 'prof-ortopedista' || pSlug === 'ortopedista' || combined.includes('ortoped') ||
    pId === 'prof-reumatologista' || pSlug === 'reumatologista' || combined.includes('reumatolog') ||
    pId === 'prof-clinico-geral' || pSlug === 'clinico-geral' || combined.includes('clinico geral') || combined.includes('clínico geral')
  ) {
    let areaId = 'pa-med-clinica';
    let areaName = 'Clínica Médica';

    if (pId === 'prof-cardiologista' || combined.includes('cardiolog')) {
      areaId = 'pa-med-cardio';
      areaName = 'Cardiologia';
    } else if (pId === 'prof-dermatologista' || combined.includes('dermatolog')) {
      areaId = 'pa-med-dermato';
      areaName = 'Dermatologia';
    } else if (pId === 'prof-psiquiatra' || combined.includes('psiquiatr')) {
      areaId = 'pa-med-psiquiatria';
      areaName = 'Psiquiatria';
    } else if (pId === 'prof-neurologista' || combined.includes('neurolog')) {
      areaId = 'pa-med-neuro';
      areaName = 'Neurologia';
    } else if (pId === 'prof-pediatra' || combined.includes('pediatr')) {
      areaId = 'pa-med-pediatria';
      areaName = 'Pediatria';
    } else if (pId === 'prof-geriatra' || combined.includes('geriatr')) {
      areaId = 'pa-med-geriatria';
      areaName = 'Geriatria';
    } else if (pId === 'prof-endocrinologista' || combined.includes('endocrin')) {
      areaId = 'pa-med-endocrino';
      areaName = 'Endocrinologia';
    } else if (pId === 'prof-ortopedista' || combined.includes('ortoped')) {
      areaId = 'pa-med-ortopedia';
      areaName = 'Ortopedia e Traumatologia';
    } else if (pId === 'prof-reumatologista' || combined.includes('reumatolog')) {
      areaId = 'pa-med-reumato';
      areaName = 'Reumatologia';
    } else if (pId === 'prof-clinico-geral' || combined.includes('clinico geral') || combined.includes('clínico geral')) {
      areaId = 'pa-med-clinica';
      areaName = 'Clínica Médica';
    }

    return {
      canonicalId: 'prof-medico',
      canonicalName: 'Médico',
      commercialModule: 'ZemdaMed',
      boardLabel: 'CRM',
      taxonomyCategory: 'SPECIALTY_ALIAS',
      isSpecificAlias: true,
      inferredAreaId: areaId,
      inferredAreaName: areaName,
      automaticPracticeAreaId: areaId,
      automaticPracticeAreaName: areaName,
      flags: makeFlags('ZemdaMed')
    };
  }

  // B. Medicina Canônica Genérica (Médico / Medicina)
  if (
    pId === 'prof-medico' ||
    pId === 'prof-medicina' ||
    pSlug === 'medico' ||
    pSlug === 'medicina' ||
    combined.includes('médic') ||
    combined.includes('medic') ||
    regType === 'CRM'
  ) {
    const isGeneralAlias = pId === 'prof-medicina' || pSlug === 'medicina';
    return {
      canonicalId: 'prof-medico',
      canonicalName: 'Médico',
      commercialModule: 'ZemdaMed',
      boardLabel: 'CRM',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaMed')
    };
  }

  // =========================================================================
  // 7. PSICOLOGIA CLÍNICA, ESPECIALIDADES E ABORDAGENS (CRP)
  // =========================================================================
  // A. Aliases de Especialidade ou Abordagem
  if (
    pId === 'prof-neuropsicologo' || pSlug === 'neuropsicologo' || combined.includes('neuropsic') ||
    pId === 'prof-psicanalista' || pSlug === 'psicanalista' || combined.includes('psicanal') ||
    pId === 'prof-terapeuta-familiar' || pSlug === 'terapeuta-familiar' || combined.includes('terapeuta familiar')
  ) {
    let areaId = 'pa-psico-clinica';
    let areaName = 'Psicologia Clínica';
    let category: ProfessionTaxonomyCategory = 'APPROACH_ALIAS';

    if (pId === 'prof-neuropsicologo' || combined.includes('neuropsic')) {
      areaId = 'pa-psico-neuro';
      areaName = 'Neuropsicologia';
      category = 'SPECIALTY_ALIAS';
    } else if (pId === 'prof-psicanalista' || combined.includes('psicanal')) {
      areaId = 'pa-psico-psicanalise';
      areaName = 'Psicanálise';
      category = 'APPROACH_ALIAS';
    } else if (pId === 'prof-terapeuta-familiar' || combined.includes('terapeuta familiar')) {
      areaId = 'pa-psico-outro';
      areaName = 'Terapia Familiar e de Casal';
      category = 'APPROACH_ALIAS';
    }

    return {
      canonicalId: 'prof-psicologo',
      canonicalName: 'Psicólogo',
      commercialModule: 'ZemdaPsico',
      boardLabel: 'CRP',
      taxonomyCategory: category,
      isSpecificAlias: true,
      inferredAreaId: areaId,
      inferredAreaName: areaName,
      automaticPracticeAreaId: areaId,
      automaticPracticeAreaName: areaName,
      flags: makeFlags('ZemdaPsico')
    };
  }

  // B. Psicologia Canônica Genérica
  if (
    pId === 'prof-psicologo' ||
    pId === 'prof-psicologia' ||
    pSlug === 'psicologo' ||
    pSlug === 'psicologia' ||
    combined.includes('psicólog') ||
    combined.includes('psicolog') ||
    regType === 'CRP'
  ) {
    const isGeneralAlias = pId === 'prof-psicologia' || pSlug === 'psicologia';
    return {
      canonicalId: 'prof-psicologo',
      canonicalName: 'Psicólogo',
      commercialModule: 'ZemdaPsico',
      boardLabel: 'CRP',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaPsico')
    };
  }

  // =========================================================================
  // 8. FONOAUDIOLOGIA (CRFa)
  // =========================================================================
  if (
    pId === 'prof-fonoaudiologo' ||
    pId === 'prof-fonoaudiologia' ||
    pSlug === 'fonoaudiologo' ||
    pSlug === 'fonoaudiologia' ||
    combined.includes('fono') ||
    regType === 'CRFA'
  ) {
    const isGeneralAlias = pId === 'prof-fonoaudiologia' || pSlug === 'fonoaudiologia';
    return {
      canonicalId: 'prof-fonoaudiologo',
      canonicalName: 'Fonoaudiólogo',
      commercialModule: 'ZemdaFono',
      boardLabel: 'CRFa',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaFono')
    };
  }

  // =========================================================================
  // 9. TERAPIA OCUPACIONAL (CREFITO)
  // =========================================================================
  if (
    pId === 'prof-terapeuta-ocupacional' ||
    pId === 'prof-terapia-ocupacional' ||
    pSlug === 'terapeuta-ocupacional' ||
    pSlug === 'terapia-ocupacional' ||
    combined.includes('ocupacional') ||
    combined.includes('terapia ocupacional') ||
    combined.includes('terapeuta ocupacional')
  ) {
    const isGeneralAlias = pId === 'prof-terapia-ocupacional' || pSlug === 'terapia-ocupacional';
    return {
      canonicalId: 'prof-terapeuta-ocupacional',
      canonicalName: 'Terapeuta Ocupacional',
      commercialModule: 'ZemdaTO',
      boardLabel: 'CREFITO',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaTO')
    };
  }

  // =========================================================================
  // 10. NUTRIÇÃO (CRN)
  // =========================================================================
  if (
    pId === 'prof-nutricionista' ||
    pId === 'prof-nutricao' ||
    pSlug === 'nutricionista' ||
    pSlug === 'nutricao' ||
    combined.includes('nutri') ||
    regType === 'CRN'
  ) {
    const isGeneralAlias = pId === 'prof-nutricao' || pSlug === 'nutricao';
    return {
      canonicalId: 'prof-nutricionista',
      canonicalName: 'Nutricionista',
      commercialModule: 'ZemdaNutri',
      boardLabel: 'CRN',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaNutri')
    };
  }

  // =========================================================================
  // 11. FISIOTERAPIA E ABORDAGENS CORPORAIS (CREFITO)
  // =========================================================================
  // A. Aliases de Abordagens Específicas
  if (
    pId === 'prof-osteopata' || pSlug === 'osteopata' || combined.includes('osteopat') ||
    pId === 'prof-quiropraxista' || pSlug === 'quiropraxista' || combined.includes('quiroprax')
  ) {
    let areaId = 'pa-fisio-osteo';
    let areaName = 'Osteopatia';
    let board = 'Registro';

    if (pId === 'prof-quiropraxista' || combined.includes('quiroprax')) {
      areaId = 'pa-fisio-quiro';
      areaName = 'Quiropraxia';
      board = 'ABQ';
    }

    return {
      canonicalId: 'prof-fisioterapeuta',
      canonicalName: 'Fisioterapeuta',
      commercialModule: 'ZemdaFisio',
      boardLabel: board,
      taxonomyCategory: 'APPROACH_ALIAS',
      isSpecificAlias: true,
      inferredAreaId: areaId,
      inferredAreaName: areaName,
      automaticPracticeAreaId: areaId,
      automaticPracticeAreaName: areaName,
      flags: makeFlags('ZemdaFisio')
    };
  }

  // B. Fisioterapia Canônica Genérica
  if (
    pId === 'prof-fisioterapeuta' ||
    pId === 'prof-fisioterapia' ||
    pSlug === 'fisioterapeuta' ||
    pSlug === 'fisioterapia' ||
    combined.includes('fisio') ||
    combined.includes('physio')
  ) {
    const isGeneralAlias = pId === 'prof-fisioterapia' || pSlug === 'fisioterapia';
    return {
      canonicalId: 'prof-fisioterapeuta',
      canonicalName: 'Fisioterapeuta',
      commercialModule: 'ZemdaFisio',
      boardLabel: 'CREFITO',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaFisio')
    };
  }

  // =========================================================================
  // 12. CIRURGIÃO-DENTISTA / ODONTOLOGIA (CRO)
  // =========================================================================
  // A. Aliases de Especialidade Odontológica
  if (
    pId === 'prof-ortodontista' || pSlug === 'ortodontista' || combined.includes('ortodont')
  ) {
    return {
      canonicalId: 'prof-dentista',
      canonicalName: 'Cirurgião-Dentista',
      commercialModule: 'ZemdaOdonto',
      boardLabel: 'CRO',
      taxonomyCategory: 'SPECIALTY_ALIAS',
      isSpecificAlias: true,
      inferredAreaId: 'pa-odonto-orto',
      inferredAreaName: 'Ortodontia',
      automaticPracticeAreaId: 'pa-odonto-orto',
      automaticPracticeAreaName: 'Ortodontia',
      flags: makeFlags('ZemdaOdonto')
    };
  }

  // B. Odontologia Canônica Genérica
  if (
    pId === 'prof-dentista' ||
    pId === 'prof-cirurgiao-dentista' ||
    pId === 'prof-odontologia' ||
    pSlug === 'dentista' ||
    pSlug === 'cirurgiao-dentista' ||
    pSlug === 'odontologia' ||
    combined.includes('odonto') ||
    combined.includes('dentis') ||
    regType === 'CRO'
  ) {
    const isGeneralAlias = pId === 'prof-odontologia' || pSlug === 'odontologia';
    return {
      canonicalId: 'prof-dentista',
      canonicalName: 'Cirurgião-Dentista',
      commercialModule: 'ZemdaOdonto',
      boardLabel: 'CRO',
      taxonomyCategory: isGeneralAlias ? 'GENERAL_ALIAS' : 'CANONICAL',
      isSpecificAlias: false,
      flags: makeFlags('ZemdaOdonto')
    };
  }

  // =========================================================================
  // 13. FALLBACK SEGURO: OUTRO PROFISSIONAL DA SAÚDE
  // =========================================================================
  return {
    canonicalId: pId || 'prof-outro-saude',
    canonicalName: normInput.name || 'Outro Profissional da Saúde',
    commercialModule: null,
    boardLabel: regType || 'Conselho/Registro',
    taxonomyCategory: 'HEALTH_SUPPORT',
    isSpecificAlias: false,
    flags: makeFlags(null)
  };
}

function makeFlags(target: ZemdaModule | null): ModuleFlags {
  return {
    zemda_fono_enabled: target === 'ZemdaFono' ? 1 : 0,
    zemda_to_enabled: target === 'ZemdaTO' ? 1 : 0,
    zemda_nutri_enabled: target === 'ZemdaNutri' ? 1 : 0,
    zemda_psico_enabled: target === 'ZemdaPsico' ? 1 : 0,
    zemda_pp_enabled: target === 'ZemdaPP' ? 1 : 0,
    zemda_fisio_enabled: target === 'ZemdaFisio' ? 1 : 0,
    zemda_odonto_enabled: target === 'ZemdaOdonto' ? 1 : 0,
    zemda_personal_enabled: target === 'ZemdaPersonal' ? 1 : 0,
    zemda_med_enabled: target === 'ZemdaMed' ? 1 : 0
  };
}

/**
 * Mapeia estritamente uma profissão para o módulo correspondente da plataforma Zemda.
 */
export function resolveProfessionModule(input: ResolveProfessionInput): { module: ZemdaModule | null; flags: ModuleFlags } {
  const resolution = resolveCanonicalProfession(input);
  return { module: resolution.commercialModule, flags: resolution.flags };
}

/**
 * Remove menções a profissões incompatíveis de practice_areas antigas
 * para que não contaminem ou restaurem acessos residuais após a troca.
 */
export function cleanPracticeAreasForNewProfession(newProfessionId: string, currentPracticeAreas?: string | null): string | null {
  if (!currentPracticeAreas || !currentPracticeAreas.trim()) return null;

  const target = resolveProfessionModule({ id: newProfessionId }).module;
  const rawAreas = currentPracticeAreas.split(/[,;\n]+/).map(a => a.trim()).filter(Boolean);

  const keywordsByModule: Record<ZemdaModule, string[]> = {
    ZemdaFono: ['fono', 'audiologia', 'linguagem', 'voz', 'motricidade orofacial', 'disfagia'],
    ZemdaTO: ['ocupacional', 'integração sensorial', 'avd', 'reabilitação física'],
    ZemdaNutri: ['nutri', 'dieta', 'alimentar', 'emagrecimento', 'clínica e funcional'],
    ZemdaPsico: ['psicolog', 'psicólog', 'tcc', 'psicanálise', 'terapia', 'psicoterapia'],
    ZemdaPP: ['psicopedag', 'aprendizagem', 'dificuldades escolares'],
    ZemdaFisio: ['fisio', 'reabilitação', 'ortopedia', 'traumatologia', 'pilates'],
    ZemdaOdonto: ['odonto', 'dentis', 'clareamento', 'ortodontia', 'endodontia', 'implante'],
    ZemdaPersonal: ['personal', 'personal trainer', 'musculação', 'treinamento', 'condicionamento físico'],
    ZemdaMed: ['médic', 'medic', 'clínica médica', 'prescrição', 'soap', 'cid', 'neurologia', 'psiquiatria', 'pediatria', 'cardiologia', 'dermatologia']
  };

  const filtered = rawAreas.filter(area => {
    const lower = area.toLowerCase();
    // Se a área menciona uma palavra-chave de OUTRO módulo que não o target, descarta
    for (const [mod, words] of Object.entries(keywordsByModule) as [ZemdaModule, string[]][]) {
      if (mod !== target) {
        if (words.some(w => lower.includes(w))) {
          return false;
        }
      }
    }
    return true;
  });

  return filtered.length > 0 ? filtered.join(', ') : null;
}
