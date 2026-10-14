"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessmentCapabilities = void 0;
exports.fieldCapability = fieldCapability;
exports.projectClinicalData = projectClinicalData;
const policy_json_1 = __importDefault(require("./policy.json"));
exports.assessmentCapabilities = Object.keys(policy_json_1.default);
function fieldCapability(field) {
    for (const [cap, patterns] of Object.entries(policy_json_1.default))
        for (const pattern of patterns) {
            if (pattern.endsWith('*') ? field.startsWith(pattern.slice(0, -1)) : field === pattern)
                return cap;
        }
}
function projectClinicalData(value, capabilities) {
    if (Array.isArray(value))
        return value.filter(v => !v?.field || !fieldCapability(v.field) || capabilities.includes(fieldCapability(v.field))).map(v => projectClinicalData(v, capabilities));
    if (!value || typeof value !== 'object')
        return value;
    const output = {};
    for (const [key, item] of Object.entries(value)) {
        const cap = fieldCapability(key);
        if (cap && !capabilities.includes(cap))
            continue;
        if (['tav_comparison', 'derived', 'references'].includes(key) && !capabilities.includes('BODY_COMPOSITION'))
            continue;
        if (['current_photos', 'previous_photos'].includes(key) && !capabilities.includes('PHOTO_MONITORING'))
            continue;
        if (key === 'posture_json' && typeof item === 'string' && !capabilities.includes('PHOTO_MONITORING')) {
            try {
                const posture = JSON.parse(item);
                delete posture.views;
                output[key] = JSON.stringify(posture);
            }
            catch {
                output[key] = null;
            }
        }
        else
            output[key] = projectClinicalData(item, capabilities);
    }
    return output;
}
