import { Fragment, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { Copy, ClipboardPaste } from 'lucide-react';
import type { Shift } from '@obliplan/shared';
import type { UserWeekDTO } from '../../api';
import { dayLabel, minToSignedHm } from '../../utils/format';
import { SHIFT_META, periodSuffix } from './shiftMeta';
import { shadeForProject } from './colorShade';
import { HolidayPill } from './HolidayPill';
import { cn } from '../../utils/cn';
import {
  SNAP_MIN,
  clamp,
  hhmmToMin,
  minToHhmm,
  snap30,
  ratioToMin,
  blockLeftPct,
  blockWidthPct,
} from './hourGrid.util';

export interface HourGridProps {
  /** ISO dates to render as day-groups (1 for "jour", 7 for "semaine"). */
  days: string[];
  /** Employees + their shifts (already loaded by the page). */
  rows: UserWeekDTO[];
  /** Optional micro team label per employee id, shown under the name (no grouping). */
  teamLabels?: Record<number, string>;
  /** First hour column, e.g. 8. */
  hourStart: number;
  /** Exclusive end label - columns rendered are hourStart..hourEnd-1, e.g. 20. */
  hourEnd: number;
  /** Lookup of hour-type id → libellé + colour (drives block colour/label). */
  hourTypes: Record<number, { libelle: string; color: string | null }>;
  /** Lookup of project (board) id → name, shown as the block subtitle under the time range. */
  boards?: Record<number, { name: string }>;
  /** ISO dates within `days` that are public holidays: marks the day header only, non-blocking. */
  holidays?: string[];
  /** Optional contract lookup for the left-column colour dot. */
  contrats?: Record<number, { color: string | null; libelle: string }>;
  /** When false the grid is a read-only view (no draw/resize/move/click). */
  editable: boolean;
  /** Drew an empty span: snapped HH:mm start/end. */
  onDraw: (userId: number, date: string, heureDebut: string, heureFin: string) => void;
  /** Drew a span across several employee rows: same slot created for each (no quick-editor). */
  onDrawMany?: (userIds: number[], date: string, heureDebut: string, heureFin: string) => void;
  /** Resized a block's edge: snapped HH:mm start/end (guaranteed end > start). */
  onResize: (shift: Shift, heureDebut: string, heureFin: string) => void;
  /** Moved a block (keeps its duration) - possibly onto another employee/day. */
  onMove: (shift: Shift, userId: number, date: string, heureDebut: string) => void;
  /** Plain click on a block (no drag). */
  onShiftClick: (shift: Shift) => void;
  /** Copy a whole (employee, day) of shifts to the page clipboard. */
  onCopyDay?: (userId: number, date: string) => void;
  /** Paste the page clipboard onto this (employee, day). */
  onPasteDay?: (userId: number, date: string) => void;
  /** A clipboard is set → enables the per-track "Coller" affordance. */
  clipboardActive?: boolean;
  /** Selection mode: disables drawing; a click on a block toggles its selection. */
  selectMode?: boolean;
  /** Currently selected shift ids (drawn with a ring). */
  selectedIds?: Set<number>;
  /** Toggle a shift's membership in the selection. */
  onToggleSelectShift?: (shiftId: number) => void;
  /** Rubber-band result: shifts intersecting the drawn rectangle. `additive` keeps the prior picks. */
  onMarqueeSelect?: (shiftIds: number[], additive: boolean) => void;
}

// ── Layout constants (px) ─────────────────────────────────────────────────────
const LABEL_W = 208; // sticky employee column
const HOUR_W = 54; // one hour column
const ROW_H = 64; // minimum height of one (employee, day) track (1 concurrency lane)
const LANE_H = 30; // height added per extra concurrency lane (parallel/overlapping shifts)
const DRAG_THRESHOLD = 4; // px of movement before a body press counts as a drag

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Assign each timed shift to a horizontal "lane" so concurrent (overlapping) shifts stack
 * vertically inside the track instead of being drawn on top of one another. Greedy interval
 * partitioning: a shift reuses the first lane whose last shift already ended, else opens a new
 * lane. `laneCount` is the max simultaneous overlap = how many rows the track must be split into.
 */
function computeLanes(timed: Shift[]): { laneOf: Map<number, number>; laneCount: number } {
  const items = timed
    .filter((s) => s.heureDebut && s.heureFin)
    .map((s) => ({ id: s.id, st: hhmmToMin(s.heureDebut!), en: hhmmToMin(s.heureFin!) }))
    .sort((a, b) => a.st - b.st || a.en - b.en);
  const laneEnds: number[] = [];
  const laneOf = new Map<number, number>();
  for (const it of items) {
    let lane = laneEnds.findIndex((end) => end <= it.st);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.en);
    } else {
      laneEnds[lane] = it.en;
    }
    laneOf.set(it.id, lane);
  }
  return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}
