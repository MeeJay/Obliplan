import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import { Users, Columns3, ChevronLeft, ChevronRight, Check, CalendarClock } from 'lucide-react';
import type { BoardDetail, Card } from '@obliplan/shared';
import { type AssignableUser } from '../../api';
import { PRIORITY_META, PRIORITY_DOT } from './cardMeta';
import { addDaysIso, dayLabel, mondayOfIso, monthLabel, todayIso } from '../../utils/format';
import { cn } from '../../utils/cn';

interface TimelineViewProps {
  board: BoardDetail;
  /** Kept for parity with the other views (Timeline is read-only for now). */
  onChanged: () => void;
  assignees: AssignableUser[];
  /** Open the shared CardEditor (mirrors how BoardView opens a card). */
  onOpenCard?: (card: Card) => void;
}

type GroupBy = 'assignee' | 'column';

interface TimelineGroup {
  key: string;
  label: string;
  isDone?: boolean;
  cards: Card[];
}

// ── Layout constants (px) ─────────────────────────────────────────────────────
const LABEL_W = 240; // sticky left column (group / card labels)
const DAY_W = 30; // one day column on the date axis
const ROW_H = 30; // one card track
const WEEKS_OPTIONS = [4, 8, 12] as const;

/** Whole-day difference b − a (both ISO yyyy-mm-dd), in days. */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function isWeekend(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Effective [start, end] of a card (single date fills both; swap if reversed). null when undated. */
function cardSpan(card: Card): { start: string; end: string } | null {
  let start = card.startDate ?? card.dueDate;
  let end = card.dueDate ?? card.startDate;
  if (!start || !end) return null;
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

export function TimelineView({ board, assignees, onOpenCard }: TimelineViewProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('assignee');
  const [weeks, setWeeks] = useState<number>(8);
  // Anchor the initial window at the earliest card date (else this week) so a board of
  // past-due or future cards opens showing its bars, not a blank forward-looking window.
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const dates = board.cards.map((c) => c.startDate ?? c.dueDate).filter((v): v is string => !!v);
    const min = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : todayIso();
    return mondayOfIso(min);
  });

  const totalDays = weeks * 7;
  const axisWidth = totalDays * DAY_W;
  const totalWidth = LABEL_W + axisWidth;

  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => addDaysIso(rangeStart, i)),
    [rangeStart, totalDays],
  );

  const monthBands = useMemo(() => {
    const bands: { key: string; label: string; span: number }[] = [];
    for (const d of days) {
      const key = d.slice(0, 7);
      const last = bands[bands.length - 1];
      if (last && last.key === key) last.span += 1;
      else bands.push({ key, label: monthLabel(key), span: 1 });
    }
    return bands;
  }, [days]);

  const assigneeById = useMemo(() => new Map(assignees.map((u) => [u.id, u])), [assignees]);
  const doneColumnIds = useMemo(
    () => new Set(board.columns.filter((c) => c.isDone).map((c) => c.id)),
    [board.columns],
  );

  const dated = useMemo(() => board.cards.filter((c) => c.startDate || c.dueDate), [board.cards]);
  const undated = useMemo(() => board.cards.filter((c) => !c.startDate && !c.dueDate), [board.cards]);

  const groups = useMemo<TimelineGroup[]>(() => {
    const byStart = (a: Card, b: Card) =>
      (a.startDate ?? a.dueDate ?? '').localeCompare(b.startDate ?? b.dueDate ?? '') ||
      a.title.localeCompare(b.title);

    if (groupBy === 'column') {
      return board.columns
        .map((col) => ({
          key: `col-${col.id}`,
          label: col.name,
          isDone: col.isDone,
          cards: dated.filter((c) => c.columnId === col.id).sort(byStart),
        }))
        .filter((g) => g.cards.length > 0);
    }

    const out: TimelineGroup[] = [];
    for (const u of assignees) {
      const cards = dated.filter((c) => c.assigneeId === u.id).sort(byStart);
      if (cards.length) out.push({ key: `u-${u.id}`, label: u.displayName || u.username, cards });
    }
    const none = dated
      .filter((c) => c.assigneeId == null || !assigneeById.has(c.assigneeId))
      .sort(byStart);
    if (none.length) out.push({ key: 'u-none', label: 'Non assigné', cards: none });
    return out;
  }, [groupBy, board.columns, dated, assignees, assigneeById]);

  const todayIdx = dayDiff(rangeStart, todayIso());
  const todayVisible = todayIdx >= 0 && todayIdx < totalDays;

  const page = (dir: number) => setRangeStart((s) => addDaysIso(s, dir * totalDays));
  const goToday = () => setRangeStart(mondayOfIso(todayIso()));

  // Vertical "today" marker, repeated inside each row so it reads as one continuous line.
  function todayLine() {
    if (!todayVisible) return null;
    return (
      <div
        className="pointer-events-none absolute inset-y-0 z-0 w-px bg-accent/40"
        style={{ left: `${((todayIdx + 0.5) / totalDays) * 100}%` }}
      />
    );
  }

  // Day-column gridlines drawn as a repeating background (matches the planning HourGrid spirit).
  const rowBg: CSSProperties = {
    backgroundImage:
      'linear-gradient(to right, rgb(var(--c-border-light) / 0.5) 0, rgb(var(--c-border-light) / 0.5) 1px, transparent 1px)',
    backgroundSize: `${DAY_W}px 100%`,
  };

  function renderBar(card: Card) {
    const span = cardSpan(card);
    if (!span) return null;
    const leftIdx = dayDiff(rangeStart, span.start);
    const rightIdx = dayDiff(rangeStart, span.end); // inclusive end day
    const startUnit = Math.max(0, leftIdx);
    const endUnit = Math.min(totalDays, rightIdx + 1);
    if (endUnit <= startUnit) return null; // fully outside the window

    const done = doneColumnIds.has(card.columnId);
    const oneDay = leftIdx === rightIdx;
    const barCls = done
      ? 'border-status-up/50 bg-bg-active text-text-muted'
      : card.priority
        ? PRIORITY_META[card.priority].cls
        : 'border-border bg-accent/15 text-accent';

    const tip = [
      card.title,
      span.start === span.end ? span.start : `${span.start} → ${span.end}`,
      card.priority ? PRIORITY_META[card.priority].label : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <button
        type="button"
        onClick={() => onOpenCard?.(card)}
        title={tip}
        style={{
          left: `${(startUnit / totalDays) * 100}%`,
          width: `${((endUnit - startUnit) / totalDays) * 100}%`,
        }}
        className={cn(
          'absolute top-1 bottom-1 z-10 flex items-center gap-1 overflow-hidden rounded border px-1.5 text-left text-[11px] font-medium',
          barCls,
          oneDay && 'justify-center',
          onOpenCard ? 'cursor-pointer hover:brightness-110' : 'cursor-default',
        )}
      >
        {done && <Check size={11} className="shrink-0" />}
        <span className={cn('truncate', done && 'line-through')}>{card.title}</span>
      </button>
    );
  }

  function cardLabelCell(card: Card, z: string) {
    const done = doneColumnIds.has(card.columnId);
    return (
      <div
        className={cn('sticky left-0 flex items-center gap-1.5 bg-bg-secondary px-3 text-xs text-text-secondary', z)}
        style={{ width: LABEL_W }}
      >
        {card.priority ? (
          <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[card.priority])} />
        ) : (
          <span className="h-2 w-2 shrink-0" />
        )}
        <span className={cn('truncate', done && 'text-text-muted line-through')}>{card.title}</span>
      </div>
    );
  }

  const hasCards = board.cards.length > 0;

  return (
    <div className="space-y-3">
      {/* Controls: grouping · horizon · date navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-bg-tertiary p-0.5">
          <button
            onClick={() => setGroupBy('assignee')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
              groupBy === 'assignee' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <Users size={13} /> Par assigné
          </button>
          <button
            onClick={() => setGroupBy('column')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
              groupBy === 'column' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <Columns3 size={13} /> Par colonne
          </button>
        </div>

        <select
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value))}
          className="rounded-md border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary"
        >
          {WEEKS_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w} semaines
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => page(-1)}
            title="Période précédente"
            className="rounded-md border border-border bg-bg-tertiary p-1.5 text-text-muted hover:text-accent"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={goToday}
            className="rounded-md border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => page(1)}
            title="Période suivante"
            className="rounded-md border border-border bg-bg-tertiary p-1.5 text-text-muted hover:text-accent"
          >
            <ChevronRight size={14} />
          </button>
          <span className="ml-1 hidden text-xs text-text-muted sm:inline">
            {dayLabel(days[0])} – {dayLabel(days[days.length - 1])}
          </span>
        </div>
      </div>

      {!hasCards ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-bg-secondary py-12 text-center">
          <CalendarClock size={28} className="text-text-muted" />
          <p className="text-sm text-text-muted">Aucune carte à afficher sur la timeline.</p>
        </div>
      ) : (
        <div className="max-h-[72vh] overflow-auto rounded-lg border border-border bg-bg-secondary">
          <div style={{ width: totalWidth }}>
            {/* Header: sticky corner + month bands over day ticks (frozen on scroll). */}
            <div className="sticky top-0 z-30 flex bg-bg-secondary">
              <div
                className="sticky left-0 z-40 flex items-end border-b border-r border-border bg-bg-secondary px-3 py-1 text-xs font-medium text-text-muted"
                style={{ width: LABEL_W }}
              >
                Tâche
              </div>
              <div style={{ width: axisWidth }} className="border-b border-border">
                <div className="flex">
                  {monthBands.map((b) => (
                    <div
                      key={b.key}
                      style={{ width: b.span * DAY_W }}
                      className="truncate border-l border-border/60 px-2 py-0.5 text-[11px] font-medium capitalize text-text-secondary first:border-l-0"
                    >
                      {b.label}
                    </div>
                  ))}
                </div>
                <div className="flex border-t border-border">
                  {days.map((d) => {
                    const wk = isWeekend(d);
                    const isToday = d === todayIso();
                    return (
                      <div
                        key={d}
                        style={{ width: DAY_W }}
                        className={cn(
                          'py-0.5 text-center font-mono text-[10px]',
                          isToday
                            ? 'bg-accent/15 font-semibold text-accent'
                            : wk
                              ? 'bg-bg-tertiary text-text-muted'
                              : 'text-text-muted',
                        )}
                      >
                        {Number(d.slice(8, 10))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Body: grouped card tracks. */}
            {groups.map((g) => (
              <Fragment key={g.key}>
                <div className="flex border-b border-border bg-bg-tertiary/40">
                  <div
                    className="sticky left-0 z-20 flex items-center gap-1.5 bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary"
                    style={{ width: LABEL_W }}
                  >
                    <span className="truncate">{g.label}</span>
                    <span className="rounded bg-bg-active px-1 text-[10px] font-normal text-text-muted">
                      {g.cards.length}
                    </span>
                    {g.isDone && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-status-up">
                        <Check size={10} /> terminé
                      </span>
                    )}
                  </div>
                  <div style={{ width: axisWidth }} className="relative">
                    {todayLine()}
                  </div>
                </div>
                {g.cards.map((card) => (
                  <div key={card.id} className="flex border-b border-border-light">
                    {cardLabelCell(card, 'z-10')}
                    <div style={{ width: axisWidth, height: ROW_H, ...rowBg }} className="relative">
                      {todayLine()}
                      {renderBar(card)}
                    </div>
                  </div>
                ))}
              </Fragment>
            ))}

            {/* "Sans date" lane: cards with neither start nor due date. */}
            {undated.length > 0 && (
              <Fragment>
                <div className="flex border-b border-t border-border bg-bg-tertiary/40">
                  <div
                    className="sticky left-0 z-20 flex items-center gap-1.5 bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary"
                    style={{ width: LABEL_W }}
                  >
                    <span className="truncate">Sans date</span>
                    <span className="rounded bg-bg-active px-1 text-[10px] font-normal text-text-muted">
                      {undated.length}
                    </span>
                  </div>
                  <div style={{ width: axisWidth }} />
                </div>
                {undated.map((card) => (
                  <div key={card.id} className="flex border-b border-border-light">
                    {cardLabelCell(card, 'z-10')}
                    <div style={{ width: axisWidth, height: ROW_H }} className="flex items-center px-3">
                      <span className="text-[11px] italic text-text-muted">Aucune date planifiée</span>
                    </div>
                  </div>
                ))}
              </Fragment>
            )}

            {groups.length === 0 && undated.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-text-muted">
                Aucune carte pour ce regroupement.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
