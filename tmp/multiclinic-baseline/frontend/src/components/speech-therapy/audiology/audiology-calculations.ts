/**
 * Cálculos e regras clínicas para o módulo de Audiologia do ZemdaFono
 * Em estrita conformidade com o:
 * "Guia de Orientação na Avaliação Audiológica – Volume I (CFFa, 2ª ed., 2023)"
 */

import {
  AudiogramDictionary,
  DegreeCriterion,
  InfantCriterion,
  LossType,
  AudiogramConfiguration,
  TransducerType
} from './audiology.types';

export const CONVENTIONAL_FREQUENCIES = [125, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000];
export const CONVENTIONAL_INTENSITIES = [-10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

export const HIGH_FREQUENCIES = [9000, 10000, 11200, 12500, 14000, 16000, 18000, 20000];

export interface PTAResult {
  average: number | null;
  frequenciesUsed: number[];
  degree: string;
  reference: string;
  hasPartialFrequencies: boolean;
  isolatedAlterations: number[];
}

/**
 * Cálculo do grau de audição conforme o critério selecionado
 * REGRA CLÍNICA: Nunca classificar "grau" por frequência isolada!
 */
export function calculateHearingDegree(
  airThresholds: AudiogramDictionary,
  criterion: DegreeCriterion
): PTAResult {
  if (criterion === 'none') {
    return {
      average: null,
      frequenciesUsed: [],
      degree: 'Critério de grau não selecionado',
      reference: '',
      hasPartialFrequencies: false,
      isolatedAlterations: []
    };
  }

  let freqsToAverage: number[] = [];
  let referenceName = '';

  switch (criterion) {
    case 'lloyd_kaplan_1978':
      freqsToAverage = [500, 1000, 2000];
      referenceName = 'Lloyd & Kaplan (1978)';
      break;
    case 'kaplan_gladstone_lloyd_1993':
      freqsToAverage = [500, 1000, 2000];
      referenceName = 'Kaplan, Gladstone & Lloyd (1993)';
      break;
    case 'davis_1970':
      freqsToAverage = [500, 1000, 2000];
      referenceName = 'Davis (1970)';
      break;
    case 'biap_1996':
      freqsToAverage = [500, 1000, 2000, 4000];
      referenceName = 'BIAP (1996)';
      break;
    case 'oms_2021':
      freqsToAverage = [500, 1000, 2000, 4000];
      referenceName = 'OMS (2021)';
      break;
    default:
      freqsToAverage = [500, 1000, 2000];
      referenceName = 'Outro critério validado';
  }

  // Verifica se todas as frequências da média estão preenchidas
  const values: number[] = [];
  let missingAny = false;
  for (const f of freqsToAverage) {
    const val = airThresholds[f];
    if (val !== null && val !== undefined) {
      values.push(val);
    } else {
      missingAny = true;
    }
  }

  // Identifica se há frequências isoladas alteradas (> 25 dB) fora da média
  const normalLimit = criterion === 'biap_1996' || criterion === 'oms_2021' ? 20 : 25;
  const isolatedAlterations: number[] = [];
  for (const [freqStr, dbVal] of Object.entries(airThresholds)) {
    const f = Number(freqStr);
    if (dbVal !== null && dbVal !== undefined && dbVal > normalLimit) {
      if (!freqsToAverage.includes(f)) {
        isolatedAlterations.push(f);
      }
    }
  }
  isolatedAlterations.sort((a, b) => a - b);

  if (missingAny || values.length === 0) {
    return {
      average: null,
      frequenciesUsed: freqsToAverage,
      degree: 'Limiares parciais para a média adotada',
      reference: referenceName,
      hasPartialFrequencies: true,
      isolatedAlterations
    };
  }

  const sum = values.reduce((acc, v) => acc + v, 0);
  const avg = Math.round(sum / values.length);

  let degreeStr = '';

  switch (criterion) {
    case 'lloyd_kaplan_1978':
      if (avg < 26) degreeStr = 'Audição normal (< 26 dB NA)';
      else if (avg <= 40) degreeStr = 'Perda auditiva de grau leve (26 a 40 dB NA)';
      else if (avg <= 55) degreeStr = 'Perda auditiva de grau moderado (41 a 55 dB NA)';
      else if (avg <= 70) degreeStr = 'Perda auditiva de grau moderadamente severo (56 a 70 dB NA)';
      else if (avg <= 90) degreeStr = 'Perda auditiva de grau severo (71 a 90 dB NA)';
      else degreeStr = 'Perda auditiva de grau profundo (> 90 dB NA)';
      break;

    case 'kaplan_gladstone_lloyd_1993':
      if (avg <= 15) degreeStr = 'Audição normal (-10 a 15 dB NA)';
      else if (avg <= 25) degreeStr = 'Perda auditiva de grau discreto (16 a 25 dB NA)';
      else if (avg <= 40) degreeStr = 'Perda auditiva de grau leve (26 a 40 dB NA)';
      else if (avg <= 55) degreeStr = 'Perda auditiva de grau moderado (41 a 55 dB NA)';
      else if (avg <= 70) degreeStr = 'Perda auditiva de grau moderadamente severo (56 a 70 dB NA)';
      else if (avg <= 90) degreeStr = 'Perda auditiva de grau severo (71 a 90 dB NA)';
      else degreeStr = 'Perda auditiva de grau profundo (>= 91 dB NA)';
      break;

    case 'davis_1970':
      if (avg <= 25) degreeStr = 'Audição normal (<= 25 dB NA)';
      else if (avg <= 40) degreeStr = 'Perda auditiva de grau leve (26 a 40 dB NA)';
      else if (avg <= 55) degreeStr = 'Perda auditiva de grau moderado (41 a 55 dB NA)';
      else if (avg <= 70) degreeStr = 'Perda auditiva de grau marcado / acentuado (56 a 70 dB NA)';
      else if (avg <= 90) degreeStr = 'Perda auditiva de grau severo (71 a 90 dB NA)';
      else degreeStr = 'Perda auditiva de grau profundo (> 90 dB NA)';
      break;

    case 'biap_1996':
      if (avg <= 20) degreeStr = 'Audição normal (<= 20 dB NA)';
      else if (avg <= 40) degreeStr = 'Perda auditiva de grau leve (21 a 40 dB NA)';
      else if (avg <= 55) degreeStr = 'Perda auditiva de grau moderado - Grau I (41 a 55 dB NA)';
      else if (avg <= 70) degreeStr = 'Perda auditiva de grau moderado - Grau II (56 a 70 dB NA)';
      else if (avg <= 80) degreeStr = 'Perda auditiva de grau severo - Grau I (71 a 80 dB NA)';
      else if (avg <= 90) degreeStr = 'Perda auditiva de grau severo - Grau II (81 a 90 dB NA)';
      else if (avg <= 100) degreeStr = 'Perda auditiva de grau muito severo - Grau I (91 a 100 dB NA)';
      else if (avg <= 110) degreeStr = 'Perda auditiva de grau muito severo - Grau II (101 a 110 dB NA)';
      else if (avg <= 120) degreeStr = 'Perda auditiva de grau muito severo - Grau III (111 a 120 dB NA)';
      else degreeStr = 'Perda auditiva total / Cofose (> 120 dB NA)';
      break;

    case 'oms_2021':
      if (avg < 20) degreeStr = 'Audição normal (< 20 dB NA)';
      else if (avg < 35) degreeStr = 'Perda auditiva de grau leve (20 a < 35 dB NA)';
      else if (avg < 50) degreeStr = 'Perda auditiva de grau moderado (35 a < 50 dB NA)';
      else if (avg < 65) degreeStr = 'Perda auditiva de grau moderadamente severo (50 a < 65 dB NA)';
      else if (avg < 80) degreeStr = 'Perda auditiva de grau severo (65 a < 80 dB NA)';
      else if (avg < 95) degreeStr = 'Perda auditiva de grau profundo (80 a < 95 dB NA)';
      else degreeStr = 'Perda auditiva completa / Surdez (>= 95 dB NA)';
      break;

    default:
      degreeStr = avg <= 25 ? 'Audição dentro dos padrões de normalidade' : `Média de ${avg} dB NA (critério validado)`;
  }

  return {
    average: avg,
    frequenciesUsed: freqsToAverage,
    degree: degreeStr,
    reference: referenceName,
    hasPartialFrequencies: false,
    isolatedAlterations
  };
}

/**
 * Classificação assistida do TIPO de perda auditiva baseada em Silman & Silverman (1997)
 * Avalia limiares testados frequência por frequência (NÃO a média tonal!).
 */
export function calculateLossType(
  airThresholds: AudiogramDictionary,
  boneThresholds: AudiogramDictionary
): { type: LossType; description: string; reference: string; detailsPerFreq: string[] } {
  const testedFreqs = [500, 1000, 2000, 3000, 4000];
  const details: string[] = [];

  let hasAlteredAir = false;
  let conductiveCount = 0;
  let sensorineuralCount = 0;
  let mixedCount = 0;
  let testedComparisonsCount = 0;

  for (const f of testedFreqs) {
    const va = airThresholds[f];
    const vo = boneThresholds[f];

    if (va !== null && va !== undefined) {
      if (va > 25) {
        hasAlteredAir = true;
      }

      if (vo !== null && vo !== undefined) {
        testedComparisonsCount++;
        const gap = va - vo;

        if (va > 25) {
          if (vo <= 15 && gap >= 15) {
            conductiveCount++;
            details.push(`${f} Hz: Condutiva (VO ${vo} dB, VA ${va} dB, gap ${gap} dB)`);
          } else if (vo > 15 && gap <= 10) {
            sensorineuralCount++;
            details.push(`${f} Hz: Neurossensorial (VO ${vo} dB, VA ${va} dB, gap ${gap} dB)`);
          } else if (vo > 15 && gap > 10) {
            mixedCount++;
            details.push(`${f} Hz: Mista (VO ${vo} dB, VA ${va} dB, gap ${gap} dB)`);
          } else {
            details.push(`${f} Hz: Limiares indeterminados`);
          }
        } else {
          details.push(`${f} Hz: Normal (VA ${va} dB, VO ${vo} dB)`);
        }
      }
    }
  }

  // Se nenhum limiar de via aérea foi preenchido
  const anyAir = Object.values(airThresholds).some(v => v !== null && v !== undefined);
  if (!anyAir) {
    return {
      type: 'undetermined',
      description: 'Sem limiares inseridos',
      reference: 'Silman & Silverman (1997)',
      detailsPerFreq: []
    };
  }

  if (!hasAlteredAir) {
    return {
      type: 'normal',
      description: 'Limiares de via aérea dentro do padrão de normalidade (<= 25 dB NA)',
      reference: 'Silman & Silverman (1997)',
      detailsPerFreq: details
    };
  }

  if (testedComparisonsCount === 0) {
    return {
      type: 'undetermined',
      description: 'Via aérea alterada; Via óssea não testada para determinação do tipo',
      reference: 'Silman & Silverman (1997)',
      detailsPerFreq: details
    };
  }

  let finalType: LossType = 'undetermined';
  let desc = '';

  if (mixedCount > 0 || (conductiveCount > 0 && sensorineuralCount > 0)) {
    finalType = 'mixed';
    desc = 'Perda auditiva do tipo mista (sugestão assistida)';
  } else if (conductiveCount > 0 && sensorineuralCount === 0) {
    finalType = 'conductive';
    desc = 'Perda auditiva do tipo condutiva (sugestão assistida)';
  } else if (sensorineuralCount > 0 && conductiveCount === 0) {
    finalType = 'sensorineural';
    desc = 'Perda auditiva do tipo neurossensorial (sugestão assistida)';
  } else {
    finalType = 'undetermined';
    desc = 'Padrão aéreo-ósseo não conclusivo; requer avaliação clínica do fonoaudiólogo';
  }

  return {
    type: finalType,
    description: desc,
    reference: 'Silman & Silverman (1997)',
    detailsPerFreq: details
  };
}

/**
 * Classificação assistida da configuração audiométrica por orelha
 * Referência: Carhart (1945) / Silman & Silverman (1997)
 */
export function calculateAudiogramConfiguration(
  airThresholds: AudiogramDictionary
): { configuration: AudiogramConfiguration; label: string; reference: string } {
  const freqs = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000];
  const validPoints: { freq: number; db: number }[] = [];

  for (const f of freqs) {
    const val = airThresholds[f];
    if (val !== null && val !== undefined) {
      validPoints.push({ freq: f, db: val });
    }
  }

  if (validPoints.length < 3) {
    return {
      configuration: 'not_classified',
      label: 'Dados insuficientes para configuração',
      reference: 'Carhart (1945) / Silman & Silverman (1997)'
    };
  }

  // Verifica entalhe acústico (queda abrupta em 3k, 4k ou 6k com recuperação posterior)
  for (let i = 1; i < validPoints.length - 1; i++) {
    const prev = validPoints[i - 1];
    const curr = validPoints[i];
    const next = validPoints[i + 1];

    if ([3000, 4000, 6000].includes(curr.freq)) {
      if (curr.db - prev.db >= 15 && curr.db - next.db >= 10) {
        return {
          configuration: 'notched',
          label: `Configuração em entalhe (entalhe em ${curr.freq} Hz)`,
          reference: 'Carhart (1945) / Silman & Silverman (1997)'
        };
      }
    }
  }

  const first = validPoints[0];
  const last = validPoints[validPoints.length - 1];
  const totalDiff = last.db - first.db; // positivo = piora em agudos (descendente); negativo = melhora (ascendente)

  // Ascendente (melhora >= 15 dB em direção às frequências altas)
  if (totalDiff <= -15) {
    return {
      configuration: 'ascending',
      label: 'Configuração ascendente',
      reference: 'Carhart (1945) / Silman & Silverman (1997)'
    };
  }

  // Descendentes
  if (totalDiff >= 15) {
    // Verifica descendente em rampa (queda brusca >= 25 dB por oitava)
    let hasCliff = false;
    for (let i = 0; i < validPoints.length - 1; i++) {
      const p1 = validPoints[i];
      const p2 = validPoints[i + 1];
      const octDiff = Math.log2(p2.freq / p1.freq);
      if (octDiff > 0) {
        const dropPerOctave = (p2.db - p1.db) / octDiff;
        if (dropPerOctave >= 25) {
          hasCliff = true;
          break;
        }
      }
    }

    if (hasCliff) {
      return {
        configuration: 'cliff_descending',
        label: 'Configuração descendente em rampa',
        reference: 'Carhart (1945) / Silman & Silverman (1997)'
      };
    }

    if (totalDiff >= 30) {
      return {
        configuration: 'marked_descending',
        label: 'Configuração descendente acentuada',
        reference: 'Carhart (1945) / Silman & Silverman (1997)'
      };
    }

    return {
      configuration: 'slight_descending',
      label: 'Configuração descendente leve',
      reference: 'Carhart (1945) / Silman & Silverman (1997)'
    };
  }

  // Horizontal (diferença <= 5 dB por oitava em todas as frequências)
  const allDiffsSmall = validPoints.every((p, idx) => {
    if (idx === 0) return true;
    return Math.abs(p.db - validPoints[idx - 1].db) <= 10;
  });

  if (allDiffsSmall && Math.abs(totalDiff) <= 10) {
    return {
      configuration: 'horizontal',
      label: 'Configuração horizontal',
      reference: 'Carhart (1945) / Silman & Silverman (1997)'
    };
  }

  return {
    configuration: 'irregular',
    label: 'Configuração traçado irregular',
    reference: 'Carhart (1945) / Silman & Silverman (1997)'
  };
}

