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

export interface CanonicalProfessionResolution {
  canonicalId: string;
  canonicalName: string;
  commercialModule: ZemdaModule | null;
  flags: ModuleFlags;
  inferredAreaId?: string;
  inferredAreaName?: string;
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

  // 1. Psicopedagogia (Verificado antes de Psicologia para evitar colisão com "psico")
  if (
    pId === 'prof-psicopedagogo' ||
    pId === 'prof-psicopedagogia' ||
    pSlug === 'psicopedagogo' ||
    pSlug === 'psicopedagogia' ||
    combined.includes('psicopedag') ||
    regType === 'ABPP'
  ) {
    return {
      canonicalId: 'prof-psicopedagogo',
      canonicalName: 'Psicopedagogo',
      commercialModule: 'ZemdaPP',
      boardLabel: 'ABPp',
      inferredAreaId: 'pa-pp-clinica',
      inferredAreaName: 'Psicopedagogia Clínica',
      flags: makeFlags('ZemdaPP')
    };
  }

  // 2. Personal Trainer / Educação Física (Verificado com prioridade para cobrir todos os aliases)
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
    return {
      canonicalId: 'prof-personal-trainer',
      canonicalName: 'Personal Trainer / Profissional de Educação Física',
      commercialModule: 'ZemdaPersonal',
      boardLabel: 'CREF',
      inferredAreaId: 'pa-personal-musculacao',
      inferredAreaName: 'Musculação & Hipertrofia',
      flags: makeFlags('ZemdaPersonal')
    };
  }

  // 3. Medicina Geral e Subespecialidades Médicas (Aliases médicos)
  if (
    pId === 'prof-medico' ||
    pId === 'prof-medicina' ||
    pId === 'prof-cardiologista' ||
    pId === 'prof-dermatologista' ||
    pId === 'prof-pediatra' ||
    pId === 'prof-psiquiatra' ||
    pId === 'prof-neurologista' ||
    pId === 'prof-geriatra' ||
    pId === 'prof-ortopedista' ||
    pId === 'prof-endocrinologista' ||
    pId === 'prof-reumatologista' ||
    pSlug === 'medico' ||
    pSlug === 'medicina' ||
    pSlug === 'cardiologista' ||
    pSlug === 'dermatologista' ||
    pSlug === 'pediatra' ||
    pSlug === 'psiquiatra' ||
    pSlug === 'neurologista' ||
    pSlug === 'geriatra' ||
    pSlug === 'ortopedista' ||
    pSlug === 'endocrinologista' ||
    pSlug === 'reumatologista' ||
    combined.includes('médic') ||
    combined.includes('medic') ||
    combined.includes('cardiolog') ||
    combined.includes('dermatolog') ||
    combined.includes('pediatr') ||
    combined.includes('psiquiatr') ||
    combined.includes('neurolog') ||
    combined.includes('geriatr') ||
    combined.includes('ortoped') ||
    combined.includes('endocrin') ||
    combined.includes('reumatolog') ||
    regType === 'CRM'
  ) {
    let inferredAreaId = 'pa-med-clinica';
    let inferredAreaName = 'Clínica Médica';

    if (pId === 'prof-psiquiatra' || combined.includes('psiquiatr')) {
      inferredAreaId = 'pa-med-psiquiatria';
      inferredAreaName = 'Psiquiatria';
    } else if (pId === 'prof-cardiologista' || combined.includes('cardiolog')) {
      inferredAreaId = 'pa-med-cardio';
      inferredAreaName = 'Cardiologia';
    } else if (pId === 'prof-dermatologista' || combined.includes('dermatolog')) {
      inferredAreaId = 'pa-med-dermato';
      inferredAreaName = 'Dermatologia';
    } else if (pId === 'prof-pediatra' || combined.includes('pediatr')) {
      inferredAreaId = 'pa-med-pediatria';
      inferredAreaName = 'Pediatria';
    } else if (pId === 'prof-neurologista' || combined.includes('neurolog')) {
      inferredAreaId = 'pa-med-neuro';
      inferredAreaName = 'Neurologia';
    } else if (pId === 'prof-geriatra' || combined.includes('geriatr')) {
      inferredAreaId = 'pa-med-geriatria';
      inferredAreaName = 'Geriatria';
    } else if (pId === 'prof-endocrinologista' || combined.includes('endocrin')) {
      inferredAreaId = 'pa-med-endocrino';
      inferredAreaName = 'Endocrinologia';
    } else if (pId === 'prof-ortopedista' || combined.includes('ortoped')) {
      inferredAreaId = 'pa-med-ortopedia';
      inferredAreaName = 'Ortopedia e Traumatologia';
    } else if (pId === 'prof-reumatologista' || combined.includes('reumatolog')) {
      inferredAreaId = 'pa-med-reumato';
      inferredAreaName = 'Reumatologia';
    }

    return {
      canonicalId: 'prof-medico',
      canonicalName: 'Médico',
      commercialModule: 'ZemdaMed',
      boardLabel: 'CRM',
      inferredAreaId,
      inferredAreaName,
      flags: makeFlags('ZemdaMed')
    };
  }

  // 4. Psicologia Clínica e Subespecialidades
  if (
    pId === 'prof-psicologo' ||
    pId === 'prof-psicologia' ||
    pId === 'prof-neuropsicologo' ||
    pId === 'prof-psicanalista' ||
    pId === 'prof-terapeuta-familiar' ||
    pSlug === 'psicologo' ||
    pSlug === 'psicologia' ||
    pSlug === 'neuropsicologo' ||
    pSlug === 'psicanalista' ||
    pSlug === 'terapeuta-familiar' ||
    combined.includes('psicólog') ||
    combined.includes('psicolog') ||
    combined.includes('neuropsicól') ||
    combined.includes('neuropsicol') ||
    combined.includes('psicanal') ||
    regType === 'CRP'
  ) {
    let inferredAreaId = 'pa-psico-clinica';
    let inferredAreaName = 'Psicologia Clínica';
    if (pId === 'prof-neuropsicologo' || combined.includes('neuropsic')) {
      inferredAreaId = 'pa-psico-neuro';
      inferredAreaName = 'Neuropsicologia';
    } else if (pId === 'prof-psicanalista' || combined.includes('psicanal')) {
      inferredAreaId = 'pa-psico-psicanalise';
      inferredAreaName = 'Psicanálise';
    }

    return {
      canonicalId: 'prof-psicologo',
      canonicalName: 'Psicólogo',
      commercialModule: 'ZemdaPsico',
      boardLabel: 'CRP',
      inferredAreaId,
      inferredAreaName,
      flags: makeFlags('ZemdaPsico')
    };
  }

  // 5. Fonoaudiologia
  if (
    pId === 'prof-fonoaudiologo' ||
    pId === 'prof-fonoaudiologia' ||
    pSlug === 'fonoaudiologo' ||
    pSlug === 'fonoaudiologia' ||
    combined.includes('fono') ||
    regType === 'CRFA'
  ) {
    return {
      canonicalId: 'prof-fonoaudiologo',
      canonicalName: 'Fonoaudiólogo',
      commercialModule: 'ZemdaFono',
      boardLabel: 'CRFa',
      inferredAreaId: 'pa-fono-linguagem',
      inferredAreaName: 'Linguagem',
      flags: makeFlags('ZemdaFono')
    };
  }

  // 6. Terapia Ocupacional
  if (
    pId === 'prof-terapeuta-ocupacional' ||
    pId === 'prof-terapia-ocupacional' ||
    pSlug === 'terapeuta-ocupacional' ||
    pSlug === 'terapia-ocupacional' ||
    combined.includes('ocupacional') ||
    combined.includes('terapia ocupacional') ||
    combined.includes('terapeuta ocupacional')
  ) {
    return {
      canonicalId: 'prof-terapeuta-ocupacional',
      canonicalName: 'Terapeuta Ocupacional',
      commercialModule: 'ZemdaTO',
      boardLabel: 'CREFITO',
      inferredAreaId: 'pa-to-pediatria',
      inferredAreaName: 'Pediatria',
      flags: makeFlags('ZemdaTO')
    };
  }

  // 7. Nutrição
  if (
    pId === 'prof-nutricionista' ||
    pId === 'prof-nutricao' ||
    pSlug === 'nutricionista' ||
    pSlug === 'nutricao' ||
    combined.includes('nutri') ||
    regType === 'CRN'
  ) {
    return {
      canonicalId: 'prof-nutricionista',
      canonicalName: 'Nutricionista',
      commercialModule: 'ZemdaNutri',
      boardLabel: 'CRN',
      inferredAreaId: 'pa-nutri-clinica',
      inferredAreaName: 'Nutrição Clínica',
      flags: makeFlags('ZemdaNutri')
    };
  }

  // 8. Fisioterapia e abordagens corporais
  if (
    pId === 'prof-fisioterapeuta' ||
    pId === 'prof-fisioterapia' ||
    pId === 'prof-osteopata' ||
    pId === 'prof-quiropraxista' ||
    pSlug === 'fisioterapeuta' ||
    pSlug === 'fisioterapia' ||
    pSlug === 'osteopata' ||
    pSlug === 'quiropraxista' ||
    combined.includes('fisio') ||
    combined.includes('physio') ||
    combined.includes('osteopat') ||
    combined.includes('quiroprax')
  ) {
    let inferredAreaId = 'pa-fisio-traumato';
    let inferredAreaName = 'Traumato-Ortopédica';
    if (pId === 'prof-osteopata' || combined.includes('osteopat')) {
      inferredAreaId = 'pa-fisio-osteo';
      inferredAreaName = 'Osteopatia';
    } else if (pId === 'prof-quiropraxista' || combined.includes('quiroprax')) {
      inferredAreaId = 'pa-fisio-quiro';
      inferredAreaName = 'Quiropraxia';
    }

    return {
      canonicalId: 'prof-fisioterapeuta',
      canonicalName: 'Fisioterapeuta',
      commercialModule: 'ZemdaFisio',
      boardLabel: 'CREFITO',
      inferredAreaId,
      inferredAreaName,
      flags: makeFlags('ZemdaFisio')
    };
  }

  // 9. Cirurgião-Dentista / Odontologia
  if (
    pId === 'prof-dentista' ||
    pId === 'prof-cirurgiao-dentista' ||
    pId === 'prof-odontologia' ||
    pSlug === 'dentista' ||
    pSlug === 'cirurgiao-dentista' ||
    pSlug === 'odontologia' ||
    combined.includes('odonto') ||
    combined.includes('dentis') ||
    combined.includes('cirurgi') ||
    regType === 'CRO'
  ) {
    return {
      canonicalId: 'prof-dentista',
      canonicalName: 'Cirurgião-Dentista',
      commercialModule: 'ZemdaOdonto',
      boardLabel: 'CRO',
      inferredAreaId: 'pa-odonto-geral',
      inferredAreaName: 'Clínica Geral',
      flags: makeFlags('ZemdaOdonto')
    };
  }

  // 10. Funções Administrativas / Outros
  if (
    pId === 'prof-administrador' ||
    pId === 'prof-gestor' ||
    pSlug === 'administrador' ||
    combined.includes('administrador') ||
    combined.includes('gestor')
  ) {
    return {
      canonicalId: 'prof-administrador',
      canonicalName: 'Administrador da Clínica',
      commercialModule: null,
      boardLabel: 'CRA',
      flags: makeFlags(null)
    };
  }

  // Fallback seguro: Outro Profissional da Saúde
  return {
    canonicalId: pId || 'prof-outro-saude',
    canonicalName: normInput.name || 'Outro Profissional da Saúde',
    commercialModule: null,
    boardLabel: regType || undefined,
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
