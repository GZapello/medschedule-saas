/**
 * clinicalModuleCopy.ts
 *
 * Configuração centralizada de textos, placeholders, domínios padrão
 * e perfis de apresentação para componentes clínicos compartilhados:
 * - MeasurableGoalsManager
 * - HomeSchoolProgramManager
 * - ExternalTestsManager
 *
 * Garante que cada especialidade/profissão visualize apenas exemplos
 * condizentes com sua prática clínica, sem alterar regras de negócio,
 * APIs ou armazenamento de dados.
 */

export type CanonicalModuleKey =
  | 'fono'
  | 'fisio'
  | 'to'
  | 'nutri'
  | 'psico'
  | 'pp'
  | 'odonto'
  | 'personal'
  | 'estetic'
  | 'med'
  | 'general';

export interface MeasurableGoalsCopyProfile {
  sectionTitle: string;
  sectionSubtitle: string;
  defaultDomain: string;
  placeholderTitle: string;
  placeholderDomain: string;
  placeholderBaseline: string;
  placeholderCurrent: string;
  placeholderTarget: string;
  placeholderUnit: string;
  placeholderCriteria: string;
  progressNotesPlaceholder: string;
}

export interface HomeSchoolCopyProfile {
  sectionTitle: string;
  sectionSubtitle: string;
  titlePlaceholder: string;
  frequencyPlaceholder: string;
  defaultFrequency: string;
  materialsPlaceholder: string;
  instructionsPlaceholder: string;
}

export interface ExternalTestsCopyProfile {
  titleDefault: string;
  subtitleDefault: string;
  testNamePlaceholder: string;
  resultSummaryPlaceholder: string;
  categoryDefault: string;
  notesPlaceholder: string;
}

export interface ClinicalModuleCopyProfile {
  key: CanonicalModuleKey;
  moduleName: string;
  goals: MeasurableGoalsCopyProfile;
  homeSchool?: HomeSchoolCopyProfile;
  externalTests: ExternalTestsCopyProfile;
}

/**
 * Normaliza qualquer alias ou identificador de módulo/especialidade/domínio
 * para a chave canônica correspondente.
 */
export function normalizeClinicalModuleKey(
  moduleType?: string | null,
  specialty?: string | null,
  domain?: string | null
): CanonicalModuleKey {
  const candidates = [moduleType, specialty, domain].filter(Boolean) as string[];
  if (candidates.length === 0) return 'general';

  const raw = candidates.join(' ').toLowerCase();

  // 1. Fonoaudiologia
  if (
    raw.includes('fono') ||
    raw.includes('crfa') ||
    raw.includes('speech') ||
    raw.includes('audiolog') ||
    raw.includes('disfagia')
  ) {
    return 'fono';
  }

  // 2. Fisioterapia
  if (
    raw.includes('fisio') ||
    raw.includes('physio') ||
    raw.includes('crefito') ||
    raw.includes('goniometr') ||
    raw.includes('cinesio')
  ) {
    return 'fisio';
  }

  // 3. Terapia Ocupacional
  if (
    raw.includes('ocupacional') ||
    raw.includes('occupational') ||
    candidates.some(c => c.toLowerCase() === 'to' || c.toLowerCase() === 'zemdato') ||
    raw.includes('avd') ||
    raw.includes('aivd')
  ) {
    return 'to';
  }

  // 4. Nutrição
  if (
    raw.includes('nutri') ||
    raw.includes('crn') ||
    raw.includes('dieta') ||
    raw.includes('antropometr')
  ) {
    return 'nutri';
  }

  // 5. Psicopedagogia (deve vir antes de psico simples)
  if (
    raw.includes('psicopedag') ||
    raw.includes('abpp') ||
    candidates.some(c => c.toLowerCase() === 'pp' || c.toLowerCase() === 'zemdapp')
  ) {
    return 'pp';
  }

  // 6. Psicologia
  if (
    raw.includes('psico') ||
    raw.includes('psychology') ||
    raw.includes('crp') ||
    raw.includes('satepsi') ||
    raw.includes('mental')
  ) {
    return 'psico';
  }

  // 7. Odontologia
  if (
    raw.includes('odonto') ||
    raw.includes('dentis') ||
    raw.includes('cro') ||
    raw.includes('bucal') ||
    raw.includes('perio')
  ) {
    return 'odonto';
  }

  // 8. Personal Trainer / Educação Física
  if (
    raw.includes('personal') ||
    raw.includes('educa') ||
    raw.includes('cref') ||
    raw.includes('treino') ||
    raw.includes('muscula')
  ) {
    return 'personal';
  }

  // 9. Estética / Saúde Integrativa
  if (
    raw.includes('estet') ||
    raw.includes('estét') ||
    raw.includes('aesthetic') ||
    raw.includes('cosmet')
  ) {
    return 'estetic';
  }

  // 10. Medicina
  if (
    raw.includes('medic') ||
    raw.includes('médic') ||
    raw.includes('crm') ||
    candidates.some(c => c.toLowerCase() === 'med' || c.toLowerCase() === 'zemdamed')
  ) {
    return 'med';
  }

  return 'general';
}

