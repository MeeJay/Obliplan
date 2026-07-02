import type { Request, Response, NextFunction } from 'express';
import type { ImportLabelMapping } from '@obliplan/shared';
import { planningImportService } from '../services/planningImport.service';
import { AppError } from '../middleware/errorHandler';

export const planningImportController = {
  /** POST /planning/import/preview - parse the CSV text, return detection + auto-mapping. */
  async preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const csvText = typeof (req.body as { csvText?: unknown })?.csvText === 'string' ? (req.body.csvText as string) : '';
      if (!csvText.trim()) throw new AppError(400, 'Fichier CSV vide ou illisible.');
      res.json({ success: true, data: await planningImportService.preview(req.tenantId, csvText) });
    } catch (err) {
      next(err);
    }
  },

  /** POST /planning/import/apply - create the shifts (drafts by default) from the mapping. */
  async apply(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const b = (req.body ?? {}) as {
        csvText?: unknown;
        year?: unknown;
        employeeMap?: unknown;
        labelMap?: unknown;
        statut?: unknown;
        mode?: unknown;
      };
      const csvText = typeof b.csvText === 'string' ? b.csvText : '';
      const year = Number(b.year);
      if (!csvText.trim()) throw new AppError(400, 'Fichier CSV vide ou illisible.');
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError(400, 'Année invalide.');
      const employeeMap = b.employeeMap && typeof b.employeeMap === 'object' ? (b.employeeMap as Record<string, number | null>) : {};
      const labelMap =
        b.labelMap && typeof b.labelMap === 'object' ? (b.labelMap as Record<string, ImportLabelMapping>) : {};
      const statut = b.statut === 'valide' ? 'valide' : 'brouillon';
      const mode = b.mode === 'merge' || b.mode === 'add' ? b.mode : 'replace';
      res.json({
        success: true,
        data: await planningImportService.apply(
          req.tenantId,
          { userId: req.session.userId!, role: req.session.role! },
          { csvText, year, employeeMap, labelMap, statut, mode },
        ),
      });
    } catch (err) {
      next(err);
    }
  },
};
