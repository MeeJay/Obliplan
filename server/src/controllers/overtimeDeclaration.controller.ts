import type { Request, Response, NextFunction } from 'express';
import { overtimeDeclarationService } from '../services/overtimeDeclaration.service';
import { userService } from '../services/user.service';
import { permissionService } from '../services/permission.service';
import { notify, emailFor, managerIdOf } from '../services/notify';
import { auditService } from '../services/audit.service';
import { AppError } from '../middleware/errorHandler';

function actor(req: Request) {
  return { userId: req.session.userId!, role: req.session.role! };
}

/**
 * Guard the recup ≤ minutes invariant against the MERGED (effective) values of a partial
 * update - a body that touches only one of the two fields must still be checked against the
 * declaration's stored counterpart, otherwise an owner could shrink minutes (or inflate récup)
 * past the stored value and have syncRecupCredit credit unearned récup on validation.
 */
function assertRecupWithinMinutes(
  existing: { minutes: number; recupMinutes: number },
  body: { minutes?: number; recupMinutes?: number },
): void {
  const effMinutes = body.minutes ?? existing.minutes;
  const effRecup = body.recupMinutes ?? existing.recupMinutes;
  if (effRecup > effMinutes) {
    throw new AppError(400, 'La récup ne peut excéder les heures déclarées');
  }
}

