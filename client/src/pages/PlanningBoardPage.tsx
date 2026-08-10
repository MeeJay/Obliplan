import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Send, Copy, Clipboard, MousePointerSquareDashed, X, Upload, Trash2, RotateCcw, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Shift, ShiftTemplate } from '@obliplan/shared';
import { planningApi, contratApi, hourTypeApi, boardApi, shiftTemplateApi, shiftApi, type UserWeekDTO } from '../api';
import { useAuthStore } from '../store/authStore';
import { mondayOfIso, todayIso, addDaysIso, dayLabel } from '../utils/format';
import { WeekNav } from '../components/planning/WeekNav';
import { RotaGrid, type RotaDrag, type ContratInfo } from '../components/planning/RotaGrid';
import { HourGrid } from '../components/planning/HourGrid';
import { SHIFT_META, SHIFT_TYPES, type HourTypeLookup, type BoardLookup } from '../components/planning/shiftMeta';
import { ShiftEditor } from '../components/planning/ShiftEditor';
import { PlanningTabs } from '../components/planning/PlanningTabs';
import { ShiftQuickEditor } from '../components/planning/ShiftQuickEditor';
import { Button } from '../components/common/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Spinner } from '../components/common/Spinner';
import { cn } from '../utils/cn';
import { PlanningTeamFilter, rowVisible, effectiveTeams } from '../components/planning/PlanningTeamFilter';
import { buildTeamMeta, compareByTeam, teamLabelFor } from '../components/planning/teamOrder';

interface EditorState {
  userId: number;
  date: string;
  shift?: Shift | null;
}

type ViewMode = 'grille' | 'semaine';
type GridRange = 'semaine' | 'mois';

/** One employee-week captured before a mutation; replayed verbatim by undo. */
interface UndoSnapshot {
  userId: number;
  monday: string;
  shifts: Array<{
    date: string;
    heureDebut: string | null;
    heureFin: string | null;
    pauseMin: number;
    type: string;
    statut: string;
    note: string | null;
    hourTypeId: number | null;
    boardId: number | null;
  }>;
}
interface UndoEntry {
  label: string;
  snapshots: UndoSnapshot[];
}
/** How many mutations can be walked back. */
const UNDO_DEPTH = 20;

/** Paste behaviour: stack onto what's there, or wipe the target days first. */
type PasteMode = 'append' | 'replace';

const HOUR_START_KEY = 'obliplan.planning.hourStart';
const HOUR_END_KEY = 'obliplan.planning.hourEnd';
const VISIBLE_TEAMS_KEY = 'obliplan.planning.visibleTeams';
const PARALLEL_KEY = 'obliplan.planning.parallelMode';

/** Seed the per-team visibility from localStorage (empty set = afficher toutes les équipes). */
function readVisibleTeams(): Set<number> {
  try {
    const raw = localStorage.getItem(VISIBLE_TEAMS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : []);
  } catch {
    return new Set();
  }
}

