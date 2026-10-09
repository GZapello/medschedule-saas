/**
 * Mapeamento e Presets Canônicos de Permissões por Papel (Role)
 * Centraliza a fonte da verdade para convites, registros, aprovações e gestão de equipe.
 */

export const DEFAULT_RECEPTIONIST_PERMISSIONS: string[] = [
  'view_schedule',
  'create_appointment',
  'edit_appointment',
  'cancel_appointment',
  'create_patient',
  'edit_patient',
  'view_exams',
  'view_financial',
  'issue_receipt',
  'view_receipts',
  'view_budgets',
  'manage_budgets',
  'view_inventory',
  'manage_inventory',
  'can_import_data'
];

export const DEFAULT_PROFESSIONAL_PERMISSIONS: string[] = [
  'view_schedule',
  'create_appointment',
  'edit_appointment',
  'cancel_appointment',
  'create_patient',
  'edit_patient',
  'view_budgets',
  'manage_budgets',
  'can_import_data'
];

export const DEFAULT_FINANCIAL_PERMISSIONS: string[] = [
  'view_schedule',
  'create_appointment',
  'edit_appointment',
  'cancel_appointment',
  'create_patient',
  'edit_patient',
  'view_financial',
  'issue_receipt',
  'view_receipts',
  'view_budgets',
  'manage_budgets'
];

export const DEFAULT_ASSISTANT_PERMISSIONS: string[] = [
  'view_schedule',
  'create_appointment',
  'edit_appointment',
  'cancel_appointment',
  'create_patient',
  'edit_patient',
  'view_exams',
  'view_inventory',
  'manage_inventory'
];

export const DEFAULT_CLINIC_ADMIN_PERMISSIONS: string[] = [
  'manage_subscription',
  'view_schedule',
  'create_appointment',
  'edit_appointment',
  'cancel_appointment',
  'create_patient',
  'edit_patient',
  'delete_patient',
  'view_records',
  'edit_records',
  'view_exams',
  'view_financial',
  'manage_financial',
  'issue_receipt',
  'view_receipts',
  'view_budgets',
  'manage_budgets',
  'view_inventory',
  'manage_inventory',
  'view_reports',
  'manage_professionals',
  'manage_staff',
  'manage_services',
  'manage_settings',
  'can_import_data'
];

/**
 * Retorna as permissões padrão para um determinado papel no sistema.
 */
export function getDefaultPermissionsForRole(role: string): string[] {
  switch (role) {
    case 'receptionist':
    case 'secretary':
      return [...DEFAULT_RECEPTIONIST_PERMISSIONS];
    case 'professional':
      return [...DEFAULT_PROFESSIONAL_PERMISSIONS];
    case 'financial':
      return [...DEFAULT_FINANCIAL_PERMISSIONS];
    case 'assistant':
      return [...DEFAULT_ASSISTANT_PERMISSIONS];
    case 'clinic_admin':
      return [...DEFAULT_CLINIC_ADMIN_PERMISSIONS];
    default:
      return [
        'view_schedule',
        'create_appointment',
        'edit_appointment',
        'cancel_appointment',
        'create_patient',
        'edit_patient'
      ];
  }
}
