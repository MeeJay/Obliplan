import { useState } from 'react';
import { Plus, CalendarClock } from 'lucide-react';
import type { Shift, PlanningAppointment } from '@obliplan/shared';
import { addDaysIso, dayLabel } from '../../utils/format';
import { SHIFT_META, TIMED_SHIFT_TYPES, periodSuffix, type HourTypeLookup, type BoardLookup } from './shiftMeta';
import { shadeForProject } from './colorShade';
import { HolidayPill } from './HolidayPill';
import { AppointmentDetailModal } from './AppointmentDetailModal';
import { cn } from '../../utils/cn';

interface WeekTableProps {
  monday: string;
  shifts: Shift[];
  editable?: boolean;
  onAdd?: (date: string) => void;
  onEdit?: (shift: Shift) => void;
  /** Optional lookups to decorate chips with the hour-type label/color and project name. */
  hourTypes?: HourTypeLookup;
  boards?: BoardLookup;
  /** ISO dates (in this week) that are public holidays. Purely a visual day-marker, non-blocking. */
  holidays?: string[];
  /** Booked meeting reservations this week (read-only), shown as RDV chips under their day. */
  appointments?: PlanningAppointment[];
}

export function WeekTable({ monday, shifts, editable, onAdd, onEdit, hourTypes = {}, boards = {}, holidays = [], appointments = [] }: WeekTableProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
  const byDay = (iso: string) => shifts.filter((s) => s.date === iso);
  const apptsByDay = (iso: string) => appointments.filter((a) => a.date === iso);
  const [apptDetail, setApptDetail] = useState<PlanningAppointment | null>(null);

  return (
    <>
    <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
      {days.map((iso) => {
        const isHoliday = holidays.includes(iso);
        return (
        <div key={iso} className="flex flex-col rounded-md border border-border bg-bg-secondary md:min-h-[120px]">
          <div
            className={cn(
              'flex items-center justify-between border-b border-border px-2 py-1.5',
              isHoliday && 'bg-status-pending/10',
            )}
          >
            <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-text-secondary">
              <span className="truncate">{dayLabel(iso)}</span>
              {isHoliday && <HolidayPill />}
            </span>
            {editable && (
              <button onClick={() => onAdd?.(iso)} className="text-text-muted hover:text-accent" title="Ajouter">
                <Plus size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1 p-1.5">
            {byDay(iso).map((s) => {
              const meta = SHIFT_META[s.type];
              const time = s.heureDebut && s.heureFin ? `${s.heureDebut}–${s.heureFin}` : meta.label;
              const ht = s.hourTypeId != null ? hourTypes[s.hourTypeId] : undefined;
              const board = s.boardId != null ? boards[s.boardId] : undefined;
              // The hour-type colour, shaded per project so each project reads as a distinct tint.
              const colored = shadeForProject(ht?.color, s.boardId);
              // Project is the headline (coloured by hour-type); the hour-type libellé becomes the subtitle.
              // No project -> hour-type libellé is the headline; no hour-type -> fall back to the shift meta label.
              const headline = (board ? board.name : ht?.libelle ?? meta.label) + periodSuffix(s.dayPeriod);
              const subtitle = board ? ht?.libelle ?? meta.label : null;
              return (
                <button
                  key={s.id}
                  onClick={() => editable && onEdit?.(s)}
                  disabled={!editable}
                  style={colored ? { backgroundColor: `${colored}22`, borderColor: colored, color: colored } : undefined}
                  className={cn(
                    'rounded border px-1.5 py-1 text-left text-[11px] leading-tight',
                    !colored && meta.cls, // hour-type colour wins over the default 'travail' violet
                    editable && 'cursor-pointer hover:opacity-80',
                    s.statut === 'brouillon' && 'border-dashed opacity-70',
                  )}
                >
                  <div className="truncate font-semibold">{headline}</div>
                  {subtitle && <div className="truncate text-[10px] opacity-80">{subtitle}</div>}
                  {TIMED_SHIFT_TYPES.includes(s.type) && <div className="font-mono">{time}</div>}
                  {s.statut === 'brouillon' && <div className="text-[10px] italic">brouillon</div>}
                </button>
              );
            })}
            {apptsByDay(iso).map((a) => (
              <button
                key={`appt-${a.id}`}
                onClick={() => setApptDetail(a)}
                title="Voir le détail du rendez-vous"
                className={cn(
                  'rounded border border-accent/50 bg-accent/10 px-1.5 py-1 text-left text-[11px] leading-tight text-accent-hover transition-opacity hover:opacity-80',
                  a.status === 'pending' && 'border-dashed opacity-80',
                )}
              >
                <div className="flex items-center gap-1 font-semibold">
                  <CalendarClock size={11} className="shrink-0" />
                  <span className="truncate">RDV · {a.name}</span>
                </div>
                <div className="truncate text-[10px] opacity-80">{a.email}</div>
                <div className="font-mono">
                  {a.start}–{a.end}
                  {a.status === 'pending' && <span className="ml-1 italic">à confirmer</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
        );
      })}
    </div>
    {apptDetail && <AppointmentDetailModal appt={apptDetail} onClose={() => setApptDetail(null)} />}
    </>
  );
}
