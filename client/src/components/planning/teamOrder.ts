import type { PlanningTeamRef } from '@obliplan/shared';

/**
 * Default ordering + labelling of planning rows by administrative team.
 *
 * A person can belong to several teams; their "primary" team (the one that drives
 * their sort position and the small label shown on the left) is the team with the
 * LOWEST weight, ties broken by team name. Rows keep a single line each — this is a
 * sort + micro-label, NOT a grouped layout with section headers.
 */

export type TeamMetaMap = Map<number, PlanningTeamRef>;

export function buildTeamMeta(teams: PlanningTeamRef[]): TeamMetaMap {
  return new Map(teams.map((t) => [t.id, t]));
}

/** The primary (lowest-weight, then name) team among `teamIds`, or null if none. */
export function primaryTeam(teamIds: number[], byId: TeamMetaMap): PlanningTeamRef | null {
  let best: PlanningTeamRef | null = null;
  for (const id of teamIds) {
    const t = byId.get(id);
    if (!t) continue;
    if (
      !best ||
      t.weight < best.weight ||
      (t.weight === best.weight && t.name.localeCompare(best.name, 'fr', { sensitivity: 'base' }) < 0)
    ) {
      best = t;
    }
  }
  return best;
}

/** Label to show on the left of a row: its primary team's name (or null if team-less). */
export function teamLabelFor(teamIds: number[], byId: TeamMetaMap): string | null {
  return primaryTeam(teamIds, byId)?.name ?? null;
}

/**
 * Comparator ordering rows by primary team (weight, then name), then by person name.
 * Team-less rows sort last (in practice they are filtered out of the team views first).
 */
export function compareByTeam(
  aTeamIds: number[],
  aName: string,
  bTeamIds: number[],
  bName: string,
  byId: TeamMetaMap,
): number {
  const ta = primaryTeam(aTeamIds, byId);
  const tb = primaryTeam(bTeamIds, byId);
  if (ta && tb) {
    if (ta.weight !== tb.weight) return ta.weight - tb.weight;
    const byTeamName = ta.name.localeCompare(tb.name, 'fr', { sensitivity: 'base' });
    if (byTeamName !== 0) return byTeamName;
  } else if (ta && !tb) {
    return -1;
  } else if (!ta && tb) {
    return 1;
  }
  return aName.localeCompare(bName, 'fr', { sensitivity: 'base' });
}
