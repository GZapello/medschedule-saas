"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
function requireJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET não configurado no ambiente. Defina a variável de ambiente JWT_SECRET antes de iniciar o servidor.');
    }
    return secret;
}
const JWT_SECRET = requireJwtSecret();
const JWT_EXPIRES_IN = '7d';
function generateToken(payload) {
    const tenant = payload.tenantId ? database_1.db.prepare('SELECT session_version FROM tenants WHERE id = ?').get(payload.tenantId) : null;
    const user = payload.userId ? database_1.db.prepare('SELECT session_version FROM users WHERE id = ?').get(payload.userId) : null;
    return jsonwebtoken_1.default.sign({
        ...payload,
        sessionVersion: tenant?.session_version || 0,
        userSessionVersion: user?.session_version || 0
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch (err) {
        return null;
    }
}
