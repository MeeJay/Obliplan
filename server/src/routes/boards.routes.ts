import { Router } from 'express';
import { kanbanController, requireBoardCreate } from '../controllers/kanban.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createBoardSchema,
  updateBoardSchema,
  createColumnSchema,
  updateColumnSchema,
  createSprintSchema,
  updateSprintSchema,
  createCardSchema,
  updateCardSchema,
  addBoardMemberSchema,
  updateBoardMemberSchema,
  addCardLinkSchema,
  addCommentSchema,
} from '../validators/schemas';

// Personal Kanban/Scrum boards. Every authenticated user manages their own.
const router = Router();

// Boards
router.get('/', kanbanController.listBoards);
// Every tenant board (id+name) for the team project-scope picker (admin/users:manage).
router.get('/all', requireTenantCapability('users:manage'), kanbanController.listAll);
router.post('/', requireBoardCreate, validate(createBoardSchema), kanbanController.createBoard);
router.get('/:id', kanbanController.getBoard);
router.put('/:id', validate(updateBoardSchema), kanbanController.updateBoard);
router.delete('/:id', kanbanController.deleteBoard);

// Columns (nested create, flat update/delete)
router.post('/:id/columns', validate(createColumnSchema), kanbanController.createColumn);
router.put('/columns/:id', validate(updateColumnSchema), kanbanController.updateColumn);
router.delete('/columns/:id', kanbanController.deleteColumn);

// Sprints
router.post('/:id/sprints', validate(createSprintSchema), kanbanController.createSprint);
router.put('/sprints/:id', validate(updateSprintSchema), kanbanController.updateSprint);
router.delete('/sprints/:id', kanbanController.deleteSprint);

// Members (board team). Mutations gated to board owner/admin or tenant admin in the controller.
router.get('/:id/members', kanbanController.listMembers);
router.post('/:id/members', validate(addBoardMemberSchema), kanbanController.addMember);
router.put('/:id/members/:userId', validate(updateBoardMemberSchema), kanbanController.updateMember);
router.delete('/:id/members/:userId', kanbanController.removeMember);

// Cards
router.post('/:id/cards', validate(createCardSchema), kanbanController.createCard);
router.put('/cards/:id', validate(updateCardSchema), kanbanController.updateCard);
router.delete('/cards/:id', kanbanController.deleteCard);

// Card dependencies (links). Require board access (checked in the controller).
router.post('/cards/:id/links', validate(addCardLinkSchema), kanbanController.addCardLink);
router.delete('/cards/links/:linkId', kanbanController.removeCardLink);

// Card comments + activity feed. Access checked per-handler in the controller.
router.get('/cards/:id/comments', kanbanController.listComments);
router.post('/cards/:id/comments', validate(addCommentSchema), kanbanController.addComment);
router.delete('/cards/comments/:commentId', kanbanController.removeComment);
router.get('/cards/:id/activity', kanbanController.getActivity);

export default router;
