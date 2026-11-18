export const SERVICE_TYPES = ['access_unlimited', 'access_limited', 'individual', 'duo', 'group', 'deliverable'] as const;
export const MODALITIES = ['presential', 'online', 'home', 'both'] as const;
export const UNITS = ['per_session', 'per_participant', 'per_month', 'per_cycle', 'contract_total'] as const;
export const PERIODS = ['one_time', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'installments'] as const;
export const DURATIONS = ['1_month', '2_months', '3_months', '6_months', '12_months', '24_months'] as const;
export const FREQUENCIES = ['weekly', 'monthly', 'unlimited', 'fixed_count'] as const;

export interface ProposalEvidence {
  sources: number[];
  evidence: string;
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
  isMonthlyEquivalent?: boolean;
  equivalentMonthlyCents?: number | null;
  maxInstallments?: number | null;
  ambiguousReason?: string;
}

export interface ProposedSchedule extends ProposalEvidence {
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  capacity: number | null;
  professionalName: string;
  professionalId: string;
  suggestedProfessionalId?: string;
}

export interface ProposedAdjustment extends ProposalEvidence {
  label: string;
  adjustmentType: 'surcharge' | 'discount' | null;
  valueType: 'fixed' | 'percentage' | null;
  amount: number | null;
  incidence: 'per_student' | 'per_session' | null;
  weekdays: number[];
  startTime: string;
  endTime: string;
}

export interface ProposedAddonOption extends ProposalEvidence {
  id?: string;
  label: string;
  addonServiceName: string;
  addonServiceRef: string;
  frequencyType: typeof FREQUENCIES[number] | null;
  frequencyCount: number | null;
  creditsPerCycle: number | null;
  additionalPriceCents: number | null;
  comboDiscountType: 'none' | 'fixed_cents' | 'percentage';
  comboDiscountValue: number | null;
  billingPeriodicity: 'monthly' | 'per_cycle' | 'one_time' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';
  durationMode: 'match_base' | typeof DURATIONS[number];
  scheduleTiming: 'during_purchase' | 'after_confirmation' | 'not_applicable';
  mandatoryUnclear?: boolean;
  ambiguousReason?: string;
  active: boolean;
}

export interface ReviewableRecord {
  key: string;
  name: string;
  description: string;
  notes: string;
  sources: number[];
  issues: string[];
  reviewed: boolean;
  existingId: string;
  allowPublicBooking?: boolean;
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
  suggestedProfessionalId?: string;
  deferSchedules?: boolean;
  action: 'create' | 'link' | 'update' | 'ignore';
  apply: string[];
  prices: ProposedPrice[];
  schedules: ProposedSchedule[];
  adjustments: ProposedAdjustment[];
  optionalAddons?: ProposedAddonOption[];
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

export interface CatalogWorkShift {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface CatalogProfessionalSummary {
  id: string;
  name: string;
  professionName?: string | null;
  publicBookingEnabled?: boolean;
  workShifts: CatalogWorkShift[];
  scheduleSummary: string;
}

export interface CatalogRecord {
  id: string;
  name: string;
  active: boolean;
  type?: string;
  capacity?: number | null;
  professionalId?: string | null;
  score?: number;
  matchReason?: string;
}

export interface ScheduleSlotCheck {
  index: number;
  status: 'ok' | 'incomplete' | 'missing_professional' | 'outside_shift' | 'conflict' | 'not_schedulable';
  message: string;
  availableRanges?: string;
}

export interface ImportAlert {
  id: string;
  scope: 'service' | 'package';
  recordKey: string;
  recordName: string;
  section: 'general' | 'prices' | 'schedules' | 'adjustments' | 'addons' | 'items';
  severity: 'blocking' | 'warning';
  message: string;
}

export interface ImportPreviewSummary {
  willCreateServices: number;
  willUpdateServices: number;
  willLinkServices: number;
  willIgnoreServices: number;
  willCreatePackages: number;
  willLinkPackages: number;
  willIgnorePackages: number;
  totalPriceOptions: number;
  totalSchedules: number;
  deferredScheduleServices: number;
}

export interface ImportDiagnostics {
  summary: {
    servicesTotal: number;
    servicesReady: number;
    servicesPending: number;
    packagesTotal: number;
    packagesReady: number;
    packagesPending: number;
    priceOptionsTotal: number;
    ambiguousPricesCount: number;
    schedulesTotal: number;
    incompleteSchedulesCount: number;
    scheduleConflictsCount: number;
    duplicatesFound: number;
    blockingAlertsCount: number;
  };
  alerts: ImportAlert[];
  scheduleChecks: Record<string, ScheduleSlotCheck[]>;
  preview: ImportPreviewSummary;
}

export interface ImportSource {
  id: number;
  fileName: string;
  copies: number;
}

export interface ImportReceipt {
  services: { key: string; id: string; name: string; action: string }[];
  packages: { key: string; id: string; name: string; action: string }[];
}

export interface ImportDraft {
  id: string;
  revision: number;
  sources: ImportSource[];
  proposal: StudioProposal;
  result: ImportReceipt | null;
  catalog: {
    services: CatalogRecord[];
    packages: CatalogRecord[];
    professionals: CatalogProfessionalSummary[];
  };
  matches: {
    services: Record<string, CatalogRecord[]>;
    packages: Record<string, CatalogRecord[]>;
  };
  diagnostics?: ImportDiagnostics;
}
