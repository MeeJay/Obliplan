import type { Request, Response, NextFunction } from 'express';
import { todoService } from '../services/todo.service';
import { AppError } from '../middleware/errorHandler';

export const todoController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await todoService.listForUser(req.tenantId, req.session.userId!) });
    } catch (err) {
      next(err);
    }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json({ success: true, data: await todoService.create(req.tenantId, req.session.userId!, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const todo = await todoService.update(Number(req.params.id), req.tenantId, req.session.userId!, req.body);
      if (!todo) throw new AppError(404, 'Tâche introuvable');
      res.json({ success: true, data: todo });
    } catch (err) {
      next(err);
    }
  },
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const ok = await todoService.delete(Number(req.params.id), req.tenantId, req.session.userId!);
      if (!ok) throw new AppError(404, 'Tâche introuvable');
      res.json({ success: true, message: 'Tâche supprimée' });
    } catch (err) {
      next(err);
    }
  },
};
