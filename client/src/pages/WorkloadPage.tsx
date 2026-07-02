import { useEffect, useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import type { WorkloadRow } from '@obliplan/shared';
import { PlanningTabs } from '../components/planning/PlanningTabs';
import { reportApi } from '../api';
import { Card, CardBody, CardHeader } from '../components/common/Card';
import { Spinner } from '../components/common/Spinner';
import { UserAvatar } from '../components/common/UserAvatar';
import { minToHm } from '../utils/format';

/** Load ratio (assigned / capacity); over-capacity or no-capacity-with-work → >1. */
function loadRatio(row: WorkloadRow): number {
  if (row.capacityMin > 0) return row.assignedMin / row.capacityMin;
  return row.assignedMin > 0 ? Infinity : 0;
}

/** Bar + text colour by load: green (ok) → amber (near full) → red (over). */
function loadTone(ratio: number): { bar: string; text: string } {
  if (ratio > 1) return { bar: 'bg-status-down', text: 'text-status-down' };
  if (ratio >= 0.9) return { bar: 'bg-status-pending', text: 'text-status-pending' };
  return { bar: 'bg-status-up', text: 'text-status-up' };
}

/** Finite sort key so two ∞-ratio rows (capacity 0 + work) don't produce NaN in the comparator. */
function sortKey(row: WorkloadRow): number {
  const r = loadRatio(row);
  return Number.isFinite(r) ? r : Number.MAX_SAFE_INTEGER;
}

export function WorkloadPage() {
  const [rows, setRows] = useState<WorkloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    reportApi
      .workload()
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setError(false);
      })
      .catch(() => {
        if (!alive) return;
        setRows([]);
        setError(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Most-loaded first (finite key avoids NaN when several rows have no capacity).
  const sorted = useMemo(() => [...rows].sort((a, b) => sortKey(b) - sortKey(a)), [rows]);

  return (
    <div className="space-y-5">
      <PlanningTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
          <Gauge size={20} className="text-accent" /> Charge de l'équipe
        </h2>
      </div>

      <p className="max-w-3xl text-sm text-text-secondary">
        Travail actif assigné (somme des estimations des cartes non terminées) comparé à la capacité hebdomadaire
        de chaque salarié - heures de base du contrat, diminuées des congés validés cette semaine.
      </p>

      {loading ? (
        <Spinner className="h-40" />
      ) : error ? (
        <p className="text-status-down">Impossible de charger la charge de l'équipe. Réessayez plus tard.</p>
      ) : sorted.length === 0 ? (
        <p className="text-text-secondary">Aucun salarié à afficher.</p>
      ) : (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">{sorted.length} salarié(s)</span>
            <span className="font-mono text-xs text-text-muted">charge / capacité</span>
          </CardHeader>
          <CardBody className="space-y-4">
            {sorted.map((row) => {
              const ratio = loadRatio(row);
              const tone = loadTone(ratio);
              const fillPct = Math.min(Number.isFinite(ratio) ? ratio : 1, 1) * 100;
              // Never round an under-capacity load up to "100%" (would clash with the amber tone).
              const pctLabel =
                row.capacityMin > 0 ? `${ratio >= 1 ? Math.round(ratio * 100) : Math.min(99, Math.round(ratio * 100))}%` : '-';
              return (
                <div key={row.userId} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <UserAvatar username={row.userName} size={24} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                      {row.userName}
                    </span>
                    <span className={`font-mono text-xs font-medium ${tone.text}`}>{pctLabel}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                    <div
                      className={`h-full rounded-full transition-all ${tone.bar}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-text-muted">
                    <span className="font-mono text-text-secondary">
                      {minToHm(row.assignedMin)} / {minToHm(row.capacityMin)}
                    </span>
                    <span>
                      {row.cardCount} carte(s)
                      {row.overCount > 0 && (
                        <span className="ml-1 text-text-muted"> ({row.overCount} sans estimation)</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
