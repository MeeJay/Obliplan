import { Router } from 'express';
import { taskController } from '../controllers/task.controller';
import { validate } from '../middleware/validate';
import { createTaskSchema, updateTaskSchema, createTaskStepSchema, updateTaskStepSchema } from '../validators/tasks.schema';

// Tasks + steps. Listing accepts ?listId= (a custom list) or ?smart= (a computed
// view: my_day | important | planned | assigned | tasks).
const router = Router();

router.get('/counts', taskController.counts);
router.get('/', taskController.list);
router.post('/', validate(createTaskSchema), taskController.create);

// Steps (nested create/read, flat update/delete)
router.get('/:id/steps', taskController.listSteps);
router.post('/:id/steps', validate(createTaskStepSchema), taskController.createStep);
router.put('/steps/:id', validate(updateTaskStepSchema), taskController.updateStep);
router.delete('/steps/:id', taskController.deleteStep);

router.put('/:id', validate(updateTaskSchema), taskController.update);
router.delete('/:id', taskController.delete);

export default router;
