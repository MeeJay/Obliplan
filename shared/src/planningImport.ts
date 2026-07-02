// ============================================================================
// Planning CSV import - parse a spreadsheet-style weekly planning (";"-delimited,
// repeating week blocks: day-header row → hour-slot row → employee bands) into
// Obliplan shifts. A 2-step flow: PREVIEW (detect + auto-map) → APPLY (create
// drafts). No blind writes: everything is mapped/confirmed by the user first.
// ============================================================================

/** What a CSV activity label becomes on import. */
export type ImportLabelAction =
  | 'hourtype' // a worked shift (type 'travail') with an hour-type (existing or created)
  | 'ignore' // dropped (e.g. "Off", noise)
  | 'pause' // lunch/break - creates a non-worked 'pause' shift (has hours, excluded from réalisé/caps)
  | 'repos'
  | 'conge'
  | 'absence'
  | 'ecole';

export interface ImportLabelMapping {
  action: ImportLabelAction;
  /** For action 'hourtype': an existing hour-type id, or null to CREATE one from the label. */
  hourTypeId: number | null;
  /**
   * Free-text project name (action 'hourtype' only). When set (non-empty), the imported
   * worked shift is linked to a board of that name - reused if one already exists in the
   * tenant (case-insensitive), otherwise created on the fly. Empty/undefined ⇒ no board.
   */
  projectName?: string | null;
  /**
   * Optional client for a board CREATED on the fly from `projectName` (only meaningful when
   * projectName is set). Passed to board create; dedupe of boards stays by normalized name,
   * so this only takes effect when a new board is actually materialized. null/undefined ⇒ none.
   */
  clientId?: number | null;
}

/** A CSV activity label + how often it appears + the suggested mapping. */
export interface ImportLabel {
  label: string;
  count: number;
  suggestion: ImportLabelMapping;
}

/** A CSV employee name + the auto-matched Obliplan user (null = unmatched → user picks). */
export interface ImportEmployee {
  csvName: string;
  suggestedUserId: number | null;
  count: number;
}

/** A parsed, collapsed shift row (date carries its own month; year applied at apply-time). */
export interface ImportParsedShift {
  employeeName: string;
  dd: string;
  mm: string;
  start: string; // 'HH:mm'
  end: string; // 'HH:mm'
  label: string;
}

export interface ImportPreview {
  weekLabels: string[];
  employees: ImportEmployee[];
  labels: ImportLabel[];
  totalShifts: number;
  /** A few collapsed shifts (first week) so the user can eyeball correctness. */
  sample: { employeeName: string; date: string; shifts: { start: string; end: string; label: string }[] }[];
  warnings: string[];
}

/**
 * How imported shifts combine with what already exists on a touched (employee, day):
 *  - 'replace' (default): wipe the existing shifts on every touched day, put the import in their place.
 *  - 'merge': keep existing shifts but trim/split any that overlap an imported slot (import wins the overlap).
 *  - 'add': cumulate - insert everything, remove/trim nothing (only exact duplicates are still skipped).
 */
export type ImportMergeMode = 'merge' | 'replace' | 'add';

export interface ImportApplyRequest {
  csvText: string;
  /** JJ/MM in the file carry no year - the user supplies it. */
  year: number;
  /** csvName → Obliplan userId (or null to skip that employee). */
  employeeMap: Record<string, number | null>;
  /** label → mapping (hourTypeId may be a real id; action 'hourtype' + null ⇒ create). */
  labelMap: Record<string, ImportLabelMapping>;
  /** Draft by default so nothing is published without review. */
  statut?: 'brouillon' | 'valide';
  /** Conflict strategy vs the existing planning. Defaults to 'replace'. */
  mode?: ImportMergeMode;
}

export interface ImportApplyResult {
  createdShifts: number;
  createdHourTypes: number;
  /** Projects (boards) created on the fly for per-label `projectName` mappings. */
  createdBoards: number;
  skipped: number;
  /** Existing shifts removed: whole days wiped ('replace') or fully overlapped ('merge'). */
  deletedShifts: number;
  /** Existing shifts clipped/split to free room for an overlapping import ('merge'). */
  trimmedShifts: number;
  perEmployee: { name: string; created: number; mapped: boolean }[];
  warnings: string[];
}
