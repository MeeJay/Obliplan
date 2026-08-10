import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Contrat } from '@obliplan/shared';
import { contratApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { minToHm, WEEKDAYS_FR } from '../utils/format';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Spinner } from '../components/common/Spinner';

interface Draft {
  id?: number;
  libelle: string;
  heuresHebdo: string; // hours
  heuresSupAutorisees: boolean;
  seuilHeures: string; // hours, '' = none
  alternance: boolean;
  /** ISO country code (drives which public holidays apply). */
  pays: string;
  /** Worked-public-holiday multiplier for heures sup (e.g. '1', '2'). */
  ferieCoeff: string;
  color: string;
  /** Custom per-day work pattern on (temps partiel / jours fixes) vs uniform base/5. */
  patternEnabled: boolean;
  /** 7 hour strings Lun..Dim (UI in hours, stored as minutes). */
  pattern: string[];
  /** FTE %, '' = none. */
  fte: string;
}

/** Countries offered in the contract form (extend as needed). */
const PAYS_OPTIONS: { code: string; label: string }[] = [
  { code: 'FR', label: 'France' },
  { code: 'MG', label: 'Madagascar' },
  { code: 'BE', label: 'Belgique' },
  { code: 'CH', label: 'Suisse' },
  { code: 'LU', label: 'Luxembourg' },
  { code: 'MA', label: 'Maroc' },
  { code: 'TN', label: 'Tunisie' },
  { code: 'SN', label: 'Sénégal' },
  { code: 'CI', label: "Côte d'Ivoire" },
];

const DEFAULT_PATTERN = ['7', '7', '7', '7', '7', '0', '0']; // 35h / 5j

const EMPTY: Draft = {
  libelle: '',
  heuresHebdo: '35',
  heuresSupAutorisees: false,
  seuilHeures: '',
  alternance: false,
  pays: 'FR',
  ferieCoeff: '1',
  color: '#7c6cff',
  patternEnabled: false,
  pattern: [...DEFAULT_PATTERN],
  fte: '',
};

/** Quick presets: 7 hour strings Lun..Dim + matching FTE %. */
const PATTERN_PRESETS: { label: string; pattern: string[]; fte: string }[] = [
  { label: '35h / 5j', pattern: ['7', '7', '7', '7', '7', '0', '0'], fte: '100' },
  { label: 'Temps plein 39h', pattern: ['7.8', '7.8', '7.8', '7.8', '7.8', '0', '0'], fte: '100' },
  { label: '80% / 4j (sans mercredi)', pattern: ['7', '7', '0', '7', '7', '0', '0'], fte: '80' },
];

const MIN_PER_DAY_MAX = 24 * 60;
const hoursToMin = (h: string): number => Math.min(MIN_PER_DAY_MAX, Math.max(0, Math.round((parseFloat(h) || 0) * 60)));

