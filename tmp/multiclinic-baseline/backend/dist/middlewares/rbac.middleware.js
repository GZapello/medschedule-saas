"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
exports.requirePermissionOrRole = requirePermissionOrRole;
const database_1 = require("../config/database");
const role_permissions_1 = require("../utils/role-permissions");
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Usuário não autenticado' });
            return;
        }
        // SuperAdmin tem acesso irrestrito em qualquer rota de gestão
        if (req.user.role === 'superadmin') {
            return next();
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                error: 'Você não possui permissão para acessar esta área.',
                code: 'FORBIDDEN'
            });
            return;
        }
        next();
    };
}
function requirePermissionOrRole(permissionId, ...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Usuário não autenticado' });
            return;
        }
        // SuperAdmin tem acesso irrestrito
        if (req.user.role === 'superadmin') {
            return next();
        }
        // Papéis autorizados diretamente (ex: clinic_admin)
        if (allowedRoles.includes(req.user.role)) {
            return next();
        }
        // Verifica se o usuário possui permissão concedida na clínica
        if (req.tenantId && req.user.userId) {
            try {
                const cu = database_1.db.prepare('SELECT permissions_json, role FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, req.tenantId);
                let perms = [];
                if (cu?.permissions_json) {
                    try {
                        const parsed = JSON.parse(cu.permissions_json);
                        if (Array.isArray(parsed))
                            perms = parsed;
                    }
                    catch (_) { }
                }
                // Mescla com as permissões padrão do papel (garante compatibilidade retroativa para usuários existentes)
                const userRole = cu?.role || req.user.role;
                const defaultPerms = (0, role_permissions_1.getDefaultPermissionsForRole)(userRole);
                const effectivePerms = Array.from(new Set([...perms, ...defaultPerms]));
                if (effectivePerms.includes(permissionId)) {
                    return next();
                }
            }
            catch (_) { }
        }
        res.status(403).json({
            success: false,
            error: 'Você não possui permissão para realizar esta ação.',
            code: 'FORBIDDEN'
        });
    };
}
