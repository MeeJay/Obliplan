import type { Request, Response, NextFunction } from 'express';
import type { PlanningViewInput } from '@obliplan/shared';
import { planningViewService } from '../services/planningView.service';
import { AppError } from '../middleware/errorHandler';

/**
 * Parse + validate a saved-view body: `name` (string, 1..80 after trim) and
 * `teamIds` (array of positive ints, deduped). Inline guard in the house style
 * of planningImport.controller (no zod middleware). The service further checks
 * that every teamId belongs to the tenant's user_teams.
 */
function parseViewInput(req: Request): PlanningViewInput {
  const b = (req.body ?? {}) as { name?: unknown; teamIds?: unknown };
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 1 || name.length > 80) {
    throw new AppError(400, 'Le nom de la vue doit contenir entre 1 et 80 caractères.');
  }
  if (
    !Array.isArray(b.teamIds) ||
    !b.teamIds.every((n) => Number.isInteger(n) && (n as number) > 0)
  ) {
    throw new AppError(400, 'La liste des équipes est invalide.');
  }
  const teamIds = [...new Set(b.teamIds as number[])];
  return { name, teamIds };
}

/** Parse a positive integer :id route param or throw a 400. */
function parseId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'Identifiant de vue invalide.');
  return id;
}

/**
 * Map a Postgres unique-violation (SQLSTATE 23505 on the (tenant_id, user_id, name)
 * constraint) to a friendly 409 so the client can surface "nom déjà utilisé".
 * Any other error is returned unchanged.
 */
function mapConflict(err: unknown): unknown {
  if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
    return new AppError(409, 'Une vue portant ce nom existe déjà.');
  }
  return err;
}

export const planningViewController = {
  /** GET /planning/views - the current user's own saved views (owner-scoped), name-ordered. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await planningViewService.list(req.tenantId, req.session.userId!);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /** POST /planning/views - create a saved view owned by the current user in the active tenant. */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = parseViewInput(req);
      const view = await planningViewService.create(req.tenantId, req.session.userId!, input);
      res.status(201).json({ success: true, data: view });
    } catch (err) {
      next(mapConflict(err));
    }
  },

  /** PUT /planning/views/:id - rename / re-scope one of the current user's own views. */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req);
      const input = parseViewInput(req);
      const view = await planningViewService.update(id, req.tenantId, req.session.userId!, input);
      if (!view) throw new AppError(404, 'Vue introuvable.');
      res.json({ success: true, data: view });
    } catch (err) {
      next(mapConflict(err));
    }
  },

  /** DELETE /planning/views/:id - remove one of the current user's own views. */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req);
      const ok = await planningViewService.remove(id, req.tenantId, req.session.userId!);
      if (!ok) throw new AppError(404, 'Vue introuvable.');
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};