/** Compact per-day hours label, e.g. 468 → "7,8", 420 → "7". */
function hLabel(min: number): string {
  const h = min / 60;
  const s = Number.isInteger(h) ? h.toString() : h.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

export function ContratsPage() {
  const can = useAuthStore((s) => s.can);
  const canManage = can('contrats:manage');

  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);

  function load() {
    setLoading(true);
    contratApi
      .list()
      .then(setContrats)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function edit(c: Contrat) {
    const hasPattern = Array.isArray(c.workPattern);
    setDraft({
      id: c.id,
      libelle: c.libelle,
      heuresHebdo: (c.heuresHebdoBaseMin / 60).toString(),
      heuresSupAutorisees: c.heuresSupAutorisees,
      seuilHeures: c.seuilHeuresSupMin != null ? (c.seuilHeuresSupMin / 60).toString() : '',
      alternance: c.alternance,
      pays: c.pays ?? 'FR',
      ferieCoeff: (c.ferieWorkedCoeff ?? 1).toString(),
      color: c.color ?? '#7c6cff',
      patternEnabled: hasPattern,
      pattern: hasPattern ? c.workPattern!.map((m) => (m / 60).toString()) : [...DEFAULT_PATTERN],
      fte: c.ftePercent != null ? c.ftePercent.toString() : '',
    });
  }

  async function save() {
    if (!draft) return;
    const fteNum = parseInt(draft.fte, 10);
    const workPattern = draft.patternEnabled ? draft.pattern.map(hoursToMin) : null;
    const payload = {
      libelle: draft.libelle,
      // With a work pattern the weekly base = the pattern's sum (keeps base, list & calc consistent).
      heuresHebdoBaseMin: workPattern
        ? workPattern.reduce((s, m) => s + m, 0)
        : Math.round(parseFloat(draft.heuresHebdo) * 60),
      heuresSupAutorisees: draft.heuresSupAutorisees,
      seuilHeuresSupMin: draft.seuilHeures ? Math.round(parseFloat(draft.seuilHeures) * 60) : null,
      alternance: draft.alternance,
      pays: /^[A-Z]{2}$/.test(draft.pays) ? draft.pays : 'FR',
      ferieWorkedCoeff: Number.isFinite(parseFloat(draft.ferieCoeff)) ? Math.max(0, parseFloat(draft.ferieCoeff)) : 1,
      color: draft.color,
      workPattern,
      ftePercent: draft.patternEnabled && Number.isFinite(fteNum) ? Math.min(100, Math.max(0, fteNum)) : null,
    };
    try {
      if (draft.id) await contratApi.update(draft.id, payload);
      else await contratApi.create(payload);
      toast.success('Contrat enregistré');
      setDraft(null);
      load();
    } catch {
      toast.error('Échec de l\'enregistrement');
    }
  }

  async function remove(id: number) {
    try {
      await contratApi.remove(id);
      toast.success('Contrat supprimé');
      load();
    } catch {
      toast.error('Suppression impossible (contrat utilisé ?)');
    }
  }

  if (loading) return <Spinner className="h-40" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Contrats</h2>
        {canManage && <Button onClick={() => setDraft({ ...EMPTY })}>Nouveau contrat</Button>}
      </div>

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-text-muted">
              <tr>
                <th className="px-4 py-2">Libellé</th>
                <th className="px-4 py-2">Base/sem.</th>
                <th className="px-4 py-2">Répartition</th>
                <th className="px-4 py-2">Heures sup</th>
                <th className="px-4 py-2">Seuil</th>
                <th className="px-4 py-2">Alternance</th>
                <th className="px-4 py-2">Pays</th>
                {canManage && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {contrats.map((c) => (
                <tr key={c.id} className="border-b border-border">
                  <td className="px-4 py-2 text-text-primary">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-border"
                        style={{ background: c.color ?? 'transparent' }}
                      />
                      {c.libelle}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono">{minToHm(c.heuresHebdoBaseMin)}</td>
                  <td className="px-4 py-2">
                    {c.workPattern ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="font-mono text-xs text-text-secondary"
                          title="Lun · Mar · Mer · Jeu · Ven · Sam · Dim (heures/jour)"
                        >
                          {c.workPattern.map((m, i) => (
                            <span key={i} className={m > 0 ? '' : 'text-text-muted'}>
                              {i > 0 ? ' ' : ''}
                              {m > 0 ? hLabel(m) : '–'}
                            </span>
                          ))}
                        </span>
                        {c.ftePercent != null && (
                          <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary">
                            {c.ftePercent}%
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-text-muted">Uniforme</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{c.heuresSupAutorisees ? 'Oui' : 'Non (→ récup)'}</td>
                  <td className="px-4 py-2 font-mono">{c.seuilHeuresSupMin != null ? minToHm(c.seuilHeuresSupMin) : '-'}</td>
                  <td className="px-4 py-2">{c.alternance ? 'Oui' : 'Non'}</td>
                  <td className="px-4 py-2">
                    <span className="font-mono">{c.pays ?? 'FR'}</span>
                    {(c.ferieWorkedCoeff ?? 1) !== 1 && (
                      <span className="ml-1 text-xs text-text-muted">×{c.ferieWorkedCoeff}</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <button className="mr-3 text-accent hover:underline" onClick={() => edit(c)}>
                        Éditer
                      </button>
                      <button className="text-status-down hover:underline" onClick={() => remove(c.id)}>
                        Suppr.
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDraft(null)}>
          <div
            className="w-full max-w-md rounded-lg border border-border bg-bg-secondary p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              {draft.id ? 'Modifier' : 'Nouveau'} contrat
            </h3>
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <Input
                  label="Libellé"
                  className="flex-1"
                  value={draft.libelle}
                  onChange={(e) => setDraft({ ...draft, libelle: e.target.value })}
                />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-text-secondary">Couleur</label>
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    className="h-[38px] w-12 cursor-pointer rounded-md border border-border bg-bg-tertiary"
                    title="Couleur du contrat (visu planning)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Heures hebdo (base)"
                  type="number"
                  step="0.5"
                  value={draft.heuresHebdo}
                  onChange={(e) => setDraft({ ...draft, heuresHebdo: e.target.value })}
                />
                <Input
                  label="Seuil heures sup (optionnel)"
                  type="number"
                  step="0.5"
                  value={draft.seuilHeures}
                  onChange={(e) => setDraft({ ...draft, seuilHeures: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.heuresSupAutorisees}
                  onChange={(e) => setDraft({ ...draft, heuresSupAutorisees: e.target.checked })}
                />
                Heures sup autorisées (sinon dépassement → récupération)
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.alternance}
                  onChange={(e) => setDraft({ ...draft, alternance: e.target.checked })}
                />
                Alternance (jours d'école réduisent l'attendu)
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-text-secondary">Pays (jours fériés)</label>
                  <select
                    value={draft.pays}
                    onChange={(e) => setDraft({ ...draft, pays: e.target.value })}
                    className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
                  >
                    {PAYS_OPTIONS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label} ({p.code})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-text-muted">Seuls les jours fériés de ce pays s'appliquent.</p>
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-text-secondary">Coeff. férié travaillé</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={draft.ferieCoeff}
                    onChange={(e) => setDraft({ ...draft, ferieCoeff: e.target.value })}
                    className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
                  />
                  <p className="text-xs text-text-muted">Heures d'un férié travaillé × ce coeff en heures sup (1 = 1:1, 2 = +100%).</p>
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-border bg-bg-tertiary/40 p-3">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={draft.patternEnabled}
                    onChange={(e) => setDraft({ ...draft, patternEnabled: e.target.checked })}
                  />
                  Répartition par jour (temps partiel / jours fixes)
                </label>
                {draft.patternEnabled && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {PATTERN_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          className="rounded border border-border bg-bg-secondary px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                          onClick={() => setDraft({ ...draft, pattern: [...p.pattern], fte: p.fte })}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {WEEKDAYS_FR.map((wd, i) => (
                        <div key={wd} className="space-y-1">
                          <label className="block text-center text-[10px] uppercase text-text-muted">{wd}</label>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            max="24"
                            value={draft.pattern[i]}
                            onChange={(e) => {
                              const next = [...draft.pattern];
                              // Clamp to 0–24h so the box can't show a value that differs from what's saved.
                              const n = parseFloat(e.target.value);
                              next[i] = e.target.value === '' ? '' : String(Math.min(24, Math.max(0, n || 0)));
                              setDraft({ ...draft, pattern: next });
                            }}
                            className="w-full rounded-md border border-border bg-bg-tertiary px-1 py-1 text-center text-sm text-text-primary"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-text-muted">
                      <span>
                        Heures attendues par jour. Total :{' '}
                        <span className="font-mono text-text-secondary">
                          {minToHm(draft.pattern.reduce((s, h) => s + hoursToMin(h), 0))}
                        </span>
                      </span>
                      <label className="flex items-center gap-1.5 text-text-secondary">
                        FTE&nbsp;%
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={draft.fte}
                          onChange={(e) => setDraft({ ...draft, fte: e.target.value })}
                          className="w-16 rounded-md border border-border bg-bg-tertiary px-2 py-1 text-text-primary"
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Annuler
              </Button>
              <Button onClick={save}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
