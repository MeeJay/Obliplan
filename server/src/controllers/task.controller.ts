import type { Request, Response, NextFunction } from 'express';
import { taskService, taskStepService, type TaskInput } from '../services/task.service';
import { taskListService } from '../services/taskList.service';
import { AppError } from '../middleware/errorHandler';
import type { SmartList } from '@obliplan/shared';

const SMART_KEYS: SmartList[] = ['my_day', 'important', 'planned', 'assigned', 'tasks'];

/** Resolve a task, enforce list access. `needEdit` requires write rights. */
async function requireTask(req: Request, taskId: number, needEdit = true) {
  const task = await taskService.getById(taskId, req.tenantId);
  if (!task) throw new AppError(404, 'Tâche introuvable');
  const access = await taskListService.access(task.listId, req.tenantId, req.session.userId!);
  if (!access) throw new AppError(403, 'Accès refusé');
  if (needEdit && !access.canEdit) throw new AppError(403, 'Modification non autorisée');
  return task;
}

export const taskController = {
  // ── Tasks ────────────────────────────────────────────────────────────────────
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const smart = req.query.smart as string | undefined;
      if (smart) {
        if (!SMART_KEYS.includes(smart as SmartList)) throw new AppError(400, 'Liste intelligente inconnue');
        res.json({ success: true, data: await taskService.smartList(smart as SmartList, req.tenantId, req.session.userId!) });
        return;
      }
      const listId = Number(req.query.listId);
      if (!listId) throw new AppError(400, 'listId ou smart requis');
      const access = await taskListService.access(listId, req.tenantId, req.session.userId!);
      if (!access) throw new AppError(403, 'Accès refusé');
      res.json({ success: true, data: await taskService.listForList(listId, req.tenantId) });
    } catch (err) {
      next(err);
    }
  },

  async counts(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await taskService.smartCounts(req.tenantId, req.session.userId!) });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as TaskInput;
      const access = await taskListService.access(data.listId, req.tenantId, req.session.userId!);
      if (!access) throw new AppError(403, 'Accès refusé');
      if (!access.canEdit) throw new AppError(403, 'Modification non autorisée');
      const task = await taskService.create(req.tenantId, req.session.userId!, data);
      res.status(201).json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await requireTask(req, Number(req.params.id));
      // Moving a task to another list requires write access on the destination too.
      const destListId = (req.body as { listId?: number }).listId;
      if (destListId && destListId !== task.listId) {
        const dest = await taskListService.access(destListId, req.tenantId, req.session.userId!);
        if (!dest || !dest.canEdit) throw new AppError(403, 'Liste de destination non autorisée');
      }
      res.json({ success: true, data: await taskService.update(task.id, req.tenantId, req.body) });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await requireTask(req, Number(req.params.id));
      await taskService.delete(task.id, req.tenantId);
      res.json({ success: true, message: 'Tâche supprimée' });
    } catch (err) {
      next(err);
    }
  },

  // ── Steps ────────────────────────────────────────────────────────────────────
  async listSteps(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await requireTask(req, Number(req.params.id), false);
      res.json({ success: true, data: await taskStepService.listForTask(task.id, req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async createStep(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await requireTask(req, Number(req.params.id));
      const step = await taskStepService.create(req.tenantId, task.id, req.body);
      res.status(201).json({ success: true, data: step });
    } catch (err) {
      next(err);
    }
  },
  async updateStep(req: Request, res: Response, next: NextFunction) {
    try {
      const step = await taskStepService.getById(Number(req.params.id), req.tenantId);
      if (!step) throw new AppError(404, 'Étape introuvable');
      await requireTask(req, step.taskId);
      res.json({ success: true, data: await taskStepService.update(step.id, req.tenantId, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async deleteStep(req: Request, res: Response, next: NextFunction) {
    try {
      const step = await taskStepService.getById(Number(req.params.id), req.tenantId);
      if (!step) throw new AppError(404, 'Étape introuvable');
      await requireTask(req, step.taskId);
      await taskStepService.delete(step.id, req.tenantId);
      res.json({ success: true, message: 'Étape supprimée' });
    } catch (err) {
      next(err);
    }
  },
};
