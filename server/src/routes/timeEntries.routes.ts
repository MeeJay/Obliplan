import { Router } from 'express';
import { timeEntryController } from '../controllers/timeEntry.controller';
import { validate } from '../middleware/validate';
import { startTimerSchema, createTimeEntrySchema, updateTimeEntrySchema } from '../validators/timeEntry.schema';

const router = Router();

router.get('/running', timeEntryController.running);
router.get('/board/:boardId/totals', timeEntryController.totals);
router.get('/board/:boardId', timeEntryController.listForBoard);
router.get('/', timeEntryController.list);

router.post('/start', validate(startTimerSchema), timeEntryController.start);
router.post('/:id/stop', timeEntryController.stop);
router.post('/', validate(createTimeEntrySchema), timeEntryController.create);
router.put('/:id', validate(updateTimeEntrySchema), timeEntryController.update);
router.delete('/:id', timeEntryController.delete);

export default router;
