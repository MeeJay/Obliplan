import { Router } from 'express';
import { todoController } from '../controllers/todo.controller';
import { validate } from '../middleware/validate';
import { createTodoSchema, updateTodoSchema } from '../validators/schemas';

const router = Router();

router.get('/', todoController.list);
router.post('/', validate(createTodoSchema), todoController.create);
router.put('/:id', validate(updateTodoSchema), todoController.update);
router.delete('/:id', todoController.delete);

export default router;
