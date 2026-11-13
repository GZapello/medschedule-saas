import { Request, Response } from 'express';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { ClassScheduleService, buildWeeklyScheduleSummary } from '../services/class-schedule.service';
import { PackageService } from '../services/package.service';

export class ClassScheduleController {
  static list(req: Request, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const serviceId = String(req.params.serviceId || '');
      const includeInactive = req.query.includeInactive !== '0' && req.query.includeInactive !== 'false';

      const serviceRow = db
        .prepare('SELECT id, name, service_kind FROM services WHERE id = ? AND tenant_id = ?')
        .get(serviceId, tenantId) as any;

      if (!serviceRow) {
        return res.status(404).json({ error: 'Serviço não encontrado neste estabelecimento.' });
      }

      const schedules = ClassScheduleService.listForService(tenantId, serviceId, {
        includeInactive
      });

      return res.json({
        schedules,
        weeklySummary: buildWeeklyScheduleSummary(schedules)
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao carregar a grade semanal da aula.'
      });
    }
  }

  static create(req: Request, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const serviceId = String(req.params.serviceId || '');

      if (!PackageService.isStudioCompatible(tenantId)) {
        return res.status(403).json({
          error: 'Grade semanal de aulas coletivas está disponível para Studio / Academia e Estabelecimentos Mistos.'
        });
      }

      const result = ClassScheduleService.createSchedules(
        tenantId,
        serviceId,
        req.body || {},
        req.user?.userId || ''
      );

      const schedules = ClassScheduleService.listForService(tenantId, serviceId, {
        includeInactive: true
      });

      logAudit(req, 'CREATE_CLASS_SCHEDULE', 'class_schedules', serviceId, {
        createdCount: result.created.length,
        createdIds: result.created.map(c => c.id)
      });

      return res.status(201).json({
        created: result.created,
        warnings: result.warnings,
        schedules,
        weeklySummary: buildWeeklyScheduleSummary(schedules)
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.message || 'Não foi possível adicionar o horário na grade semanal.',
        code: err?.code
      });
    }
  }

  static update(req: Request, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const serviceId = String(req.params.serviceId || '');
      const scheduleId = String(req.params.scheduleId || '');

      if (!PackageService.isStudioCompatible(tenantId)) {
        return res.status(403).json({
          error: 'Grade semanal de aulas coletivas está disponível para Studio / Academia e Estabelecimentos Mistos.'
        });
      }

      const result = ClassScheduleService.updateSchedule(tenantId, serviceId, scheduleId, req.body || {});
      const schedules = ClassScheduleService.listForService(tenantId, serviceId, {
        includeInactive: true
      });

      logAudit(req, 'UPDATE_CLASS_SCHEDULE', 'class_schedules', scheduleId, {
        serviceId
      });

      return res.json({
        schedule: result.schedule,
        warnings: result.warnings,
        schedules,
        weeklySummary: buildWeeklyScheduleSummary(schedules)
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.message || 'Não foi possível atualizar o horário da grade.',
        code: err?.code
      });
    }
  }

  static toggleStatus(req: Request, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const serviceId = String(req.params.serviceId || '');
      const scheduleId = String(req.params.scheduleId || '');

      if (!PackageService.isStudioCompatible(tenantId)) {
        return res.status(403).json({
          error: 'Grade semanal de aulas coletivas está disponível para Studio / Academia e Estabelecimentos Mistos.'
        });
      }

      const { active } = req.body || {};
      const result = ClassScheduleService.updateSchedule(tenantId, serviceId, scheduleId, {
        active: active === false || active === 0 ? 0 : 1
      });
      const schedules = ClassScheduleService.listForService(tenantId, serviceId, {
        includeInactive: true
      });

      logAudit(req, 'TOGGLE_CLASS_SCHEDULE', 'class_schedules', scheduleId, {
        serviceId,
        active: result.schedule.active
      });

      return res.json({
        schedule: result.schedule,
        warnings: result.warnings,
        schedules,
        weeklySummary: buildWeeklyScheduleSummary(schedules)
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.message || 'Não foi possível alterar o status do horário.',
        code: err?.code
      });
    }
  }

  static remove(req: Request, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const serviceId = String(req.params.serviceId || '');
      const scheduleId = String(req.params.scheduleId || '');

      if (!PackageService.isStudioCompatible(tenantId)) {
        return res.status(403).json({
          error: 'Grade semanal de aulas coletivas está disponível para Studio / Academia e Estabelecimentos Mistos.'
        });
      }

      const result = ClassScheduleService.deleteOrDeactivateSchedule(tenantId, serviceId, scheduleId);
      const schedules = ClassScheduleService.listForService(tenantId, serviceId, {
        includeInactive: true
      });

      logAudit(req, 'DELETE_CLASS_SCHEDULE', 'class_schedules', scheduleId, {
        serviceId,
        action: result.action
      });

      return res.json({
        ...result,
        schedules,
        weeklySummary: buildWeeklyScheduleSummary(schedules)
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({
        error: err?.message || 'Não foi possível remover o horário da grade.',
        code: err?.code
      });
    }
  }
}