/**
 * Catálogo central de cópias, placeholders e defaults visuais por módulo
 */
export const CLINICAL_MODULE_COPY: Record<CanonicalModuleKey, ClinicalModuleCopyProfile> = {
  // =========================================================================
  // FONOAUDIOLOGIA (ZemdaFono)
  // =========================================================================
  fono: {
    key: 'fono',
    moduleName: 'ZemdaFono',
    goals: {
      sectionTitle: 'Metas Fonoaudiológicas Mensuráveis',
      sectionSubtitle:
        'Acompanhamento longitudinal de fala, fonologia, linguagem, voz, motricidade orofacial, audiologia e disfagia',
      defaultDomain: 'Fala/Fonologia',
      placeholderTitle: 'Ex: Produzir o fonema /s/ em posição medial com 80% de acerto em fala dirigida',
      placeholderDomain: 'Ex: Fala/Fonologia, Linguagem, Voz, Motricidade Orofacial, Audiologia, Disfagia',
      placeholderBaseline: 'Ex: 40',
      placeholderCurrent: 'Ex: 60',
      placeholderTarget: 'Ex: 80',
      placeholderUnit: 'Ex: % de acertos, ocorrências, segundos, dB, palavras/min',
      placeholderCriteria: 'Ex: Produção correta em 8 de 10 oportunidades durante fala dirigida',
      progressNotesPlaceholder:
        'Descreva a evolução fonêmica, adequação vocal, deglutição ou compreensão linguística observada...'
    },
    homeSchool: {
      sectionTitle: 'Programa de Treino e Orientações Domiciliares / Escolares (ZemdaFono)',
      sectionSubtitle:
        'Atividades estruturadas para estimulação de fala, linguagem, motricidade orofacial e voz na rotina',
      titlePlaceholder: 'Ex: Treino do fonema /s/ durante situações da rotina',
      frequencyPlaceholder: 'Ex: 10 a 15 minutos por dia',
      defaultFrequency: '10 a 15 minutos por dia',
      materialsPlaceholder: 'Ex: Figuras, livro infantil, espelho ou lista de palavras',
      instructionsPlaceholder:
        'Descreva como realizar a atividade, quais estímulos oferecer, quantidade de tentativas e como registrar a resposta.'
    },
    externalTests: {
      titleDefault: 'Testes Externos, Protocolos & Laudos Fonoaudiológicos (ZemdaFono)',
      subtitleDefault:
        'Anexe relatórios audiológicos, exames otorrinolaringológicos, laudos escolares e protocolos externos.',
      testNamePlaceholder:
        'Ex: Relatório audiológico externo, avaliação otorrinolaringológica, relatório escolar...',
      resultSummaryPlaceholder: 'Ex: Síntese do resultado conforme documento recebido...',
      categoryDefault: 'Teste/Instrumento Externo',
      notesPlaceholder: 'Anotações contextuais sobre o achado clínico ou orientações do documento...'
    }
  },

  // =========================================================================
  // FISIOTERAPIA (ZemdaFisio)
  // =========================================================================
  fisio: {
    key: 'fisio',
    moduleName: 'ZemdaFisio',
    goals: {
      sectionTitle: 'Metas Fisioterapêuticas Mensuráveis',
      sectionSubtitle:
        'Acompanhamento longitudinal de amplitude articular, força muscular, dor e capacidade funcional',
      defaultDomain: 'Mobilidade',
      placeholderTitle: 'Ex: Amplitude de flexão do joelho direito até 110 graus',
      placeholderDomain: 'Ex: Mobilidade, Força, Dor, Equilíbrio, Marcha, Funcionalidade',
      placeholderBaseline: 'Ex: 60',
      placeholderCurrent: 'Ex: 75',
      placeholderTarget: 'Ex: 110',
      placeholderUnit: 'Ex: graus, kgf, pontos, metros, segundos, repetições',
      placeholderCriteria: 'Ex: Medição por goniometria ativa nas mesmas condições de avaliação',
      progressNotesPlaceholder:
        'Descreva os ganhos cinético-funcionais, redução de dor ou reavaliação goniométrica...'
    },
    externalTests: {
      titleDefault: 'Exames, Laudos & Testes Funcionais Externos (ZemdaFisio)',
      subtitleDefault:
        'Anexe laudos de imagem, relatórios ortopédicos, testes funcionais e exames complementares.',
      testNamePlaceholder: 'Ex: Laudo de imagem, relatório ortopédico, teste funcional externo...',
      resultSummaryPlaceholder: 'Ex: ADM registrada, força, escore funcional ou síntese do laudo...',
      categoryDefault: 'Documento Externo',
      notesPlaceholder: 'Observações sobre impacto no plano fisioterapêutico ou limitações biomecânicas...'
    }
  },

  // =========================================================================
  // TERAPIA OCUPACIONAL (ZemdaTO)
  // =========================================================================
  to: {
    key: 'to',
    moduleName: 'ZemdaTO',
    goals: {
      sectionTitle: 'Metas Ocupacionais Mensuráveis',
      sectionSubtitle:
        'Acompanhamento longitudinal de autonomia em AVDs, AIVDs, integração sensorial e participação social',
      defaultDomain: 'AVD',
      placeholderTitle: 'Ex: Realizar 4 de 5 etapas da rotina de vestir com no máximo 1 pista verbal',
      placeholderDomain: 'Ex: AVD, AIVD, Participação, Motricidade Fina, Sensorial, Rotina',
      placeholderBaseline: 'Ex: 1',
      placeholderCurrent: 'Ex: 3',
      placeholderTarget: 'Ex: 4',
      placeholderUnit: 'Ex: % de independência, nº de etapas, nº de pistas, minutos, ocorrências',
      placeholderCriteria: 'Ex: Desempenho observado na rotina com registro do nível de assistência',
      progressNotesPlaceholder:
        'Descreva o nível de assistência exigido, pistas utilizadas, adaptações ou autonomia observada...'
    },
    homeSchool: {
      sectionTitle: 'Programa de Atividades e Orientações (Casa / Escola)',
      sectionSubtitle:
        'Orientações estruturadas para continuidade da autonomia e desempenho ocupacional na rotina',
      titlePlaceholder: 'Ex: Treino de abotoamento na rotina matinal',
      frequencyPlaceholder: 'Ex: Diário ao acordar, 2x por semana',
      defaultFrequency: 'Diário (15 minutos)',
      materialsPlaceholder: 'Ex: Quadro de rotina visual, adaptador de lápis',
      instructionsPlaceholder:
        'Descreva passo a passo como realizar o estímulo, quando intervir, adaptações e como incentivar a autonomia...'
    },
    externalTests: {
      titleDefault: 'Testes, Protocolos & Avaliações Externas (ZemdaTO)',
      subtitleDefault:
        'Anexe relatórios escolares, avaliações funcionais externas, relatórios neurológicos e escalas de suporte.',
      testNamePlaceholder: 'Ex: Relatório escolar, avaliação funcional externa, relatório neurológico...',
      resultSummaryPlaceholder: 'Ex: Descrição funcional registrada no documento externo...',
      categoryDefault: 'Teste/Instrumento Externo',
      notesPlaceholder: 'Observações sobre desempenho ocupacional, barreiras ambientais ou adaptações recomendadas...'
    }
  },

  // =========================================================================
  // NUTRIÇÃO (ZemdaNutri)
  // =========================================================================
  nutri: {
    key: 'nutri',
    moduleName: 'ZemdaNutri',
    goals: {
      sectionTitle: 'Metas Nutricionais Mensuráveis',
      sectionSubtitle:
        'Acompanhamento longitudinal de hábitos alimentares, composição corporal, hidratação e metas clínicas',
      defaultDomain: 'Comportamento Alimentar',
      placeholderTitle: 'Ex: Atingir ingestão hídrica média de 2,0 L por dia',
      placeholderDomain: 'Ex: Antropometria, Comportamento Alimentar, Hidratação, Ingestão, Plano Alimentar',
      placeholderBaseline: 'Ex: 1.0',
      placeholderCurrent: 'Ex: 1.5',
      placeholderTarget: 'Ex: 2.0',
      placeholderUnit: 'Ex: kg, cm, %, kcal, g, mL, L/dia, porções',
      placeholderCriteria: 'Ex: Registro alimentar e acompanhamento na consulta',
      progressNotesPlaceholder:
        'Descreva a adesão dietética, marcadores antropométricos ou evolução metabólica informada...'
    },
    externalTests: {
      titleDefault: 'Exames Laboratoriais, Bioimpedância & Anexos Nutricionais (ZemdaNutri)',
      subtitleDefault:
        'Anexe laudos laboratoriais, relatórios de bioimpedância, relatórios médicos e diários alimentares.',
      testNamePlaceholder:
        'Ex: Exames laboratoriais, bioimpedância, relatório endocrinológico, diário alimentar...',
      resultSummaryPlaceholder: 'Ex: Resultado laboratorial ou composição corporal conforme documento...',
      categoryDefault: 'Planilha de Resultados',
      notesPlaceholder: 'Observações nutricionais, marcadores bioquímicos e correlação com o plano alimentar...'
    }
  },

  // =========================================================================
  // PSICOLOGIA (ZemdaPsico)
  // =========================================================================
  psico: {
    key: 'psico',
    moduleName: 'ZemdaPsico',
    goals: {
      sectionTitle: 'Metas Clínicas & Acompanhamento de Progresso (ZemdaPsico)',
      sectionSubtitle:
        'Acompanhamento longitudinal de regulação emocional, comportamento, sono e objetivos terapêuticos',
      defaultDomain: 'Regulação Emocional',
      placeholderTitle: 'Ex: Reduzir episódios de evitação de 5 para 2 ocorrências por semana',
      placeholderDomain: 'Ex: Regulação Emocional, Comportamento, Sono, Habilidades Sociais, Adesão',
      placeholderBaseline: 'Ex: 5',
      placeholderCurrent: 'Ex: 3',
      placeholderTarget: 'Ex: 2',
      placeholderUnit: 'Ex: ocorrências/semana, dias/semana, pontos, frequência, %',
      placeholderCriteria: 'Ex: Registro autorrelatado e revisão clínica durante as sessões',
      progressNotesPlaceholder:
        'Descreva a autorregulação, novos repertórios comportamentais ou relatos trazidos na sessão...'
    },
    externalTests: {
      titleDefault: 'Testes Externos, Protocolos & Laudos Anexados (ZemdaPsico)',
      subtitleDefault:
        'Anexe laudos psicológicos externos, relatórios neuropsicológicos, pareceres psiquiátricos e documentos externos sob sigilo.',
      testNamePlaceholder: 'Ex: Laudo psicológico externo, relatório neuropsicológico, relatório psiquiátrico...',
      resultSummaryPlaceholder: 'Ex: Síntese do documento externo...',
      categoryDefault: 'Documento Externo',
      notesPlaceholder: 'Anotações contextuais de suporte clínico sob estrito sigilo profissional...'
    }
  },

  // =========================================================================
  // PSICOPEDAGOGIA (ZemdaPP)
  // =========================================================================
  pp: {
    key: 'pp',
    moduleName: 'ZemdaPP',
    goals: {
      sectionTitle: 'Metas Psicopedagógicas Mensuráveis',
      sectionSubtitle:
        'Acompanhamento longitudinal de processos de leitura, escrita, cálculo, atenção e funções executivas',
      defaultDomain: 'Leitura',
      placeholderTitle: 'Ex: Ler corretamente 8 de 10 palavras com estrutura silábica trabalhada',
      placeholderDomain: 'Ex: Leitura, Escrita, Matemática, Atenção, Funções Executivas, Aprendizagem',
      placeholderBaseline: 'Ex: 3',
      placeholderCurrent: 'Ex: 6',
      placeholderTarget: 'Ex: 8',
      placeholderUnit: 'Ex: % de acertos, itens corretos, palavras/min, minutos, nº de pistas',
      placeholderCriteria: 'Ex: Desempenho observado em atividade estruturada equivalente',
      progressNotesPlaceholder:
        'Descreva a evolução nas atividades pedagógicas, nível de mediação necessária ou avanços na aprendizagem...'
    },
    externalTests: {
      titleDefault: 'Anexos, Cadernos Digitalizados & Testes Externos (ZemdaPP)',
      subtitleDefault:
        'Anexe relatórios escolares, avaliações pedagógicas, cadernos digitalizados e pareceres interdisciplinares.',
      testNamePlaceholder:
        'Ex: Relatório escolar, avaliação pedagógica, caderno digitalizado, relatório interdisciplinar...',
      resultSummaryPlaceholder: 'Ex: Síntese do desempenho ou observações registradas no documento...',
      categoryDefault: 'Documento Externo',
      notesPlaceholder: 'Observações sobre o contexto escolar, produção gráfica ou mediação pedagógica...'
    }
  },

  // =========================================================================
  // ODONTOLOGIA (ZemdaOdonto)
  // =========================================================================
  odonto: {
    key: 'odonto',
    moduleName: 'ZemdaOdonto',
    goals: {
      sectionTitle: 'Metas Clínicas Odontológicas',
      sectionSubtitle:
        'Acompanhamento longitudinal de saúde bucal, periodontia, índice de placa e reabilitação',
      defaultDomain: 'Higiene Oral',
      placeholderTitle: 'Ex: Reduzir índice de placa de 40% para 20% no acompanhamento',
      placeholderDomain: 'Ex: Higiene Oral, Periodontia, Dor, Função, Ortodontia, Reabilitação',
      placeholderBaseline: 'Ex: 40',
      placeholderCurrent: 'Ex: 28',
      placeholderTarget: 'Ex: 20',
      placeholderUnit: 'Ex: %, mm, pontos, dias, ocorrências',
      placeholderCriteria: 'Ex: Reavaliação odontológica utilizando o mesmo parâmetro clínico',
      progressNotesPlaceholder:
        'Descreva a resposta tecidual, redução de sangramento à sondagem ou controle de biofilme...'
    },
    externalTests: {
      titleDefault: 'Exames Radiográficos, Laudos & Anexos Odontológicos (ZemdaOdonto)',
      subtitleDefault:
        'Anexe radiografias panorâmicas, periapicais, tomografias, fotos intraorais e laudos externos.',
      testNamePlaceholder:
        'Ex: Radiografia panorâmica, tomografia, laudo radiológico, documentação ortodôntica...',
      resultSummaryPlaceholder: 'Ex: Síntese do laudo ou achado registrado no documento...',
      categoryDefault: 'Documento Externo',
      notesPlaceholder: 'Observações clínicas sobre estruturas dentoalveolares ou planejamento cirúrgico...'
    }
  },

  // =========================================================================
  // PERSONAL TRAINER / ED. FÍSICA (ZemdaPersonal)
  // =========================================================================
  personal: {
    key: 'personal',
    moduleName: 'ZemdaPersonal',
    goals: {
      sectionTitle: 'Metas de Condicionamento, Carga & Composição Corporal',
      sectionSubtitle:
        'Acompanhamento longitudinal de progressão de carga, volume de treino, perímetros e metas físicas',
      defaultDomain: 'Carga & Força',
      placeholderTitle: 'Ex: Realizar agachamento com carga de 80 kg para 8 repetições com boa técnica',
      placeholderDomain: 'Ex: Carga & Força, Condicionamento, Dobras Cutâneas, Frequência, Perímetros',
      placeholderBaseline: 'Ex: 50',
      placeholderCurrent: 'Ex: 65',
      placeholderTarget: 'Ex: 80',
      placeholderUnit: 'Ex: kg, repetições, km, minutos, % gordura',
      placeholderCriteria: 'Ex: Execução técnica com amplitude completa sem compensações',
      progressNotesPlaceholder:
        'Descreva a percepção subjetiva de esforço (PSE), progressão de carga ou adesão ao treino...'
    },
    externalTests: {
      titleDefault: 'Avaliações Médicas, Testes & Exames Externos (ZemdaPersonal)',
      subtitleDefault:
        'Anexe laudos cardiológicos, teste ergométrico, relatórios de bioimpedância e atestados do aluno.',
      testNamePlaceholder: 'Ex: Teste ergométrico, avaliação cardiológica, bioimpedância, laudo médico...',
      resultSummaryPlaceholder: 'Ex: Resultado conforme documento apresentado pelo aluno...',
      categoryDefault: 'Documento Externo',
      notesPlaceholder: 'Observações sobre liberação médica para treino, faixas de FC ou recomendações...'
    }
  },

  // =========================================================================
  // ESTÉTICA (ZemdaEstetic)
  // =========================================================================
  estetic: {
    key: 'estetic',
    moduleName: 'ZemdaEstetic',
    goals: {
      sectionTitle: 'Metas de Tratamento & Evolução Estética',
      sectionSubtitle:
        'Acompanhamento longitudinal de parâmetros faciais, corporais, capilares e satisfação do cliente',
      defaultDomain: 'Facial',
      placeholderTitle: 'Ex: Melhora de 50% na hidratação e uniformidade do relevo cutâneo facial',
      placeholderDomain: 'Ex: Facial, Corporal, Capilar, Relevo Cutâneo, Fotoenvelhecimento, Aderência',
      placeholderBaseline: 'Ex: 20',
      placeholderCurrent: 'Ex: 40',
      placeholderTarget: 'Ex: 70',
      placeholderUnit: 'Ex: %, pontos, sessões, cm, dias',
      placeholderCriteria: 'Ex: Análise fotográfica padronizada e parâmetros da avaliação clínica',
      progressNotesPlaceholder:
        'Descreva a resposta tecidual, cuidados domiciliares aplicados e evolução observada...'
    },
    externalTests: {
      titleDefault: 'Exames, Laudos & Avaliações Prévias (ZemdaEstetic)',
      subtitleDefault:
        'Anexe laudos dermatológicos, exames laboratoriais, avaliações anteriores e termos complementares.',
      testNamePlaceholder: 'Ex: Exames laboratoriais, laudo dermatológico, avaliação prévia...',
      resultSummaryPlaceholder: 'Ex: Síntese das condições e observações do documento...',
      categoryDefault: 'Documento Externo',
      notesPlaceholder: 'Observações sobre fototipo, histórico prévio ou cuidados específicos recomendados...'
    }
  },

  // =========================================================================
  // MEDICINA (ZemdaMed)
  // =========================================================================
  med: {
    key: 'med',
    moduleName: 'ZemdaMed',
    goals: {
      sectionTitle: 'Metas Clínicas & Parâmetros Terapêuticos',
      sectionSubtitle:
        'Acompanhamento longitudinal de biomarcadores, pressão arterial, controle glicêmico e metas terapêuticas',
      defaultDomain: 'Controle Clínico',
      placeholderTitle: 'Ex: Reduzir pressão arterial sistólica para meta menor que 130 mmHg',
      placeholderDomain: 'Ex: Controle Clínico, Biomarcadores, Sintomas, Adesão Medicamentosa, Prevenção',
      placeholderBaseline: 'Ex: 150',
      placeholderCurrent: 'Ex: 138',
      placeholderTarget: 'Ex: 128',
      placeholderUnit: 'Ex: mmHg, mg/dL, %, pontos, doses/dia',
      placeholderCriteria: 'Ex: Média de aferições em repouso e MAPA/MRPA',
      progressNotesPlaceholder:
        'Descreva o controle dos parâmetros clínicos, tolerabilidade e evolução médica...'
    },
    externalTests: {
      titleDefault: 'Exames Complementares, Laudos & Pareceres Médicos (ZemdaMed)',
      subtitleDefault:
        'Anexe laudos laboratoriais, radiológicos, pareceres de especialistas e relatórios hospitalares.',
      testNamePlaceholder:
        'Ex: Exames laboratoriais, laudo radiológico, parecer de especialista, relatório de alta...',
      resultSummaryPlaceholder: 'Ex: Síntese do laudo ou achados do documento...',
      categoryDefault: 'Documento Externo',
      notesPlaceholder: 'Hipótese diagnóstica, conduta correlacionada ou orientações do especialista...'
    }
  },

  // =========================================================================
  // GERAL / MULTIPROFISSIONAL (Fallback)
  // =========================================================================
  general: {
    key: 'general',
    moduleName: 'Atendimento Geral',
    goals: {
      sectionTitle: 'Metas Terapêuticas Mensuráveis',
      sectionSubtitle:
        'Acompanhamento longitudinal de objetivos clínicos, metas funcionais e linha do tempo de evolução',
      defaultDomain: 'Funcional',
      placeholderTitle: 'Ex: Atingir o objetivo clínico planejado com autonomia e segurança',
      placeholderDomain: 'Ex: Funcional, Sintomas, Comportamento, Adesão, Autonomia',
      placeholderBaseline: 'Ex: 40',
      placeholderCurrent: 'Ex: 65',
      placeholderTarget: 'Ex: 100',
      placeholderUnit: 'Ex: %, pontos, repetições, dias',
      placeholderCriteria: 'Ex: Critério de mensuração e observação clínica sistemática',
      progressNotesPlaceholder:
        'Descreva a evolução do paciente, intervenções aplicadas ou ajustes de conduta...'
    },
    externalTests: {
      titleDefault: 'Testes Externos, Protocolos & Anexos',
      subtitleDefault:
        'Anexe testes escaneados, relatórios externos, protocolos, planilhas ou documentos recebidos de outras instituições.',
      testNamePlaceholder: 'Ex: Relatório multiprofissional, laudo externo, exame complementar...',
      resultSummaryPlaceholder: 'Ex: Síntese das informações registradas no documento...',
      categoryDefault: 'Teste/Instrumento Externo',
      notesPlaceholder: 'Anotações contextuais sobre a aplicação ou interpretação do documento...'
    }
  }
};

/**
 * Resolve o perfil completo de apresentação visual (copy, placeholders, defaults)
 * a partir de moduleType, specialty e/ou domain informados.
 */
export function resolveClinicalCopyProfile(
  moduleType?: string | null,
  specialty?: string | null,
  domain?: string | null
): ClinicalModuleCopyProfile {
  const key = normalizeClinicalModuleKey(moduleType, specialty, domain);
  return CLINICAL_MODULE_COPY[key] || CLINICAL_MODULE_COPY.general;
}
