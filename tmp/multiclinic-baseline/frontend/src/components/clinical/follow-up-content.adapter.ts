/**
 * follow-up-content.adapter.ts
 * 
 * Adapter canônico para geração e adaptação do Documento de Acompanhamento do Paciente.
 * Traduz dados clínicos estruturados de cada módulo/profissão para orientações práticas,
 * garantindo conformidade com a taxonomia do Zemda e sigilo de anotações internas.
 * 
 * Diretrizes de Segurança Clínica:
 * - NUNCA expor no documento do paciente:
 *   1. Anotações internas, hipóteses diagnósticas não finalizadas ou SOAP bruto
 *   2. Custos, preços, lotes, estoque ou validades
 *   3. Técnicas cirúrgicas invasivas confidenciais
 *   4. Anotações de sessões de psicologia ou testes psicológicos restritos
 */

import { ApiClient } from '../../api/client';

export interface FollowUpContentInput {
  moduleType?: string;
  professionId?: string;
  practiceAreaIds?: string[];
  capabilities?: string[];
  moduleData?: any;
  clinicalEvolution?: string;
  technicalNotes?: string;
  currentUser?: any;
  // Overrides diretos vindos de props ou formulários
  initialGuidelines?: string;
  mealPlanText?: string;
  homeExercisesText?: string;
  homeActivitiesText?: string;
  nextAppointmentNote?: string;
  serviceName?: string;
}

export interface FollowUpContentOutput {
  documentTitle: string;
  documentSubtitle: string;
  generalGuidelines: string;
  mealPlanText?: string;
  homeExercisesText?: string;
  homeActivitiesText?: string;
  nextAppointmentNote?: string;
  moduleBadge?: string;
}

/**
 * Formata data ISO ou string YYYY-MM-DD para o padrão brasileiro DD/MM/AAAA (com hora opcional)
 */
export function formatFollowUpDate(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';

  // Se já estiver formatado como DD/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
    return trimmed;
  }

  // Se for YYYY-MM-DD puro sem horário (ex: 2026-10-25)
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    return `${day}/${month}/${year}`;
  }

  // Se for ISO ou com horário
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) {
    return trimmed;
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  // Verifica se possui horário relevante (diferente de 00:00:00 UTC puro)
  if (trimmed.includes('T') && !trimmed.endsWith('T00:00:00.000Z') && !trimmed.endsWith('T00:00:00Z')) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    if (hours !== '00' || minutes !== '00') {
      return `${day}/${month}/${year} às ${hours}:${minutes}`;
    }
  }

  return `${day}/${month}/${year}`;
}

/**
 * Higieniza texto removendo termos técnicos ou confidenciais caso tenham sido inseridos
 */
export function sanitizePatientFollowUpText(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\[(?:SIGILOSO|INTERNO|SOAP|HIPÓTESE|DIAGNÓSTICO|CONFIDENCIAL)\]/gi, '')
    .trim();
}

/**
 * Construtor canônico do conteúdo de acompanhamento do paciente
 */
