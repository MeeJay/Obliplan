import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BookmarkPlus, ChevronDown, Trash2 } from 'lucide-react';
import type { PlanningView } from '@obliplan/shared';
import { planningApi, planningViewApi } from '../../api';
import { cn } from '../../utils/cn';

/** localStorage key holding the last-used per-team visibility selection (JSON array of team ids; 0 = "Sans équipe"). */
export const VISIBLE_TEAMS_KEY = 'obliplan.planning.visibleTeams';

/**
 * Read the persisted visibility selection. Parents may use this to seed their `visibleTeams`
 * state so a reload restores the last filter (e.g. `useState(() => readVisibleTeams())`).
 */
export function readVisibleTeams(): Set<number | 0> {
  try {
    const raw = localStorage.getItem(VISIBLE_TEAMS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is number => typeof n === 'number'));
  } catch {
    return new Set();
  }
}

function writeVisibleTeams(value: Set<number | 0>): void {
  try {
    localStorage.setItem(VISIBLE_TEAMS_KEY, JSON.stringify([...value]));
  } catch {
    /* ignore quota / serialization failures - persistence is best-effort */
  }
}

/**
 * Pure visibility test for a planning row, given the currently visible team set.
 * An empty set means "no filter" (everyone is shown). `0` is the "Sans équipe" pseudo-team.
 * A row is visible if the set is empty, OR it shares at least one team with the set,
 * OR it belongs to no team and "Sans équipe" (0) is selected.
 */
export function rowVisible(teamIds: number[], value: Set<number | 0>): boolean {
  if (value.size === 0) return true;
  if (teamIds.length === 0) return value.has(0);
  return teamIds.some((id) => value.has(id));
}

/**
 * Drop selected ids that aren't present on THIS page's rows (a saved/persisted selection is
 * shared across pages+weeks, so it can hold a team absent here - which would otherwise blank
 * the grid). If nothing selected remains present, the result is empty = "show all" (auto-recover).
 */
export function effectiveTeams(value: Set<number | 0>, presentTeamIds: number[], hasNoTeam: boolean): Set<number | 0> {
  const present = new Set<number>(presentTeamIds);
  const eff = new Set<number | 0>();
  for (const id of value) {
    if (id === 0 ? hasNoTeam : present.has(id)) eff.add(id);
  }
  return eff;
}

interface PlanningTeamFilterProps {
  /** Union of every team id present across the rendered rows (deduped). Only these chips are shown. */
  presentTeamIds: number[];
  /** Whether at least one rendered row belongs to no team (adds the "Sans équipe" chip). */
  hasNoTeam: boolean;
  /** Currently visible team ids (0 = "Sans équipe"). Empty = show everyone. */
  value: Set<number | 0>;
  onChange: (next: Set<number | 0>) => void;
}

const chipCls = (active: boolean) =>
  cn(
    'rounded border px-2 py-1 text-xs transition-colors',
    active
      ? 'border-accent bg-accent/10 text-text-primary'
      : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary',
  );

/**
 * Chip row to show/hide plannings by Axis-C team, with named saved "vues" (presets of visible team ids).
 * Controlled: the parent owns the `value` Set and derives visible rows via `rowVisible`.
 * The active selection is mirrored to localStorage so the last filter can be restored on reload.
 */
