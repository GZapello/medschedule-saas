export interface StudentProfile {
  id?: string;
  patient_id: string;
  goal?: string;
  experience_level?: 'iniciante' | 'intermediario' | 'avancado' | 'atleta';
  weekly_frequency?: number;
  training_preferences?: string;
  restrictions?: string;
  notes?: string;
  height?: number;
  current_weight?: number;
}

export interface Student {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  birth_date?: string;
  gender?: string;
  status: string;
  avatar_url?: string;
  created_at: string;
  goal?: string;
  experience_level?: string;
  weekly_frequency?: number;
  restrictions?: string;
  height?: number;
  current_weight?: number;
  active_workouts_count?: number;
  last_assessment_date?: string;
  last_fat_pct?: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
  secondary_muscles_json?: string;
  instructions?: string;
  photo_url?: string;
  is_custom?: number;
  created_by?: string;
}

export interface WorkoutExercise {
  id?: string;
  exercise_id?: string;
  order_index?: number;
  name: string;
  muscle_group: string;
  sets: number;
  reps: string;
  load_kg?: number;
  tempo?: string;
  rest_seconds: number;
  cadence?: string;
  rpe?: number;
  rir?: number;
  technique?: string;
  technique_custom?: string;
  notes?: string;
  photo_url?: string;
  exercise_default_photo?: string;
  instructions?: string;
}

export interface Workout {
  id: string;
  patient_id: string;
  patient_name?: string;
  professional_id: string;
  professional_name?: string;
  title: string;
  division: string; // 'A' | 'B' | 'C' | 'D' | 'E'
  structure_type?: string; // 'ABC', 'ABCD', 'ABCDE', 'Fullbody', 'Upper/Lower'
  version?: number;
  is_active: number;
  notes?: string;
  exercises_count?: number;
  created_at: string;
  updated_at?: string;
  exercises?: WorkoutExercise[];
}

export interface AssessmentPhoto {
  id: string;
  assessment_id?: string;
  patient_id: string;
  photo_type: 'front' | 'back' | 'right' | 'left';
  photo_url: string;
  photo_date: string;
  notes?: string;
  weight?: number;
  body_fat_percentage?: number;
}

export interface StrengthTestItem {
  id?: string;
  exercise_name: string;
  load_kg: number;
  reps: number;
  one_rm_kg?: number;
  test_date?: string;
  notes?: string;
}

export interface EnduranceTestItem {
  id?: string;
  test_name: string;
  result_value: number;
  unit: string; // 'reps' | 'segundos'
  classification?: string;
  notes?: string;
}

export interface FlexibilityTestItem {
  id?: string;
  test_name: string;
  result_cm?: number;
  notes?: string;
}

export interface TavRange {
  id: string;
  protocol_id: string;
  gender?: string;
  min_age?: number | null;
  max_age?: number | null;
  min_value: number;
  max_value: number;
  classification: string;
  color_code?: string;
}

export interface TavProtocol {
  id: string;
  tenant_id: string;
  method: string;
  equipment: string;
  protocol_name: string;
  unit: string;
  source_reference?: string;
  is_active: number;
  ranges?: TavRange[];
}

export interface ComparisonMetricItem {
  field: string;
  label: string;
  unit: string;
  previous: number | null;
  current: number | null;
  diff: number | null;
  pct_variation: number | null;
}

export interface AssessmentComparison {
  previous_assessment: Assessment;
  current_assessment: Assessment;
  previous_photos: AssessmentPhoto[];
  current_photos: AssessmentPhoto[];
  metrics: ComparisonMetricItem[];
  tav_comparison: {
    previous: {
      value?: number;
      unit?: string;
      method?: string;
      equipment?: string;
      classification?: string;
    };
    current: {
      value?: number;
      unit?: string;
      method?: string;
      equipment?: string;
      classification?: string;
    };
  };
}

export interface Assessment {
  id: string;
  patient_id: string;
  professional_id: string;
  professional_name?: string;
  assessment_date: string;
  weight?: number;
  height?: number;
  bmi?: number;
  whr?: number;
  whtr?: number;
  neck_cm?: number;
  shoulder_cm?: number;
  chest_cm?: number;
  arm_right_relaxed?: number;
  arm_left_relaxed?: number;
  arm_right_flexed?: number;
  arm_left_flexed?: number;
  forearm_right?: number;
  forearm_left?: number;
  wrist_right?: number;
  wrist_left?: number;
  waist_cm?: number;
  abdomen_cm?: number;
  hip_cm?: number;
  thigh_right_prox?: number;
  thigh_left_prox?: number;
  thigh_right_med?: number;
  thigh_left_med?: number;
  thigh_right_dist?: number;
  thigh_left_dist?: number;
  calf_right?: number;
  calf_left?: number;
  fold_subscapular?: number;
  fold_triceps?: number;
  fold_biceps?: number;
  fold_chest?: number;
  fold_axillary?: number;
  fold_suprailiac?: number;
  fold_abdominal?: number;
  fold_thigh?: number;
  fold_calf?: number;
  skinfolds_protocol?: string;
  body_fat_percentage?: number;
  fat_mass_kg?: number;
  lean_mass_kg?: number;
  muscle_mass_kg?: number;
  composition_method?: string;
  body_water_liters?: number;
  bmr_kcal?: number;
  raw_composition_data_json?: string;
  tav_value?: number;
  tav_unit?: string;
  tav_method?: string;
  tav_equipment?: string;
  tav_protocol_id?: string;
  tav_classification?: string;
  tav_notes?: string;
  resting_heart_rate_bpm?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  vo2_max?: number;
  vo2_method_type?: string;
  vo2_protocol?: string;
  strength_tests_json?: string;
  muscular_endurance_tests_json?: string;
  flexibility_wells_cm?: number;
  flexibility_tests_json?: string;
  protocol?: string;
  notes?: string;
  photos_count?: number;
}

export interface WorkoutLog {
  id: string;
  workout_id?: string;
  workout_title?: string;
  division?: string;
  patient_id: string;
  patient_name?: string;
  avatar_url?: string;
  completed_at: string;
  duration_minutes?: number;
  rpe?: number;
  feedback_notes?: string;
  exercises_performed?: Array<{
    name: string;
    load_kg?: number;
    sets_completed?: number;
    reps?: string;
  }>;
}

export interface PersonalRecord {
  exercise_name: string;
  max_load: number;
  date: string;
  reps?: string;
}

export interface WorkoutTemplate {
  id: string;
  title: string;
  structure_type: string;
  description?: string;
  workouts: Array<{
    title: string;
    division: string;
    notes?: string;
    exercises: WorkoutExercise[];
  }>;
  created_at: string;
}

export interface AttendanceStats {
  totalWorkoutsCompleted: number;
  lastMonthWorkouts: number;
  targetWeeklyFrequency: number;
  currentWeeklyAvg: number;
  adherencePercentage: number;
  appointments: {
    total_scheduled: number;
    completed_count: number;
    canceled_count: number;
    no_show_count: number;
  };
}
