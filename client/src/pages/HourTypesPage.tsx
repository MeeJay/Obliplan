import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { HourType } from '@obliplan/shared';
import { hourTypeApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Spinner } from '../components/common/Spinner';

interface Draft {
  id?: number;
  libelle: string;
  code: string;
  color: string;
  isActive: boolean;
}

const EMPTY: Draft = { libelle: '', code: '', color: '#7c6cff', isActive: true };

export function HourTypesPage() {
  const can = useAuthStore((s) => s.can);
  const canManage = can('hourtypes:manage');

  const [types, setTypes] = useState<HourType[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);

  function load() {
    setLoading(true);
    hourTypeApi
      .list()
      .then(setTypes)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function edit(t: HourType) {
    setDraft({
      id: t.id,
      libelle: t.libelle,
      code: t.code ?? '',
      color: t.color ?? '#7c6cff',
      isActive: t.isActive,
    });
  }

  async function save() {
    if (!draft) return;
    const payload = {
      libelle: draft.libelle,
      code: draft.code || null,
      color: draft.color,
      isActive: draft.isActive,
    };
    try {
      if (draft.id) await hourTypeApi.update(draft.id, payload);
      else await hourTypeApi.create(payload);
      toast.success("Type d'heure enregistré");
      setDraft(null);
      load();
    } catch {
      toast.error("Échec de l'enregistrement");
    }
  }

  async function remove(id: number) {
    try {
      await hourTypeApi.remove(id);
      toast.success('Type supprimé');
      load();
    } catch {
      toast.error('Suppression impossible (type utilisé ?)');
    }
  }

  if (loading) return <Spinner className="h-40" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Types d'heures</h2>
        {canManage && <Button onClick={() => setDraft({ ...EMPTY })}>Nouveau type</Button>}
      </div>

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-text-muted">
              <tr>
                <th className="px-4 py-2">Libellé</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Actif</th>
                {canManage && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-b border-border">
                  <td className="px-4 py-2 text-text-primary">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-border"
                        style={{ background: t.color ?? 'transparent' }}
                      />
                      {t.libelle}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-text-secondary">{t.code ?? '-'}</td>
                  <td className="px-4 py-2">{t.isActive ? 'Oui' : 'Non'}</td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <button className="mr-3 text-accent hover:underline" onClick={() => edit(t)}>
                        Éditer
                      </button>
                      <button className="text-status-down hover:underline" onClick={() => remove(t.id)}>
                        Suppr.
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {types.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-text-muted" colSpan={canManage ? 4 : 3}>
                    Aucun type d'heure défini.
                  </td>
                </tr>
              )}
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
              {draft.id ? 'Modifier' : 'Nouveau'} type d'heure
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
                    title="Couleur du type (visu planning)"
                  />
                </div>
              </div>
              <Input
                label="Code (optionnel)"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="FRONT, BACK, PAUSE…"
              />
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                />
                Actif
              </label>
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
