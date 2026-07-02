import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CopyPlus } from 'lucide-react';
import type { Shift } from '@obliplan/shared';
import { PlanningTabs } from '../components/planning/PlanningTabs';
import { planningApi, contratApi, hourTypeApi, boardApi, type UserWeekDTO } from '../api';
import { useAuthStore } from '../store/authStore';
import { mondayOfIso, todayIso, addDaysIso, minToHm, minToSignedHm } from '../utils/format';
import { WeekNav } from '../components/planning/WeekNav';
import { WeekTable } from '../components/planning/WeekTable';
import { ComplianceFlags } from '../components/planning/ComplianceFlags';
import { ShiftTemplatesManager } from '../components/planning/ShiftTemplatesManager';
import type { HourTypeLookup, BoardLookup } from '../components/planning/shiftMeta';
import { ShiftEditor } from '../components/planning/ShiftEditor';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { PlanningTeamFilter, rowVisible, effectiveTeams } from '../components/planning/PlanningTeamFilter';

interface EditorState {
  userId: number;
  date: string;
  shift?: Shift | null;
}

interface ContratInfo {
  color: string | null;
  libelle: string;
}

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

export function TeamPage() {
  const [monday, setMonday] = useState(() => mondayOfIso(todayIso()));
  const [rows, setRows] = useState<UserWeekDTO[]>([]);
  const [contrats, setContrats] = useState<Record<number, ContratInfo>>({});
  const [hourTypes, setHourTypes] = useState<HourTypeLookup>({});
  const [boards, setBoards] = useState<BoardLookup>({});
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [visibleTeams, setVisibleTeams] = useState<Set<number>>(readVisibleTeams);
  const canWrite = useAuthStore((s) => s.can('planning:write'));

  const presentTeamIds = [...new Set(rows.flatMap((r) => r.teamIds ?? []))];
  const hasNoTeam = rows.some((r) => (r.teamIds ?? []).length === 0);
  // Ignore any persisted team id not present here so a cross-page selection can't blank the list.
  const effTeams = effectiveTeams(visibleTeams, presentTeamIds, hasNoTeam);
  // One row per employee, filtered by OR-visibility (never duplicated per team).
  const visibleRows = rows.filter((r) => rowVisible(r.teamIds ?? [], effTeams));

  const load = useCallback(() => {
    setLoading(true);
    planningApi
      .team(monday)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [monday]);

  async function duplicatePrevWeek() {
    // Act on what you see: only the currently visible teams' employees.
    if (visibleRows.length === 0) return;
    setDuplicating(true);
    try {
      const { count } = await planningApi.copyWeek(addDaysIso(monday, -7), monday, visibleRows.map((r) => r.user.id));
      toast.success(count > 0 ? `${count} créneau(x) dupliqué(s) en brouillon` : 'Aucun créneau à dupliquer');
      load();
    } catch {
      toast.error('Échec de la duplication');
    } finally {
      setDuplicating(false);
    }
  }

  useEffect(load, [load]);

  useEffect(() => localStorage.setItem(VISIBLE_TEAMS_KEY, JSON.stringify([...visibleTeams])), [visibleTeams]);

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
  }, []);

  return (
    <div className="space-y-5">
      <PlanningTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text-primary">Planning de l'équipe</h2>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <Button variant="secondary" onClick={duplicatePrevWeek} loading={duplicating} disabled={visibleRows.length === 0}>
              <CopyPlus size={15} /> Dupliquer la semaine préc.
            </Button>
          )}
          <WeekNav monday={monday} onChange={setMonday} />
        </div>
      </div>

      <PlanningTeamFilter
        presentTeamIds={presentTeamIds}
        hasNoTeam={hasNoTeam}
        value={visibleTeams}
        onChange={setVisibleTeams}
      />

      {canWrite && <ShiftTemplatesManager />}

      {loading ? (
        <Spinner className="h-40" />
      ) : rows.length === 0 ? (
        <p className="text-text-secondary">Aucun salarié rattaché.</p>
      ) : (
        visibleRows.map((row) => {
          const ci = row.user.contratId ? contrats[row.user.contratId] : undefined;
          return (
          <Card key={row.user.id}>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className="h-4 w-1.5 shrink-0 rounded-full"
                  style={{ background: ci?.color ?? 'rgb(var(--c-border-light))' }}
                />
                <span className="font-medium text-text-primary">{row.user.displayName || row.user.username}</span>
                {ci && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: ci.color ? `${ci.color}22` : 'rgb(var(--c-bg-tertiary))',
                      color: ci.color ?? 'rgb(var(--c-text-muted))',
                    }}
                  >
                    {ci.libelle}
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                <span className="text-text-secondary">
                  {minToHm(row.counter.realiseMin)} / {minToHm(row.counter.attenduMin)}
                </span>
                <span className={row.counter.ecartMin >= 0 ? 'text-status-up' : 'text-status-down'}>
                  {minToSignedHm(row.counter.ecartMin)}
                </span>
                {row.counter.heuresSupMin > 0 && (
                  <span className="rounded bg-status-pending/15 px-1.5 py-0.5 text-status-pending">
                    sup {minToHm(row.counter.heuresSupMin)}
                  </span>
                )}
                {row.counter.recupEligibleMin > 0 && (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                    récup {minToHm(row.counter.recupEligibleMin)}
                  </span>
                )}
                <span className="text-text-muted">solde {minToHm(row.recupSoldeMin)}</span>
              </div>
            </CardHeader>
            <CardBody className="space-y-2">
              <ComplianceFlags flags={row.flags} />
              <WeekTable
                monday={monday}
                shifts={row.shifts}
                editable
                hourTypes={hourTypes}
                boards={boards}
                holidays={rows[0]?.holidays ?? []}
                onAdd={(date) => setEditor({ userId: row.user.id, date })}
                onEdit={(shift) => setEditor({ userId: row.user.id, date: shift.date, shift })}
              />
            </CardBody>
          </Card>
          );
        })
      )}

      {editor && (
        <ShiftEditor
          userId={editor.userId}
          date={editor.date}
          shift={editor.shift}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
