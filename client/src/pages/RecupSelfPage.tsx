import { useEffect, useState } from 'react';
import type { RecupMouvement } from '@obliplan/shared';
import { recupApi } from '../api';
import { minToHm } from '../utils/format';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Spinner } from '../components/common/Spinner';

const SOURCE_LABELS: Record<string, string> = {
  overtime: 'Heures sup',
  eligible: 'Validation semaine',
  'recup-shift': 'Récup planning',
  manual: 'Manuel',
};

/** Human label for a movement's provenance (null/unknown → manual attribution). */
function sourceLabel(source: string | null | undefined): string {
  return (source && SOURCE_LABELS[source]) || 'Manuel';
}

export function RecupSelfPage() {
  const [movements, setMovements] = useState<RecupMouvement[]>([]);
  const [soldeMin, setSoldeMin] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    recupApi
      .list()
      .then((d) => {
        setMovements(d.movements);
        setSoldeMin(d.soldeMin);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner className="h-40" />;

  if (error) {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-semibold text-text-primary">Ma récupération</h2>
        <Card>
          <CardBody>
            <p className="text-sm text-status-down">
              Impossible de charger vos mouvements de récupération. Réessayez plus tard.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-text-primary">Ma récupération</h2>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">Solde courant</span>
          <span className={`font-mono text-lg ${soldeMin < 0 ? 'text-status-down' : 'text-accent'}`}>
            {minToHm(soldeMin)}
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text-muted">
            Le solde est la somme de vos crédits (heures gagnées) moins vos débits (heures récupérées). Seul votre
            manager peut attribuer ou ajuster ces mouvements.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Historique des mouvements</span>
        </CardHeader>
        <CardBody>
          {movements.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun mouvement.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-text-muted">
                <tr>
                  <th className="py-1">Semaine</th>
                  <th>Sens</th>
                  <th>Durée</th>
                  <th>Source</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-1.5 font-mono">{m.semaine}</td>
                    <td className={m.sens === 'credit' ? 'text-status-up' : 'text-status-down'}>
                      {m.sens === 'credit' ? 'Crédit' : 'Débit'}
                    </td>
                    <td className="font-mono">{minToHm(m.heuresMin)}</td>
                    <td>
                      <span className="rounded bg-bg-hover px-1.5 py-0.5 text-xs text-text-secondary">
                        {sourceLabel(m.source)}
                      </span>
                    </td>
                    <td className="text-text-secondary">{m.motif}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