export function buildPatientFollowUpContent(input: FollowUpContentInput): FollowUpContentOutput {
  const {
    moduleType,
    professionId: rawProfId,
    practiceAreaIds = [],
    capabilities = [],
    moduleData,
    initialGuidelines,
    mealPlanText,
    homeExercisesText,
    homeActivitiesText,
    nextAppointmentNote,
    serviceName = '',
    currentUser
  } = input;

  const profId = (
    rawProfId ||
    currentUser?.canonicalProfessionId ||
    currentUser?.professionId ||
    ''
  ).toLowerCase();

  const isEsteticModule =
    moduleType === 'ZemdaEstetic' ||
    practiceAreaIds.some(pa =>
      ['pa-odonto-estetica', 'pa-estet-facial', 'pa-estet-corporal', 'pa-estet-capilar', 'pa-biomed-estetica', 'pa-farm-estetica'].includes(pa)
    ) ||
    capabilities.some(c => c.startsWith('ESTETIC_')) ||
    ['prof-esteticista', 'prof-biomedicina', 'prof-farmacia'].includes(profId);

  const isNutriModule = moduleType === 'ZemdaNutri' || profId === 'prof-nutricionista';
  const isPhysioModule = moduleType === 'ZemdaFisio' || profId === 'prof-fisioterapeuta';
  const isSpeechModule = moduleType === 'ZemdaFono' || profId === 'prof-fonoaudiologo';
  const isTOModule = moduleType === 'ZemdaTO' || profId === 'prof-terapeuta-ocupacional';
  const isPersonalModule = moduleType === 'ZemdaPersonal' || profId === 'prof-personal-trainer';
  const isOdontoModule = moduleType === 'ZemdaOdonto' || profId === 'prof-dentista';
  const isDoctorModule = moduleType === 'ZemdaMed' || profId === 'prof-medico';
  const isPsicoModule = moduleType === 'ZemdaPsico' || profId === 'prof-psicologo';
  const isPPModule = moduleType === 'ZemdaPP' || profId === 'prof-psicopedagogo';

  // 1. ZEMDAESTETIC (Estética / HOF)
  if (isEsteticModule) {
    let extractedPostInstructions = '';
    let extractedScheduledReturn = '';

    if (moduleData) {
      // Extrai procedureForm.post_instructions
      if (moduleData.procedureForm?.post_instructions) {
        extractedPostInstructions = moduleData.procedureForm.post_instructions;
      } else if (moduleData.post_instructions) {
        extractedPostInstructions = moduleData.post_instructions;
      } else if (moduleData.areas) {
        const activeAreaKey = moduleData.activeArea || Object.keys(moduleData.areas)[0];
        const activeForms = moduleData.areas[activeAreaKey];
        if (activeForms?.procedureForm?.post_instructions) {
          extractedPostInstructions = activeForms.procedureForm.post_instructions;
        }
      }

      // Extrai returnForm
      const returnObj = moduleData.returnForm || (moduleData.areas && moduleData.activeArea ? moduleData.areas[moduleData.activeArea]?.returnForm : null);
      if (returnObj) {
        if (returnObj.scheduled_date) {
          extractedScheduledReturn = formatFollowUpDate(returnObj.scheduled_date);
          if (extractedScheduledReturn) {
            extractedScheduledReturn = `Retorno agendado para ${extractedScheduledReturn}`;
          }
        } else if (returnObj.return_interval) {
          extractedScheduledReturn = `Retorno previsto em ${returnObj.return_interval}`;
        }
      }
    }

    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || extractedPostInstructions || ''
    );

    return {
      documentTitle: 'GUIA DO PACIENTE • CUIDADOS PÓS-PROCEDIMENTO',
      documentSubtitle: 'Orientações e Cuidados Pós-Procedimento Estético',
      generalGuidelines: resolvedGuidelines,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote || extractedScheduledReturn),
      moduleBadge: 'ZemdaEstetic'
    };
  }

  // 2. ZEMDANUTRI (Nutrição)
  if (isNutriModule) {
    let resolvedMealPlan = mealPlanText || '';
    if (!resolvedMealPlan && moduleData) {
      if (moduleData.planForm?.meals && Array.isArray(moduleData.planForm.meals)) {
        resolvedMealPlan = moduleData.planForm.meals
          .map((m: any) => {
            const items = (m.items || []).map((it: any) => `• ${it.food || it.name} (${it.portion || `${it.grams || ''}g`})`).join('\n');
            return `${m.mealName || m.name}:\n${items || '• Conforme orientação'}`;
          })
          .join('\n\n');
      } else if (moduleData.meals && Array.isArray(moduleData.meals)) {
        resolvedMealPlan = moduleData.meals
          .map((m: any) => `${m.name || m.mealName}: ${m.description || ''}`)
          .join('\n');
      }
    }

    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || moduleData?.planForm?.generalGuidelines || moduleData?.generalGuidelines || ''
    );

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Nutricionais e Plano Alimentar',
      generalGuidelines: resolvedGuidelines,
      mealPlanText: resolvedMealPlan || undefined,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaNutri'
    };
  }

  // 3. ZEMDAFISIO (Fisioterapia)
  if (isPhysioModule) {
    const resolvedExercises = homeExercisesText || moduleData?.homeExercisesText || '';
    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || moduleData?.conducts || ''
    );

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Prescrição de Exercícios Domiciliares e Reabilitação',
      generalGuidelines: resolvedGuidelines,
      homeExercisesText: resolvedExercises || undefined,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaFisio'
    };
  }

  // 4. ZEMDAFONO (Fonoaudiologia)
  if (isSpeechModule) {
    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || moduleData?.conducts || moduleData?.consultationConducts || ''
    );

    const resolvedActivities = sanitizePatientFollowUpText(
      homeActivitiesText || moduleData?.treatmentPlanData?.homeSchoolGuidance || moduleData?.homeSchoolGuidance || ''
    );

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Fonoaudiológicas e Treinos Domiciliares',
      generalGuidelines: resolvedGuidelines,
      homeActivitiesText: resolvedActivities || undefined,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaFono'
    };
  }

  // 5. ZEMDATO (Terapia Ocupacional)
  if (isTOModule) {
    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || moduleData?.treatmentPlanData?.familyGuidelines || moduleData?.familyGuidelines || ''
    );

    const resolvedActivities = sanitizePatientFollowUpText(
      homeActivitiesText || moduleData?.treatmentPlanData?.interventions || moduleData?.interventions || ''
    );

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Terapêuticas e Rotina de Autonomia',
      generalGuidelines: resolvedGuidelines,
      homeActivitiesText: resolvedActivities || undefined,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaTO'
    };
  }

  // 6. ZEMDAPERSONAL (Personal Trainer / Educação Física)
  if (isPersonalModule) {
    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || ''
    );
    const resolvedExercises = sanitizePatientFollowUpText(
      homeExercisesText || ''
    );

    return {
      documentTitle: 'GUIA DO ALUNO • ORIENTAÇÕES DE TREINO',
      documentSubtitle: 'Diretrizes de Treinamento, Cuidados e Recuperação',
      generalGuidelines: resolvedGuidelines,
      homeExercisesText: resolvedExercises || undefined,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaPersonal'
    };
  }

  // 7. ZEMDAODONTO (Odontologia)
  if (isOdontoModule) {
    const isServiceAesthetic =
      /harmoniz|est[eé]tic|botox|preenchim|bioestimulador/i.test(serviceName) ||
      practiceAreaIds.includes('pa-odonto-estetica');

    if (isServiceAesthetic) {
      return {
        documentTitle: 'GUIA DO PACIENTE • CUIDADOS PÓS-PROCEDIMENTO',
        documentSubtitle: 'Orientações Pós-Procedimento Odontológico e Harmonização',
        generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
        nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
        moduleBadge: 'ZemdaOdonto'
      };
    }

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações de Cuidados Pós-Procedimento Odontológico',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaOdonto'
    };
  }

  // 8. ZEMDAMED (Medicina)
  if (isDoctorModule) {
    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Recomendações Médicas e Cuidados ao Paciente',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote || ''),
      moduleBadge: 'ZemdaMed'
    };
  }

  // 9. ZEMDAPSICO (Psicologia)
  if (isPsicoModule) {
    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Práticas e Continuidade do Cuidado',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaPsico'
    };
  }

  // 10. ZEMDAPP (Psicopedagogia)
  if (isPPModule) {
    return {
      documentTitle: 'GUIA DO PACIENTE / RESPONSÁVEL',
      documentSubtitle: 'Orientações Psicopedagógicas e Rotina de Aprendizagem',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
      homeActivitiesText: sanitizePatientFollowUpText(homeActivitiesText || ''),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaPP'
    };
  }

  // 11. PROFISSÕES GERAIS / INTEGRATIVAS (Árvore Clínica)
  if (profId === 'prof-doula') {
    return {
      documentTitle: 'GUIA DA GESTANTE / PUÉRPERA',
      documentSubtitle: 'Orientações e Conforto Perinatal',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'Doula'
    };
  }

  if (profId === 'prof-acupuntura') {
    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Pós-Sessão de Acupuntura',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'Acupuntura'
    };
  }

  if (profId === 'prof-enfermeiro' || profId === 'prof-tec-enfermagem') {
    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações e Cuidados de Enfermagem',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'Enfermagem'
    };
  }

  // DEFAULT GLOBAL
  return {
    documentTitle: 'GUIA DO PACIENTE',
    documentSubtitle: 'Acompanhamento Terapêutico e Cuidados Domiciliares',
    generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || ''),
    mealPlanText: mealPlanText || undefined,
    homeExercisesText: homeExercisesText || undefined,
    homeActivitiesText: homeActivitiesText || undefined,
    nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
    moduleBadge: moduleType || undefined
  };
}

