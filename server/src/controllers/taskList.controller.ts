import type { Request, Response, NextFunction } from 'express';
import { taskListService, listGroupService, listShareService } from '../services/taskList.service';
import { userService } from '../services/user.service';
import { AppError } from '../middleware/errorHandler';

/** Require the current user to own the list (rename / delete / share / reorder). */
async function requireOwner(req: Request, listId: number) {
  const list = await taskListService.getById(listId, req.tenantId);
  if (!list) throw new AppError(404, 'Liste introuvable');
  if (list.ownerId !== req.session.userId) throw new AppError(403, 'Accès refusé');
  return list;
}

export const taskListController = {
  // ── Lists ────────────────────────────────────────────────────────────────────
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      await taskListService.ensureInbox(req.tenantId, req.session.userId!);
      res.json({ success: true, data: await taskListService.listForUser(req.tenantId, req.session.userId!) });
    } catch (err) {
      next(err);
    }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await taskListService.create(req.tenantId, req.session.userId!, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      await requireOwner(req, Number(req.params.id));
      res.json({ success: true, data: await taskListService.update(Number(req.params.id), req.tenantId, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await requireOwner(req, Number(req.params.id));
      await taskListService.delete(Number(req.params.id), req.tenantId);
      res.json({ success: true, message: 'Liste supprimée' });
    } catch (err) {
      next(err);
    }
  },
  async reorder(req: Request, res: Response, next: NextFunction) {
    try {
      await taskListService.reorder(req.tenantId, req.session.userId!, req.body.items);
      res.json({ success: true, message: 'Ordre mis à jour' });
    } catch (err) {
      next(err);
    }
  },

  // ── Groups ───────────────────────────────────────────────────────────────────
  async listGroups(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await listGroupService.listForUser(req.tenantId, req.session.userId!) });
    } catch (err) {
      next(err);
    }
  },
  async createGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await listGroupService.create(req.tenantId, req.session.userId!, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
  async updateGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const group = await listGroupService.update(Number(req.params.id), req.tenantId, req.session.userId!, req.body);
      if (!group) throw new AppError(404, 'Groupe introuvable');
      res.json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  },
  async deleteGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const ok = await listGroupService.delete(Number(req.params.id), req.tenantId, req.session.userId!);
      if (!ok) throw new AppError(404, 'Groupe introuvable');
      res.json({ success: true, message: 'Groupe supprimé' });
    } catch (err) {
      next(err);
    }
  },

  // ── Sharing ──────────────────────────────────────────────────────────────────
  async listShares(req: Request, res: Response, next: NextFunction) {
    try {
      await requireOwner(req, Number(req.params.id));
      res.json({ success: true, data: await listShareService.listForList(Number(req.params.id), req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async createShare(req: Request, res: Response, next: NextFunction) {
    try {
      const listId = Number(req.params.id);
      await requireOwner(req, listId);
      const { userId, canEdit } = req.body as { userId: number; canEdit?: boolean };
      if (userId === req.session.userId) throw new AppError(400, 'La liste vous appartient déjà');
      const share = await listShareService.share(req.tenantId, listId, userId, canEdit ?? true);
      res.status(201).json({ success: true, data: share });
    } catch (err) {
      next(err);
    }
  },
  async deleteShare(req: Request, res: Response, next: NextFunction) {
    try {
      const listId = Number(req.params.id);
      await requireOwner(req, listId);
      await listShareService.unshare(listId, Number(req.params.userId), req.tenantId);
      res.json({ success: true, message: 'Partage retiré' });
    } catch (err) {
      next(err);
    }
  },

  // ── Members pool (for the share picker + assignee dropdown) ───────────────────
  async membersPool(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await userService.getByTenant(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
};
