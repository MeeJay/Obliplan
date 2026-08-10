import { Plus, Copy, ClipboardPaste, CalendarClock } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Shift, PlanningAppointment } from '@obliplan/shared';
import type { UserWeekDTO } from '../../api';
import { addDaysIso, dayLabel, minToSignedHm } from '../../utils/format';
import { SHIFT_META, TIMED_SHIFT_TYPES, type HourTypeLookup, type BoardLookup } from './shiftMeta';
import { shadeForProject } from './colorShade';
import { HolidayPill } from './HolidayPill';
import { cn } from '../../utils/cn';

/** What is currently being dragged onto a cell: an existing shift (move) or a template (create). */
export type RotaDrag =
  | { kind: 'shift'; shiftId: number; userId: number; date: string }
  | { kind: 'template'; templateId: number };

export interface ContratInfo {
  color: string | null;
  libelle: string;
}

interface RotaGridProps {
  monday: string;
  rows: UserWeekDTO[];
  /** Optional micro team label per employee id, shown under the name (no grouping). */
  teamLabels?: Record<number, string>;
  contrats: Record<number, ContratInfo>;
  hourTypes: HourTypeLookup;
  boards: BoardLookup;
  /** ISO dates in the rendered week that are public holidays: marks the day header only, non-blocking. */
  holidays?: string[];
  /** When false the grid is read-only: no add button, no drag, no click-to-edit. */
  editable?: boolean;
  /** Whether a drag is in progress (enables cell drop highlighting). */
  dragActive: boolean;
  onCellDrop: (userId: number, date: string) => void;
  onCellAdd: (userId: number, date: string) => void;
  onShiftDragStart: (shift: Shift) => void;
  onShiftEdit: (shift: Shift) => void;
  onDragEnd: () => void;
  /** Copy a whole day's shifts (employee, date) to the page clipboard. */
  onCopyDay?: (userId: number, date: string) => void;
  /** Paste the page clipboard onto this (employee, date). */
  onPasteDay?: (userId: number, date: string) => void;
  /** A clipboard is set → show the per-cell "Coller" button. */
  clipboardActive?: boolean;
}

const cellKey = (userId: number, date: string) => `${userId}:${date}`;

