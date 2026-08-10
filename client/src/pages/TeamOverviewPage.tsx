import { useEffect, useState } from 'react';
import { CalendarRange, Eye, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Shift, TeamOverviewDTO, TeamOverviewMember } from '@obliplan/shared';
import { planningApi, hourTypeApi, boardApi } from '../api';
import { addDaysIso, dayLabel, mondayOfIso, todayIso } from '../utils/format';
import { WeekNav } from '../components/planning/WeekNav';
import { SHIFT_META, TIMED_SHIFT_TYPES, type HourTypeLookup, type BoardLookup } from '../components/planning/shiftMeta';
import { shadeForProject } from '../components/planning/colorShade';
import { HolidayPill } from '../components/planning/HolidayPill';
import { Card } from '../components/common/Card';
import { Spinner } from '../components/common/Spinner';
import { cn } from '../utils/cn';
import { PlanningTeamFilter, rowVisible, effectiveTeams } from '../components/planning/PlanningTeamFilter';
import { buildTeamMeta, compareByTeam, teamLabelFor } from '../components/planning/teamOrder';

const VISIBLE_TEAMS_KEY = 'obliplan.planning.visibleTeams';

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

/**
 * Read-only "Vue équipe" - every employee sees who works when (validated shifts only).
 * Deliberately NON-interactive: no add button, no drag, no click-to-edit. Privacy: the DTO
 * carries times + type + hour-type only (server strips the free-text note, counters & flags).
 */