export function PlanningTeamFilter({ presentTeamIds, hasNoTeam, value, onChange }: PlanningTeamFilterProps) {
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
  const [views, setViews] = useState<PlanningView[]>([]);
  const [viewsLoaded, setViewsLoaded] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hydratedRef = useRef(false);

  // Fetch team names once (chips fall back to "Équipe #id" until they arrive).
  useEffect(() => {
    let alive = true;
    planningApi
      .teams()
      .then((teams) => {
        if (alive) setTeamNames(Object.fromEntries(teams.map((t) => [t.id, t.name])));
      })
      .catch(() => {
        /* names are cosmetic - filtering still works by id */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Restore the last-used selection once, only when the parent starts with no selection.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const persisted = readVisibleTeams();
    if (persisted.size > 0 && value.size === 0) onChange(persisted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the active selection to localStorage whenever it changes.
  useEffect(() => {
    writeVisibleTeams(value);
  }, [value]);

  // Load saved views the first time the dropdown is opened.
  useEffect(() => {
    if (viewsOpen && !viewsLoaded) void refreshViews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewsOpen]);

  // Close the "Vues" dropdown on outside click.
  useEffect(() => {
    if (!viewsOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setViewsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [viewsOpen]);

  async function refreshViews() {
    try {
      const list = await planningViewApi.list();
      setViews(list);
    } catch {
      /* keep whatever we had; the list simply stays empty on first failure */
    } finally {
      setViewsLoaded(true);
    }
  }

  function teamLabel(id: number): string {
    return teamNames[id] ?? `Équipe #${id}`;
  }

  function toggle(id: number | 0) {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function reset() {
    onChange(new Set());
  }

  function applyView(view: PlanningView) {
    // [] in a view means "all teams" -> empty selection -> no filter.
    onChange(new Set(view.teamIds));
    setViewsOpen(false);
  }

  async function saveView() {
    const name = window.prompt('Sous quel nom souhaitez-vous enregistrer cette vue ?')?.trim();
    if (!name) return;
    // "Sans équipe" (0) is a display pseudo-team, not a real user_teams id, so it is not persisted.
    const teamIds = [...value].filter((id): id is number => id !== 0);
    // A view stores only real team ids; a selection of ONLY "Sans équipe" would persist as [] which
    // means "toutes les équipes" on apply - the opposite of what's on screen. Block that case.
    if (teamIds.length === 0 && value.size > 0) {
      toast('La catégorie « Sans équipe » ne peut pas être enregistrée seule dans une vue.');
      return;
    }
    setBusy(true);
    try {
      await planningViewApi.create({ name, teamIds });
      await refreshViews();
      toast.success('Votre vue a été enregistrée.');
    } catch {
      toast.error("Votre vue n'a pas pu être enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteView(id: number) {
    setBusy(true);
    try {
      await planningViewApi.remove(id);
      await refreshViews();
      toast.success('La vue a été supprimée.');
    } catch {
      toast.error("La vue n'a pas pu être supprimée.");
    } finally {
      setBusy(false);
    }
  }

  // Nothing meaningful to filter unless at least one REAL team is present among the rows.
  // (A lone "Sans équipe" chip can never hide anyone, so we hide the whole control.)
  if (presentTeamIds.length === 0) return null;

  // Present teams, sorted by display name for a stable order.
  const sortedTeamIds = [...presentTeamIds].sort((a, b) =>
    teamLabel(a).localeCompare(teamLabel(b), 'fr', { sensitivity: 'base' }),
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs text-text-muted">Équipes :</span>
      <div className="flex flex-wrap items-center gap-1">
        {sortedTeamIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            aria-pressed={value.has(id)}
            className={chipCls(value.has(id))}
          >
            {teamLabel(id)}
          </button>
        ))}
        {hasNoTeam && (
          <button
            key="no-team"
            type="button"
            onClick={() => toggle(0)}
            aria-pressed={value.has(0)}
            className={chipCls(value.has(0))}
            title="Salariés rattachés à aucune équipe"
          >
            Sans équipe
          </button>
        )}
        {value.size > 0 && (
          <button
            type="button"
            onClick={reset}
            className="rounded border border-transparent px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            Tout afficher
          </button>
        )}
      </div>

      {/* "Vues" - saved presets of visible teams (per utilisateur). */}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setViewsOpen((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors',
            'border-border bg-bg-secondary text-text-secondary hover:text-text-primary',
          )}
        >
          Vues
          <ChevronDown size={12} className={cn('transition-transform', viewsOpen && 'rotate-180')} />
        </button>

        {viewsOpen && (
          <div
            ref={panelRef}
            className="absolute left-0 top-8 z-50 w-64 overflow-hidden rounded-lg border border-border bg-bg-secondary shadow-2xl"
          >
            <div className="max-h-56 overflow-y-auto py-1">
              {!viewsLoaded ? (
                <p className="px-3 py-2 text-xs text-text-muted">Chargement de vos vues...</p>
              ) : views.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted">Vous n'avez pas encore de vue enregistrée.</p>
              ) : (
                views.map((view) => (
                  <div
                    key={view.id}
                    className="flex items-center justify-between gap-2 px-1 hover:bg-bg-hover"
                  >
                    <button
                      type="button"
                      onClick={() => applyView(view)}
                      className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm text-text-primary"
                      title={`Appliquer la vue « ${view.name} »`}
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteView(view.id)}
                      disabled={busy}
                      className="shrink-0 rounded p-1.5 text-text-muted transition-colors hover:text-status-down disabled:opacity-50"
                      title="Supprimer cette vue"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() => void saveView()}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover disabled:opacity-50"
              >
                <BookmarkPlus size={14} className="shrink-0 text-text-muted" />
                Enregistrer la vue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
