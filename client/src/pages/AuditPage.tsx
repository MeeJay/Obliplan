import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { AuditEntry, AuditVerifyResult } from '@obliplan/shared';
import { auditApi } from '../api';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';
import { cn } from '../utils/cn';

/** Human FR labels for each emitted audit action - fallback = raw action code. */
const ACTION_LABELS: Record<string, string> = {
  'leave.decide': 'Validation congé',
  'overtime.decide': 'Validation heures sup',
  'user.create': 'Création salarié',
  'user.update': 'Modification salarié',
  'gdpr.anonymize': 'Anonymisation (RGPD)',
  'gdpr.export': 'Export de données (RGPD)',
  'planning.publish': 'Publication planning',
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS);

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function errMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

/** ISO timestamp → French short date + time (e.g. "01/07/2026 14:32"). */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Cible column - "user #12" (entity type + id), or "-" when none. */
function targetLabel(e: AuditEntry): string {
  if (!e.entityType) return '-';
  return e.entityId != null ? `${e.entityType} #${e.entityId}` : e.entityType;
}

/** Compact meta rendering - "decision: valide · week: 2026-W27". */
function metaLabel(meta: Record<string, unknown> | null): string {
  if (!meta) return '-';
  const parts = Object.entries(meta).map(
    ([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
  );
  return parts.length ? parts.join(' · ') : '-';
}

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('');

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    auditApi
      .list(action ? { action } : undefined)
      .then((rows) => setEntries(rows))
      .catch((err) => setError(errMsg(err, 'Impossible de charger le journal d’audit')))
      .finally(() => setLoading(false));
  }, [action]);

  useEffect(load, [load]);

  async function verify() {
    setVerifying(true);
    try {
      const result = await auditApi.verify();
      setVerifyResult(result);
      if (result.ok) toast.success('Chaîne intègre');
      else toast.error('Rupture détectée dans le journal');
    } catch (err) {
      toast.error(errMsg(err, 'Échec de la vérification'));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Journal d'audit</h2>
          <p className="text-sm text-text-muted">
            Trace inviolable des actions sensibles - chaînée par empreinte pour détecter toute altération.
          </p>
        </div>
        <Button variant="secondary" loading={verifying} onClick={verify}>
          <ShieldCheck size={16} className="mr-2" />
          Vérifier l'intégrité
        </Button>
      </div>

      {verifyResult && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-md border px-4 py-3 text-sm',
            verifyResult.ok
              ? 'border-status-up/40 bg-status-up/10 text-status-up'
              : 'border-status-down/40 bg-status-down/10 text-status-down',
          )}
        >
          {verifyResult.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>
            {verifyResult.ok
              ? `Chaîne intègre - ${verifyResult.checked} entrée${verifyResult.checked > 1 ? 's' : ''} vérifiée${
                  verifyResult.checked > 1 ? 's' : ''
                }`
              : `Rupture détectée à l'entrée #${verifyResult.firstBrokenId}`}
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium text-text-secondary">Entrées</span>
          <div className="w-56">
            <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filtrer par action">
              <option value="">Toutes les actions</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <Spinner className="h-40" />
          ) : error ? (
            <p className="text-sm text-status-down">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune entrée dans le journal.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-text-muted">
                    <th className="px-3 py-2 text-left font-medium">Date/heure</th>
                    <th className="px-3 py-2 text-left font-medium">Auteur</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-left font-medium">Cible</th>
                    <th className="px-3 py-2 text-left font-medium">Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-border hover:bg-bg-tertiary">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-text-muted">
                        {formatDateTime(e.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-text-primary">{e.actorName ?? '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{actionLabel(e.action)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-text-muted">{targetLabel(e)}</td>
                      <td className="px-3 py-2 text-text-muted">{metaLabel(e.meta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