export function TeamOverviewPage() {
  const [monday, setMonday] = useState(() => mondayOfIso(todayIso()));
  const [data, setData] = useState<TeamOverviewDTO | null>(null);
  const [hourTypes, setHourTypes] = useState<HourTypeLookup>({});
  const [boards, setBoards] = useState<BoardLookup>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [visibleTeams, setVisibleTeams] = useState<Set<number>>(readVisibleTeams);
  const [teamMeta, setTeamMeta] = useState(() => buildTeamMeta([]));

  // Hour-type colours drive the chip colour (same approach as the editable rota); optional.
  useEffect(() => {
    hourTypeApi
      .list()
      .then((list) =>
        setHourTypes(Object.fromEntries(list.map((h) => [h.id, { libelle: h.libelle, color: h.color }]))),
      )
      .catch(() => setHourTypes({}));
    boardApi
      .list()
      .then((list) => setBoards(Object.fromEntries(list.map((b) => [b.id, { name: b.name }]))))
      .catch(() => setBoards({}));
    planningApi
      .teams()
      .then((teams) => setTeamMeta(buildTeamMeta(teams)))
      .catch(() => setTeamMeta(buildTeamMeta([])));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(false);
    planningApi
      .teamOverview(monday)
      .then(setData)
      .catch(() => {
        setError(true);
        toast.error("Impossible de charger le planning de l'équipe");
      })
      .finally(() => setLoading(false));
  }, [monday]);

  useEffect(() => localStorage.setItem(VISIBLE_TEAMS_KEY, JSON.stringify([...visibleTeams])), [visibleTeams]);

  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
  // Week-level public holidays (tenant-wide) - purely a visual day-marker, never blocks a shift.
  const holidays = data?.holidays ?? [];
  // Team planning is team-scoped: employees attached to no administrative team are excluded.
  const members = (data?.members ?? []).filter((m) => (m.teamIds ?? []).length > 0);
  const presentTeamIds = [...new Set(members.flatMap((m) => m.teamIds ?? []))];
  // Ignore any persisted team id not present here so a cross-page selection can't blank the table.
  const effTeams = effectiveTeams(visibleTeams, presentTeamIds, false);
  // One member row per employee, filtered by OR-visibility, sorted by team (weight, then name).
  const visibleMembers = members
    .filter((m) => rowVisible(m.teamIds ?? [], effTeams))
    .sort((a, b) =>
      compareByTeam(a.teamIds ?? [], a.displayName ?? a.username, b.teamIds ?? [], b.displayName ?? b.username, teamMeta),
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Planning de l'équipe</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
            <Eye size={13} />
            Lecture seule - créneaux validés uniquement
          </p>
        </div>
        <WeekNav monday={monday} onChange={setMonday} />
      </div>

      <PlanningTeamFilter
        presentTeamIds={presentTeamIds}
        hasNoTeam={false}
        value={visibleTeams}
        onChange={setVisibleTeams}
      />

      {loading ? (
        <Spinner className="h-40" />
      ) : error ? (
        <Card className="p-8 text-center text-sm text-text-secondary">
          Une erreur est survenue lors du chargement du planning de l'équipe.
        </Card>
      ) : members.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <CalendarRange size={28} className="text-text-muted" />
          <p className="text-sm text-text-secondary">Aucun collègue à afficher pour cette semaine.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-48 border-b border-r border-border bg-bg-secondary px-3 py-2 text-left text-xs font-medium text-text-muted">
                  Salarié
                </th>
                {days.map((iso) => {
                  // Header flags a férié for at least one displayed member (countries may differ);
                  // the precise per-member mark is on each cell.
                  const isHoliday =
                    visibleMembers.some((m) => (m.holidays ?? []).includes(iso)) || holidays.includes(iso);
                  return (
                    <th
                      key={iso}
                      className={cn(
                        'border-b border-border bg-bg-secondary px-2 py-2 text-center text-xs font-medium text-text-secondary',
                        isHoliday && 'bg-status-pending/10',
                      )}
                    >
                      <span className="block">{dayLabel(iso)}</span>
                      {isHoliday && <span className="mt-0.5 inline-flex justify-center"><HolidayPill /></span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((m) => (
                <tr key={m.userId}>
                  <th className="sticky left-0 z-10 border-b border-r border-border bg-bg-secondary px-3 py-2 text-left align-top">
                    <span className="block truncate text-sm font-medium text-text-primary">
                      {m.displayName || m.username}
                    </span>
                    {teamLabelFor(m.teamIds ?? [], teamMeta) && (
                      <span className="mt-0.5 block truncate text-[10px] uppercase tracking-wide text-text-muted">
                        {teamLabelFor(m.teamIds ?? [], teamMeta)}
                      </span>
                    )}
                  </th>
                  {days.map((iso) => {
                    const cellShifts = m.shifts.filter((s) => s.date === iso);
                    const cellAppts = (m.appointments ?? []).filter((a) => a.date === iso);
                    const cellHoliday = (m.holidays ?? []).includes(iso);
                    return (
                      <td
                        key={iso}
                        className={cn(
                          'h-[92px] border-b border-r border-border align-top',
                          cellHoliday && 'bg-status-pending/10',
                        )}
                      >
                        <div className="flex h-full flex-col gap-1 p-1">
                          {cellHoliday && (
                            <span className="rounded bg-status-pending/20 px-1 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-status-pending">
                              Férié
                            </span>
                          )}
                          {cellShifts.map((s) => (
                            <ReadOnlyShiftChip key={s.id} shift={s} hourTypes={hourTypes} boards={boards} />
                          ))}
                          {cellAppts.map((a) => (
                            <ReadOnlyApptChip key={`appt-${a.id}`} appt={a} />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Anonymised busy "Rendez-vous" chip for the overview: shows only the time band, NEVER the
 *  external booker's name/e-mail (this view is readable by every employee). */
function ReadOnlyApptChip({ appt }: { appt: TeamOverviewMember['appointments'][number] }) {
  return (
    <div
      title={`Rendez-vous · ${appt.start}-${appt.end}${appt.status === 'pending' ? ' · à confirmer' : ''}`}
      className={cn(
        'rounded border border-accent/50 bg-accent/10 px-1.5 py-0.5 text-left text-[11px] leading-tight text-accent-hover',
        appt.status === 'pending' && 'border-dashed opacity-80',
      )}
    >
      <div className="flex items-center gap-1">
        <CalendarClock size={10} className="shrink-0" />
        <span className="truncate font-medium">Rendez-vous</span>
      </div>
      <span className="mt-0.5 block font-mono text-[10px] opacity-80">
        {appt.start}–{appt.end}
      </span>
    </div>
  );
}

/** A non-interactive shift chip - reuses SHIFT_META + hour-type colours like WeekTable/RotaGrid, but no affordances. */
function ReadOnlyShiftChip({ shift, hourTypes, boards }: { shift: Shift; hourTypes: HourTypeLookup; boards: BoardLookup }) {
  const meta = SHIFT_META[shift.type];
  const timed = TIMED_SHIFT_TYPES.includes(shift.type);
  const time = shift.heureDebut && shift.heureFin ? `${shift.heureDebut}–${shift.heureFin}` : null;
  const ht = shift.hourTypeId != null ? hourTypes[shift.hourTypeId] : undefined;
  const board = shift.boardId != null ? boards[shift.boardId] : undefined;
  const colored = shadeForProject(ht?.color, shift.boardId);
  return (
    <div
      title={[meta.label, board?.name, time, ht?.libelle].filter(Boolean).join(' · ')}
      style={colored ? { backgroundColor: `${colored}22`, borderColor: colored, color: colored } : undefined}
      className={cn(
        'rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight',
        !colored && meta.cls, // hour-type colour wins over the default type colour
      )}
    >
      <div className="flex items-center justify-between gap-1">
        {/* Hour-type label + project name share the left side; the pair truncates so it never
            pushes the time out of the chip ("sans dépasser sur l'heure prévue"). */}
        <span className="min-w-0 truncate">
          <span className="font-medium">{ht?.libelle ?? meta.label}</span>
          {board && <span className="opacity-80"> · {board.name}</span>}
        </span>
        {timed && time && <span className="shrink-0 font-mono text-[10px]">{time}</span>}
      </div>
    </div>
  );
}