/**
 * Classificação assistida do IPRF / IRF conforme intervalos estritos do Guia CFFa 2023
 * Intervalos:
 * 90–100%: Reconhecimento de fala dentro da normalidade
 * 78–88%: Discreta dificuldade
 * 66–76%: Moderada dificuldade
 * 54–56%: Acentuada dificuldade
 * Abaixo de 52%: Profunda dificuldade
 * Intervalos fora dessa tabela: NÃO inventar categoria -> "Não classificado automaticamente pelo critério selecionado."
 */
export function classifyIPRF(percentage: number | null | undefined): string {
  if (percentage === null || percentage === undefined || isNaN(percentage)) {
    return 'Não realizado ou não informado';
  }

  const p = Math.round(percentage);

  if (p >= 90 && p <= 100) {
    return 'Reconhecimento de fala dentro dos padrões de normalidade (90 a 100%)';
  }
  if (p >= 78 && p <= 88) {
    return 'Discreta dificuldade de reconhecimento de fala (78 a 88%)';
  }
  if (p >= 66 && p <= 76) {
    return 'Moderada dificuldade de reconhecimento de fala (66 a 76%)';
  }
  if (p >= 54 && p <= 56) {
    return 'Acentuada dificuldade de reconhecimento de fala (54 a 56%)';
  }
  if (p < 52) {
    return 'Profunda dificuldade de reconhecimento de fala (< 52%)';
  }

  return 'Não classificado automaticamente pelo critério selecionado (valor intermediário segundo tabela do Guia CFFa 2023)';
}

/**
 * Análise assistida do reflexo contralateral frente ao limiar da via aérea aferente
 * Diferencial:
 * 70 a 100 dB acima do limiar da VA: Presente em níveis normais
 * < 70 dB acima: Presente diminuído (sugestivo de recrutamento)
 * > 100 dB acima: Presente aumentado
 */
export function analyzeContralateralReflex(
  reflexDb: number | null | undefined,
  airThresholdDb: number | null | undefined,
  status: 'present' | 'absent' | 'not_tested'
): string {
  if (status === 'not_tested') return 'Não pesquisado';
  if (status === 'absent') return 'Ausente na intensidade máxima testada';
  if (reflexDb === null || reflexDb === undefined) return 'Não informado';
  if (airThresholdDb === null || airThresholdDb === undefined) return `Presente em ${reflexDb} dB`;

  const diff = reflexDb - airThresholdDb;
  if (diff >= 70 && diff <= 100) {
    return `Presente em níveis normais (${diff} dB acima do limiar de VA)`;
  }
  if (diff < 70) {
    return `Presente diminuído (${diff} dB acima do limiar de VA - recrutamento objetivo)`;
  }
  return `Presente aumentado (${diff} dB acima do limiar de VA)`;
}
