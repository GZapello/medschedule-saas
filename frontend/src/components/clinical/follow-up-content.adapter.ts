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

    const defaultEsteticGuidelines =
      '1. Evitar exposição solar direta e calor excessivo (banhos muito quentes, sauna) nas primeiras 48 a 72 horas.\n' +
      '2. Aplicar protetor solar com FPS 30 ou superior a cada 3 horas durante o dia.\n' +
      '3. Não massagear, comprimir ou manipular a área tratada sem orientação do profissional.\n' +
      '4. Evitar a prática de exercícios físicos intensos nas primeiras 24 a 48 horas.\n' +
      '5. Manter hidratação oral adequada ingerindo água regularmente.\n' +
      '6. Em caso de dor persistente, vermelhidão excessiva, calor local intenso ou qualquer alteração na sensibilidade ou coloração da pele, entrar em contato imediatamente com o consultório.';

    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || extractedPostInstructions || defaultEsteticGuidelines
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

    const defaultNutriGuidelines =
      'Seguir o plano alimentar estruturado, mantendo adequada hidratação ao longo do dia e respeitando os sinais de fome e saciedade. ' +
      'Em caso de dúvidas sobre substituições de alimentos ou horários, consulte as opções combinadas em consulta.';

    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || moduleData?.planForm?.generalGuidelines || moduleData?.generalGuidelines || defaultNutriGuidelines
    );

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Nutricionais e Plano Alimentar',
      generalGuidelines: resolvedGuidelines,
      mealPlanText: resolvedMealPlan,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaNutri'
    };
  }

  // 3. ZEMDAFISIO (Fisioterapia)
  if (isPhysioModule) {
    const defaultPhysioGuidelines =
      'Seguir a rotina de exercícios com os cuidados orientados em sessão. ' +
      'Respeitar o limite de conforto muscular e articular (não realizar movimentos com dor aguda). ' +
      'Manter boa postura nas atividades diárias e descanso nos intervalos prescritos.';

    const resolvedExercises = homeExercisesText || moduleData?.homeExercisesText || '';
    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || moduleData?.conducts || defaultPhysioGuidelines
    );

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Prescrição de Exercícios Domiciliares e Reabilitação',
      generalGuidelines: resolvedGuidelines,
      homeExercisesText: resolvedExercises,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaFisio'
    };
  }

  // 4. ZEMDAFONO (Fonoaudiologia)
  if (isSpeechModule) {
    const defaultFonoGuidelines =
      'Realizar os exercícios miofuncionais, de estimulação auditiva ou de linguagem conforme orientado na consulta fonoaudiológica.';
    const defaultFonoActivities =
      '1. Manter boa hidratação ao longo do dia, ingerindo água em pequenos goles.\n' +
      '2. Realizar os treinos vocais ou miofuncionais em ambiente tranquilo e em frente ao espelho.\n' +
      '3. Anotar dúvidas e percepções do paciente para alinhamento no próximo atendimento.';

    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || moduleData?.conducts || moduleData?.consultationConducts || defaultFonoGuidelines
    );

    const resolvedActivities = sanitizePatientFollowUpText(
      homeActivitiesText || moduleData?.treatmentPlanData?.homeSchoolGuidance || moduleData?.homeSchoolGuidance || defaultFonoActivities
    );

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Fonoaudiológicas e Treinos Domiciliares',
      generalGuidelines: resolvedGuidelines,
      homeActivitiesText: resolvedActivities,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaFono'
    };
  }

  // 5. ZEMDATO (Terapia Ocupacional)
  if (isTOModule) {
    const defaultTOGuidelines =
      'Seguir os treinos de autonomia, adaptação e estímulo sensorial em rotina domiciliar conforme planejado em sessão.';
    const defaultTOActivities =
      '1. Utilizar os recursos de tecnologia assistiva indicados.\n' +
      '2. Estimular a autonomia nas atividades diárias respeitando o tempo e o ritmo do paciente.\n' +
      '3. Registrar em diário de bordo os momentos de maior facilidade ou desafio.';

    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || moduleData?.treatmentPlanData?.familyGuidelines || moduleData?.familyGuidelines || defaultTOGuidelines
    );

    const resolvedActivities = sanitizePatientFollowUpText(
      homeActivitiesText || moduleData?.treatmentPlanData?.interventions || moduleData?.interventions || defaultTOActivities
    );

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Terapêuticas e Rotina de Autonomia',
      generalGuidelines: resolvedGuidelines,
      homeActivitiesText: resolvedActivities,
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaTO'
    };
  }

  // 6. ZEMDAPERSONAL (Personal Trainer / Educação Física)
  if (isPersonalModule) {
    const defaultPersonalGuidelines =
      '1. Manter hidratação adequada antes, durante e após os treinos.\n' +
      '2. Respeitar o tempo de recuperação muscular e o descanso noturno (mínimo de 7 a 8 horas de sono reparador).\n' +
      '3. Realizar aquecimento e mobilidade articular prévios às cargas principais.\n' +
      '4. Comunicar imediatamente qualquer dor aguda osteomuscular ou articular ao treinador.';

    const defaultPersonalExercises =
      'Seguir a programação de exercícios acordada em consultoria. Cargas, séries e intervalos devem respeitar a periodização estabelecida.';

    const resolvedGuidelines = sanitizePatientFollowUpText(
      initialGuidelines || defaultPersonalGuidelines
    );
    const resolvedExercises = sanitizePatientFollowUpText(
      homeExercisesText || defaultPersonalExercises
    );

    return {
      documentTitle: 'GUIA DO ALUNO • ORIENTAÇÕES DE TREINO',
      documentSubtitle: 'Diretrizes de Treinamento, Cuidados e Recuperação',
      generalGuidelines: resolvedGuidelines,
      homeExercisesText: resolvedExercises,
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
      const defaultOdontoEsteticGuidelines =
        '1. Evitar exposição solar direta e calor excessivo nas primeiras 48 a 72 horas.\n' +
        '2. Aplicar protetor solar diariamente na face.\n' +
        '3. Não massagear ou pressionar as áreas aplicadas.\n' +
        '4. Evitar esforço físico e atividade esportiva nas primeiras 48 horas.\n' +
        '5. Em caso de dor atípica, inchaço progressivo ou calor intenso local, contatar o consultório imediatamente.';

      return {
        documentTitle: 'GUIA DO PACIENTE • CUIDADOS PÓS-PROCEDIMENTO',
        documentSubtitle: 'Orientações Pós-Procedimento Odontológico e Harmonização',
        generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultOdontoEsteticGuidelines),
        nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
        moduleBadge: 'ZemdaOdonto'
      };
    }

    const defaultOdontoGuidelines =
      '1. Repouso relativo no dia da intervenção, evitando esforço físico e exposição ao sol.\n' +
      '2. Higienização bucal cuidadosa com escovação suave; evitar bochechos vigorosos nas primeiras 24 horas.\n' +
      '3. Alimentação líquida ou pastosa morna a fria nas primeiras 24 a 48 horas.\n' +
      '4. Compressas frias externas de 20 minutos intercaladas na face caso indicado.\n' +
      '5. Tomar as medicações prescritas rigorosamente nos horários indicados.\n' +
      '6. Em caso de sangramento persistente, dor intensa refratária ou febre, contatar o cirurgião-dentista imediatamente.';

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações de Cuidados Pós-Procedimento Odontológico',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultOdontoGuidelines),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaOdonto'
    };
  }

  // 8. ZEMDAMED (Medicina)
  if (isDoctorModule) {
    const defaultMedGuidelines =
      '1. Seguir rigorosamente as doses, horários e orientações das medicações prescritas na receita médica.\n' +
      '2. Manter repouso e hidratação adequados.\n' +
      '3. Observar sinais de alerta (febre alta persistente, falta de ar, dor súbita intensa ou piora do estado geral) e buscar atendimento de urgência caso ocorram.\n' +
      '4. Manter o acompanhamento e retornar na data estipulada para reavaliação clínica.';

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Recomendações Médicas e Cuidados ao Paciente',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultMedGuidelines),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote || 'Retorno conforme orientação médica e agendamento prévio.'),
      moduleBadge: 'ZemdaMed'
    };
  }

  // 9. ZEMDAPSICO (Psicologia)
  if (isPsicoModule) {
    const defaultPsicoGuidelines =
      '1. Manter a regularidade dos horários e da rotina diária acordada em sessão.\n' +
      '2. Praticar os combinados e exercícios acordados (técnicas de respiração, diário reflexivo ou pausas planejadas).\n' +
      '3. Reservar momentos de autocuidado e desconexão saudável ao longo da semana.\n' +
      '4. Dúvidas, sentimentos ou percepções importantes podem ser anotados para discussão no próximo encontro.';

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Práticas e Continuidade do Cuidado',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultPsicoGuidelines),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaPsico'
    };
  }

  // 10. ZEMDAPP (Psicopedagogia)
  if (isPPModule) {
    const defaultPPGuidelines =
      '1. Organizar um ambiente tranquilo, iluminado e sem distrações digitais para os momentos de estudo e tarefas.\n' +
      '2. Estabelecer rotina diária com horários regulares e pausas curtas entre os blocos de estudo.\n' +
      '3. Estimular a leitura compartilhada e jogos de raciocínio lúdicos em família.\n' +
      '4. Celebrar as pequenas conquistas e valorizar o esforço contínuo no processo de aprendizagem.';

    const defaultPPActivities =
      'Realizar as atividades e estímulos propostos no caderno de orientações psicopedagógicas.';

    return {
      documentTitle: 'GUIA DO PACIENTE / RESPONSÁVEL',
      documentSubtitle: 'Orientações Psicopedagógicas e Rotina de Aprendizagem',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultPPGuidelines),
      homeActivitiesText: sanitizePatientFollowUpText(homeActivitiesText || defaultPPActivities),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'ZemdaPP'
    };
  }

  // 11. PROFISSÕES GERAIS / INTEGRATIVAS (Árvore Clínica)
  if (profId === 'prof-doula') {
    const defaultDoula =
      '1. Praticar as técnicas de respiração, relaxamento e movimentação pélvica acordadas.\n' +
      '2. Manter hidratação constante e alimentação leve.\n' +
      '3. Aplicar medidas de alívio natural do desconforto (banhos mornos, massagens lombares, uso da bola de pilates).\n' +
      '4. A equipe de apoio e a doula permanecem à disposição para suporte contínuo.';

    return {
      documentTitle: 'GUIA DA GESTANTE / PUÉRPERA',
      documentSubtitle: 'Orientações e Conforto Perinatal',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultDoula),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'Doula'
    };
  }

  if (profId === 'prof-acupuntura') {
    const defaultAcupuntura =
      '1. Evitar esforço físico extenuante e consumo de álcool nas primeiras 12 a 24 horas após a aplicação.\n' +
      '2. Manter boa hidratação ao longo do dia para apoiar a circulação e os efeitos da sessão.\n' +
      '3. É comum sentir sensação de relaxamento profundo ou leve sonolência após o atendimento.\n' +
      '4. Registrar como se sentiu nos dias subsequentes para ajuste dos pontos na próxima sessão.';

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações Pós-Sessão de Acupuntura',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultAcupuntura),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'Acupuntura'
    };
  }

  if (profId === 'prof-enfermeiro' || profId === 'prof-tec-enfermagem') {
    const defaultEnfermagem =
      '1. Manter os curativos secos e limpos conforme a técnica orientada.\n' +
      '2. Observar sinais de alerta local (vermelhidão intensa, calor, dor acentuada ou secreção com odor).\n' +
      '3. Seguir rigorosamente o cronograma de troca de curativos e cuidados de higiene.\n' +
      '4. Em caso de dúvidas ou alterações súbitas, contatar imediatamente a equipe de enfermagem.';

    return {
      documentTitle: 'GUIA DO PACIENTE',
      documentSubtitle: 'Orientações e Cuidados de Enfermagem',
      generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultEnfermagem),
      nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
      moduleBadge: 'Enfermagem'
    };
  }

  // DEFAULT GLOBAL
  const defaultGlobal =
    'Seguir as orientações terapêuticas combinadas em consulta. Em caso de dúvidas ou sintomas atípicos, entre em contato com a equipe.';

  return {
    documentTitle: 'GUIA DO PACIENTE',
    documentSubtitle: 'Acompanhamento Terapêutico e Cuidados Domiciliares',
    generalGuidelines: sanitizePatientFollowUpText(initialGuidelines || defaultGlobal),
    mealPlanText: mealPlanText || undefined,
    homeExercisesText: homeExercisesText || undefined,
    homeActivitiesText: homeActivitiesText || undefined,
    nextAppointmentNote: sanitizePatientFollowUpText(nextAppointmentNote),
    moduleBadge: moduleType || undefined
  };
}