export const overtimeDeclarationController = {
  /** GET /overtime/declarations?userId= - self, or manager/admin over the target. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = Number(req.query.userId) || req.session.userId!;
      if (userId !== req.session.userId && !(await userService.canManage(actor(req), userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      res.json({ success: true, data: await overtimeDeclarationService.getForUser(req.tenantId, userId) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /overtime/declarations/pending - pending for the manager's team (platform admin = whole
   *  tenant). Gated by requireTenantCapability('overtime:validate') on the route. */
  async pending(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const managerId = req.session.platformAdmin || req.session.role === 'admin' ? null : req.session.userId!;
      res.json({ success: true, data: await overtimeDeclarationService.getPending(req.tenantId, managerId) });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /overtime/declarations/team-summary?month=YYYY-MM - per-employee monthly overtime
   * aggregate for the manager's team (admin = whole tenant). Defaults to the current month.
   */
  async teamSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const monthParam = String(req.query.month ?? '');
      const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7);
      const from = `${month}-01`;
      const [y, m] = month.split('-').map(Number);
      const toExclusive = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      const managerId = req.session.platformAdmin || req.session.role === 'admin' ? null : req.session.userId!;
      res.json({
        success: true,
        data: await overtimeDeclarationService.teamSummary(req.tenantId, managerId, from, toExclusive),
      });
    } catch (err) {
      next(err);
    }
  },

  /** POST /overtime/declarations - any employee declares for self; manager/admin for a report. */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as {
        userId?: number;
        natureId: number;
        date: string;
        minutes: number;
        recupMinutes?: number;
        motif?: string | null;
      };
      const targetUserId = body.userId ?? req.session.userId!;
      if (targetUserId !== req.session.userId && !(await userService.canManage(actor(req), targetUserId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      const declaration = await overtimeDeclarationService.create(req.tenantId, { ...body, userId: targetUserId });
      // Notify the employee's manager (best-effort, never blocks the response).
      const managerId = await managerIdOf(req.tenantId, targetUserId);
      if (managerId && managerId !== req.session.userId) {
        const title = 'Nouvelle déclaration d’heures supplémentaires';
        const emailBody = `Une déclaration du ${declaration.date} attend votre validation.`;
        await notify(req.tenantId, {
          recipientIds: [managerId],
          actorId: req.session.userId,
          type: 'overtime.submitted',
          title,
          body: emailBody,
          link: '/heures-sup',
          entityType: 'overtime_declaration',
          entityId: declaration.id,
          email: emailFor(title, { title, body: emailBody, link: '/heures-sup' }),
        });
      }
      res.status(201).json({ success: true, data: declaration });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /overtime/declarations/:id/decision - manager/admin validates or refuses. */
  async decide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await overtimeDeclarationService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Déclaration introuvable');
      if (!(await userService.canManage(actor(req), existing.userId, req.tenantId))) {
        throw new AppError(403, 'Seul le manager peut valider une déclaration');
      }
      const { decision, comment } = req.body as { decision: 'valide' | 'refuse'; comment?: string | null };
      if (decision === 'refuse' && !comment?.trim()) {
        throw new AppError(400, 'Un motif de refus est requis');
      }
      const updated = await overtimeDeclarationService.decide(
        existing.id,
        req.tenantId,
        req.session.userId!,
        decision,
        comment ?? null,
      );
      // Notify the author of the decision (best-effort, never blocks the response).
      if (existing.userId !== req.session.userId) {
        const approved = decision === 'valide';
        const title = approved ? 'Heures supplémentaires validées' : 'Heures supplémentaires refusées';
        const body = !approved && comment?.trim() ? `Motif du refus : ${comment.trim()}` : undefined;
        await notify(req.tenantId, {
          recipientIds: [existing.userId],
          actorId: req.session.userId,
          type: 'overtime.decided',
          title,
          body,
          link: '/heures-sup',
          entityType: 'overtime_declaration',
          entityId: existing.id,
          email: emailFor(title, { title, body, link: '/heures-sup' }),
        });
      }
      await auditService.record(req.tenantId, req.session.userId!, 'overtime.decide', {
        entityType: 'overtime_declaration',
        entityId: existing.id,
        meta: { decision },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /overtime/declarations/:id - the owner edits their own still-pending declaration,
   * or a manager/admin edits a managed report's declaration (any status, for correction/cleanup;
   * the edit reverts it to en_attente for re-validation).
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await overtimeDeclarationService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Déclaration introuvable');
      const isOwner = existing.userId === req.session.userId;
      const isManager = !isOwner && (await userService.canManage(actor(req), existing.userId, req.tenantId));
      if (!isOwner && !isManager) {
        throw new AppError(403, 'Seul l’auteur ou son manager peut modifier la déclaration');
      }
      // The owner self-edit is limited to pending rows (a decided one goes through request-change);
      // a manager may correct any status.
      if (isOwner && existing.status !== 'en_attente') {
        throw new AppError(409, 'Seule une déclaration en attente peut être modifiée');
      }
      const body = req.body as { natureId?: number; date?: string; minutes?: number; recupMinutes?: number; motif?: string | null };
      assertRecupWithinMinutes(existing, body);
      const updated = await overtimeDeclarationService.update(existing.id, req.tenantId, body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /overtime/declarations/:id/request-change - owner submits corrected values on
   * an already-decided declaration; reverts it to en_attente for the manager to re-validate.
   */
  async requestChange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await overtimeDeclarationService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Déclaration introuvable');
      if (existing.userId !== req.session.userId) {
        throw new AppError(403, 'Seul l’auteur peut demander une modification');
      }
      const body = req.body as { natureId?: number; date?: string; minutes?: number; recupMinutes?: number; motif?: string | null };
      assertRecupWithinMinutes(existing, body);
      const updated = await overtimeDeclarationService.update(existing.id, req.tenantId, body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /overtime/declarations/:id - owner removes their own pending declaration,
   * or a user with overtime:validate (manager/admin) removes any.
   */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await overtimeDeclarationService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Déclaration introuvable');
      const isOwnerPending = existing.userId === req.session.userId && existing.status === 'en_attente';
      const canValidate = await permissionService.userHasTenantCapability(
        req.session.userId!,
        req.tenantId,
        'overtime:validate',
        req.session.role === 'admin',
      );
      if (!isOwnerPending && !canValidate) {
        throw new AppError(403, 'Suppression non autorisée');
      }
      await overtimeDeclarationService.delete(existing.id, req.tenantId);
      res.json({ success: true, message: 'Déclaration supprimée' });
    } catch (err) {
      next(err);
    }
  },
};