function readHour(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === '') return fallback; // Number(null) === 0 would break the 8–20 default
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 24 ? v : fallback;
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
function toMin(hm: string | null): number {
  if (!hm) return 0;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
function toTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function PlanningBoardPage() {
  const navigate = useNavigate();
  const [monday, setMonday] = useState(() => mondayOfIso(todayIso()));
  const [rows, setRows] = useState<UserWeekDTO[]>([]);
  const [contrats, setContrats] = useState<Record<number, ContratInfo>>({});
  const [hourTypes, setHourTypes] = useState<HourTypeLookup>({});
  const [boards, setBoards] = useState<BoardLookup>({});
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('grille');
  const [gridRange, setGridRange] = useState<GridRange>('semaine');
  // In "mois" grille mode we stack 4 consecutive weeks (each = the full week grid, all collaborators).
  const [monthWeeks, setMonthWeeks] = useState<{ monday: string; rows: UserWeekDTO[] }[]>([]);
  const [hourStart, setHourStart] = useState(() => readHour(HOUR_START_KEY, 8));
  const [hourEnd, setHourEnd] = useState(() => readHour(HOUR_END_KEY, 20));
  const [quickShift, setQuickShift] = useState<Shift | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [drag, setDrag] = useState<RotaDrag | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);
  // Per-team visibility filter (client-side OR-visibility over the single row list). Empty = toutes les équipes.
  const [visibleTeams, setVisibleTeams] = useState<Set<number>>(readVisibleTeams);
  const [teamMeta, setTeamMeta] = useState(() => buildTeamMeta([]));
  // Copy/paste a whole day (or a hand-picked selection) of shifts.
  const [clipboard, setClipboard] = useState<{ shiftIds: number[]; label: string; spanDays: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [confirmDeleteSel, setConfirmDeleteSel] = useState(false);
  const [deletingSel, setDeletingSel] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [undoing, setUndoing] = useState(false);
  const [pasteMode, setPasteMode] = useState<PasteMode>('append');
  // Parallel mode: new/moved blocks sit ON TOP of what's there instead of carving it
  // (two things happening at once), persisted so the choice survives a reload.
  const [parallelMode, setParallelMode] = useState(() => localStorage.getItem(PARALLEL_KEY) === '1');
  const canWrite = useAuthStore((s) => s.can('planning:write'));

  // "mois" grille = 4 consecutive weeks fetched together; otherwise a single week.
  // Kept under the name fetchRows so every existing refresh call site works unchanged.
  const fetchRows = useCallback(
    () =>
      (view === 'grille' && gridRange === 'mois'
        ? Promise.all([0, 1, 2, 3].map((i) => planningApi.team(addDaysIso(monday, i * 7)))).then((res) => {
            setMonthWeeks([0, 1, 2, 3].map((i) => ({ monday: addDaysIso(monday, i * 7), rows: res[i] })));
            setRows(res[0]);
          })
        : planningApi.team(monday).then((r) => {
            setRows(r);
            setMonthWeeks([]);
          })
      ).catch(() => toast.error('Chargement du planning impossible')), // keep current rows on a transient refresh error
    [monday, view, gridRange],
  );

  const load = useCallback(() => {
    setLoading(true);
    fetchRows().finally(() => setLoading(false));
  }, [fetchRows]);

  useEffect(load, [load]);

  // Reset the selection when the visible window changes (the picked shifts are no longer shown).
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [monday, gridRange, view]);

  // Ctrl+Z / Cmd+Z anywhere on the board (ignored while typing in a field).
  useEffect(() => {
    if (!canWrite) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      // Never steal the shortcut from a field being typed in (the browser's own undo wins there).
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      // Nor while a modal/editor is open, where Ctrl+Z belongs to that context.
      if (el?.closest('[role="dialog"]')) return;
      e.preventDefault();
      void (isUndo ? undoLastRef.current?.() : redoLastRef.current?.());
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canWrite]);

  useEffect(() => {
    contratApi
      .list()
      .then((list) => setContrats(Object.fromEntries(list.map((c) => [c.id, { color: c.color, libelle: c.libelle }]))))
      .catch(() => setContrats({}));
    hourTypeApi
      .list()
      .then((list) => setHourTypes(Object.fromEntries(list.map((h) => [h.id, { libelle: h.libelle, color: h.color }]))))
      .catch(() => setHourTypes({}));
    boardApi
      .list()
      .then((list) => setBoards(Object.fromEntries(list.map((b) => [b.id, { name: b.name }]))))
      .catch(() => setBoards({}));
    planningApi
      .teams()
      .then((teams) => setTeamMeta(buildTeamMeta(teams)))
      .catch(() => setTeamMeta(buildTeamMeta([])));
    if (canWrite) shiftTemplateApi.list().then(setTemplates).catch(() => setTemplates([]));
  }, [canWrite]);

  // Persist the hour-range; self-heal an inconsistent end (e.g. stale localStorage).
  useEffect(() => localStorage.setItem(HOUR_START_KEY, String(hourStart)), [hourStart]);
  useEffect(() => localStorage.setItem(HOUR_END_KEY, String(hourEnd)), [hourEnd]);
  useEffect(() => localStorage.setItem(VISIBLE_TEAMS_KEY, JSON.stringify([...visibleTeams])), [visibleTeams]);
  useEffect(() => {
    if (hourEnd <= hourStart) setHourEnd(Math.min(24, hourStart + 1));
  }, [hourStart, hourEnd]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
  const monthMode = view === 'grille' && gridRange === 'mois';
  // Weeks currently on screen: 4 stacked in "mois", else just the current week.
  const displayWeeks = monthMode && monthWeeks.length ? monthWeeks : [{ monday, rows }];
  // Team planning is team-scoped: employees attached to no administrative team are excluded.
  const hasTeam = (r: UserWeekDTO) => (r.teamIds ?? []).length > 0;
  // Present teams / filter computed over EVERY displayed week so the chips cover the whole view.
  const allShownRows = displayWeeks.flatMap((w) => w.rows).filter(hasTeam);
  const presentTeamIds = [...new Set(allShownRows.flatMap((r) => r.teamIds ?? []))];
  // Ignore any persisted team id not present here so a cross-page selection can't blank the grid.
  const effTeams = effectiveTeams(visibleTeams, presentTeamIds, false);
  // One row per employee: team-scoped, OR-visibility filtered, sorted by team (weight, then name).
  const visibleOf = (list: UserWeekDTO[]) =>
    list
      .filter((r) => hasTeam(r) && rowVisible(r.teamIds ?? [], effTeams))
      .sort((a, b) =>
        compareByTeam(
          a.teamIds ?? [],
          a.user.displayName || a.user.username,
          b.teamIds ?? [],
          b.user.displayName || b.user.username,
          teamMeta,
        ),
      );
  const visibleRows = visibleOf(rows);
  // Small left-hand team label per employee (primary team = lowest weight).
  const teamLabels: Record<number, string> = {};
  for (const r of allShownRows) {
    const label = teamLabelFor(r.teamIds ?? [], teamMeta);
    if (label) teamLabels[r.user.id] = label;
  }
  // Drafts across every displayed week so "Publier (N)" matches what you see.
  const draftCount = displayWeeks.reduce(
    (n, w) => n + visibleOf(w.rows).reduce((m, r) => m + r.shifts.filter((s) => s.statut === 'brouillon').length, 0),
    0,
  );

  // ── Undo (Ctrl+Z) ───────────────────────────────────────────────────────────
  // Each mutation first snapshots the affected employees' displayed week(s). Undo replays
  // that snapshot through /planning/restore-week, so it survives id changes (a restore
  // recreates rows) and covers create / resize / move / paste / delete uniformly.
  const snapshotOf = (r: UserWeekDTO, weekMonday: string): UndoSnapshot => ({
    userId: r.user.id,
    monday: weekMonday,
    shifts: r.shifts.map((s) => ({
      date: s.date,
      heureDebut: s.heureDebut,
      heureFin: s.heureFin,
      pauseMin: s.pauseMin,
      type: s.type,
      statut: s.statut,
      note: s.note,
      hourTypeId: s.hourTypeId,
      boardId: s.boardId,
    })),
  });

  function snapshotFor(userIds: number[]): UndoSnapshot[] {
    const wanted = new Set(userIds);
    const out: UndoSnapshot[] = [];
    for (const w of displayWeeks) {
      for (const r of w.rows) {
        if (wanted.has(r.user.id)) out.push(snapshotOf(r, w.monday));
      }
    }
    return out;
  }

  /** Re-capture exactly the (employee, week) pairs of an entry, to build its mirror step. */
  function recapture(entry: UndoEntry): UndoSnapshot[] {
    const out: UndoSnapshot[] = [];
    for (const s of entry.snapshots) {
      const week = displayWeeks.find((w) => w.monday === s.monday);
      const row = week?.rows.find((r) => r.user.id === s.userId);
      if (row && week) out.push(snapshotOf(row, week.monday));
    }
    return out;
  }

  function pushUndo(label: string, userIds: number[]) {
    const snap = snapshotFor(userIds);
    if (snap.length === 0) return;
    setUndoStack((prev) => [...prev.slice(-(UNDO_DEPTH - 1)), { label, snapshots: snap }]);
    setRedoStack([]); // a fresh mutation invalidates the redo branch (standard behaviour)
  }

  /** Apply one entry's snapshots, pushing the mirror state onto the opposite stack. */
  async function applyHistory(entry: UndoEntry, opposite: 'undo' | 'redo'): Promise<void> {
    const mirror = recapture(entry);
    for (const s of entry.snapshots) {
      await planningApi.restoreWeek(s.userId, s.monday, s.shifts);
    }
    const push = opposite === 'redo' ? setRedoStack : setUndoStack;
    if (mirror.length) push((prev) => [...prev.slice(-(UNDO_DEPTH - 1)), { label: entry.label, snapshots: mirror }]);
    setSelectedIds(new Set());
    await fetchRows();
  }

  async function undoLast() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry || undoing) return;
    setUndoing(true);
    try {
      await applyHistory(entry, 'redo');
      setUndoStack((prev) => prev.slice(0, -1));
      toast.success(`Annulé : ${entry.label}`);
    } catch {
      toast.error('Annulation impossible');
    } finally {
      setUndoing(false);
    }
  }

  async function redoLast() {
    const entry = redoStack[redoStack.length - 1];
    if (!entry || undoing) return;
    setUndoing(true);
    try {
      await applyHistory(entry, 'undo');
      setRedoStack((prev) => prev.slice(0, -1));
      toast.success(`Rétabli : ${entry.label}`);
    } catch {
      toast.error('Rétablissement impossible');
    } finally {
      setUndoing(false);
    }
  }
  // Keep the keyboard handlers pointing at the freshest closures (stacks + current week).
  const undoLastRef = useRef<(() => Promise<void>) | null>(null);
  const redoLastRef = useRef<(() => Promise<void>) | null>(null);
  undoLastRef.current = undoLast;
  redoLastRef.current = redoLast;

  // ── Hourly-grid (Grille horaire) callbacks → existing endpoints ──────────────
  async function handleDraw(userId: number, date: string, heureDebut: string, heureFin: string) {
    try {
      pushUndo('création du créneau', [userId]);
      const created = await shiftApi.create({
        userId,
        date,
        heureDebut,
        heureFin,
        type: 'travail',
        statut: 'brouillon',
        carve: !parallelMode,
      });
      await fetchRows();
      setQuickShift(created); // open the quick editor so the manager tags it immediately
    } catch {
      toast.error('Création impossible');
    }
  }

  // Same slot drawn across several employees at once → one draft each (no quick editor).
  async function handleDrawMany(userIds: number[], date: string, heureDebut: string, heureFin: string) {
    try {
      pushUndo(`${userIds.length} créneaux créés`, userIds);
      await Promise.all(
        userIds.map((userId) =>
          shiftApi.create({
            userId,
            date,
            heureDebut,
            heureFin,
            type: 'travail',
            statut: 'brouillon',
            carve: !parallelMode,
          }),
        ),
      );
      toast.success(`${userIds.length} créneaux créés`);
      await fetchRows();
    } catch {
      toast.error('Création impossible');
    }
  }

  async function handleResize(shift: Shift, heureDebut: string, heureFin: string) {
    try {
      pushUndo('redimensionnement', [shift.userId]);
      await shiftApi.update(shift.id, { heureDebut, heureFin, carve: !parallelMode });
      await fetchRows();
    } catch {
      toast.error('Redimensionnement impossible');
    }
  }

  async function handleMove(shift: Shift, userId: number, date: string, heureDebut: string) {
    const dur = shift.heureDebut && shift.heureFin ? toMin(shift.heureFin) - toMin(shift.heureDebut) : 60;
    const heureFin = toTime(toMin(heureDebut) + Math.max(30, dur)); // keep original duration
    try {
      pushUndo('déplacement', [shift.userId, userId]);
      await shiftApi.update(shift.id, { userId, date, heureDebut, heureFin, carve: !parallelMode });
      await fetchRows();
    } catch {
      toast.error('Déplacement impossible');
    }
  }

  // ── Week-overview (Semaine / RotaGrid) drag-drop: move shift or drop a template ─
  async function handleCellDrop(userId: number, date: string) {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === 'shift') {
      if (d.userId === userId && d.date === date) return; // dropped on origin - no-op
      try {
        pushUndo('déplacement', [d.userId, userId]);
        await shiftApi.update(d.shiftId, { userId, date });
        fetchRows();
      } catch {
        toast.error('Déplacement impossible');
      }
      return;
    }
    const t = templates.find((tpl) => tpl.id === d.templateId);
    if (!t) return;
    try {
      await shiftApi.create({
        userId,
        date,
        type: t.type,
        heureDebut: t.heureDebut,
        heureFin: t.heureFin,
        pauseMin: t.pauseMin,
        hourTypeId: t.hourTypeId,
        boardId: t.boardId,
        statut: 'brouillon',
      });
      fetchRows();
    } catch {
      toast.error('Création impossible');
    }
  }

  async function publish() {
    // Publish every displayed week (1 in "semaine", 4 in "mois"), scoped to the visible teams.
    const targets = displayWeeks
      .map((w) => ({ monday: w.monday, userIds: visibleOf(w.rows).map((r) => r.user.id) }))
      .filter((t) => t.userIds.length > 0);
    if (targets.length === 0 || draftCount === 0) return;
    setPublishing(true);
    try {
      let published = 0;
      let notified = 0;
      for (const t of targets) {
        const res = await planningApi.publish(t.monday, t.userIds);
        published += res.published;
        notified += res.notified;
      }
      toast.success(`${published} publié(s), ${notified} notifié(s)`);
      fetchRows();
    } catch {
      toast.error('Publication impossible');
    } finally {
      setPublishing(false);
    }
  }

  async function copyPrevWeek() {
    const userIds = visibleRows.map((r) => r.user.id);
    if (userIds.length === 0) return;
    setCopying(true);
    try {
      const { count } = await planningApi.copyWeek(addDaysIso(monday, -7), monday, userIds);
      toast.success(`${count} créneau(x) dupliqué(s)`);
      fetchRows();
    } catch {
      toast.error('Duplication impossible');
    } finally {
      setCopying(false);
    }
  }

  // ── Copy / paste a day (or a selection) of shifts via planningApi.cloneShifts ──
  function copyDay(userId: number, date: string) {
    // In "mois" a user appears once per week; take the day's shifts from whichever week holds `date`.
    const who = allShownRows.find((r) => r.user.id === userId)?.user;
    const dayShifts = allShownRows
      .filter((r) => r.user.id === userId)
      .flatMap((r) => r.shifts)
      .filter((s) => s.date === date);
    if (!who || dayShifts.length === 0) return;
    const name = who.displayName || who.username;
    setClipboard({
      shiftIds: dayShifts.map((s) => s.id),
      label: `${dayLabel(date)} - ${name} (${dayShifts.length})`,
      spanDays: 1,
    });
  }

  async function pasteOnto(userId: number, date: string) {
    if (!clipboard) return;
    try {
      pushUndo(pasteMode === 'replace' ? 'collage (remplacement)' : 'collage', [userId]);
      // A copy spanning several days keeps its shape: the server re-spreads each shift from
      // the target day instead of collapsing the whole block onto it.
      const { count } = await planningApi.cloneShifts(clipboard.shiftIds, userId, date, {
        spread: clipboard.spanDays > 1,
        replace: pasteMode === 'replace',
      });
      if (count === 0) toast('Aucun créneau à coller (source supprimée ?)');
      else toast.success(`${count} créneau(x) collé(s)`);
      fetchRows();
    } catch {
      toast.error('Collage impossible');
    }
  }

  function toggleSelectShift(shiftId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  }

  function toggleSelectMode() {
    setSelectMode((on) => {
      if (on) setSelectedIds(new Set()); // leaving selection mode clears the picks
      return !on;
    });
  }

  function copySelection() {
    if (selectedIds.size === 0) return;
    // Count the distinct days covered: >1 means the paste must re-spread instead of collapsing.
    const days = new Set(
      allShownRows.flatMap((r) => r.shifts.filter((s) => selectedIds.has(s.id)).map((s) => s.date)),
    );
    setClipboard({
      shiftIds: [...selectedIds],
      label: `Sélection (${selectedIds.size})`,
      spanDays: Math.max(1, days.size),
    });
  }

  // Rubber-band result from the grid: replace (or extend, when additive) the picks.
  function selectShiftIds(ids: number[], additive: boolean) {
    setSelectedIds((prev) => {
      const next = additive ? new Set(prev) : new Set<number>();
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function deleteSelection() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setDeletingSel(true);
    try {
      const owners = allShownRows.filter((r) => r.shifts.some((s) => selectedIds.has(s.id))).map((r) => r.user.id);
      pushUndo(`${ids.length} créneaux supprimés`, owners);
      await Promise.all(ids.map((id) => shiftApi.remove(id)));
      toast.success(`${ids.length} créneau(x) supprimé(s)`);
      setSelectedIds(new Set());
      setConfirmDeleteSel(false);
      await fetchRows();
    } catch {
      toast.error('Échec de la suppression');
    } finally {
      setDeletingSel(false);
    }
  }

  // One HourGrid for a given week (reused once in "semaine", 4x stacked in "mois").
  const renderHourGrid = (gDays: string[], gRows: UserWeekDTO[], gHolidays?: string[]) => (
    <HourGrid
      days={gDays}
      rows={gRows}
      teamLabels={teamLabels}
      boards={boards}
      holidays={gHolidays}
      hourStart={hourStart}
      hourEnd={Math.max(hourStart + 1, hourEnd)}
      hourTypes={hourTypes}
      contrats={contrats}
      editable={canWrite}
      onDraw={handleDraw}
      onDrawMany={canWrite ? handleDrawMany : undefined}
      onResize={handleResize}
      onMove={handleMove}
      onShiftClick={(s) => setQuickShift(s)}
      onCopyDay={canWrite ? copyDay : undefined}
      onPasteDay={canWrite ? pasteOnto : undefined}
      clipboardActive={canWrite && clipboard !== null}
      selectMode={canWrite && selectMode}
      selectedIds={selectedIds}
      onToggleSelectShift={canWrite ? toggleSelectShift : undefined}
      onMarqueeSelect={canWrite ? selectShiftIds : undefined}
    />
  );

  return (
    <div className="space-y-4">
      <PlanningTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text-primary">Tableau planning</h2>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => void undoLast()}
                disabled={undoStack.length === 0 || undoing}
                title={
                  undoStack.length
                    ? `Annuler : ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`
                    : 'Rien à annuler (Ctrl+Z)'
                }
                aria-label="Annuler"
                className={cn(
                  'rounded-md border border-border bg-bg-secondary p-2 text-text-secondary transition-colors',
                  'hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={() => void redoLast()}
                disabled={redoStack.length === 0 || undoing}
                title={
                  redoStack.length
                    ? `Rétablir : ${redoStack[redoStack.length - 1].label} (Ctrl+Maj+Z)`
                    : 'Rien à rétablir (Ctrl+Maj+Z)'
                }
                aria-label="Rétablir"
                className={cn(
                  'rounded-md border border-border bg-bg-secondary p-2 text-text-secondary transition-colors',
                  'hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                <RotateCw size={15} />
              </button>
            </div>
          )}
          {canWrite && (
            <Button variant="secondary" onClick={() => navigate('/import-planning')}>
              <Upload size={15} className="mr-1" /> Importer CSV
            </Button>
          )}
          {canWrite && (
            <Button variant="secondary" onClick={copyPrevWeek} loading={copying}>
              <Copy size={15} className="mr-1" /> Dupliquer la semaine préc.
            </Button>
          )}
          {canWrite && (
            <Button onClick={publish} loading={publishing} disabled={draftCount === 0}>
              <Send size={15} className="mr-1" /> Publier{draftCount > 0 ? ` (${draftCount})` : ''}
            </Button>
          )}
          <WeekNav monday={monday} onChange={setMonday} />
        </div>
      </div>

      {/* View switcher + Grille range controls. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border bg-bg-secondary p-0.5">
          {(['grille', 'semaine'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                view === v ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {v === 'grille' ? 'Grille horaire' : 'Semaine'}
            </button>
          ))}
        </div>

        <PlanningTeamFilter
          presentTeamIds={presentTeamIds}
          hasNoTeam={false}
          value={visibleTeams}
          onChange={setVisibleTeams}
        />

        {canWrite && (
          <label
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
              parallelMode
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary',
            )}
            title={
              parallelMode
                ? 'Les nouveaux créneaux se superposent à ceux déjà présents (deux activités en même temps).'
                : "Par défaut un nouveau créneau découpe celui qu'il recouvre (4h de back + 1h de réu = back / réu / back)."
            }
          >
            <input
              type="checkbox"
              checked={parallelMode}
              onChange={(e) => {
                setParallelMode(e.target.checked);
                localStorage.setItem(PARALLEL_KEY, e.target.checked ? '1' : '0');
              }}
              className="h-3 w-3"
            />
            Créneaux en parallèle
          </label>
        )}

        {view === 'grille' && (
          <>
            <div className="inline-flex rounded-md border border-border bg-bg-secondary p-0.5">
              {(['semaine', 'mois'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setGridRange(r)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    gridRange === r ? 'bg-bg-active text-text-primary' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {r === 'semaine' ? 'Semaine' : 'Mois'}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <span>Heures</span>
              <input
                type="number"
                min={0}
                max={23}
                value={hourStart}
                onChange={(e) => setHourStart(clamp(Number(e.target.value), 0, 23))}
                className="w-14 rounded border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <span>→</span>
              <input
                type="number"
                min={1}
                max={24}
                value={hourEnd}
                onChange={(e) => setHourEnd(clamp(Number(e.target.value), hourStart + 1, 24))}
                className="w-14 rounded border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {canWrite && (
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectMode}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    selectMode
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary',
                  )}
                  title="Sélectionner des créneaux à copier ou supprimer"
                >
                  <MousePointerSquareDashed size={14} /> Sélection
                </button>
                {selectMode && (
                  <>
                    <Button variant="secondary" onClick={copySelection} disabled={selectedIds.size === 0}>
                      <Copy size={14} className="mr-1" /> Copier la sélection ({selectedIds.size})
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setConfirmDeleteSel(true)}
                      disabled={selectedIds.size === 0}
                    >
                      <Trash2 size={14} className="mr-1" /> Supprimer la sélection ({selectedIds.size})
                    </Button>
                    <span className="text-xs text-text-muted">Glissez un rectangle sur la grille ou cliquez un créneau (Maj pour ajouter)</span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Hour-type legend (Grille). */}
      {view === 'grille' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs text-text-muted">Légende :</span>
            {SHIFT_TYPES.map((t) => (
              <span
                key={t}
                className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]', SHIFT_META[t].cls)}
              >
                {SHIFT_META[t].label}
              </span>
            ))}
            {Object.entries(hourTypes).map(([id, ht]) => (
              <span key={id} className="inline-flex items-center gap-1 text-xs text-text-secondary">
                <span className="h-2 w-2 rounded-full" style={{ background: ht.color ?? 'rgb(var(--c-text-muted))' }} />
                {ht.libelle}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Template rail - drag a model onto a cell (Semaine view) to create a draft shift. */}
      {view === 'semaine' && canWrite && templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2">
          <span className="text-xs text-text-muted">Modèles :</span>
          {templates.map((t) => {
            const meta = SHIFT_META[t.type];
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => setDrag({ kind: 'template', templateId: t.id })}
                onDragEnd={() => setDrag(null)}
                title={`${t.name} (${t.heureDebut}–${t.heureFin}) - glisser sur une case`}
                className={cn(
                  'flex cursor-grab items-center gap-1.5 rounded border px-2 py-1 text-xs active:cursor-grabbing',
                  meta.cls,
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color ?? 'currentColor' }} />
                <span className="font-medium">{t.name}</span>
                <span className="font-mono text-[10px] opacity-80">
                  {t.heureDebut}–{t.heureFin}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Clipboard banner - a day (or selection) is ready to paste onto any journée. */}
      {canWrite && clipboard && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
          <Clipboard size={15} className="shrink-0 text-accent" />
          <span className="text-text-secondary">
            <span className="font-medium text-text-primary">{clipboard.label}</span> copié(s) - cliquez « Coller » sur une
            journée.
            {clipboard.spanDays > 1 && (
              <span className="ml-1 text-text-muted">
                Les {clipboard.spanDays} jours copiés seront replacés à partir du jour cible.
              </span>
            )}
          </span>
          <span className="inline-flex items-center overflow-hidden rounded border border-border">
            {(['append', 'replace'] as PasteMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPasteMode(m)}
                title={
                  m === 'append'
                    ? 'Ajoute les créneaux collés à ceux déjà présents'
                    : 'Annule et remplace : efface les créneaux des journées visées avant de coller'
                }
                className={cn(
                  'px-2 py-0.5 text-xs transition-colors',
                  pasteMode === m ? 'bg-accent/15 font-medium text-accent' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {m === 'append' ? 'Ajouter' : 'Remplacer'}
              </button>
            ))}
          </span>
          <button
            type="button"
            onClick={() => setClipboard(null)}
            className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            <X size={13} /> Vider
          </button>
        </div>
      )}

      {loading ? (
        <Spinner className="h-40" />
      ) : rows.length === 0 ? (
        <p className="text-text-secondary">Aucun salarié rattaché.</p>
      ) : view === 'grille' ? (
        monthMode ? (
          <div className="space-y-5">
            {displayWeeks.map((w) => (
              <div key={w.monday} className="space-y-1.5">
                <div className="text-sm font-medium text-text-secondary">
                  {dayLabel(w.monday)} → {dayLabel(addDaysIso(w.monday, 6))}
                </div>
                {renderHourGrid(
                  Array.from({ length: 7 }, (_, i) => addDaysIso(w.monday, i)),
                  visibleOf(w.rows),
                  w.rows[0]?.holidays,
                )}
              </div>
            ))}
          </div>
        ) : (
          renderHourGrid(weekDays, visibleRows, rows[0]?.holidays)
        )
      ) : (
        <RotaGrid
          monday={monday}
          rows={visibleRows}
          teamLabels={teamLabels}
          holidays={rows[0]?.holidays}
          contrats={contrats}
          hourTypes={hourTypes}
          boards={boards}
          editable={canWrite}
          dragActive={canWrite && drag !== null}
          onCellDrop={canWrite ? handleCellDrop : () => {}}
          onCellAdd={canWrite ? (userId, date) => setEditor({ userId, date }) : () => {}}
          onShiftDragStart={canWrite ? (s) => setDrag({ kind: 'shift', shiftId: s.id, userId: s.userId, date: s.date }) : () => {}}
          onShiftEdit={(s) => (canWrite ? setEditor({ userId: s.userId, date: s.date, shift: s }) : undefined)}
          onDragEnd={() => setDrag(null)}
          onCopyDay={canWrite ? copyDay : undefined}
          onPasteDay={canWrite ? pasteOnto : undefined}
          clipboardActive={canWrite && clipboard !== null}
        />
      )}

      {quickShift && (
        <ShiftQuickEditor shift={quickShift} onClose={() => setQuickShift(null)} onSaved={fetchRows} />
      )}

      {editor && (
        <ShiftEditor
          userId={editor.userId}
          date={editor.date}
          shift={editor.shift}
          onClose={() => setEditor(null)}
          onSaved={fetchRows}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteSel}
        danger
        title="Supprimer les créneaux sélectionnés ?"
        confirmLabel={`Supprimer (${selectedIds.size})`}
        loading={deletingSel}
        message={
          <p>
            {selectedIds.size} créneau(x) seront <strong className="text-status-down">définitivement supprimés</strong>.
            Cette action est irréversible.
          </p>
        }
        onConfirm={() => void deleteSelection()}
        onCancel={() => setConfirmDeleteSel(false)}
      />
    </div>
  );
}
