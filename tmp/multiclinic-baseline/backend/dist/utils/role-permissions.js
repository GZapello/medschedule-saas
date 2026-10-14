"use strict";
/**
 * Mapeamento e Presets Canônicos de Permissões por Papel (Role)
 * Centraliza a fonte da verdade para convites, registros, aprovações e gestão de equipe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CLINIC_ADMIN_PERMISSIONS = exports.DEFAULT_ASSISTANT_PERMISSIONS = exports.DEFAULT_FINANCIAL_PERMISSIONS = exports.DEFAULT_PROFESSIONAL_PERMISSIONS = exports.DEFAULT_RECEPTIONIST_PERMISSIONS = void 0;
exports.getDefaultPermissionsForRole = getDefaultPermissionsForRole;
exports.DEFAULT_RECEPTIONIST_PERMISSIONS = [
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
exports.DEFAULT_PROFESSIONAL_PERMISSIONS = [
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
exports.DEFAULT_FINANCIAL_PERMISSIONS = [
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
exports.DEFAULT_ASSISTANT_PERMISSIONS = [
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
exports.DEFAULT_CLINIC_ADMIN_PERMISSIONS = [
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
function getDefaultPermissionsForRole(role) {
    switch (role) {
        case 'receptionist':
        case 'secretary':
            return [...exports.DEFAULT_RECEPTIONIST_PERMISSIONS];
        case 'professional':
            return [...exports.DEFAULT_PROFESSIONAL_PERMISSIONS];
        case 'financial':
            return [...exports.DEFAULT_FINANCIAL_PERMISSIONS];
        case 'assistant':
            return [...exports.DEFAULT_ASSISTANT_PERMISSIONS];
        case 'clinic_admin':
            return [...exports.DEFAULT_CLINIC_ADMIN_PERMISSIONS];
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
