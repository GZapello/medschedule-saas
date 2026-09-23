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

/**
 * Mapeia estritamente uma profissão para o módulo correspondente da plataforma Zemda.
 */
export function resolveProfessionModule(input: ResolveProfessionInput): { module: ZemdaModule | null; flags: ModuleFlags } {
  const pId = (input.id || '').trim().toLowerCase();
  const pName = (input.name || '').trim().toLowerCase();
  const pSlug = (input.slug || '').trim().toLowerCase();
  const regType = (input.registrationType || '').trim().toUpperCase();

  const combined = `${pId} ${pName} ${pSlug}`.toLowerCase();

  let matchedModule: ZemdaModule | null = null;

  // 1. Psicopedagogia (Verificado antes de Psicologia para evitar colisão com "psico")
  if (
    pId === 'prof-psicopedagogo' ||
    pId === 'prof-psicopedagogia' ||
    pSlug === 'psicopedagogo' ||
    pSlug === 'psicopedagogia' ||
    combined.includes('psicopedag') ||
    regType === 'ABPP'
  ) {
    matchedModule = 'ZemdaPP';
  }
  // 2. Psicologia Clínica
  else if (
    pId === 'prof-psicologo' ||
    pId === 'prof-psicologia' ||
    pId === 'prof-neuropsicologo' ||
    pId === 'prof-psicanalista' ||
    pId === 'prof-terapeuta-familiar' ||
    pSlug === 'psicologo' ||
    pSlug === 'psicologia' ||
    pSlug === 'neuropsicologo' ||
    pSlug === 'psicanalista' ||
    combined.includes('psicólog') ||
    combined.includes('psicolog') ||
    combined.includes('neuropsicól') ||
    combined.includes('neuropsicol') ||
    combined.includes('psicanal') ||
    regType === 'CRP'
  ) {
    matchedModule = 'ZemdaPsico';
  }
  // 3. Fonoaudiologia
  else if (
    pId === 'prof-fonoaudiologo' ||
    pId === 'prof-fonoaudiologia' ||
    pSlug === 'fonoaudiologo' ||
    pSlug === 'fonoaudiologia' ||
    combined.includes('fono') ||
    regType === 'CRFA'
  ) {
    matchedModule = 'ZemdaFono';
  }
  // 4. Terapia Ocupacional
  else if (
    pId === 'prof-terapeuta-ocupacional' ||
    pId === 'prof-terapia-ocupacional' ||
    pSlug === 'terapeuta-ocupacional' ||
    pSlug === 'terapia-ocupacional' ||
    combined.includes('ocupacional') ||
    combined.includes('terapia ocupacional') ||
    combined.includes('terapeuta ocupacional')
  ) {
    matchedModule = 'ZemdaTO';
  }
  // 5. Nutrição
  else if (
    pId === 'prof-nutricionista' ||
    pId === 'prof-nutricao' ||
    pSlug === 'nutricionista' ||
    pSlug === 'nutricao' ||
    combined.includes('nutri') ||
    regType === 'CRN'
  ) {
    matchedModule = 'ZemdaNutri';
  }
  // 6. Fisioterapia
  else if (
    pId === 'prof-fisioterapeuta' ||
    pId === 'prof-fisioterapia' ||
    pSlug === 'fisioterapeuta' ||
    pSlug === 'fisioterapia' ||
    combined.includes('fisio') ||
    combined.includes('physio')
  ) {
    matchedModule = 'ZemdaFisio';
  }
  // 7. Cirurgião-Dentista / Odontologia
  else if (
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
    matchedModule = 'ZemdaOdonto';
  }
  // 8. Personal Trainer / Educação Física
  else if (
    pId === 'prof-personal-trainer' ||
    pId === 'prof-educacao-fisica' ||
    pId === 'prof-educador-fisico' ||
    pId === 'personal_trainer' ||
    pSlug === 'personal-trainer' ||
    pSlug === 'educacao-fisica' ||
    combined.includes('personal') ||
    combined.includes('educação física') ||
    combined.includes('educacao fisica') ||
    regType === 'CREF'
  ) {
    matchedModule = 'ZemdaPersonal';
  }
  // 9. Medicina Geral e Especialidades Médicas
  else if (
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
    regType === 'CRM'
  ) {
    matchedModule = 'ZemdaMed';
  }

  // Gera mapa atômico com exclusividade mútua
  const flags: ModuleFlags = {
    zemda_fono_enabled: matchedModule === 'ZemdaFono' ? 1 : 0,
    zemda_to_enabled: matchedModule === 'ZemdaTO' ? 1 : 0,
    zemda_nutri_enabled: matchedModule === 'ZemdaNutri' ? 1 : 0,
    zemda_psico_enabled: matchedModule === 'ZemdaPsico' ? 1 : 0,
    zemda_pp_enabled: matchedModule === 'ZemdaPP' ? 1 : 0,
    zemda_fisio_enabled: matchedModule === 'ZemdaFisio' ? 1 : 0,
    zemda_odonto_enabled: matchedModule === 'ZemdaOdonto' ? 1 : 0,
    zemda_personal_enabled: matchedModule === 'ZemdaPersonal' ? 1 : 0,
    zemda_med_enabled: matchedModule === 'ZemdaMed' ? 1 : 0
  };

  return { module: matchedModule, flags };
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
