/**
 * Modelos de dados e tipos para o módulo de Audiologia do ZemdaFono
 * Baseado nas diretrizes do Guia CFFa (2023) - Volume I
 */

export type EarSide = 'right' | 'left';
export type ConductionType = 'air' | 'bone';

export type TransducerType =
  | 'supra_aural'     // Fone supra-aural (ex: TDH-39, DD45)
  | 'insert'         // Fone de inserção (ex: ER-3A, 3C)
  | 'bone_vibrator'   // Vibrador ósseo (ex: B-71, Radioear)
  | 'free_field'     // Campo livre (alto-falantes)
  | 'other';

export interface AudiometryThresholdItem {
  frequency: number;       // Hz (125 a 8000 Hz, ou altas frequências)
  db: number;              // dB NA (-10 a 120)
  ear: EarSide;
  conduction: ConductionType;
  masked: boolean;
  noResponse: boolean;
  maskingLevel?: number | null; // Intensidade do ruído mascarante em dB
  transducer?: TransducerType;
}

export type AudiogramDictionary = { [freq: number]: number | null };

export interface AudiogramData {
  rightAir: AudiogramDictionary;
  leftAir: AudiogramDictionary;
  rightBone: AudiogramDictionary;
  leftBone: AudiogramDictionary;
  // Estrutura rica de limiares com mascaramento e ausência de resposta
  detailedThresholds?: AudiometryThresholdItem[];
}

export type InspectionStatus = 'no_impediment' | 'alteration' | 'impediment' | 'not_evaluated';

export interface EarCanalInspection {
  odStatus: InspectionStatus;
  odNotes: string;
  oeStatus: InspectionStatus;
  oeNotes: string;
}

export interface AudiologyEquipment {
  brand: string;
  model: string;
  calibrationDate: string;
  serialNumber?: string;
  transducer?: TransducerType;
}

export type DegreeCriterion =
  | 'none'
  | 'lloyd_kaplan_1978'
  | 'kaplan_gladstone_lloyd_1993'
  | 'davis_1970'
  | 'biap_1996'
  | 'oms_2021'
  | 'other';

export type InfantCriterion =
  | 'none'
  | 'northern_downs_2005'
  | 'oms_2020'
  | 'other';

export type WeberResult = 'lateralize_right' | 'lateralize_left' | 'indifferent' | 'not_performed';

export interface WeberTest {
  500?: WeberResult;
  1000?: WeberResult;
  2000?: WeberResult;
  3000?: WeberResult;
  4000?: WeberResult;
}

export interface SpeechAudiometry {
  lrfOD?: number | null;                    // Limiar de Reconhecimento de Fala (dB)
  lrfOE?: number | null;
  ldvOD?: number | null;                    // Limiar de Detecção de Voz (dB)
  ldvOE?: number | null;
  iprfOD?: number | null;                  // Índice Percentual de Reconhecimento de Fala (%)
  iprfOE?: number | null;
  presentationIntensityOD?: number | null; // Intensidade de apresentação (dB)
  presentationIntensityOE?: number | null;
  maskingOD?: number | null;               // Mascaramento em dB
  maskingOE?: number | null;
  wordList?: string;                       // Material / Lista de palavras utilizada
  notes?: string;
  notPerformed?: boolean;
}

export type TympanometryCurveType = 'A' | 'As' | 'Ad' | 'B' | 'C' | 'D' | 'P' | 'other' | '';

export interface TympanometryEar {
  earCanalVolume?: number | null;   // Volume do MAE (ml ou cm³)
  peakPressure?: number | null;     // Pressão do pico (daPa)
  compliance?: number | null;       // Complacência/admitância (ml ou mmho)
  curveType?: TympanometryCurveType;
  notes?: string;
}

export interface Tympanometry {
  probeFrequency: '226' | '1000' | 'other';
  probeFrequencyOther?: string;
  right: TympanometryEar;
  left: TympanometryEar;
}

export type AcousticReflexStatus = 'present' | 'absent' | 'not_tested';

export interface AcousticReflexItem {
  db?: number | null;
  status: AcousticReflexStatus;
}

export interface AcousticReflexes {
  ipsiOD: Record<number, AcousticReflexItem>;
  ipsiOE: Record<number, AcousticReflexItem>;
  contraOD: Record<number, AcousticReflexItem>;
  contraOE: Record<number, AcousticReflexItem>;
}

export interface PediatricCrossCheck {
  behavioralObservation?: string;
  instrumentalSounds?: string;
  speechSounds?: string;
  vra?: string;                // Visual Reinforcement Audiometry
  cpa?: string;                // Conditioned Play Audiometry
  imitanciometry?: string;
  eoa?: string;                // Emissões Otoacústicas
  bera?: string;               // PEATE / BERA
  numberOfSessions?: number;
  interaction?: string;
  speechComprehension?: string;
  quantitativeResults?: string;
  qualitativeResults?: string;
  guidance?: string;
  criterion?: InfantCriterion;
}

export interface HighFrequencyAudiometry {
  right?: Record<number, number | null>;
  left?: Record<number, number | null>;
  equipment?: string;
  transducer?: string;
  stimulus?: string;
  criterion?: string;
  notes?: string;
}

export interface OccupationalAudiometry {
  jobRole?: string;
  complementNR7?: string;
  notes?: string;
}

export type LossType = 'normal' | 'conductive' | 'sensorineural' | 'mixed' | 'undetermined';

export type AudiogramConfiguration =
  | 'horizontal'
  | 'ascending'
  | 'slight_descending'
  | 'marked_descending'
  | 'cliff_descending'
  | 'u_shaped'
  | 'inverted_u_shaped'
  | 'notched'
  | 'irregular'
  | 'not_classified';

export interface AudiologyClassification {
  degreeCriterion: DegreeCriterion;
  typeCriterion: string;            // Ex: "Silman & Silverman (1997)"
  configurationCriterion: string;   // Ex: "Carhart (1945) / Silman & Silverman (1997)"
  suggestedResultOD: string;
  suggestedResultOE: string;
  confirmedResultOD: string;
  confirmedResultOE: string;
  laterality: 'unilateral' | 'bilateral' | 'none';
  symmetry: 'symmetric' | 'asymmetric' | 'none';
  isolatedFrequencies?: string;
  finalConclusion: string;
  referenceUsed: string;
  confirmedByProfessional: boolean;
  confirmedAt?: string;
  professionalName?: string;
  crfa?: string;
}

export type AudiologyModality = 'clinical' | 'pediatric' | 'occupational' | 'high_frequency';

export interface AudiologyRecordPayload {
  schemaVersion: 2;
  modality: AudiologyModality;
  inspection: EarCanalInspection;
  equipment: AudiologyEquipment;
  audiometry: {
    thresholds: AudiometryThresholdItem[];
    rightAir: AudiogramDictionary;
    leftAir: AudiogramDictionary;
    rightBone: AudiogramDictionary;
    leftBone: AudiogramDictionary;
    transducer: TransducerType;
  };
  classification: AudiologyClassification;
  weber: WeberTest;
  speechAudiometry: SpeechAudiometry;
  tympanometry: Tympanometry;
  acousticReflexes: AcousticReflexes;
  pediatric?: PediatricCrossCheck;
  highFrequency?: HighFrequencyAudiometry;
  occupational?: OccupationalAudiometry;
  referredBy?: string;
  notes?: string;
}