export interface PatientFollowUpContext {
  moduleType: string;
  patientId: string;
  patientName: string;
  professionalName: string;
  professionalCouncil: string;
  serviceName: string;
  generalGuidelines: string;
  mealPlanText: string;
  homeExercisesText: string;
  homeActivitiesText: string;
  nextAppointmentNote: string;
}

/**
 * Função compartilhada para obter contexto real de acompanhamento a partir de um atendimento
 * Retorna somente dados apropriados para entrega ao paciente, campos sem informação retornam vazio.
 */
export async function getPatientFollowUpContext(appointmentId: string): Promise<PatientFollowUpContext> {
  let appointment: any = null;
  let clinicalRecord: any = null;

  try {
    const apptRes = await ApiClient.get<any>(`/v1/appointments/${appointmentId}`);
    appointment = apptRes;
  } catch (e) {
    console.warn('[getPatientFollowUpContext] Erro ao buscar agendamento:', e);
  }

  try {
    const recRes = await ApiClient.get<any>(`/v1/clinical-records/appointment/${appointmentId}`);
    if (recRes) {
      clinicalRecord = Array.isArray(recRes) ? recRes[0] : recRes;
    }
  } catch (e) {
    // Registro pode não ter sido salvo ainda se o atendimento estiver em andamento
  }

  const moduleType = appointment?.clinical_module || appointment?.service?.module || '';
  const patientId = appointment?.patient_id || '';
  const patientName = appointment?.patient_name || '';
  const professionalName = appointment?.professional_name || '';
  const professionalCouncil = appointment?.professional_council || '';
  const serviceName = appointment?.service_name || '';

  const moduleData = clinicalRecord?.metadata || clinicalRecord?.module_data || null;
  const initialGuidelines = clinicalRecord?.guidelines || clinicalRecord?.patient_guidelines || '';

  const adapted = buildPatientFollowUpContent({
    moduleType,
    moduleData,
    initialGuidelines,
    serviceName
  });

  return {
    moduleType,
    patientId,
    patientName,
    professionalName,
    professionalCouncil,
    serviceName,
    generalGuidelines: adapted.generalGuidelines || '',
    mealPlanText: adapted.mealPlanText || '',
    homeExercisesText: adapted.homeExercisesText || '',
    homeActivitiesText: adapted.homeActivitiesText || '',
    nextAppointmentNote: adapted.nextAppointmentNote || ''
  };
}