export function RotaGrid({
  monday,
  rows,
  teamLabels,
  contrats,
  hourTypes,
  boards,
  holidays,
  editable = true,
  dragActive,
  onCellDrop,
  onCellAdd,
  onShiftDragStart,
  onShiftEdit,
  onDragEnd,
  onCopyDay,
  onPasteDay,
  clipboardActive = false,
}: RotaGridProps) {
  const [overKey, setOverKey] = useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));

  // Clear the drop highlight whenever a drag ends (incl. cancels outside the grid).
  useEffect(() => {
    if (!dragActive) setOverKey(null);
  }, [dragActive]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 w-48 border-b border-r border-border bg-bg-secondary px-3 py-2 text-left text-xs font-medium text-text-muted">
              Salarié
            </th>
            {days.map((iso) => {
              // Header flags a férié for at least one displayed employee (countries may differ);
              // the precise per-employee mark is on each cell.
              const isHoliday =
                rows.some((r) => (r.holidays ?? []).includes(iso)) || (holidays?.includes(iso) ?? false);
              return (
                <th
                  key={iso}
                  className="border-b border-border bg-bg-secondary px-2 py-2 text-center text-xs font-medium text-text-secondary"
                >
                  <span
                    className={cn(
                      'flex items-center justify-center gap-1 rounded',
                      isHoliday && 'bg-status-pending/10',
                    )}
                  >
                    <span className="truncate">{dayLabel(iso)}</span>
                    {isHoliday && <HolidayPill />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ci = row.user.contratId ? contrats[row.user.contratId] : undefined;
            return (
              <tr key={row.user.id}>
                <th className="sticky left-0 z-10 border-b border-r border-border bg-bg-secondary px-3 py-2 text-left align-top">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-4 w-1.5 shrink-0 rounded-full"
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
                  </span>
                </th>
                {days.map((iso) => {
                  const key = cellKey(row.user.id, iso);
                  const cellShifts = row.shifts.filter((s) => s.date === iso);
                  const cellAppts = (row.appointments ?? []).filter((a) => a.date === iso);
                  // Public holiday for THIS employee's country (per-cell, countries may differ).
                  const cellHoliday = (row.holidays ?? []).includes(iso);
                  return (
                    <td
                      key={iso}
                      onDragOver={(e) => {
                        if (!dragActive) return;
                        e.preventDefault();
                        setOverKey((k) => (k === key ? k : key));
                      }}
                      onDragLeave={(e) => {
                        // Ignore leave events fired when the pointer enters a child chip (avoids highlight flicker).
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey((k) => (k === key ? null : k));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setOverKey(null);
                        onCellDrop(row.user.id, iso);
                      }}
                      onClick={editable ? () => onCellAdd(row.user.id, iso) : undefined}
                      className={cn(
                        'group h-[92px] border-b border-r border-border align-top transition-colors',
                        cellHoliday && 'bg-status-pending/10',
                        editable && 'cursor-pointer hover:bg-bg-hover/40',
                        overKey === key && 'bg-accent/10 outline outline-2 -outline-offset-2 outline-accent',
                      )}
                    >
                      <div className="flex h-full flex-col gap-1 p-1">
                        {cellHoliday && (
                          <span className="rounded bg-status-pending/20 px-1 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-status-pending">
                            Férié
                          </span>
                        )}
                        {cellShifts.map((s) => (
                          <ShiftChip
                            key={s.id}
                            shift={s}
                            editable={editable}
                            hourTypes={hourTypes}
                            boards={boards}
                            onDragStart={() => onShiftDragStart(s)}
                            onDragEnd={onDragEnd}
                            onEdit={() => onShiftEdit(s)}
                          />
                        ))}
                        {cellAppts.map((a) => (
                          <ApptChip key={`appt-${a.id}`} appt={a} />
                        ))}
                        {editable && (
                          <div className="mt-auto flex items-center justify-center gap-1 pt-0.5">
                            {onCopyDay && cellShifts.length > 0 && (
                              <button
                                type="button"
                                title="Copier la journée"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCopyDay(row.user.id, iso);
                                }}
                                className="text-text-muted opacity-30 transition-opacity hover:text-accent group-hover:opacity-70"
                              >
                                <Copy size={12} />
                              </button>
                            )}
                            {clipboardActive && onPasteDay && (
                              <button
                                type="button"
                                title="Coller ici"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPasteDay(row.user.id, iso);
                                }}
                                className="inline-flex items-center gap-0.5 rounded border border-accent/40 bg-accent/10 px-1 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/20"
                              >
                                <ClipboardPaste size={11} /> Coller
                              </button>
                            )}
                            <button
                              type="button"
                              title="Ajouter un créneau"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCellAdd(row.user.id, iso);
                              }}
                              className="flex justify-center text-text-muted opacity-30 transition-opacity hover:text-accent group-hover:opacity-70"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Read-only booked-meeting chip (name + times) shown alongside shifts on the rota cell. */
function ApptChip({ appt }: { appt: PlanningAppointment }) {
  return (
    <div
      title={`Rendez-vous · ${appt.name} (${appt.email})${appt.subject ? ` · ${appt.subject}` : ''}${appt.status === 'pending' ? ' · à confirmer' : ''}`}
      className={cn(
        'rounded border border-accent/50 bg-accent/10 px-1.5 py-0.5 text-left text-[11px] leading-tight text-accent-hover',
        appt.status === 'pending' && 'border-dashed opacity-80',
      )}
    >
      <div className="flex items-center gap-1">
        <CalendarClock size={10} className="shrink-0" />
        <span className="truncate font-medium">RDV · {appt.name}</span>
      </div>
      <span className="mt-0.5 block font-mono text-[10px] opacity-80">
        {appt.start}–{appt.end}
      </span>
    </div>
  );
}

interface ShiftChipProps {
  shift: Shift;
  editable?: boolean;
  hourTypes: HourTypeLookup;
  boards: BoardLookup;
  onDragStart: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
}

function ShiftChip({ shift, editable = true, hourTypes, boards, onDragStart, onDragEnd, onEdit }: ShiftChipProps) {
  const meta = SHIFT_META[shift.type];
  const timed = TIMED_SHIFT_TYPES.includes(shift.type);
  const time = shift.heureDebut && shift.heureFin ? `${shift.heureDebut}–${shift.heureFin}` : null;
  const ht = shift.hourTypeId != null ? hourTypes[shift.hourTypeId] : undefined;
  const board = shift.boardId != null ? boards[shift.boardId] : undefined;
  // Hour-type colour shaded per project (distinct tint per project on the same type).
  const colored = shadeForProject(ht?.color, shift.boardId);
  return (
    <div
      draggable={editable}
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      onDragStart={(e) => {
        if (!editable) return;
        e.stopPropagation();
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        onEdit();
      }}
      onKeyDown={(e) => {
        if (!editable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onEdit();
        }
      }}
      title={[meta.label, time, ht?.libelle, board?.name].filter(Boolean).join(' · ')}
      style={colored ? { backgroundColor: `${colored}22`, borderColor: colored, color: colored } : undefined}
      className={cn(
        'rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-accent',
        editable && 'cursor-grab active:cursor-grabbing',
        !colored && meta.cls, // hour-type colour wins over the default 'travail' violet
        shift.statut === 'brouillon' && 'border-dashed opacity-70',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-medium">{ht?.libelle ?? meta.label}</span>
        {timed && time && <span className="shrink-0 font-mono text-[10px]">{time}</span>}
      </div>
      {board && <span className="mt-0.5 block truncate text-[10px] opacity-80">{board.name}</span>}
      {shift.statut === 'brouillon' && <span className="block text-[10px] italic">brouillon</span>}
    </div>
  );
}
