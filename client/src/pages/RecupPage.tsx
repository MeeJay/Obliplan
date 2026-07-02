import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { RecupMouvement, RecupSens } from '@obliplan/shared';
import { planningApi, recupApi, type UserWeekDTO, type RecupWeekPreview } from '../api';
import { mondayOfIso, todayIso, addDaysIso, minToHm } from '../utils/format';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
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

export function RecupPage() {
  const thisMonday = mondayOfIso(todayIso());
  const [team, setTeam] = useState<UserWeekDTO[]>([]);
  const [selected, setSelected] = useState<UserWeekDTO | null>(null);
  const [movements, setMovements] = useState<RecupMouvement[]>([]);
  const [soldeMin, setSoldeMin] = useState(0);
  const [loading, setLoading] = useState(true);

  // Week validation (auto-credit) panel.
  const [preview, setPreview] = useState<RecupWeekPreview | null>(null);
  const [validating, setValidating] = useState(false);
  const [selfService, setSelfService] = useState(false);

  // Attribution form (defaults to N+1).
  const [semaine, setSemaine] = useState(addDaysIso(thisMonday, 7));
  const [hours, setHours] = useState('1');
  const [sens, setSens] = useState<RecupSens>('credit');
  const [motif, setMotif] = useState('');

  useEffect(() => {
    planningApi
      .team(thisMonday)
      .then((rows) => {
        setTeam(rows);
        setSelected((cur) => cur ?? rows[0] ?? null);
      })
      .catch(() => toast.error('Échec du chargement de l’équipe'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMovements = useCallback((userId: number) => {
    recupApi
      .list(userId)
      .then((d) => {
        setMovements(d.movements);
        setSoldeMin(d.soldeMin);
      })
      .catch(() => {
        // Clear stale data so one user's movements are never shown under another's header.
        setMovements([]);
        setSoldeMin(0);
        toast.error('Échec du chargement des mouvements');
      });
  }, []);

  const loadPreview = useCallback(
    (userId: number) => {
      recupApi
        .weekPreview(userId, thisMonday)
        .then(setPreview)
        .catch(() => setPreview(null));
    },
    [thisMonday],
  );

  useEffect(() => {
    if (!selected) return;
    loadMovements(selected.user.id);
    loadPreview(selected.user.id);
    setSelfService(!!selected.user.recupSelfService);
  }, [selected, loadMovements, loadPreview]);

  async function validateWeek() {
    if (!selected) return;
    setValidating(true);
    try {
      const { soldeMin: updated } = await recupApi.validateWeek(selected.user.id, thisMonday);
      setSoldeMin(updated);
      toast.success('Semaine validée, récupération créditée');
      loadMovements(selected.user.id);
      loadPreview(selected.user.id);
    } catch {
      toast.error('Échec de la validation');
    } finally {
      setValidating(false);
    }
  }

  async function toggleSelfService() {
    if (!selected) return;
    const next = !selfService;
    setSelfService(next);
    try {
      await recupApi.setSelfService(selected.user.id, next);
      toast.success(next ? 'Accès self-service activé' : 'Accès self-service désactivé');
    } catch {
      setSelfService(!next);
      toast.error('Échec de la mise à jour');
    }
  }

  async function attribute() {
    if (!selected) return;
    const heuresMin = Math.round(parseFloat(hours) * 60);
    if (!heuresMin || heuresMin <= 0) {
      toast.error('Durée invalide');
      return;
    }
    try {
      await recupApi.create({ userId: selected.user.id, semaine, heuresMin, sens, motif: motif || null });
      toast.success('Récupération attribuée');
      setMotif('');
      loadMovements(selected.user.id);
    } catch {
      toast.error('Échec de l\'attribution');
    }
  }

  if (loading) return <Spinner className="h-40" />;

  if (team.length === 0) {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-semibold text-text-primary">Attribution de récupération</h2>
        <Card>
          <CardBody className="space-y-1 text-sm">
            <p className="text-text-secondary">Aucun salarié à afficher dans ce workspace.</p>
            <p className="text-text-muted">
              Vous êtes peut-être sur le workspace « par défaut » : basculez (sélecteur en haut à gauche) vers un
              workspace contenant des salariés (ex. la démo), ou créez des salariés dans « Salariés ». Un manager ne
              voit ici que les salariés qui lui sont rattachés (manager_id).
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-text-primary">Attribution de récupération</h2>
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Employee list */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <span className="text-sm font-medium text-text-secondary">Salariés</span>
          </CardHeader>
          <CardBody className="space-y-1">
            {team.map((row) => (
              <button
                key={row.user.id}
                onClick={() => setSelected(row)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                  selected?.user.id === row.user.id
                    ? 'bg-bg-active text-text-primary'
                    : 'text-text-secondary hover:bg-bg-hover'
                }`}
              >
                <span>{row.user.displayName || row.user.username}</span>
                {row.counter.recupEligibleMin > 0 && (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
                    +{minToHm(row.counter.recupEligibleMin)}
                  </span>
                )}
              </button>
            ))}
          </CardBody>
        </Card>

        {/* Detail + form */}
        {selected && (
          <div className="space-y-5 lg:col-span-2">
            {/* Week validation → idempotent auto-credit of eligible récup */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <span className="font-medium text-text-primary">Valider la semaine ({thisMonday})</span>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={selfService}
                    onChange={toggleSelfService}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  Accès self-service
                </label>
              </CardHeader>
              <CardBody className="space-y-3">
                {preview ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <div className="text-xs text-text-muted">Éligible cette semaine</div>
                        <div className="font-mono text-accent">{minToHm(preview.eligibleMin)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-muted">Solde actuel</div>
                        <div className={`font-mono ${preview.soldeMin < 0 ? 'text-status-down' : 'text-text-primary'}`}>
                          {minToHm(preview.soldeMin)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-text-muted">À créditer</div>
                        <div className="font-mono text-status-up">{minToHm(preview.eligibleMin)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-text-muted">Solde projeté</div>
                        <div className={`font-mono ${preview.negative ? 'text-status-down' : 'text-text-primary'}`}>
                          {minToHm(preview.projectedSoldeMin)}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-text-secondary">
                      {minToHm(preview.eligibleMin)} seront créditées sur le solde de récupération.
                    </p>
                    {preview.alreadyCreditedMin > 0 && (
                      <p className="text-xs text-text-muted">
                        Déjà crédité pour cette semaine : {minToHm(preview.alreadyCreditedMin)} - la validation remplace
                        ce crédit (idempotent).
                      </p>
                    )}
                    <Button
                      onClick={validateWeek}
                      loading={validating}
                      disabled={preview.eligibleMin <= 0 && preview.alreadyCreditedMin <= 0}
                    >
                      Valider & créditer
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-text-muted">Aucune récupération éligible pour cette semaine.</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <span className="font-medium text-text-primary">
                  {selected.user.displayName || selected.user.username}
                </span>
                <span className="font-mono text-sm text-accent">Solde : {minToHm(soldeMin)}</span>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Input label="Semaine (lundi)" type="date" value={semaine} onChange={(e) => setSemaine(e.target.value)} />
                  <Input label="Durée (heures)" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
                  <Select label="Sens" value={sens} onChange={(e) => setSens(e.target.value as RecupSens)}>
                    <option value="credit">Crédit (+)</option>
                    <option value="debit">Débit (−)</option>
                  </Select>
                  <div className="flex items-end">
                    <Button className="w-full" onClick={attribute}>
                      Attribuer
                    </Button>
                  </div>
                </div>
                <Input label="Motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Dépassement semaine N…" />
                {selected.counter.recupEligibleMin > 0 && (
                  <button
                    className="text-xs text-accent hover:underline"
                    onClick={() => setHours((selected.counter.recupEligibleMin / 60).toString())}
                  >
                    Pré-remplir avec la récup éligible de la semaine ({minToHm(selected.counter.recupEligibleMin)})
                  </button>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <span className="text-sm font-medium text-text-secondary">Mouvements</span>
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
        )}
      </div>
    </div>
  );
}
