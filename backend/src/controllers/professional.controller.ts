import { respondBillingError } from './billing.controller';
import { requireCapacity, pendingBillingManager, BillingService } from '../services/billing.service';
import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '../utils/password';
import { logAudit } from '../middlewares/audit.middleware';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { createDefaultSchedules } from '../utils/schedule-defaults';
import { resolveProfessionModule, cleanPracticeAreasForNewProfession } from '../utils/profession-module';
import { ProfessionTaxonomyService } from '../services/profession-taxonomy.service';

export class ProfessionalController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          p.id, p.tenant_id, p.user_id, p.name, p.slug, p.public_booking_enabled,
          p.photo_url, p.profession_id, p.specialty_id, p.specialty_custom,
          p.registration_type, p.registration_number, p.bio, p.practice_areas, p.buffer_minutes, p.active,
          p.remuneration_type, p.commission_percentage, p.fixed_salary, p.payment_day,
          p.profession_change_used, p.profession_changed_at,
          u.email, u.phone,
          COALESCE(p.specialty_custom, spec.name, p.practice_areas, '') as specialty_name, spec.color as specialty_color,
          COALESCE(prof.name, p.profession_name) as profession_name
        FROM professionals p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        WHERE p.tenant_id = ?
        ORDER BY p.name ASC
      `);
      const professionals = stmt.all(tenantId);
      res.json(professionals);
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar profissionais' });
    }
  }

  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const stmt = db.prepare(`
        SELECT 
          p.id, p.tenant_id, p.user_id, p.name, p.slug, p.public_booking_enabled,
          p.photo_url, p.profession_id, p.specialty_id, p.specialty_custom,
          p.registration_type, p.registration_number, p.bio, p.practice_areas, p.buffer_minutes, p.active,
          p.remuneration_type, p.commission_percentage, p.fixed_salary, p.payment_day,
          p.profession_change_used, p.profession_changed_at,
          u.email, u.phone,
          COALESCE(p.specialty_custom, spec.name, p.practice_areas, '') as specialty_name,
          COALESCE(prof.name, p.profession_name) as profession_name
        FROM professionals p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        WHERE p.id = ? AND p.tenant_id = ?
      `);
      const professional = stmt.get(id, tenantId);

      if (!professional) {
        res.status(404).json({ error: 'Profissional não encontrado' });
        return;
      }

      // Busca grade de horários
      const schedStmt = db.prepare(`
        SELECT id, day_of_week, start_time, end_time, break_start, break_end, is_active
        FROM schedules
        WHERE professional_id = ? AND tenant_id = ?
        ORDER BY day_of_week ASC
      `);
      const schedules = schedStmt.all(id, tenantId).map((s: any) => ({
        ...s,
        is_active: Boolean(s.is_active)
      }));

      // Busca bloqueios futuros
      const blockStmt = db.prepare(`
        SELECT id, title, start_datetime, end_datetime, reason, type
        FROM blocked_times
        WHERE professional_id = ? AND tenant_id = ? AND end_datetime >= datetime('now')
        ORDER BY start_datetime ASC
      `);
      const blockedTimes = blockStmt.all(id, tenantId);

      res.json({
        professional,
        schedules,
        blockedTimes
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar detalhes do profissional' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        name, email, password, phone, professionId, specialtyId, specialtyName, specialtyCustom,
        registrationType, registrationNumber, bio, practiceAreas, bufferMinutes, photoUrl, gender,
        slug: userSlug, publicBookingEnabled, remunerationType, commissionPercentage, fixedSalary, paymentDay
      } = req.body;

      if (!name || !email) {
        res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
        return;
      }

      // Verifica ou cria usuário
      let userId: string;
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase()) as { id: string } | undefined;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        userId = uuidv4();
        const pwdHash = await hashPassword(password || '123456');
        const insertUser = db.prepare(`
          INSERT INTO users (id, tenant_id, name, email, password_hash, role, phone, status)
          VALUES (?, ?, ?, ?, ?, 'professional', ?, 'active')
        `);
        insertUser.run(userId, tenantId, name, email.trim().toLowerCase(), pwdHash, phone || null);
      }

      const profId = 'pro-' + uuidv4().slice(0, 8);
      const customSpec = specialtyCustom || specialtyName || null;
      
      // Gera slug único caso não informado
      let finalSlug = userSlug ? String(userSlug).trim().toLowerCase() : '';
      if (!finalSlug) {
        const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        finalSlug = `${base}-${profId.slice(-4)}`;
      }

      let profName = '';
      let profSlug = '';
      if (professionId) {
        const pRow = db.prepare('SELECT id, name, slug FROM professions WHERE id = ?').get(professionId) as any;
        if (pRow) {
          profName = pRow.name || '';
          profSlug = pRow.slug || '';
        }
      }

      const { module: targetModule, flags } = resolveProfessionModule({
        id: professionId,
        name: profName,
        slug: profSlug,
        registrationType
      });

      const insertProf = db.prepare(`
        INSERT INTO professionals (
          id, tenant_id, user_id, name, slug, public_booking_enabled, photo_url, profession_id, profession_name, specialty_id, specialty_custom,
          registration_type, registration_number, bio, practice_areas, buffer_minutes, gender,
          remuneration_type, commission_percentage, fixed_salary, payment_day, active,
          zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,
          zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertProf.run(
        profId,
        tenantId,
        userId,
        name,
        finalSlug,
        publicBookingEnabled !== undefined ? (publicBookingEnabled ? 1 : 0) : 1,
        photoUrl || null,
        professionId || null,
        profName || null,
        specialtyId || null,
        customSpec,
        registrationType || null,
        registrationNumber || null,
        bio || null,
        practiceAreas || null,
        bufferMinutes || 10,
        gender === 'F' ? 'F' : 'M',
        remunerationType || 'commission',
        commissionPercentage !== undefined ? Number(commissionPercentage) : 0,
        fixedSalary !== undefined ? Number(fixedSalary) : 0,
        paymentDay !== undefined ? Number(paymentDay) : 5,
        flags.zemda_fisio_enabled,
        flags.zemda_odonto_enabled,
        flags.zemda_nutri_enabled,
        flags.zemda_to_enabled,
        flags.zemda_fono_enabled,
        flags.zemda_pp_enabled,
        flags.zemda_psico_enabled,
        flags.zemda_personal_enabled
      );

      // Atualiza usuário vinculado com profissão e flags
      db.prepare(`
        UPDATE users SET
          profession_id = ?,
          profession_name = ?,
          registration_type = ?,
          registration_number = ?,
          practice_areas = ?,
          zemda_fisio_enabled = ?,
          zemda_odonto_enabled = ?,
          zemda_nutri_enabled = ?,
          zemda_to_enabled = ?,
          zemda_fono_enabled = ?,
          zemda_pp_enabled = ?,
          zemda_psico_enabled = ?,
          zemda_personal_enabled = ?
        WHERE id = ?
      `).run(
        professionId || null,
        profName || null,
        registrationType || null,
        registrationNumber || null,
        practiceAreas || null,
        flags.zemda_fisio_enabled,
        flags.zemda_odonto_enabled,
        flags.zemda_nutri_enabled,
        flags.zemda_to_enabled,
        flags.zemda_fono_enabled,
        flags.zemda_pp_enabled,
        flags.zemda_psico_enabled,
        flags.zemda_personal_enabled,
        userId
      );

      // Cria grade de horários padrão de segunda a sexta (ativo) e fim de semana (inativo)
      createDefaultSchedules(db, tenantId, profId);

      let permissions = ['view_schedule', 'create_appointment', 'edit_appointment', 'cancel_appointment', 'create_patient', 'edit_patient', 'access_zemda_body'];
      if (targetModule === 'ZemdaPersonal') {
        permissions.push('access_zemda_personal');
      }

      // Garante vínculo ativo na clínica com permissões e flags
      db.prepare(`
        INSERT INTO clinic_users (
          id, tenant_id, user_id, role, status, is_manager, permissions_json, practice_areas,
          profession_id, profession_name, profession_custom,
          zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled, zemda_to_enabled,
          zemda_fono_enabled, zemda_pp_enabled, zemda_psico_enabled, zemda_personal_enabled
        )
        VALUES (?, ?, ?, 'professional', 'active', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          role = 'professional',
          status = 'active',
          profession_id = excluded.profession_id,
          profession_name = excluded.profession_name,
          profession_custom = excluded.profession_custom,
          permissions_json = excluded.permissions_json,
          practice_areas = COALESCE(excluded.practice_areas, clinic_users.practice_areas),
          zemda_fisio_enabled = excluded.zemda_fisio_enabled,
          zemda_odonto_enabled = excluded.zemda_odonto_enabled,
          zemda_nutri_enabled = excluded.zemda_nutri_enabled,
          zemda_to_enabled = excluded.zemda_to_enabled,
          zemda_fono_enabled = excluded.zemda_fono_enabled,
          zemda_pp_enabled = excluded.zemda_pp_enabled,
          zemda_psico_enabled = excluded.zemda_psico_enabled,
          zemda_personal_enabled = excluded.zemda_personal_enabled
      `).run(
        'cu-' + uuidv4().slice(0, 8),
        tenantId,
        userId,
        JSON.stringify(permissions),
        practiceAreas || null,
        professionId || null,
        profName || null,
        profName || null,
        flags.zemda_fisio_enabled,
        flags.zemda_odonto_enabled,
        flags.zemda_nutri_enabled,
        flags.zemda_to_enabled,
        flags.zemda_fono_enabled,
        flags.zemda_pp_enabled,
        flags.zemda_psico_enabled,
        flags.zemda_personal_enabled
      );

      logAudit(req, 'CREATE_PROFESSIONAL', 'professionals', profId, { name, email, slug: finalSlug });
      res.status(201).json({ id: profId, name, slug: finalSlug, message: 'Profissional cadastrado com sucesso' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar profissional' });
    }
  }

  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const {
        name, professionId, specialtyId, specialtyName, specialtyCustom, registrationType, registrationNumber,
        bio, practiceAreas, bufferMinutes, photoUrl, gender, active,
        slug, publicBookingEnabled, remunerationType, commissionPercentage, fixedSalary, paymentDay
      } = req.body;

      // 1. Busca profissional atual para validação de existência e verificação da alteração única de profissão
      const currentProf = db.prepare(`
        SELECT id, tenant_id, user_id, profession_id, practice_areas, profession_change_used
        FROM professionals
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!currentProf) {
        res.status(404).json({ error: 'Profissional não encontrado' });
        return;
      }

      // Se for profissional, valida se está editando o próprio perfil
      if (req.user && req.user.role === 'professional' && currentProf.user_id && currentProf.user_id !== req.user.userId) {
        res.status(403).json({ error: 'Você só pode editar o seu próprio perfil profissional' });
        return;
      }

      const customSpec = specialtyCustom !== undefined ? specialtyCustom : (specialtyName !== undefined ? specialtyName : null);

      // 2. Regra: Alteração de profissão apenas uma vez durante toda a conta
      const isChangingProfession = Boolean(professionId && professionId !== currentProf.profession_id);

      if (isChangingProfession) {
        if (Boolean(currentProf.profession_change_used)) {
          res.status(403).json({
            error: 'A alteração de profissão já foi utilizada para este profissional e não é mais permitida.'
          });
          return;
        }
      }

      const markChangeUsed = isChangingProfession ? 1 : 0;
      const nowIso = new Date().toISOString();

      const updateStmt = db.prepare(`
        UPDATE professionals SET
          name = COALESCE(?, name),
          slug = COALESCE(?, slug),
          public_booking_enabled = COALESCE(?, public_booking_enabled),
          profession_id = COALESCE(?, profession_id),
          specialty_id = COALESCE(?, specialty_id),
          specialty_custom = COALESCE(?, specialty_custom),
          registration_type = COALESCE(?, registration_type),
          registration_number = COALESCE(?, registration_number),
          bio = COALESCE(?, bio),
          practice_areas = COALESCE(?, practice_areas),
          buffer_minutes = COALESCE(?, buffer_minutes),
          photo_url = COALESCE(?, photo_url),
          gender = COALESCE(?, gender),
          remuneration_type = COALESCE(?, remuneration_type),
          commission_percentage = COALESCE(?, commission_percentage),
          fixed_salary = COALESCE(?, fixed_salary),
          payment_day = COALESCE(?, payment_day),
          active = COALESCE(?, active),
          profession_change_used = CASE WHEN ? = 1 THEN 1 ELSE profession_change_used END,
          profession_changed_at = CASE WHEN ? = 1 THEN ? ELSE profession_changed_at END,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        name || null,
        slug ? String(slug).trim().toLowerCase() : null,
        publicBookingEnabled !== undefined ? (publicBookingEnabled ? 1 : 0) : null,
        professionId || null,
        specialtyId || null,
        customSpec,
        registrationType || null,
        registrationNumber || null,
        bio || null,
        practiceAreas || null,
        bufferMinutes !== undefined ? Number(bufferMinutes) : null,
        photoUrl || null,
        gender || null,
        remunerationType || null,
        commissionPercentage !== undefined ? Number(commissionPercentage) : null,
        fixedSalary !== undefined ? Number(fixedSalary) : null,
        paymentDay !== undefined ? Number(paymentDay) : null,
        active !== undefined ? (active ? 1 : 0) : null,
        markChangeUsed,
        markChangeUsed,
        markChangeUsed ? nowIso : null,
        id,
        tenantId
      );

      // 3. Atualização automática do módulo profissional correspondente à nova profissão escolhida
      if (isChangingProfession && tenantId) {
        const taxonomyResult = ProfessionTaxonomyService.updateProfessionalTaxonomy({
          tenantId,
          professionalId: String(id),
          newProfessionId: professionId,
          newSpecialtyId: specialtyId,
          newSpecialtyCustom: customSpec,
          practiceAreas,
          registrationType,
          registrationNumber
        });

        // Se for gestor, sincroniza tenant
        if (currentProf.user_id) {
          const cu = db.prepare('SELECT is_manager FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(currentProf.user_id, tenantId) as any;
          if (cu?.is_manager) {
            db.prepare(`
              UPDATE tenants SET
                manager_profession = ?,
                manager_practice_areas = ?
              WHERE id = ?
            `).run(taxonomyResult.canonicalProfessionName || null, taxonomyResult.finalPracticeAreas, tenantId);
          }
        }

        logAudit(req, 'CHANGE_PROFESSION_ONCE', 'professionals', String(id), {
          oldProfessionId: currentProf.profession_id,
          newProfessionId: professionId,
          newProfessionName: taxonomyResult.canonicalProfessionName,
          targetModule: taxonomyResult.commercialModule
        });
      }

      logAudit(req, 'UPDATE_PROFESSIONAL', 'professionals', id);
      res.json({ message: 'Profissional atualizado com sucesso' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar profissional' });
    }
  }

  static updateSchedules(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { schedules } = req.body; // Array de { day_of_week, start_time, end_time, break_start, break_end, is_active }

      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      if (!Array.isArray(schedules)) {
        res.status(400).json({ error: 'Array de horários (schedules) é obrigatório' });
        return;
      }

      // Verifica se o profissional existe no tenant
      const prof = db.prepare('SELECT id, user_id FROM professionals WHERE id = ? AND tenant_id = ?').get(id, tenantId) as { id: string; user_id: string } | undefined;
      if (!prof) {
        res.status(404).json({ error: 'Profissional não encontrado' });
        return;
      }

      // Apenas o Gerente/Gerenciador da Clínica pode alterar a escala de trabalho (Item 1)
      if (req.user?.role !== 'clinic_admin' && req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Apenas o Gerente/Gerenciador da Clínica pode editar a escala de trabalho.' });
        return;
      }

      // Validação de Conflitos: Busca agendamentos futuros não-cancelados com JOIN seguro em patients
      const futureAppts = db.prepare(`
        SELECT a.id, COALESCE(p.full_name, 'Paciente') as patient_name, a.start_time, a.end_time
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        WHERE a.tenant_id = ? AND a.professional_id = ? AND a.status NOT IN ('cancelled') AND a.start_time >= datetime('now')
        ORDER BY a.start_time ASC
      `).all(tenantId, id) as { id: string; patient_name: string; start_time: string; end_time: string }[];

      const conflicts: Array<{ appointmentId: string; patientName: string; startTime: string; reason: string }> = [];

      const extractTime = (timeStr: string) => {
        if (!timeStr) return '';
        const part = timeStr.includes('T') ? timeStr.split('T')[1] : timeStr.split(' ')[1] || timeStr;
        return part.slice(0, 5);
      };

      // Verifica se cada consulta futura cabe na nova grade de trabalho
      for (const appt of futureAppts) {
        if (!appt.start_time || !appt.end_time) continue;
        const normalizedStart = appt.start_time.includes('T') ? appt.start_time : appt.start_time.replace(' ', 'T');
        const apptDate = new Date(normalizedStart);
        const dayOfWeek = isNaN(apptDate.getDay()) ? -1 : apptDate.getDay();
        if (dayOfWeek === -1) continue;

        const apptStartTime = extractTime(appt.start_time);
        const apptEndTime = extractTime(appt.end_time);

        // Procura se há algum turno ativo no mesmo dia que englobe esse agendamento
        const activeShiftsForDay = schedules.filter(s => Number(s.day_of_week) === dayOfWeek && Boolean(s.is_active));
        if (activeShiftsForDay.length === 0) {
          conflicts.push({
            appointmentId: appt.id,
            patientName: appt.patient_name,
            startTime: appt.start_time,
            reason: 'O profissional não terá expediente neste dia da semana na nova escala.'
          });
          continue;
        }

        let fitsInAnyShift = false;
        for (const shift of activeShiftsForDay) {
          const shiftStart = shift.start_time || '08:00';
          const shiftEnd = shift.end_time || '18:00';
          const breakStart = shift.break_start;
          const breakEnd = shift.break_end;

          const insideShift = apptStartTime >= shiftStart && apptEndTime <= shiftEnd;
          let insideBreak = false;
          if (breakStart && breakEnd) {
            insideBreak = (apptStartTime >= breakStart && apptStartTime < breakEnd) ||
                          (apptEndTime > breakStart && apptEndTime <= breakEnd);
          }

          if (insideShift && !insideBreak) {
            fitsInAnyShift = true;
            break;
          }
        }

        if (!fitsInAnyShift) {
          conflicts.push({
            appointmentId: appt.id,
            patientName: appt.patient_name,
            startTime: appt.start_time,
            reason: 'O horário da consulta coincide com um intervalo de pausa ou está fora do expediente do novo turno.'
          });
        }
      }

      // Remove horários existentes e insere a nova grade em transação atômica segura
      db.exec('BEGIN TRANSACTION');
      try {
        db.prepare('DELETE FROM schedules WHERE professional_id = ? AND tenant_id = ?').run(id, tenantId);

        const insertStmt = db.prepare(`
          INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const s of schedules) {
          insertStmt.run(
            `sch-${uuidv4().slice(0, 8)}`,
            tenantId,
            id,
            Number(s.day_of_week),
            s.start_time || '08:00',
            s.end_time || '18:00',
            s.break_start || null,
            s.break_end || null,
            s.is_active ? 1 : 0
          );
        }

        db.exec('COMMIT');
      } catch (txErr) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw txErr;
      }

      logAudit(req, 'UPDATE_SCHEDULES', 'schedules', id, { totalPeriods: schedules.length, conflictsCount: conflicts.length });
      
      // Responde com sucesso e detalhes de conflito, sem apagar consultas existentes
      res.json({
        message: 'Horários atualizados com sucesso.',
        warning: conflicts.length > 0
          ? `Atenção: Foram encontrados ${conflicts.length} agendamento(s) já marcado(s) fora dos novos horários definidos. As consultas foram preservadas intactas.`
          : undefined,
        conflicts: conflicts.length > 0 ? conflicts : []
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.updateSchedules] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar horários' });
    }
  }

  // ==========================================
  // PÁGINA PÚBLICA DO PROFISSIONAL (/agendar/:slug)
  // ==========================================

  static getPublicProfile(req: Request, res: Response): void {
    try {
      const { slug } = req.params;
      if (!slug) {
        res.status(400).json({ error: 'Slug do profissional não informado' });
        return;
      }

      const profRow = db.prepare(`
        SELECT 
          p.id, p.tenant_id, p.name, p.slug, p.photo_url, p.bio,
          p.registration_type, p.registration_number, p.practice_areas, p.gender,
          COALESCE(p.specialty_custom, spec.name, p.practice_areas, '') as specialty_name,
          prof.name as profession_name
        FROM professionals p
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        WHERE p.slug = ? AND p.active = 1 AND p.public_booking_enabled = 1
      `).get(String(slug).trim().toLowerCase()) as any;

      if (!profRow) {
        res.status(404).json({ error: 'Página pública do profissional não encontrada ou agendamento online desativado.' });
        return;
      }

      // Busca dados públicos da clínica
      const tenantRow = db.prepare(`
        SELECT id, name, trade_name, slug, logo_url, phone, mobile, whatsapp, email,
               address, street, number, neighborhood, city, state, zip_code, description
        FROM tenants
        WHERE id = ? AND status = 'active'
      `).get(profRow.tenant_id) as any;

      if (!tenantRow) {
        res.status(404).json({ error: 'Clínica não encontrada ou inativa' });
        return;
      }

      // Busca serviços do profissional (ou todos os ativos da clínica se não houver vinculação restrita)
      let services = db.prepare(`
        SELECT s.id, s.name, s.description,
               COALESCE(ps.custom_duration, s.duration_minutes) as duration_minutes,
               COALESCE(ps.custom_price, s.price) as price,
               s.modality
        FROM professional_services ps
        JOIN services s ON s.id = ps.service_id
        WHERE ps.professional_id = ? AND s.active = 1
        ORDER BY s.name ASC
      `).all(profRow.id) as any[];

      if (!services || services.length === 0) {
        services = db.prepare(`
          SELECT id, name, description, duration_minutes, price, modality
          FROM services
          WHERE tenant_id = ? AND active = 1
          ORDER BY name ASC
        `).all(profRow.tenant_id) as any[];
      }

      res.json({
        professional: profRow,
        tenant: tenantRow,
        services
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.getPublicProfile] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar página pública do profissional' });
    }
  }

  static getPublicSlots(req: Request, res: Response): void {
    try {
      const { slug } = req.params;
      const { date, serviceId } = req.query;

      if (!slug || !date) {
        res.status(400).json({ error: 'Slug do profissional e data (YYYY-MM-DD) são obrigatórios' });
        return;
      }

      const profRow = db.prepare(`
        SELECT id, tenant_id FROM professionals
        WHERE slug = ? AND active = 1 AND public_booking_enabled = 1
      `).get(String(slug).trim().toLowerCase()) as { id: string; tenant_id: string } | undefined;

      if (!profRow) {
        res.status(404).json({ error: 'Profissional não encontrado' });
        return;
      }

      // Se serviceId não foi passado, pega o primeiro serviço ativo
      let targetServiceId = serviceId ? String(serviceId) : null;
      if (!targetServiceId) {
        const firstSrv = db.prepare(`
          SELECT id FROM services WHERE tenant_id = ? AND active = 1 LIMIT 1
        `).get(profRow.tenant_id) as { id: string } | undefined;
        if (firstSrv) targetServiceId = firstSrv.id;
      }

      if (!targetServiceId) {
        res.status(400).json({ error: 'Nenhum serviço disponível para calcular disponibilidade' });
        return;
      }

      const slots = calculateAvailableSlots(
        profRow.tenant_id,
        profRow.id,
        targetServiceId,
        String(date)
      );

      res.json({
        date: String(date),
        professionalId: profRow.id,
        serviceId: targetServiceId,
        totalAvailable: slots.length,
        slots
      });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.getPublicSlots] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar horários livres do profissional' });
    }
  }

  static createBlockedTime(req: Request, res: Response): void {
    try {
      if (req.user?.role !== 'clinic_admin' && req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Apenas o Gerente/Gerenciador da Clínica pode gerenciar bloqueios de horários.' });
        return;
      }

      const tenantId = req.tenantId;
      const { professionalId, roomId, title, startDatetime, endDatetime, reason, type } = req.body;

      if (!title || !startDatetime || !endDatetime) {
        res.status(400).json({ error: 'Título, data/hora inicial e final são obrigatórios' });
        return;
      }

      const id = 'blk-' + uuidv4().slice(0, 8);
      const insertStmt = db.prepare(`
        INSERT INTO blocked_times (id, tenant_id, professional_id, room_id, title, start_datetime, end_datetime, reason, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        tenantId,
        professionalId || null,
        roomId || null,
        title,
        startDatetime,
        endDatetime,
        reason || null,
        type || 'absence'
      );

      logAudit(req, 'CREATE_BLOCKED_TIME', 'blocked_times', id, { title, startDatetime, endDatetime });
      res.status(201).json({ id, message: 'Bloqueio de horário registrado com sucesso' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.createBlockedTime] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar bloqueio' });
    }
  }

  static deleteBlockedTime(req: Request, res: Response): void {
    try {
      if (req.user?.role !== 'clinic_admin' && req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Apenas o Gerente/Gerenciador da Clínica pode remover bloqueios de horários.' });
        return;
      }

      const { blockId } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM blocked_times WHERE id = ? AND tenant_id = ?').run(blockId, tenantId);
      logAudit(req, 'DELETE_BLOCKED_TIME', 'blocked_times', blockId);
      res.json({ message: 'Bloqueio removido com sucesso' });
    } catch (err: any) {
      if (respondBillingError(res, err)) return;
      console.error('[ProfessionalController.deleteBlockedTime] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover bloqueio' });
    }
  }
}
