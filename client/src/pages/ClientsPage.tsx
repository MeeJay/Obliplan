import { useEffect, useState, type ChangeEvent } from 'react';
import toast from 'react-hot-toast';
import { ImagePlus } from 'lucide-react';
import type { Client } from '@obliplan/shared';
import { clientApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Spinner } from '../components/common/Spinner';

interface Draft {
  id?: number;
  name: string;
  color: string;
  contact: string;
  notes: string;
  archived: boolean;
  logo: string | null;
}

const EMPTY: Draft = { name: '', color: '#7c6cff', contact: '', notes: '', archived: false, logo: null };

/**
 * Reads an image File and returns a small base64 data-URI: the image is drawn onto a
 * canvas scaled so its longest side is ≤ `max` px, then exported as WebP (PNG fallback
 * when the browser can't encode WebP). Result is a few KB - safe to store in a text column.
 */
async function resizeImageToDataUrl(file: File, max = 96): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('decode'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0, w, h);
  let out = canvas.toDataURL('image/webp', 0.9);
  if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
  return out;
}

export function ClientsPage() {
  const can = useAuthStore((s) => s.can);
  const canManage = can('clients:manage');

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);

  function load() {
    setLoading(true);
    clientApi
      .list()
      .then(setClients)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function edit(c: Client) {
    setDraft({
      id: c.id,
      name: c.name,
      color: c.color ?? '#7c6cff',
      contact: c.contact ?? '',
      notes: c.notes ?? '',
      archived: c.archived,
      logo: c.logo ?? null,
    });
  }

  async function onPickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-picking the same file fires onChange again
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez choisir une image');
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file, 96);
      if (dataUrl.length > 200000) {
        toast.error('Image trop lourde, choisissez-en une plus légère');
        return;
      }
      setDraft((d) => (d ? { ...d, logo: dataUrl } : d));
    } catch {
      toast.error('Image illisible');
    }
  }

  async function save() {
    if (!draft) return;
    const payload = {
      name: draft.name,
      color: draft.color,
      contact: draft.contact || null,
      notes: draft.notes || null,
      archived: draft.archived,
      logo: draft.logo,
    };
    try {
      if (draft.id) await clientApi.update(draft.id, payload);
      else await clientApi.create(payload);
      toast.success('Client enregistré');
      setDraft(null);
      load();
    } catch {
      toast.error('Échec de l\'enregistrement');
    }
  }

  async function remove(id: number) {
    try {
      await clientApi.remove(id);
      toast.success('Client supprimé');
      load();
    } catch {
      toast.error('Suppression impossible');
    }
  }

  if (loading) return <Spinner className="h-40" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Clients</h2>
        {canManage && <Button onClick={() => setDraft({ ...EMPTY })}>Nouveau client</Button>}
      </div>

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-text-muted">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">Statut</th>
                {canManage && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border">
                  <td className="px-4 py-2 text-text-primary">
                    <span className="inline-flex items-center gap-2">
                      {c.logo ? (
                        <img
                          src={c.logo}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded border border-border object-cover"
                        />
                      ) : (
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-border"
                          style={{ background: c.color ?? 'transparent' }}
                        />
                      )}
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{c.contact || '-'}</td>
                  <td className="px-4 py-2">{c.archived ? 'Archivé' : 'Actif'}</td>
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
              {clients.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="px-4 py-6 text-center text-text-muted">
                    Aucun client. Créez-en un pour rattacher vos projets.
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
              {draft.id ? 'Modifier' : 'Nouveau'} client
            </h3>
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <Input
                  label="Nom"
                  className="flex-1"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-text-secondary">Couleur</label>
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    className="h-[38px] w-12 cursor-pointer rounded-md border border-border bg-bg-tertiary"
                    title="Couleur du client (visu projets)"
                  />
                </div>
              </div>
              <Input
                label="Contact (optionnel)"
                value={draft.contact}
                onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-text-secondary">Logo (optionnel)</label>
                <div className="flex items-center gap-3">
                  {draft.logo ? (
                    <img
                      src={draft.logo}
                      alt="Logo du client"
                      className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border text-base font-semibold text-white"
                      style={{ background: draft.color || '#7c6cff' }}
                    >
                      {(draft.name.trim()[0] || '?').toUpperCase()}
                    </span>
                  )}
                  <div className="flex flex-col items-start gap-1.5">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary hover:bg-bg-hover">
                      <ImagePlus size={14} />
                      {draft.logo ? 'Changer' : 'Importer une image'}
                      <input type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
                    </label>
                    {draft.logo && (
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, logo: null })}
                        className="text-xs text-status-down hover:underline"
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-text-muted">Redimensionné automatiquement (≤ 96 px).</p>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-text-secondary">Notes (optionnel)</label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.archived}
                  onChange={(e) => setDraft({ ...draft, archived: e.target.checked })}
                />
                Archivé (masqué des nouveaux projets)
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
