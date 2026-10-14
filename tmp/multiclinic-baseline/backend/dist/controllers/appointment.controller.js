"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentController = void 0;
exports.validateClinicBusinessHours = validateClinicBusinessHours;
exports.validateProfessionalSchedule = validateProfessionalSchedule;
const public_booking_1 = require("../utils/public-booking");
const slot_calculator_1 = require("../utils/slot-calculator");
const clinical_controller_1 = require("./clinical.controller");
const clinical_module_1 = require("../utils/clinical-module");
const billing_service_1 = require("../services/billing.service");
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const audit_middleware_1 = require("../middlewares/audit.middleware");
const notification_service_1 = require("../services/notification.service");
const whatsapp_service_1 = require("../services/whatsapp.service");
const phone_utils_1 = require("../utils/phone.utils");
function validMeetingUrl(value) {
    if (value === undefined || value === null || value === '')
        return true;
    if (typeof value !== 'string')
        return false;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' && !url.username && !url.password;
    }
    catch {
        return false;
    }
}
function validateClinicBusinessHours(tenantId, startTime, endTime) {
    try {
        const tenantRow = database_1.db.prepare('SELECT business_hours_json FROM tenants WHERE id = ?').get(tenantId);
        if (!tenantRow?.business_hours_json)
            return { valid: true };
        const bhList = JSON.parse(tenantRow.business_hours_json);
        if (!Array.isArray(bhList) || bhList.length === 0)
            return { valid: true };
        const normalizedStart = startTime.includes('T') ? startTime : startTime.replace(' ', 'T');
        const datePart = normalizedStart.slice(0, 10);
        const [y, m, d] = datePart.split('-').map(Number);
        const dayOfWeek = (!isNaN(y) && !isNaN(m) && !isNaN(d))
            ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
            : new Date(normalizedStart).getDay();
        const dayConfig = bhList.find((bh) => Number(bh.dayOfWeek) === dayOfWeek);
        if (!dayConfig)
            return { valid: true };
        if (dayConfig.isOpen === false || dayConfig.active === false) {
            return { valid: false, error: 'A clínica não realiza atendimentos neste dia da semana.' };
        }
        const timeOnly = (dStr) => {
            const parts = dStr.split('T');
            return parts[1]?.slice(0, 5) || '00:00';
        };
        const reqStartTime = timeOnly(startTime);
        const reqEndTime = timeOnly(endTime);
        if (dayConfig.startTime && reqStartTime < dayConfig.startTime) {
            return { valid: false, error: `O horário solicitado (${reqStartTime}) é anterior ao início do expediente da clínica (${dayConfig.startTime}).` };
        }
        if (dayConfig.endTime && reqEndTime > dayConfig.endTime) {
            return { valid: false, error: `O horário de término (${reqEndTime}) ultrapassa o expediente da clínica (${dayConfig.endTime}).` };
        }
        if (dayConfig.breakStart && dayConfig.breakEnd) {
            if ((reqStartTime >= dayConfig.breakStart && reqStartTime < dayConfig.breakEnd) ||
                (reqEndTime > dayConfig.breakStart && reqEndTime <= dayConfig.breakEnd) ||
                (reqStartTime <= dayConfig.breakStart && reqEndTime >= dayConfig.breakEnd)) {
                return { valid: false, error: `O horário solicitado coincide com o intervalo da clínica (${dayConfig.breakStart} às ${dayConfig.breakEnd}).` };
            }
        }
        return { valid: true };
    }
    catch (e) {
        return { valid: true };
    }
}
function validateProfessionalSchedule(tenantId, professionalId, startTime, endTime) {
    try {
        const normalizedStart = startTime.includes('T') ? startTime : startTime.replace(' ', 'T');
        const normalizedEnd = endTime.includes('T') ? endTime : endTime.replace(' ', 'T');
        const datePart = normalizedStart.slice(0, 10);
        const [y, m, d] = datePart.split('-').map(Number);
        const dayOfWeek = (!isNaN(y) && !isNaN(m) && !isNaN(d))
            ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
            : new Date(normalizedStart).getDay();
        if (dayOfWeek === -1 || isNaN(dayOfWeek))
            return { valid: false, error: 'Data de agendamento inválida.' };
        const timeOnly = (dStr) => {
            const parts = dStr.split('T');
            return parts[1]?.slice(0, 5) || '00:00';
        };
        const reqStartTime = timeOnly(normalizedStart);
        const reqEndTime = timeOnly(normalizedEnd);
        // 1. Busca os turnos de trabalho ativos do profissional para esse dia da semana
        const activeShifts = database_1.db.prepare(`
      SELECT start_time, end_time, break_start, break_end
      FROM schedules
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
      ORDER BY start_time ASC
    `).all(tenantId, professionalId, dayOfWeek);
        if (!activeShifts || activeShifts.length === 0) {
            return {
                valid: false,
                error: 'O profissional não possui escala de trabalho ativa neste dia da semana.'
            };
        }
        // 2. Verifica se o horário solicitado cabe integralmente em algum turno ativo sem coincidir com pausa
        let fitsInAnyShift = false;
        let breakConflict = false;
        for (const shift of activeShifts) {
            const shiftStart = shift.start_time || '08:00';
            const shiftEnd = shift.end_time || '18:00';
            const breakStart = shift.break_start;
            const breakEnd = shift.break_end;
            const insideShift = reqStartTime >= shiftStart && reqEndTime <= shiftEnd;
            let insideBreak = false;
            if (breakStart && breakEnd) {
                insideBreak = (reqStartTime >= breakStart && reqStartTime < breakEnd) ||
                    (reqEndTime > breakStart && reqEndTime <= breakEnd) ||
                    (reqStartTime <= breakStart && reqEndTime >= breakEnd);
            }
            if (insideBreak) {
                breakConflict = true;
            }
            if (insideShift && !insideBreak) {
                fitsInAnyShift = true;
                break;
            }
        }
        if (!fitsInAnyShift) {
            if (breakConflict) {
                return {
                    valid: false,
                    error: 'O horário solicitado coincide com o intervalo de descanso do profissional.'
                };
            }
            return {
                valid: false,
                error: 'O horário solicitado está fora da escala de trabalho ativa do profissional.'
            };
        }
        // 3. Verifica se não coincide com período de bloqueio / férias / ausência
        const block = database_1.db.prepare(`
      SELECT title FROM blocked_times
      WHERE tenant_id = ?
        AND (professional_id = ? OR professional_id IS NULL)
        AND REPLACE(start_datetime, ' ', 'T') < ?
        AND REPLACE(end_datetime, ' ', 'T') > ?
      LIMIT 1
    `).get(tenantId, professionalId, normalizedEnd, normalizedStart);
        if (block) {
            return {
                valid: false,
                error: `O profissional possui um bloqueio de agenda neste horário: ${block.title || 'Ausência'}.`
            };
        }
        return { valid: true };
    }
    catch (e) {
        return { valid: true };
    }
}
class AppointmentController {
    static list(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const { startDate, endDate, professionalId, status, patientId } = req.query;
            let query = `
        SELECT 
          a.id, a.tenant_id, a.appointment_number, a.patient_id, a.professional_id,
          a.service_id, a.room_id, a.start_time, a.end_time, a.status, a.modality, a.meeting_url,
          a.patient_notes, a.internal_notes, a.cancellation_reason, a.created_at,
          a.clinical_module,
          s.clinical_module as service_clinical_module,
          pat.full_name as patient_name, pat.phone as patient_phone, pat.email as patient_email,
          pat.is_child as patient_is_child,
          p.name as professional_name, p.photo_url as professional_photo,
          s.name as service_name, s.duration_minutes, s.price as service_price,
          r.name as room_name,
          pay.status as payment_status, pay.amount as payment_amount, pay.payment_method
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        LEFT JOIN rooms r ON r.id = a.room_id
        LEFT JOIN payments pay ON pay.appointment_id = a.id
        WHERE a.tenant_id = ?
      `;
            const params = [tenantId];
            // Se for profissional logado (sem ser admin), filtra apenas seus atendimentos
            if (req.user && req.user.role === 'professional') {
                query += ' AND a.professional_id IN (SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1)';
                params.push(req.user.userId, tenantId);
            }
            else if (professionalId) {
                query += ' AND a.professional_id = ?';
                params.push(professionalId);
            }
            if (patientId) {
                query += ' AND a.patient_id = ?';
                params.push(patientId);
            }
            if (status) {
                query += ' AND a.status = ?';
                params.push(status);
            }
            if (startDate) {
                query += ' AND a.start_time >= ?';
                params.push(startDate);
            }
            if (endDate) {
                query += ' AND a.start_time <= ?';
                params.push(endDate);
            }
            query += ' ORDER BY a.start_time ASC';
            const stmt = database_1.db.prepare(query);
            const appointments = stmt.all(...params);
            res.json(appointments);
        }
        catch (err) {
            console.error('[AppointmentController.list] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar agendamentos' });
        }
    }
    static getById(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            const stmt = database_1.db.prepare(`
        SELECT 
          a.*,
          s.clinical_module as service_clinical_module,
          pat.full_name as patient_name, pat.phone as patient_phone, pat.email as patient_email,
          pat.birth_date as patient_birth_date, pat.cpf as patient_cpf, pat.is_child as patient_is_child,
          p.name as professional_name, p.registration_number,
          s.name as service_name, s.price as service_price, s.duration_minutes,
          r.name as room_name,
          pay.id as payment_id, pay.status as payment_status, pay.amount as payment_amount, pay.payment_method
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        LEFT JOIN rooms r ON r.id = a.room_id
        LEFT JOIN payments pay ON pay.appointment_id = a.id
        WHERE a.id = ? AND a.tenant_id = ?
      `);
            const appointment = stmt.get(id, tenantId);
            if (!appointment) {
                const otherTenantCheck = database_1.db.prepare('SELECT tenant_id FROM appointments WHERE id = ?').get(id);
                if (otherTenantCheck && otherTenantCheck.tenant_id !== tenantId) {
                    res.status(403).json({ error: 'Acesso negado: este agendamento pertence a outra clínica' });
                    return;
                }
                res.status(404).json({ error: 'Agendamento não encontrado' });
                return;
            }
            // Histórico de status
            const historyStmt = database_1.db.prepare(`
        SELECT previous_status, new_status, changed_by, reason, created_at
        FROM appointment_status_history
        WHERE appointment_id = ?
        ORDER BY created_at ASC
      `);
            const statusHistory = historyStmt.all(id);
            res.json({ appointment, statusHistory });
        }
        catch (err) {
            console.error('[AppointmentController.getById] Erro:', err);
            res.status(500).json({ error: 'Erro ao buscar agendamento' });
        }
    }
    static create(req, res) {
        if (!req.path.startsWith('/v1/public/')) {
            AppointmentController.createInternal(req, res);
            return;
        }
        // Send success only after the synchronous transaction has committed.
        let status = 200;
        let body;
        const pendingResponse = {
            status(code) { status = code; return pendingResponse; },
            json(value) { body = value; return pendingResponse; }
        };
        try {
            // Billing expiry opens its own transaction. Run it before the atomic booking
            // transaction; subscription eligibility is still checked inside createInternal.
            billing_service_1.BillingService.expireGrace();
            database_1.db.transaction(() => AppointmentController.createInternal(req, pendingResponse))();
            res.status(status).json(body);
        }
        catch (err) {
            console.error('[AppointmentController.createPublic] Erro:', err);
            res.status(500).json({ error: 'Não foi possível concluir o agendamento. Tente novamente.' });
        }
    }
    static createInternal(req, res) {
        try {
            let tenantId = req.tenantId;
            const { tenantSlug, patientId, professionalId, serviceId, roomId, startTime, endTime, modality, meeting_url, patientNotes, internalNotes, insuranceId, referredFromAppointmentId, referredByProfessionalId, referralReason, 
            // Dados se o paciente for novo (página de agendamento público)
            newPatientData } = req.body;
            if (!validMeetingUrl(meeting_url)) {
                res.status(400).json({ error: 'Informe um link HTTPS válido para a teleconsulta.' });
                return;
            }
            const isPublic = req.path.startsWith('/v1/public/');
            if (isPublic) {
                const tenant = (0, public_booking_1.resolveBookingTenant)(tenantSlug, req.body.bookingSequence);
                const individualSlug = typeof req.body.professionalSlug === 'string' ? req.body.professionalSlug : undefined;
                if (!tenant || (!individualSlug && tenant.public_booking_enabled !== 1)) {
                    res.status(404).json({ error: 'Agendamento online indisponível.' });
                    return;
                }
                tenantId = tenant.id;
                if (!(0, public_booking_1.publicBookingProfessional)(tenant.id, String(professionalId), individualSlug) || !(0, public_booking_1.professionalBookingService)(tenant.id, String(professionalId), String(serviceId))) {
                    res.status(404).json({ error: 'Atendimento indisponível.' });
                    return;
                }
                if (patientId || roomId || internalNotes || insuranceId || referredFromAppointmentId || referredByProfessionalId || referralReason) {
                    res.status(400).json({ error: 'Dados de agendamento inválidos.' });
                    return;
                }
                if (!newPatientData || typeof newPatientData.fullName !== 'string' || newPatientData.fullName.trim().length < 2 || newPatientData.fullName.length > 150 || typeof newPatientData.phone !== 'string' || !/^\d{10,13}$/.test(newPatientData.phone.replace(/\D/g, '')) || (newPatientData.email && (typeof newPatientData.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newPatientData.email) || newPatientData.email.length > 254)) || (newPatientData.isChild && (typeof newPatientData.guardianName !== 'string' || !newPatientData.guardianName.trim())) || String(patientNotes || '').length > 1000 || String(newPatientData.notes || '').length > 1000) {
                    res.status(400).json({ error: 'Revise o nome, telefone e demais dados informados.' });
                    return;
                }
                const service = (0, public_booking_1.professionalBookingService)(tenant.id, String(professionalId), String(serviceId));
                if (!['presential', 'online', 'home'].includes(modality) || (service.modality !== 'both' && service.modality !== modality) || (service.modality === 'both' && modality === 'home')) {
                    res.status(400).json({ error: 'Modalidade indisponível para este atendimento.' });
                    return;
                }
                const start = String(startTime || '').replace(' ', 'T');
                const end = String(endTime || '').replace(' ', 'T');
                if (!(0, public_booking_1.validBookingDate)(start.slice(0, 10)) || !(0, slot_calculator_1.calculateAvailableSlots)(tenant.id, String(professionalId), String(serviceId), start.slice(0, 10)).some(slot => slot.startTime === start && slot.endTime === end)) {
                    res.status(409).json({ code: 'SLOT_UNAVAILABLE', error: 'Este horário não está mais disponível. Escolha outro horário.' });
                    return;
                }
            }
            if (!tenantId) {
                res.status(400).json({ error: 'Identificação da clínica obrigatória' });
                return;
            }
            if (!professionalId || !serviceId || !startTime || !endTime) {
                res.status(400).json({ error: 'Profissional, serviço, início e término são obrigatórios' });
                return;
            }
            if (!database_1.db.prepare("SELECT 1 FROM tenants WHERE id = ? AND status = 'active'").get(tenantId)) {
                res.status(403).json({ error: 'O acesso a esta clínica está bloqueado.' });
                return;
            }
            if (!isPublic)
                billing_service_1.BillingService.expireGrace();
            if (!(0, billing_service_1.canOperate)(tenantId)) {
                res.status(isPublic ? 404 : 402).json(isPublic ? { error: 'Agendamento online indisponível.' } : { code: 'SUBSCRIPTION_REQUIRED', error: 'Agendamento indisponível. A clínica precisa regularizar sua assinatura.' });
                return;
            }
            // Resolve ou cria o paciente
            let resolvedPatientId = patientId;
            if (!resolvedPatientId && newPatientData) {
                const { fullName, phone, email, isChild, guardianName, guardianPhone, notes } = newPatientData;
                if (!fullName || !phone) {
                    res.status(400).json({ error: 'Nome e telefone do paciente são obrigatórios' });
                    return;
                }
                const existingPatient = database_1.db.prepare(`
          SELECT id FROM patients WHERE tenant_id = ? AND (phone = ? OR (email IS NOT NULL AND email = ?))
        `).get(tenantId, phone, email || '');
                if (existingPatient) {
                    resolvedPatientId = existingPatient.id;
                }
                else {
                    resolvedPatientId = 'pat-' + (0, uuid_1.v4)().slice(0, 8);
                    database_1.db.prepare(`
            INSERT INTO patients (id, tenant_id, full_name, phone, email, is_child, notes_admin, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(resolvedPatientId, tenantId, fullName, phone, email || null, isChild ? 1 : 0, notes || null);
                    if (isChild && guardianName) {
                        // O agendamento público não coleta a autorização do responsável: fica pendente para a clínica registrar.
                        database_1.db.prepare(`
              INSERT INTO guardians (id, tenant_id, patient_id, full_name, phone, relationship, is_primary, authorization_signed)
              VALUES (?, ?, ?, ?, ?, 'legal_guardian', 1, 0)
            `).run('grd-' + (0, uuid_1.v4)().slice(0, 8), tenantId, resolvedPatientId, guardianName, guardianPhone || phone);
                    }
                }
            }
            if (!resolvedPatientId) {
                res.status(400).json({ error: 'Paciente não identificado' });
                return;
            }
            const normalizedStartTime = String(startTime).trim().replace(' ', 'T');
            const normalizedEndTime = String(endTime).trim().replace(' ', 'T');
            const isCustomTime = Boolean(req.body.isCustomTime || req.body.is_custom_time);
            // 0. Validação dos horários de funcionamento da clínica (Item 3) e escala de trabalho (Item 1)
            // Agendamento em horário avulso (!isPublic && isCustomTime) é exceção pontual que permite horário fora da disponibilidade habitual
            if (!isCustomTime || isPublic) {
                const hoursCheck = validateClinicBusinessHours(tenantId, normalizedStartTime, normalizedEndTime);
                if (!hoursCheck.valid) {
                    res.status(400).json({ error: hoursCheck.error });
                    return;
                }
                // 0b. Validação da escala de trabalho ativa do profissional (Item 1)
                const scheduleCheck = validateProfessionalSchedule(tenantId, professionalId, normalizedStartTime, normalizedEndTime);
                if (!scheduleCheck.valid) {
                    res.status(400).json({ error: scheduleCheck.error });
                    return;
                }
            }
            // 1. Verifica concorrência do PROFISSIONAL (Item 7)
            const profConflict = database_1.db.prepare(`
        SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
          AND a.professional_id = ?
          AND a.status NOT IN ('cancelled')
          AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
      `).get(tenantId, professionalId, normalizedEndTime, normalizedStartTime);
            if (profConflict) {
                res.status(409).json({
                    error: 'Este horário não está mais disponível. Escolha outro horário.',
                    code: 'PROFESSIONAL_SLOT_OCCUPIED',
                    ...(isPublic ? {} : {
                        conflict: {
                            startTime: profConflict.start_time,
                            endTime: profConflict.end_time,
                            professionalName: profConflict.professional_name,
                            serviceName: profConflict.service_name
                        }
                    })
                });
                return;
            }
            // 2. Verifica concorrência do PACIENTE em toda a clínica (Regra do Item 9)
            const patientConflict = database_1.db.prepare(`
        SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
          AND a.patient_id = ?
          AND a.status NOT IN ('cancelled')
          AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
      `).get(tenantId, resolvedPatientId, normalizedEndTime, normalizedStartTime);
            if (patientConflict) {
                res.status(409).json({
                    error: 'Este paciente já possui um atendimento neste horário.',
                    code: 'PATIENT_APPOINTMENT_CONFLICT',
                    ...(isPublic ? {} : { conflict: {
                            startTime: patientConflict.start_time,
                            endTime: patientConflict.end_time,
                            professionalName: patientConflict.professional_name,
                            serviceName: patientConflict.service_name
                        } })
                });
                return;
            }
            // 3. Verifica concorrência da SALA física, se selecionada
            if (roomId) {
                const roomConflict = database_1.db.prepare(`
          SELECT a.id, a.start_time, a.end_time, r.name as room_name, p.name as professional_name
          FROM appointments a
          JOIN rooms r ON r.id = a.room_id
          JOIN professionals p ON p.id = a.professional_id
          WHERE a.tenant_id = ?
            AND a.room_id = ?
            AND a.status NOT IN ('cancelled')
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        `).get(tenantId, roomId, normalizedEndTime, normalizedStartTime);
                if (roomConflict) {
                    res.status(409).json({
                        error: `A sala ${roomConflict.room_name} já está ocupada neste horário por ${roomConflict.professional_name}.`,
                        code: 'ROOM_CONFLICT',
                        conflict: {
                            roomName: roomConflict.room_name,
                            professionalName: roomConflict.professional_name,
                            startTime: roomConflict.start_time,
                            endTime: roomConflict.end_time
                        }
                    });
                    return;
                }
            }
            const appointmentId = 'apt-' + (0, uuid_1.v4)().slice(0, 8);
            const year = new Date().getFullYear();
            const countStmt = database_1.db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?');
            const count = (countStmt.get(tenantId).c || 0) + 1;
            const appointmentNumber = `AG-${year}-${count.toString().padStart(4, '0')}`;
            // Resolução antecipada do módulo clínico e profissão do agendamento
            let initialClinicalModule = null;
            let resolvedProfessionId = null;
            if (serviceId) {
                const srv = database_1.db.prepare('SELECT clinical_module FROM services WHERE id = ? AND tenant_id = ?').get(serviceId, tenantId);
                if (srv?.clinical_module && (0, clinical_module_1.isPrimaryClinicalModule)(srv.clinical_module)) {
                    initialClinicalModule = srv.clinical_module;
                }
            }
            if (!initialClinicalModule && professionalId) {
                const resolvedModule = (0, clinical_module_1.resolveClinicalModule)({ professional_id: professionalId, service_id: serviceId }, tenantId);
                if ((0, clinical_module_1.isPrimaryClinicalModule)(resolvedModule)) {
                    initialClinicalModule = resolvedModule;
                }
            }
            if (professionalId) {
                const profRow = database_1.db.prepare('SELECT profession_id FROM professionals WHERE (id = ? OR user_id = ?) AND tenant_id = ?').get(professionalId, professionalId, tenantId);
                if (profRow?.profession_id) {
                    resolvedProfessionId = profRow.profession_id;
                }
            }
            // Insere agendamento com os novos campos de convênio e encaminhamento
            const insertAppt = database_1.db.prepare(`
        INSERT INTO appointments (
          id, tenant_id, appointment_number, patient_id, professional_id, service_id,
          room_id, start_time, end_time, status, modality, meeting_url, patient_notes, internal_notes,
          insurance_id, referred_from_appointment_id, referred_by_professional_id, referral_reason,
          clinical_module, profession_id,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
            insertAppt.run(appointmentId, tenantId, appointmentNumber, resolvedPatientId, professionalId, serviceId, roomId || null, normalizedStartTime, normalizedEndTime, modality || 'presential', typeof meeting_url === 'string' ? meeting_url.trim() || null : null, patientNotes || null, internalNotes || null, insuranceId || null, referredFromAppointmentId || null, referredByProfessionalId || null, referralReason || null, initialClinicalModule, resolvedProfessionId, req.user ? req.user.userId : 'online_booking');
            // Insere histórico inicial
            database_1.db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, NULL, 'scheduled', ?, 'Agendamento criado com sucesso')
      `).run((0, uuid_1.v4)(), appointmentId, req.user ? req.user.name : 'Cliente Online');
            // Gera registro financeiro pendente baseado no valor do serviço
            const serviceRow = database_1.db.prepare('SELECT price FROM services WHERE id = ?').get(serviceId);
            if (serviceRow && serviceRow.price > 0) {
                database_1.db.prepare(`
          INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, notes)
          VALUES (?, ?, ?, ?, ?, 'pix', 'pending', 'Gerado automaticamente pelo agendamento')
        `).run('pay-' + (0, uuid_1.v4)().slice(0, 8), tenantId, appointmentId, resolvedPatientId, serviceRow.price);
            }
            // Enfileira notificação
            const patientData = database_1.db.prepare('SELECT full_name, phone, email FROM patients WHERE id = ?').get(resolvedPatientId);
            if (patientData) {
                database_1.db.prepare(`
          INSERT INTO notifications (id, tenant_id, patient_id, professional_id, appointment_id, type, channel, recipient, content, status, scheduled_for)
          VALUES (?, ?, ?, ?, ?, 'confirmation', 'whatsapp', ?, ?, 'pending', datetime('now'))
        `).run('notif-' + (0, uuid_1.v4)().slice(0, 8), tenantId, resolvedPatientId, professionalId, appointmentId, patientData.phone, `Olá ${patientData.full_name}, seu atendimento foi agendado com sucesso para ${startTime}. Código: ${appointmentNumber}`);
            }
            // Agenda lembrete automático inteligente de 1 hora antes (Item 22)
            notification_service_1.NotificationService.scheduleAppointmentReminder(appointmentId);
            (0, audit_middleware_1.logAudit)(req, 'CREATE_APPOINTMENT', 'appointments', appointmentId, { appointmentNumber, startTime, endTime });
            res.status(201).json({
                id: appointmentId,
                appointmentNumber,
                startTime,
                endTime,
                message: 'Atendimento agendado com sucesso!'
            });
        }
        catch (err) {
            if (req.path.startsWith('/v1/public/'))
                throw err;
            console.error('[AppointmentController.create] Erro:', err);
            res.status(500).json({ error: 'Erro ao registrar agendamento' });
        }
    }
    static updateStatus(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            const { status, reason, cancellationReasonCategory, clinicalModule: requestedModule, professionId } = req.body;
            const allowedStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'];
            if (!allowedStatuses.includes(status)) {
                res.status(400).json({ error: 'Status de agendamento inválido' });
                return;
            }
            const current = database_1.db.prepare('SELECT id, patient_id, status, clinical_module, professional_id, profession_id, service_id FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!current) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
                return;
            }
            if (status === 'in_progress') {
                const assignedProfessional = database_1.db.prepare('SELECT user_id, active FROM professionals WHERE id=? AND tenant_id=?')
                    .get(current.professional_id, tenantId);
                if (!req.user || !['professional', 'clinic_admin'].includes(req.user.role) ||
                    !assignedProfessional || assignedProfessional.active !== 1 ||
                    (req.user.role === 'professional' && assignedProfessional.user_id !== req.user.userId) ||
                    !(0, clinical_controller_1.hasClinicalAccess)(req, current.patient_id)) {
                    res.status(403).json({ error: 'Sem permissão para iniciar o atendimento. Verifique o vínculo ativo do profissional com esta clínica.' });
                    return;
                }
            }
            // Resolução antecipada do módulo atual e do módulo canônico da profissão
            const rawCurrentModule = current.clinical_module;
            const resolvedProfModule = (0, clinical_module_1.resolveClinicalModule)(current, tenantId) || undefined;
            // Determinação do módulo alvo:
            // Se requestedModule for módulo primário válido, prioriza-o
            // Caso contrário, se o profissional resolver para módulo primário, adota-o
            // Caso contrário, se o agendamento já tiver módulo não-nulo e diferente de 'ZemdaBody', mantém-no
            // Se for transição para 'in_progress', fallback para 'general' se nada específico foi resolvido
            let clinicalModule = undefined;
            if ((0, clinical_module_1.isPrimaryClinicalModule)(requestedModule)) {
                clinicalModule = requestedModule;
            }
            else if ((0, clinical_module_1.isPrimaryClinicalModule)(resolvedProfModule)) {
                clinicalModule = resolvedProfModule;
            }
            else if (rawCurrentModule && rawCurrentModule !== 'ZemdaBody' && rawCurrentModule !== 'Zemda360') {
                clinicalModule = rawCurrentModule;
            }
            else if (status === 'in_progress') {
                clinicalModule = resolvedProfModule || 'general';
            }
            // Regra de Imutabilidade Estrita:
            // Bloqueia troca APENAS quando for mudança REAL e conflitante entre módulos clínicos específicos diferentes
            // (ex.: ZemdaOdonto -> ZemdaFisio, ou ZemdaFono -> ZemdaPsico).
            // Se o módulo atual for 'general', nulo, 'Zemda360' ou 'ZemdaBody' e o alvo for módulo primário, é PROMOÇÃO SEGURA.
            if ((0, clinical_module_1.isPrimaryClinicalModule)(rawCurrentModule) &&
                (0, clinical_module_1.isPrimaryClinicalModule)(clinicalModule) &&
                rawCurrentModule !== clinicalModule) {
                res.status(409).json({
                    error: `O atendimento já foi iniciado com o módulo "${rawCurrentModule}". Não é permitido alterar o módulo clínico durante o atendimento.`
                });
                return;
            }
            // Verifica se já existe evolução salva em outro módulo para este agendamento
            if (clinicalModule) {
                const existingRec = database_1.db.prepare("SELECT id, module_type, clinical_evolution, module_data_json FROM records WHERE appointment_id = ? AND tenant_id = ? AND module_type IS NOT NULL AND module_type NOT IN ('ZemdaBody', 'Zemda360') LIMIT 1").get(id, tenantId);
                if (existingRec && existingRec.module_type) {
                    if ((0, clinical_module_1.isPrimaryClinicalModule)(existingRec.module_type) && existingRec.module_type !== clinicalModule) {
                        res.status(409).json({
                            error: `O prontuário deste atendimento já foi registrado no módulo "${existingRec.module_type}". Não é permitido salvar em módulos diferentes.`
                        });
                        return;
                    }
                    // Promoção segura de prontuário legado 'general' quando promovendo agendamento para módulo canônico
                    if (existingRec.module_type === 'general' && (0, clinical_module_1.isPrimaryClinicalModule)(clinicalModule)) {
                        database_1.db.prepare("UPDATE records SET module_type = ? WHERE id = ?").run(clinicalModule, existingRec.id);
                    }
                }
            }
            // Resolução segura de profession_id
            let resolvedProfessionId = professionId || current.profession_id || null;
            if (!resolvedProfessionId && current.professional_id) {
                const profRow = database_1.db.prepare('SELECT profession_id FROM professionals WHERE (id = ? OR user_id = ?) AND tenant_id = ?').get(current.professional_id, current.professional_id, tenantId);
                if (profRow?.profession_id)
                    resolvedProfessionId = profRow.profession_id;
            }
            if (!resolvedProfessionId && req.user?.professionId) {
                resolvedProfessionId = req.user.professionId;
            }
            const cancelledBy = req.user ? `${req.user.name} (${req.user.role})` : 'Usuário';
            if (status === 'completed' && current.status !== 'completed') {
                res.status(409).json({ error: 'Finalize pelo atendimento para salvar o prontuário e registrar o recebimento.' });
                return;
            }
            const updateStmt = database_1.db.prepare(`
        UPDATE appointments SET
          status = ?,
          cancellation_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE cancellation_reason END,
          cancellation_reason_category = CASE WHEN ? = 'cancelled' THEN ? ELSE cancellation_reason_category END,
          cancelled_by = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_by END,
          cancelled_at = CASE WHEN ? = 'cancelled' THEN datetime('now') ELSE cancelled_at END,
          clinical_module = COALESCE(?, NULLIF(NULLIF(clinical_module, 'ZemdaBody'), 'Zemda360')),
          profession_id = COALESCE(?, profession_id),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);
            updateStmt.run(status, status, reason || null, status, cancellationReasonCategory || (status === 'cancelled' ? 'Outro' : null), status, status === 'cancelled' ? cancelledBy : null, status, clinicalModule || null, resolvedProfessionId || null, id, tenantId);
            // Registra histórico
            database_1.db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run((0, uuid_1.v4)(), id, current.status, status, req.user ? req.user.name : 'Sistema', reason ? (cancellationReasonCategory ? `[${cancellationReasonCategory}] ${reason}` : reason) : null);
            (0, audit_middleware_1.logAudit)(req, 'UPDATE_APPOINTMENT_STATUS', 'appointments', id, { from: current.status, to: status, reason, cancellationReasonCategory });
            if (status === 'cancelled') {
                notification_service_1.NotificationService.cancelAppointmentReminders(id);
            }
            res.json({ message: `Status alterado para ${status}` });
        }
        catch (err) {
            console.error('[AppointmentController.updateStatus] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar status do agendamento' });
        }
    }
    static reschedule(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            const { startTime, endTime, reason } = req.body;
            if (!tenantId) {
                res.status(400).json({ error: 'Identificação da clínica obrigatória' });
                return;
            }
            if (!startTime || !endTime) {
                res.status(400).json({ error: 'Novo horário de início e fim são obrigatórios' });
                return;
            }
            const appt = database_1.db.prepare('SELECT patient_id, professional_id, room_id, status FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!appt) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
                return;
            }
            const normalizedStartTime = String(startTime).trim().replace(' ', 'T');
            const normalizedEndTime = String(endTime).trim().replace(' ', 'T');
            // 0. Validação dos horários de funcionamento da clínica (Item 3)
            const hoursCheck = validateClinicBusinessHours(tenantId, normalizedStartTime, normalizedEndTime);
            if (!hoursCheck.valid) {
                res.status(400).json({ error: hoursCheck.error });
                return;
            }
            // 0b. Validação da escala de trabalho ativa do profissional
            const scheduleCheck = validateProfessionalSchedule(tenantId, appt.professional_id, normalizedStartTime, normalizedEndTime);
            if (!scheduleCheck.valid) {
                res.status(400).json({ error: scheduleCheck.error });
                return;
            }
            // 1. Conflito de profissional (Item 7)
            const conflict = database_1.db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ?
          AND professional_id = ?
          AND id != ?
          AND status NOT IN ('cancelled')
          AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
      `).get(tenantId, appt.professional_id, id, normalizedEndTime, normalizedStartTime);
            if (conflict) {
                res.status(409).json({ error: 'Este horário não está mais disponível. Escolha outro horário.' });
                return;
            }
            // 2. Conflito do paciente
            if (appt.patient_id) {
                const patientConflict = database_1.db.prepare(`
          SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
          FROM appointments a
          JOIN professionals p ON p.id = a.professional_id
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.patient_id = ?
            AND a.id != ?
            AND a.status NOT IN ('cancelled')
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        `).get(tenantId, appt.patient_id, id, normalizedEndTime, normalizedStartTime);
                if (patientConflict) {
                    res.status(409).json({
                        error: 'Este paciente já possui outro atendimento neste horário.',
                        code: 'PATIENT_APPOINTMENT_CONFLICT',
                        conflict: {
                            startTime: patientConflict.start_time,
                            endTime: patientConflict.end_time,
                            professionalName: patientConflict.professional_name,
                            serviceName: patientConflict.service_name
                        }
                    });
                    return;
                }
            }
            // 3. Conflito de sala
            if (appt.room_id) {
                const roomConflict = database_1.db.prepare(`
          SELECT a.id, a.start_time, a.end_time, r.name as room_name, p.name as professional_name
          FROM appointments a
          JOIN rooms r ON r.id = a.room_id
          JOIN professionals p ON p.id = a.professional_id
          WHERE a.tenant_id = ?
            AND a.room_id = ?
            AND a.id != ?
            AND a.status NOT IN ('cancelled')
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        `).get(tenantId, appt.room_id, id, normalizedEndTime, normalizedStartTime);
                if (roomConflict) {
                    res.status(409).json({
                        error: `A sala ${roomConflict.room_name} já está ocupada neste horário por ${roomConflict.professional_name}.`,
                        code: 'ROOM_CONFLICT'
                    });
                    return;
                }
            }
            database_1.db.prepare(`
        UPDATE appointments SET
          start_time = ?,
          end_time = ?,
          status = 'rescheduled',
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(normalizedStartTime, normalizedEndTime, id, tenantId);
            database_1.db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, ?, 'rescheduled', ?, ?)
      `).run((0, uuid_1.v4)(), id, appt.status, req.user ? req.user.name : 'Sistema', reason || 'Horário remarcado');
            // Atualiza os lembretes automáticos para o novo horário (Item 24)
            notification_service_1.NotificationService.cancelAppointmentReminders(id);
            notification_service_1.NotificationService.scheduleAppointmentReminder(id);
            (0, audit_middleware_1.logAudit)(req, 'RESCHEDULE_APPOINTMENT', 'appointments', id, { newStart: normalizedStartTime, newEnd: normalizedEndTime });
            res.json({ message: 'Atendimento remarcado com sucesso' });
        }
        catch (err) {
            console.error('[AppointmentController.reschedule] Erro:', err);
            res.status(500).json({ error: 'Erro ao remarcar atendimento' });
        }
    }
    static update(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(401).json({ error: 'Tenant ID required' });
                return;
            }
            const { serviceId, professionalId, roomId, startTime, endTime, notes, modality, meeting_url } = req.body;
            if (!validMeetingUrl(meeting_url) || (modality !== undefined && !['presential', 'online', 'home'].includes(modality))) {
                res.status(400).json({ error: 'Modalidade ou link HTTPS da teleconsulta inválido.' });
                return;
            }
            const appt = database_1.db.prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!appt) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
                return;
            }
            let newStart = appt.start_time;
            let newEnd = appt.end_time;
            if (startTime) {
                newStart = String(startTime).trim().replace(' ', 'T');
            }
            if (endTime) {
                newEnd = String(endTime).trim().replace(' ', 'T');
            }
            const safeProfId = String(professionalId || appt.professional_id || '');
            const safeStart = String(newStart || '');
            const safeEnd = String(newEnd || '');
            if (startTime || endTime || professionalId) {
                const hoursCheck = validateClinicBusinessHours(tenantId, safeStart, safeEnd);
                if (!hoursCheck.valid) {
                    res.status(400).json({ error: hoursCheck.error });
                    return;
                }
                const scheduleCheck = validateProfessionalSchedule(tenantId, safeProfId, safeStart, safeEnd);
                if (!scheduleCheck.valid) {
                    res.status(400).json({ error: scheduleCheck.error });
                    return;
                }
                const conflict = database_1.db.prepare(`
          SELECT id FROM appointments
          WHERE tenant_id = ?
            AND professional_id = ?
            AND id != ?
            AND status NOT IN ('cancelled')
            AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
        `).get(tenantId, safeProfId, id, safeEnd, safeStart);
                if (conflict) {
                    res.status(409).json({ error: 'Este horário não está mais disponível. Escolha outro horário.' });
                    return;
                }
            }
            database_1.db.prepare(`
        UPDATE appointments SET
          service_id = COALESCE(?, service_id),
          professional_id = COALESCE(?, professional_id),
          room_id = CASE WHEN ? IS NOT NULL THEN ? ELSE room_id END,
          start_time = ?,
          end_time = ?,
          patient_notes = COALESCE(?, patient_notes),
          modality = COALESCE(?, modality),
          meeting_url = CASE WHEN ? THEN ? ELSE meeting_url END,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(serviceId || null, professionalId || null, roomId !== undefined ? roomId : null, roomId || null, newStart, newEnd, notes !== undefined ? notes : null, modality || null, meeting_url !== undefined ? 1 : 0, typeof meeting_url === 'string' ? meeting_url.trim() || null : null, id, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'UPDATE_APPOINTMENT', 'appointments', id, { serviceId, professionalId, newStart, newEnd });
            res.json({ message: 'Dados do atendimento atualizados com sucesso' });
        }
        catch (err) {
            console.error('[AppointmentController.update] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar dados do atendimento' });
        }
    }
    /**
     * Envia ou registra lembrete manual de consulta via WhatsApp (Oficial ou Fallback Link)
     * POST /v1/appointments/:id/whatsapp-reminder
     */
    static async sendWhatsAppReminder(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            const { messageText, fallbackOpened } = req.body || {};
            if (!tenantId) {
                res.status(400).json({ error: 'Identificação da clínica obrigatória' });
                return;
            }
            // 1. Busca dados completos do agendamento, paciente e profissional
            const appt = database_1.db.prepare(`
        SELECT a.id, a.tenant_id, a.patient_id, a.professional_id, a.start_time, a.status,
               pat.full_name as patient_name, pat.phone as patient_phone,
               t.name as clinic_name, p.name as professional_name, s.name as service_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN tenants t ON t.id = a.tenant_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(id, tenantId);
            if (!appt) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
                return;
            }
            const phone = appt.patient_phone;
            if (!phone || !(0, phone_utils_1.isValidPhoneNumber)(phone)) {
                res.status(400).json({ error: 'Paciente sem telefone válido cadastrado' });
                return;
            }
            const normalizedPhone = (0, phone_utils_1.normalizePhoneWithDDI)(phone);
            const user = req.user;
            const userId = user?.userId || user?.id || null;
            let userName = user?.name || user?.fullName || '';
            if (!userName && userId) {
                const uRow = database_1.db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
                if (uRow?.name)
                    userName = uRow.name;
            }
            userName = userName || 'Usuário';
            const finalMessage = (messageText && typeof messageText === 'string' && messageText.trim().length > 0)
                ? messageText.trim()
                : (0, phone_utils_1.buildWhatsAppReminderMessage)({
                    patientName: appt.patient_name,
                    professionalName: appt.professional_name,
                    clinicName: appt.clinic_name,
                    startTime: appt.start_time,
                    serviceName: appt.service_name
                });
            // 2. Se for abertura direta pelo link manual (wa.me)
            if (fallbackOpened) {
                const notifId = 'not-' + (0, uuid_1.v4)().slice(0, 8);
                database_1.db.prepare(`
          INSERT INTO notifications (
            id, tenant_id, patient_id, professional_id, appointment_id,
            type, channel, recipient, content, status, delivery_status,
            mode, sent_by_user_id, sent_by_name, scheduled_for, sent_at
          ) VALUES (?, ?, ?, ?, ?, 'reminder_manual', 'whatsapp', ?, ?, 'sent', 'manual_opened', 'manual', ?, ?, datetime('now'), datetime('now'))
        `).run(notifId, tenantId, appt.patient_id, appt.professional_id, appt.id, normalizedPhone, finalMessage, userId, userName);
                (0, audit_middleware_1.logAudit)(req, 'WHATSAPP_MANUAL_OPENED', 'appointments', appt.id, {
                    recipient: normalizedPhone,
                    sent_by: userName,
                    channel: 'whatsapp_manual_link',
                    mode: 'fallback'
                });
                res.status(200).json({
                    success: true,
                    mode: 'manual_opened',
                    message: 'Lembrete manual registrado com sucesso'
                });
                return;
            }
            // 3. Tentativa de envio oficial via Infobip WhatsApp
            const isOfficialConnected = whatsapp_service_1.WhatsAppService.isConnected();
            if (!isOfficialConnected) {
                res.status(400).json({
                    success: false,
                    error: 'A integração oficial com a API do WhatsApp (Infobip) não está conectada no sistema.',
                    canFallback: true
                });
                return;
            }
            const sendResult = await whatsapp_service_1.WhatsAppService.sendTextMessage({
                recipientPhone: normalizedPhone,
                messageText: finalMessage
            });
            if (!sendResult.success) {
                const notifId = 'not-' + (0, uuid_1.v4)().slice(0, 8);
                database_1.db.prepare(`
          INSERT INTO notifications (
            id, tenant_id, patient_id, professional_id, appointment_id,
            type, channel, recipient, content, status, delivery_status,
            mode, sent_by_user_id, sent_by_name, scheduled_for, last_error
          ) VALUES (?, ?, ?, ?, ?, 'reminder_manual', 'whatsapp', ?, ?, 'failed', 'failed', 'manual', ?, ?, datetime('now'), ?)
        `).run(notifId, tenantId, appt.patient_id, appt.professional_id, appt.id, normalizedPhone, finalMessage, userId, userName, sendResult.error || 'Erro no envio da API Infobip');
                res.status(502).json({
                    success: false,
                    error: sendResult.error || 'Falha ao enviar mensagem pela API do WhatsApp',
                    canFallback: true
                });
                return;
            }
            // 4. Sucesso no envio oficial
            const notifId = 'not-' + (0, uuid_1.v4)().slice(0, 8);
            database_1.db.prepare(`
        INSERT INTO notifications (
          id, tenant_id, patient_id, professional_id, appointment_id,
          type, channel, recipient, content, status, delivery_status,
          mode, sent_by_user_id, sent_by_name, scheduled_for, sent_at, external_message_id
        ) VALUES (?, ?, ?, ?, ?, 'reminder_manual', 'whatsapp', ?, ?, 'sent', 'delivered', 'manual', ?, ?, datetime('now'), datetime('now'), ?)
      `).run(notifId, tenantId, appt.patient_id, appt.professional_id, appt.id, normalizedPhone, finalMessage, userId, userName, sendResult.messageId || null);
            (0, audit_middleware_1.logAudit)(req, 'WHATSAPP_REMINDER_SENT', 'appointments', appt.id, {
                recipient: normalizedPhone,
                sent_by: userName,
                channel: 'whatsapp_infobip_official',
                message_id: sendResult.messageId
            });
            res.status(200).json({
                success: true,
                mode: 'official',
                messageId: sendResult.messageId,
                message: 'Lembrete enviado com sucesso via WhatsApp!'
            });
        }
        catch (err) {
            console.error('[AppointmentController.sendWhatsAppReminder] Erro:', err);
            res.status(500).json({ error: 'Erro ao processar envio de lembrete pelo WhatsApp' });
        }
    }
    /**
     * Consulta histórico de comunicações/lembretes de um agendamento
     * GET /v1/appointments/:id/communications
     */
    static getCommunications(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Identificação da clínica obrigatória' });
                return;
            }
            const rows = database_1.db.prepare(`
        SELECT id, type, channel, recipient, content, status, delivery_status,
               mode, sent_by_name, sent_at, scheduled_for, last_error, created_at
        FROM notifications
        WHERE appointment_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(id, tenantId);
            res.json(rows);
        }
        catch (err) {
            console.error('[AppointmentController.getCommunications] Erro:', err);
            res.status(500).json({ error: 'Erro ao buscar comunicações do agendamento' });
        }
    }
}
exports.AppointmentController = AppointmentController;
