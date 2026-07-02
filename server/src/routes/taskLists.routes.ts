import { Router } from 'express';
import { taskListController } from '../controllers/taskList.controller';
import { validate } from '../middleware/validate';
import {
  createTaskListSchema,
  updateTaskListSchema,
  reorderListsSchema,
  createListGroupSchema,
  updateListGroupSchema,
  shareListSchema,
} from '../validators/tasks.schema';

// "Mes tâches" - custom lists, collapsible groups and sharing. Every authenticated
// tenant user manages their own lists and the lists shared with them.
const router = Router();

// Groups (literal paths first so they don't collide with "/:id")
router.get('/groups', taskListController.listGroups);
router.post('/groups', validate(createListGroupSchema), taskListController.createGroup);
router.put('/groups/:id', validate(updateListGroupSchema), taskListController.updateGroup);
router.delete('/groups/:id', taskListController.deleteGroup);

// Tenant member pool (share picker + assignee dropdown)
router.get('/members-pool', taskListController.membersPool);

// Lists
router.get('/', taskListController.list);
router.post('/', validate(createTaskListSchema), taskListController.create);
router.put('/reorder', validate(reorderListsSchema), taskListController.reorder);

// Sharing (nested under a list)
router.get('/:id/shares', taskListController.listShares);
router.post('/:id/shares', validate(shareListSchema), taskListController.createShare);
router.delete('/:id/shares/:userId', taskListController.deleteShare);

router.put('/:id', validate(updateTaskListSchema), taskListController.update);
router.delete('/:id', taskListController.delete);

export default router;
