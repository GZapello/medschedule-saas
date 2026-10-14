"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTRATION_PROFESSIONS = exports.PROFESSION_CATEGORIES = void 0;
exports.PROFESSION_CATEGORIES = [
    {
        id: 'health_wellness',
        name: 'Saúde Humana e Bem-estar',
        professions: [
            { id: 'med_general', label: 'Médico(a) - Todas as Especialidades', category: 'health_wellness', defaultDurationMinutes: 30, bufferMinutes: 0 },
            { id: 'psychology', label: 'Psicólogo(a) / Psicoterapeuta', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
            { id: 'speech_therapy', label: 'Fonoaudiólogo(a)', category: 'health_wellness', defaultDurationMinutes: 40, bufferMinutes: 5 },
            { id: 'nutrition', label: 'Nutricionista', category: 'health_wellness', defaultDurationMinutes: 45, bufferMinutes: 5 },
            { id: 'physiotherapy', label: 'Fisioterapeuta', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 5 },
            { id: 'dentistry', label: 'Odontologista / Dentista', category: 'health_wellness', defaultDurationMinutes: 45, bufferMinutes: 10 },
            { id: 'occupational_therapy', label: 'Terapeuta Ocupacional', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
            { id: 'psychopedagogy', label: 'Psicopedagogo(a)', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
            { id: 'nursing', label: 'Enfermeiro(a)', category: 'health_wellness', defaultDurationMinutes: 40, bufferMinutes: 5 },
            { id: 'personal_trainer', label: 'Personal Trainer / Profissional de Educação Física', category: 'health_wellness', defaultDurationMinutes: 60, bufferMinutes: 10 },
            { id: 'acupuncture', label: 'Acupunturista', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
            { id: 'podology', label: 'Podólogo(a)', category: 'health_wellness', defaultDurationMinutes: 45, bufferMinutes: 10 },
            { id: 'art_therapy', label: 'Arteterapeuta', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
            { id: 'music_therapy', label: 'Musicoterapeuta', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 },
            { id: 'biomedicine', label: 'Biomédico(a)', category: 'health_wellness', defaultDurationMinutes: 30, bufferMinutes: 0 },
            { id: 'pharmacy', label: 'Farmacêutico(a)', category: 'health_wellness', defaultDurationMinutes: 30, bufferMinutes: 0 },
            { id: 'social_work', label: 'Assistente Social', category: 'health_wellness', defaultDurationMinutes: 45, bufferMinutes: 10 },
            { id: 'esthetician', label: 'Esteticista', category: 'health_wellness', defaultDurationMinutes: 60, bufferMinutes: 10 },
            { id: 'doula', label: 'Doula / Consultora de Amamentação', category: 'health_wellness', defaultDurationMinutes: 60, bufferMinutes: 10 },
            { id: 'pilates_instructor', label: 'Instrutor(a) de Pilates', category: 'health_wellness', defaultDurationMinutes: 50, bufferMinutes: 10 }
        ]
    }
];
var registration_professions_1 = require("./registration-professions");
Object.defineProperty(exports, "REGISTRATION_PROFESSIONS", { enumerable: true, get: function () { return registration_professions_1.REGISTRATION_PROFESSIONS; } });
