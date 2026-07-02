import type { Request, Response, NextFunction } from 'express';
import {
  boardService, columnService, sprintService, cardService, commentService, activityService,
  type CardInput,
} from '../services/kanban.service';
import type { BoardMemberRole, CardLinkType } from '@obliplan/shared';
import { teamService } from '../services/team.service';
import { AppError } from '../middleware/errorHandler';

/** Board access: owner, platform admin, manager-of-owner, board member, or team scope. */
async function requireBoard(req: Request, boardId: number) {
  const board = await boardService.getById(boardId, req.tenantId);
  if (!board) throw new AppError(404, 'Tableau introuvable');
  const ok = await boardService.canAccess(board, { userId: req.session.userId!, role: req.session.role!});
  if (!ok) throw new AppError(403, 'Accès refusé');
  return board;
}

/** Member-management gate: board owner/admin member, or a tenant/platform admin. */
async function requireBoardManager(req: Request, boardId: number) {
  const board = await boardService.getById(boardId, req.tenantId);
  if (!board) throw new AppError(404, 'Tableau introuvable');
  const ok = req.session.platformAdmin || await boardService.isBoardManager(boardId, req.tenantId, req.session.userId!);
  if (!ok) throw new AppError(403, 'Accès refusé');
  return board;
}

/**
 * Content-write gate: board access AND not a read-only 'viewer' member. An explicit
 * 'viewer' is read-only on content (cards/columns/sprints/links) unless they are also a
 * tenant/platform admin. Everyone else with access (owner/admin/member, manager-of-owner,
 * admin, team rw-scope) may write.
 */
async function requireBoardWrite(req: Request, boardId: number) {
  const board = await requireBoard(req, boardId);
  if (!req.session.platformAdmin && req.session.role !== 'admin') {
    const member = await boardService.getMember(boardId, req.tenantId, req.session.userId!);
    if (member?.role === 'viewer') throw new AppError(403, 'Accès en lecture seule sur ce tableau');
  }
  return board;
}

/**
 * Gate board creation (Axis C): admins, managers, or members of a team whose
 * canCreate flag is set. Everyone else gets 403. Apply after requireAuth +
 * requireTenant on POST /boards.
 */
export async function requireBoardCreate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const { role, platformAdmin, userId } = req.session;
    if (platformAdmin || role === 'admin' || role === 'manager') return next();
    const scope = await teamService.resolveScope(userId!, req.tenantId, { role, platformAdmin });
    if (scope.canCreate) return next();
    next(new AppError(403, 'Création de projet non autorisée'));
  } catch (err) {
    next(err);
  }
}