const EMPTY_LANES = { laneOf: new Map<number, number>(), laneCount: 1 };

// ── Live interaction state ────────────────────────────────────────────────────
type Drag =
  | null
  | { kind: 'draw'; userId: number; date: string; anchorMin: number; curMin: number; curUserId: number }
  | { kind: 'resize'; shift: Shift; edge: 'start' | 'end'; startMin: number; endMin: number }
  | {
      kind: 'move';
      shift: Shift;
      durMin: number;
      grabOffset: number; // minutes from block start to the grab point
      downX: number;
      downY: number;
      moved: boolean;
      // live target:
      userId: number;
      date: string;
      startMin: number;
    };

// Rubber-band rectangle in client (viewport) coordinates: (x0,y0) anchor → (x1,y1) cursor.
type Marquee = null | { x0: number; y0: number; x1: number; y1: number };

export function HourGrid({
  days,
  rows,
  teamLabels,
  boards,
  hourStart,
  hourEnd,
  hourTypes,
  holidays,
  contrats,
  editable,
  onDraw,
  onDrawMany,
  onResize,
  onMove,
  onShiftClick,
  onCopyDay,
  onPasteDay,
  clipboardActive = false,
  selectMode = false,
  selectedIds,
  onToggleSelectShift,
  onMarqueeSelect,
}: HourGridProps) {
  const axisStart = hourStart * 60;
  const axisEnd = hourEnd * 60;
  const hours = Array.from({ length: Math.max(1, hourEnd - hourStart) }, (_, i) => hourStart + i);
  const dayWidth = hours.length * HOUR_W;

  // Keep a live ref alongside React state: pointer handlers read the ref (no stale
  // closures), the render reads state (for the ghost/preview).
  const [drag, setDragState] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null);
  const setDrag = (d: Drag) => {
    dragRef.current = d;
    setDragState(d);
  };

  // ── Marquee (rubber-band) selection, client-space so scroll/sticky cols don't matter ─
  const scrollRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarqueeState] = useState<Marquee>(null);
  const marqueeRef = useRef<Marquee>(null);
  const additiveRef = useRef(false);
  const setMarquee = (m: Marquee) => {
    marqueeRef.current = m;
    setMarqueeState(m);
  };

  // Start only from an empty track cell (target === the track itself); a press that
  // lands on a block/button keeps its own click-to-toggle, no marquee.
  const onMarqueeDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    additiveRef.current = e.shiftKey || e.ctrlKey || e.metaKey;
    setMarquee({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
  };
  const onMarqueeMove = (e: RPointerEvent<HTMLDivElement>) => {
    const m = marqueeRef.current;
    if (!m) return;
    setMarquee({ ...m, x1: e.clientX, y1: e.clientY });
  };
  const onMarqueeUp = () => {
    const m = marqueeRef.current;
    setMarquee(null);
    if (!m) return;
    const moved = Math.abs(m.x1 - m.x0) + Math.abs(m.y1 - m.y0) >= DRAG_THRESHOLD;
    if (!moved) {
      // A plain click on empty space clears the selection (unless adding).
      if (!additiveRef.current) onMarqueeSelect?.([], false);
      return;
    }
    const left = Math.min(m.x0, m.x1);
    const right = Math.max(m.x0, m.x1);
    const top = Math.min(m.y0, m.y1);
    const bottom = Math.max(m.y0, m.y1);
    const ids: number[] = [];
    scrollRef.current?.querySelectorAll<HTMLElement>('[data-shift-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) ids.push(Number(el.dataset.shiftId));
    });
    onMarqueeSelect?.(ids, additiveRef.current);
  };
  const onTrackCancel = () => {
    setDrag(null);
    setMarquee(null);
  };

  // ── Pointer → minute helpers ────────────────────────────────────────────────
  const minAtX = (trackEl: HTMLElement, clientX: number, snap: boolean): number => {
    const r = trackEl.getBoundingClientRect();
    const ratio = r.width > 0 ? (clientX - r.left) / r.width : 0;
    return ratioToMin(ratio, axisStart, axisEnd, snap);
  };

  const trackUnderPointer = (clientX: number, clientY: number) => {
    const hit = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest(
      '[data-track]',
    ) as HTMLElement | null;
    if (!hit) return null;
    return { el: hit, userId: Number(hit.dataset.userid), date: hit.dataset.date! };
  };

  // Employees spanned vertically between the draw anchor row and the current row
  // (inclusive), in top-to-bottom order. Used both to preview and to create.
  const rowIndexOf = (uid: number) => rows.findIndex((r) => r.user.id === uid);
  const drawSpanUserIds = (d: { userId: number; curUserId: number }): number[] => {
    const i0 = rowIndexOf(d.userId);
    const i1 = rowIndexOf(d.curUserId);
    if (i0 < 0 || i1 < 0) return [d.userId];
    return rows.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map((r) => r.user.id);
  };

  // ── Draw (empty-track drag) - horizontal sets the slot, vertical spans employees ─
  const onTrackDown = (e: RPointerEvent<HTMLDivElement>, userId: number, date: string) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const m = minAtX(el, e.clientX, true);
    setDrag({ kind: 'draw', userId, date, anchorMin: m, curMin: m, curUserId: userId });
  };
  const onTrackMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.kind !== 'draw') return;
    // e.currentTarget is the captured anchor track: its rect gives the correct time axis
    // regardless of which row the pointer is now over.
    const m = minAtX(e.currentTarget, e.clientX, true);
    const hit = trackUnderPointer(e.clientX, e.clientY);
    const curUserId = hit ? hit.userId : d.curUserId;
    if (m !== d.curMin || curUserId !== d.curUserId) setDrag({ ...d, curMin: m, curUserId });
  };
  const onTrackUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || d.kind !== 'draw' || d.anchorMin === d.curMin) return; // no real drag = no-op
    const a = Math.min(d.anchorMin, d.curMin);
    const b = Math.max(d.anchorMin, d.curMin);
    const userIds = drawSpanUserIds(d);
    if (userIds.length <= 1) onDraw(userIds[0] ?? d.userId, d.date, minToHhmm(a), minToHhmm(b));
    else onDrawMany?.(userIds, d.date, minToHhmm(a), minToHhmm(b));
  };

  // ── Resize (edge handle drag) ───────────────────────────────────────────────
  const onHandleDown = (e: RPointerEvent<HTMLElement>, shift: Shift, edge: 'start' | 'end') => {
    e.stopPropagation();
    if (e.button !== 0 || !shift.heureDebut || !shift.heureFin) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'resize', shift, edge, startMin: hhmmToMin(shift.heureDebut), endMin: hhmmToMin(shift.heureFin) });
  };
  const onHandleMove = (e: RPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.kind !== 'resize') return;
    const trackEl = e.currentTarget.closest('[data-track]') as HTMLElement | null;
    if (!trackEl) return;
    const m = minAtX(trackEl, e.clientX, true);
    if (d.edge === 'start') {
      const ns = clamp(Math.min(m, d.endMin - SNAP_MIN), axisStart, d.endMin - SNAP_MIN);
      if (ns !== d.startMin) setDrag({ ...d, startMin: ns });
    } else {
      const ne = clamp(Math.max(m, d.startMin + SNAP_MIN), d.startMin + SNAP_MIN, axisEnd);
      if (ne !== d.endMin) setDrag({ ...d, endMin: ne });
    }
  };
  const onHandleUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || d.kind !== 'resize' || d.endMin - d.startMin < SNAP_MIN) return;
    const start = minToHhmm(d.startMin);
    const end = minToHhmm(d.endMin);
    if (start !== d.shift.heureDebut || end !== d.shift.heureFin) onResize(d.shift, start, end);
  };

  // ── Move (body drag) - or plain click when no drag occurred ──────────────────
  const onBodyDown = (e: RPointerEvent<HTMLDivElement>, shift: Shift) => {
    e.stopPropagation();
    if (e.button !== 0 || !shift.heureDebut || !shift.heureFin) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const trackEl = el.closest('[data-track]') as HTMLElement | null;
    const startMin = hhmmToMin(shift.heureDebut);
    const endMin = hhmmToMin(shift.heureFin);
    const grabMin = trackEl ? minAtX(trackEl, e.clientX, false) : startMin;
    setDrag({
      kind: 'move',
      shift,
      durMin: endMin - startMin,
      grabOffset: grabMin - startMin,
      downX: e.clientX,
      downY: e.clientY,
      moved: false,
      userId: shift.userId,
      date: shift.date,
      startMin,
    });
  };
  const onBodyMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.kind !== 'move') return;
    if (!d.moved && Math.abs(e.clientX - d.downX) + Math.abs(e.clientY - d.downY) < DRAG_THRESHOLD) return;
    const hit = trackUnderPointer(e.clientX, e.clientY);
    const trackEl = hit?.el ?? (e.currentTarget.closest('[data-track]') as HTMLElement | null);
    if (!trackEl) return;
    const pm = minAtX(trackEl, e.clientX, false);
    const ns = clamp(snap30(pm - d.grabOffset), axisStart, Math.max(axisStart, axisEnd - d.durMin));
    setDrag({ ...d, moved: true, userId: hit?.userId ?? d.userId, date: hit?.date ?? d.date, startMin: ns });
  };
  const onBodyUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || d.kind !== 'move') return;
    if (!d.moved) {
      onShiftClick(d.shift);
      return;
    }
    const newStart = minToHhmm(d.startMin);
    if (d.userId !== d.shift.userId || d.date !== d.shift.date || newStart !== d.shift.heureDebut) {
      onMove(d.shift, d.userId, d.date, newStart);
    }
  };

  const onAnyCancel = () => setDrag(null);

  // ── Block rendering ─────────────────────────────────────────────────────────
  function renderTimed(s: Shift, isDragShift: boolean, lane = 0, laneCount = 1) {
    const liveResize = isDragShift && drag?.kind === 'resize';
    const startMin = liveResize ? drag.startMin : hhmmToMin(s.heureDebut!);
    const endMin = liveResize ? drag.endMin : hhmmToMin(s.heureFin!);
    // A shift entirely outside the visible hour window is hidden (no phantom sliver).
    if (endMin <= axisStart || startMin >= axisEnd) return null;
    // Clamp geometry into the visible window so partially-visible blocks stay grabbable.
    const vs = clamp(startMin, axisStart, axisEnd - SNAP_MIN);
    const ve = clamp(endMin, vs + SNAP_MIN, axisEnd);
    const meta = SHIFT_META[s.type];
    const ht = s.hourTypeId != null ? hourTypes[s.hourTypeId] : undefined;
    const board = s.boardId != null ? boards?.[s.boardId] : undefined;
    const label = ht?.libelle ?? meta.label;
    // Hour-type colour shaded per project so each project is a distinct tint of the same family.
    const colored = shadeForProject(ht?.color, s.boardId);
    const timeText = `${s.heureDebut}–${s.heureFin}`;
    const isMoving = isDragShift && drag?.kind === 'move' && drag.moved;
    const selected = selectMode && !!selectedIds?.has(s.id);

    // Vertical placement: one lane per concurrent shift so overlaps stack instead of hiding
    // each other. A single-lane track keeps the block near-full-height (as before).
    const style: CSSProperties = {
      left: `${blockLeftPct(vs, axisStart, axisEnd)}%`,
      width: `${blockWidthPct(vs, ve, axisStart, axisEnd)}%`,
      top: `calc(${(lane / laneCount) * 100}% + 2px)`,
      height: `calc(${100 / laneCount}% - 4px)`,
    };
    if (colored) Object.assign(style, { backgroundColor: `${colored}22`, borderColor: colored, color: colored });

    const handleProps = (edge: 'start' | 'end') => ({
      onPointerDown: (e: RPointerEvent<HTMLSpanElement>) => onHandleDown(e, s, edge),
      onPointerMove: onHandleMove,
      onPointerUp: onHandleUp,
      onPointerCancel: onAnyCancel,
    });

    return (
      <div
        key={s.id}
        data-shift-id={s.id}
        title={[label, board?.name, timeText, meta.label].filter(Boolean).join(' · ')}
        onPointerDown={editable && !selectMode ? (e) => onBodyDown(e, s) : undefined}
        onPointerMove={editable && !selectMode ? onBodyMove : undefined}
        onPointerUp={editable && !selectMode ? onBodyUp : undefined}
        onPointerCancel={editable && !selectMode ? onAnyCancel : undefined}
        onClick={
          selectMode && onToggleSelectShift
            ? (e) => {
                e.stopPropagation();
                onToggleSelectShift(s.id);
              }
            : undefined
        }
        style={style}
        className={cn(
          'group absolute flex select-none flex-col justify-center overflow-hidden rounded border px-1.5 text-left',
          !colored && meta.cls,
          s.statut === 'brouillon' && 'border-dashed opacity-70',
          isDragShift && (drag?.kind === 'resize' || drag?.kind === 'move') && 'z-20',
          isMoving && 'opacity-30',
          selectMode ? 'cursor-pointer' : editable ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-default',
          selected && 'z-20 ring-2 ring-accent ring-offset-1 ring-offset-bg-secondary',
        )}
      >
        {editable && !selectMode && (
          <span
            {...handleProps('start')}
            title="Glisser pour redimensionner"
            className="absolute inset-y-0 left-0 z-10 flex w-2 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
          >
            <span className="h-3 w-0.5 rounded-full bg-current/70" />
          </span>
        )}
        <span className="flex items-center gap-1 leading-none">
          {colored && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colored }} />
          )}
          <span className="truncate text-[11px] font-medium">{label}</span>
        </span>
        <span className="mt-0.5 truncate font-mono text-[10px] leading-none opacity-80">{timeText}</span>
        {board && (
          <span className="mt-0.5 truncate text-[10px] font-medium leading-none opacity-90">{board.name}</span>
        )}
        {editable && !selectMode && (
          <span
            {...handleProps('end')}
            title="Glisser pour redimensionner"
            className="absolute inset-y-0 right-0 z-10 flex w-2 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
          >
            <span className="h-3 w-0.5 rounded-full bg-current/70" />
          </span>
        )}
      </div>
    );
  }

  /** Full-day / untimed shift (congé, repos…) - a labelled bar; stacked vertically when several coexist. */
  function renderFullDay(s: Shift, index: number, count: number) {
    const meta = SHIFT_META[s.type];
    const selected = selectMode && !!selectedIds?.has(s.id);
    // A half-day block occupies the matching half of the track (am = left, pm = right).
    const style: CSSProperties = {
      left: s.dayPeriod === 'pm' ? '50%' : 2,
      right: s.dayPeriod === 'am' ? '50%' : 2,
      top: `calc(${(index / count) * 100}% + 2px)`,
      height: `calc(${100 / count}% - 4px)`,
    };
    return (
      <div
        key={s.id}
        data-shift-id={s.id}
        title={`${meta.label}${periodSuffix(s.dayPeriod)}`}
        onPointerDown={editable ? (e) => e.stopPropagation() : undefined}
        onClick={
          selectMode && onToggleSelectShift
            ? (e) => {
                e.stopPropagation();
                onToggleSelectShift(s.id);
              }
            : editable
              ? () => onShiftClick(s)
              : undefined
        }
        style={style}
        className={cn(
          'absolute flex select-none items-center justify-center rounded border text-[11px] font-medium',
          meta.cls,
          s.statut === 'brouillon' && 'border-dashed opacity-70',
          selectMode ? 'cursor-pointer' : editable ? 'cursor-pointer' : 'cursor-default',
          selected && 'z-20 ring-2 ring-accent ring-offset-1 ring-offset-bg-secondary',
        )}
      >
        <span className="truncate px-1">
          {meta.label}
          {periodSuffix(s.dayPeriod)}
        </span>
      </div>
    );
  }

  /** Read-only overlay: a booked meeting reservation (name + times). Pointer-transparent so
   *  drawing/selecting the underlying track still works; sits above shift blocks. */
  function renderAppointment(a: UserWeekDTO['appointments'][number]) {
    const s = hhmmToMin(a.start);
    const e = hhmmToMin(a.end);
    if (e <= axisStart || s >= axisEnd) return null;
    const vs = clamp(s, axisStart, axisEnd - SNAP_MIN);
    const ve = clamp(e, vs + SNAP_MIN, axisEnd);
    return (
      <div
        key={`appt-${a.id}`}
        title={`Rendez-vous · ${a.name} (${a.email})${a.subject ? ` · ${a.subject}` : ''} · ${a.start}-${a.end}${a.status === 'pending' ? ' · à confirmer' : ''}`}
        style={{ left: `${blockLeftPct(vs, axisStart, axisEnd)}%`, width: `${blockWidthPct(vs, ve, axisStart, axisEnd)}%` }}
        className={cn(
          'pointer-events-none absolute top-0.5 z-10 flex h-[17px] items-center gap-0.5 overflow-hidden rounded border border-accent bg-accent/25 px-1 text-[9px] font-semibold text-accent-hover',
          a.status === 'pending' && 'border-dashed',
        )}
      >
        <span className="truncate">RDV · {a.name}</span>
      </div>
    );
  }

  function drawGhost(userId: number, date: string) {
    if (drag?.kind !== 'draw' || drag.date !== date) return null;
    if (!drawSpanUserIds(drag).includes(userId)) return null;
    const a = Math.min(drag.anchorMin, drag.curMin);
    const b = Math.max(a + SNAP_MIN, Math.max(drag.anchorMin, drag.curMin));
    return (
      <div
        className="pointer-events-none absolute top-1 bottom-1 z-30 flex items-center justify-center rounded border border-dashed border-accent bg-accent/15 text-[10px] font-medium text-accent"
        style={{ left: `${blockLeftPct(a, axisStart, axisEnd)}%`, width: `${blockWidthPct(a, b, axisStart, axisEnd)}%` }}
      >
        {minToHhmm(a)}–{minToHhmm(b)}
      </div>
    );
  }

  function moveGhost(userId: number, date: string) {
    if (!(drag?.kind === 'move' && drag.moved && drag.userId === userId && drag.date === date)) return null;
    const startMin = drag.startMin;
    const endMin = startMin + drag.durMin;
    const ht = drag.shift.hourTypeId != null ? hourTypes[drag.shift.hourTypeId] : undefined;
    const colored = shadeForProject(ht?.color, drag.shift.boardId);
    const meta = SHIFT_META[drag.shift.type];
    const style: CSSProperties = {
      left: `${blockLeftPct(startMin, axisStart, axisEnd)}%`,
      width: `${blockWidthPct(startMin, endMin, axisStart, axisEnd)}%`,
    };
    if (colored) Object.assign(style, { backgroundColor: `${colored}33`, borderColor: colored, color: colored });
    return (
      <div
        className={cn(
          'pointer-events-none absolute top-1 bottom-1 z-30 flex items-center overflow-hidden rounded border-2 px-1.5 text-[11px] font-medium shadow-card',
          !colored && meta.cls,
        )}
        style={style}
      >
        <span className="truncate">
          {minToHhmm(startMin)}–{minToHhmm(endMin)}
        </span>
      </div>
    );
  }

  // Hour gridlines drawn as a repeating background (full hours + fainter half-hours).
  const trackBgBase: CSSProperties = {
    backgroundImage:
      'linear-gradient(to right, rgb(var(--c-border-light)) 0, rgb(var(--c-border-light)) 1px, transparent 1px),' +
      'linear-gradient(to right, rgb(var(--c-border-light) / 0.45) 0, rgb(var(--c-border-light) / 0.45) 1px, transparent 1px)',
    backgroundSize: `${HOUR_W}px 100%, ${HOUR_W / 2}px 100%`,
    backgroundPosition: 'left top',
  };

  function renderTrack(row: UserWeekDTO, date: string, height: number, lanes: { laneOf: Map<number, number>; laneCount: number }) {
    const userId = row.user.id;
    const here = row.shifts.filter((s) => s.date === date);
    const timed = here.filter((s) => s.heureDebut && s.heureFin);
    const fullday = here.filter((s) => !(s.heureDebut && s.heureFin));
    const appts = (row.appointments ?? []).filter((a) => a.date === date);
    // Public holiday for THIS employee's country (per-cell: a MG member's fériés differ from a FR one's).
    const isHoliday = (row.holidays ?? []).includes(date);
    return (
      <div
        key={date}
        data-track=""
        data-userid={userId}
        data-date={date}
        onPointerDown={
          editable ? (selectMode ? onMarqueeDown : (e) => onTrackDown(e, userId, date)) : undefined
        }
        onPointerMove={editable ? (selectMode ? onMarqueeMove : onTrackMove) : undefined}
        onPointerUp={editable ? (selectMode ? onMarqueeUp : onTrackUp) : undefined}
        onPointerCancel={editable ? onTrackCancel : undefined}
        style={{ ...trackBgBase, height }}
        className={cn(
          'group relative border-b border-r border-border',
          isHoliday && 'bg-status-pending/10',
          editable && 'cursor-crosshair touch-none',
        )}
      >
        {isHoliday && (
          <span className="pointer-events-none absolute left-1 top-1 z-30 rounded bg-status-pending/20 px-1 text-[9px] font-semibold uppercase tracking-wide text-status-pending">
            Férié
          </span>
        )}
        {fullday.map((s, i) => renderFullDay(s, i, fullday.length))}
        {timed.map((s) =>
          renderTimed(s, drag != null && 'shift' in drag && drag.shift.id === s.id, lanes.laneOf.get(s.id) ?? 0, lanes.laneCount),
        )}
        {appts.map((a) => renderAppointment(a))}
        {drawGhost(userId, date)}
        {moveGhost(userId, date)}
        {editable && onCopyDay && (
          <div className="absolute right-1 top-1 z-30 flex gap-1">
            {here.length > 0 && (
              <button
                type="button"
                title="Copier ce jour"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyDay(userId, date);
                }}
                className="rounded border border-border bg-bg-secondary/90 p-0.5 text-text-muted opacity-0 shadow-card transition-opacity hover:text-accent group-hover:opacity-100"
              >
                <Copy size={12} />
              </button>
            )}
            {clipboardActive && onPasteDay && (
              <button
                type="button"
                title="Coller ici"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onPasteDay(userId, date);
                }}
                className="inline-flex items-center gap-0.5 rounded border border-accent/40 bg-accent/10 px-1 py-0.5 text-[10px] font-medium text-accent shadow-card transition-colors hover:bg-accent/20"
              >
                <ClipboardPaste size={11} /> Coller
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-[72vh] overflow-auto rounded-lg border border-border bg-bg-secondary">
      {/* Rubber-band overlay - fixed (viewport space) so it isn't clipped by the scroll container. */}
      {marquee && (
        <div
          className="pointer-events-none fixed z-50 rounded-sm border border-accent bg-accent/10"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}
      <div className="grid w-max" style={{ gridTemplateColumns: `${LABEL_W}px repeat(${days.length}, ${dayWidth}px)` }}>
        {/* Header: sticky corner (top+left) + per-day group (day label over hour ticks), frozen on scroll. */}
        <div className="sticky left-0 top-0 z-40 flex items-end border-b border-r border-border bg-bg-secondary px-3 py-2 text-xs font-medium text-text-muted">
          Salarié
        </div>
        {days.map((date) => {
          // Column header flags a day férié for AT LEAST ONE displayed employee (countries may
          // differ); the precise per-employee marking is on each cell. Falls back to the prop.
          const isHoliday =
            rows.some((r) => (r.holidays ?? []).includes(date)) || (holidays?.includes(date) ?? false);
          return (
          <div key={`h-${date}`} className="sticky top-0 z-30 border-b border-r border-border bg-bg-secondary">
            <div
              className={cn(
                'flex items-center justify-center gap-1 border-b border-border px-2 py-1 text-center text-xs font-medium text-text-secondary',
                isHoliday && 'bg-status-pending/10',
              )}
            >
              <span className="truncate">{dayLabel(date)}</span>
              {isHoliday && <HolidayPill />}
            </div>
            <div className="flex">
              {hours.map((h) => (
                <div
                  key={h}
                  style={{ width: HOUR_W }}
                  className="shrink-0 border-l border-border/40 py-1 text-center font-mono text-[10px] text-text-muted first:border-l-0"
                >
                  {pad2(h)}h
                </div>
              ))}
            </div>
          </div>
          );
        })}

        {/* Body: one row per employee → sticky label + a track per day. */}
        {rows.map((row) => {
          const ci = row.user.contratId != null ? contrats?.[row.user.contratId] : undefined;
          // Lanes per day + the busiest day sets this employee's row height (grid rows share a
          // height, so the sticky label must match the tallest track of the week).
          const lanesByDate = new Map<string, { laneOf: Map<number, number>; laneCount: number }>();
          let maxLanes = 1;
          for (const date of days) {
            const info = computeLanes(row.shifts.filter((s) => s.date === date));
            lanesByDate.set(date, info);
            if (info.laneCount > maxLanes) maxLanes = info.laneCount;
          }
          const rowHeight = Math.max(ROW_H, maxLanes * LANE_H + 6);
          return (
            <Fragment key={row.user.id}>
              <div
                className="sticky left-0 z-20 flex items-center gap-2 border-b border-r border-border bg-bg-secondary px-3"
                style={{ height: rowHeight }}
              >
                <span
                  className="h-5 w-1.5 shrink-0 rounded-full"
                  style={{ background: ci?.color ?? 'rgb(var(--c-border-light))' }}
                  title={ci?.libelle}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {row.user.displayName || row.user.username}
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[10px]',
                      row.counter.ecartMin >= 0 ? 'text-status-up' : 'text-status-down',
                    )}
                  >
                    {minToSignedHm(row.counter.ecartMin)}
                  </span>
                  {teamLabels?.[row.user.id] && (
                    <span className="block truncate text-[10px] uppercase tracking-wide text-text-muted">
                      {teamLabels[row.user.id]}
                    </span>
                  )}
                </span>
              </div>
              {days.map((date) => renderTrack(row, date, rowHeight, lanesByDate.get(date) ?? EMPTY_LANES))}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
