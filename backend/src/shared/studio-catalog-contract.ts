export const SERVICE_TYPES = ['access_unlimited', 'access_limited', 'individual', 'duo', 'group', 'deliverable'] as const;
export const MODALITIES = ['presential', 'online', 'home', 'both'] as const;
export const UNITS = ['per_session', 'per_participant', 'per_month', 'per_cycle', 'contract_total'] as const;
export const PERIODS = ['one_time', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'installments'] as const;
export const DURATIONS = ['1_month', '2_months', '3_months', '6_months', '12_months', '24_months'] as const;
export const FREQUENCIES = ['weekly', 'monthly', 'unlimited', 'fixed_count'] as const;

interface ProposalEvidence {
  sources: number[];
  evidence: string;
}

interface ReviewableRecord {
  key: string;
  name: string;
  description: string;
  notes: string;
  sources: number[];
  issues: string[];
  reviewed: boolean;
  existingId: string;
}

export interface ProposedPrice extends ProposalEvidence {
  label: string;
  amountCents: number | null;
  unit: typeof UNITS[number] | null;
  paymentPeriod: typeof PERIODS[number] | null;
  duration: typeof DURATIONS[number] | null;
  frequencyType: typeof FREQUENCIES[number] | null;
  frequencyCount: number | null;
  installments: number | null;
  participants: number | null;
}

interface ProposedSchedule extends ProposalEvidence {
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  capacity: number | null;
  professionalName: string;
  professionalId: string;
}

interface ProposedAdjustment extends ProposalEvidence {
  label: string;
  adjustmentType: 'surcharge' | 'discount' | null;
  valueType: 'fixed' | 'percentage' | null;
  amount: number | null;
  incidence: 'per_student' | 'per_session' | null;
  weekdays: number[];
  startTime: string;
  endTime: string;
}

export interface ProposedService extends ReviewableRecord {
  activity: string;
  type: typeof SERVICE_TYPES[number] | null;
  modality: typeof MODALITIES[number] | null;
  capacity: number | null;
  durationMinutes: number | null;
  weeklyLimit: number | null;
  monthlyLimit: number | null;
  professionalNames: string[];
  professionalId: string;
  action: 'create' | 'link' | 'update' | 'ignore';
  apply: string[];
  prices: ProposedPrice[];
  schedules: ProposedSchedule[];
  adjustments: ProposedAdjustment[];
}

export interface ProposedPackageItem {
  serviceName: string;
  serviceRef: string;
  includedCredits: number | null;
  weeklyFrequency: number | null;
  monthlyLimit: number | null;
  mandatory: boolean;
}

export interface ProposedPackage extends ReviewableRecord {
  action: 'create' | 'link' | 'ignore';
  price: ProposedPrice | null;
  items: ProposedPackageItem[];
}

export interface StudioProposal {
  services: ProposedService[];
  packages: ProposedPackage[];
}