export const kanbanController = {
  // ── Boards ─────────────────────────────────────────────────────────────────
  async listBoards(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await boardService.listVisible(req.tenantId, {
        userId: req.session.userId!,
        role: req.session.role!,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
  async listAll(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await boardService.listAll(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async getBoard(req: Request, res: Response, next: NextFunction) {
    try {
      await requireBoard(req, Number(req.params.id));
      res.json({ success: true, data: await boardService.getDetail(Number(req.params.id), req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async createBoard(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, clientId } = req.body as { name: string; description?: string | null; clientId?: number | null };
      res.status(201).json({ success: true, data: await boardService.create(req.tenantId, req.session.userId!, { name, description, clientId }) });
    } catch (err) {
      next(err);
    }
  },
  async updateBoard(req: Request, res: Response, next: NextFunction) {
    try {
      await requireBoardManager(req, Number(req.params.id));
      res.json({ success: true, data: await boardService.update(Number(req.params.id), req.tenantId, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async deleteBoard(req: Request, res: Response, next: NextFunction) {
    try {
      await requireBoardManager(req, Number(req.params.id));
      await boardService.delete(Number(req.params.id), req.tenantId);
      res.json({ success: true, message: 'Tableau supprimé' });
    } catch (err) {
      next(err);
    }
  },

  // ── Columns ──────────────────────────────────────────────────────────────────
  async createColumn(req: Request, res: Response, next: NextFunction) {
    try {
      const boardId = Number(req.params.id);
      await requireBoardWrite(req, boardId);
      res.status(201).json({ success: true, data: await columnService.create(req.tenantId, boardId, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async updateColumn(req: Request, res: Response, next: NextFunction) {
    try {
      const col = await columnService.update(Number(req.params.id), req.tenantId, req.body);
      if (!col) throw new AppError(404, 'Colonne introuvable');
      await requireBoardWrite(req, col.boardId);
      res.json({ success: true, data: col });
    } catch (err) {
      next(err);
    }
  },
  async deleteColumn(req: Request, res: Response, next: NextFunction) {
    try {
      const ok = await columnService.delete(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Colonne introuvable');
      res.json({ success: true, message: 'Colonne supprimée' });
    } catch (err) {
      next(err);
    }
  },

  // ── Sprints ──────────────────────────────────────────────────────────────────
  async createSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const boardId = Number(req.params.id);
      await requireBoardWrite(req, boardId);
      res.status(201).json({ success: true, data: await sprintService.create(req.tenantId, boardId, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async updateSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const sprint = await sprintService.update(Number(req.params.id), req.tenantId, req.body);
      if (!sprint) throw new AppError(404, 'Sprint introuvable');
      await requireBoardWrite(req, sprint.boardId);
      res.json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },
  async deleteSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const ok = await sprintService.delete(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Sprint introuvable');
      res.json({ success: true, message: 'Sprint supprimé' });
    } catch (err) {
      next(err);
    }
  },

  // ── Cards ──────────────────────────────────────────────────────────────────
  async createCard(req: Request, res: Response, next: NextFunction) {
    try {
      const boardId = Number(req.params.id);
      await requireBoardWrite(req, boardId);
      const card = await cardService.create(req.tenantId, boardId, req.session.userId!, req.body as CardInput);
      res.status(201).json({ success: true, data: card });
    } catch (err) {
      next(err);
    }
  },
  async updateCard(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await cardService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Carte introuvable');
      await requireBoardWrite(req, existing.boardId);
      res.json({ success: true, data: await cardService.update(existing.id, req.tenantId, req.body, req.session.userId!) });
    } catch (err) {
      next(err);
    }
  },
  async deleteCard(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await cardService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Carte introuvable');
      await requireBoardWrite(req, existing.boardId);
      await cardService.delete(existing.id, req.tenantId);
      res.json({ success: true, message: 'Carte supprimée' });
    } catch (err) {
      next(err);
    }
  },

  // ── Members ──────────────────────────────────────────────────────────────────
  async listMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const boardId = Number(req.params.id);
      await requireBoard(req, boardId);
      res.json({ success: true, data: await boardService.getMembers(boardId, req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      const boardId = Number(req.params.id);
      await requireBoardManager(req, boardId);
      const { userId, role } = req.body as { userId: number; role?: BoardMemberRole };
      res.status(201).json({ success: true, data: await boardService.addMember(boardId, req.tenantId, userId, role) });
    } catch (err) {
      next(err);
    }
  },
  async updateMember(req: Request, res: Response, next: NextFunction) {
    try {
      const boardId = Number(req.params.id);
      await requireBoardManager(req, boardId);
      const member = await boardService.updateMemberRole(
        boardId, req.tenantId, Number(req.params.userId), (req.body as { role: BoardMemberRole }).role,
      );
      if (!member) throw new AppError(404, 'Membre introuvable');
      res.json({ success: true, data: member });
    } catch (err) {
      next(err);
    }
  },
  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const boardId = Number(req.params.id);
      await requireBoardManager(req, boardId);
      const ok = await boardService.removeMember(boardId, req.tenantId, Number(req.params.userId));
      if (!ok) throw new AppError(404, 'Membre introuvable');
      res.json({ success: true, message: 'Membre retiré' });
    } catch (err) {
      next(err);
    }
  },

  // ── Card dependencies (links) ────────────────────────────────────────────────
  async addCardLink(req: Request, res: Response, next: NextFunction) {
    try {
      const source = await cardService.getById(Number(req.params.id), req.tenantId);
      if (!source) throw new AppError(404, 'Carte introuvable');
      await requireBoardWrite(req, source.boardId);
      const { targetCardId, type } = req.body as { targetCardId: number; type: CardLinkType };
      const link = await cardService.addLink(source.boardId, req.tenantId, source.id, targetCardId, type);
      res.status(201).json({ success: true, data: link });
    } catch (err) {
      next(err);
    }
  },
  async removeCardLink(req: Request, res: Response, next: NextFunction) {
    try {
      const link = await cardService.getLink(Number(req.params.linkId), req.tenantId);
      if (!link) throw new AppError(404, 'Lien introuvable');
      await requireBoardWrite(req, link.boardId);
      await cardService.removeLink(link.id, req.tenantId);
      res.json({ success: true, message: 'Lien supprimé' });
    } catch (err) {
      next(err);
    }
  },

  // ── Card comments + activity ─────────────────────────────────────────────────
  async listComments(req: Request, res: Response, next: NextFunction) {
    try {
      const card = await cardService.getById(Number(req.params.id), req.tenantId);
      if (!card) throw new AppError(404, 'Carte introuvable');
      await requireBoard(req, card.boardId);
      res.json({ success: true, data: await commentService.getComments(card.id, req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async addComment(req: Request, res: Response, next: NextFunction) {
    try {
      const card = await cardService.getById(Number(req.params.id), req.tenantId);
      if (!card) throw new AppError(404, 'Carte introuvable');
      await requireBoardWrite(req, card.boardId);
      const { body, mentions } = req.body as { body: string; mentions?: number[] };
      const comment = await commentService.addComment(
        card.id, req.tenantId, req.session.userId!, body, mentions ?? [],
      );
      res.status(201).json({ success: true, data: comment });
    } catch (err) {
      next(err);
    }
  },
  async removeComment(req: Request, res: Response, next: NextFunction) {
    try {
      const comment = await commentService.getCommentById(Number(req.params.commentId), req.tenantId);
      if (!comment) throw new AppError(404, 'Commentaire introuvable');
      const card = await cardService.getById(comment.cardId, req.tenantId);
      if (!card) throw new AppError(404, 'Carte introuvable');
      await requireBoard(req, card.boardId);
      const isManager = await boardService.isBoardManager(card.boardId, req.tenantId, req.session.userId!);
      await commentService.deleteComment(comment.id, req.tenantId, req.session.userId!, isManager);
      res.json({ success: true, message: 'Commentaire supprimé' });
    } catch (err) {
      next(err);
    }
  },
  async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const card = await cardService.getById(Number(req.params.id), req.tenantId);
      if (!card) throw new AppError(404, 'Carte introuvable');
      await requireBoard(req, card.boardId);
      res.json({ success: true, data: await activityService.getActivity(card.id, req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
};
