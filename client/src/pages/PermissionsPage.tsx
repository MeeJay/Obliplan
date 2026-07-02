import { Fragment, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Plus, Trash2, Shield } from 'lucide-react';
import type { PermissionSet, CapabilityDef } from '@obliplan/shared';
import { permissionSetApi } from '../api';
import { Card, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Spinner } from '../components/common/Spinner';

export function PermissionsPage() {
  const [sets, setSets] = useState<PermissionSet[]>([]);
  const [caps, setCaps] = useState<CapabilityDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  function load() {
    Promise.all([permissionSetApi.list(), permissionSetApi.capabilities()])
      .then(([s, c]) => {
        setSets(s);
        setCaps(c);
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function toggle(set: PermissionSet, capKey: string) {
    const has = set.capabilities.includes(capKey);
    const next = has ? set.capabilities.filter((c) => c !== capKey) : [...set.capabilities, capKey];
    // optimistic
    setSets((list) => list.map((s) => (s.id === set.id ? { ...s, capabilities: next } : s)));
    try {
      await permissionSetApi.update(set.id, { capabilities: next });
    } catch {
      toast.error('Échec de la mise à jour');
      load();
    }
  }

  async function createSet() {
    if (!newName.trim()) return;
    try {
      await permissionSetApi.create({ name: newName.trim(), capabilities: [] });
      setNewName('');
      load();
      toast.success('Set créé');
    } catch {
      toast.error('Échec de la création');
    }
  }

  async function removeSet(id: number) {
    try {
      await permissionSetApi.remove(id);
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Suppression impossible');
    }
  }

  if (loading) return <Spinner className="h-40" />;

  // Group capabilities for readable rows.
  const groups = Array.from(new Set(caps.map((c) => c.group)));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Permissions</h2>
        <p className="mt-1 text-sm text-text-muted">
          Matrice capacités × jeux de permissions. Obligate (ou l'admin) attribue un jeu par groupe/tenant ;
          le jeu définit ce que l'utilisateur peut faire. Le rôle <span className="font-mono">admin</span> a toutes les capacités.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Nouveau jeu de permissions" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-xs" />
        <Button onClick={createSet}>
          <Plus size={14} className="mr-1" /> Créer
        </Button>
      </div>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Capacité</th>
                {sets.map((s) => (
                  <th key={s.id} className="px-3 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="flex items-center gap-1 font-medium text-text-primary">
                        {s.isDefault && <Shield size={12} className="text-accent" />}
                        {s.name}
                      </span>
                      <span className="font-mono text-[10px] text-text-muted">{s.slug}</span>
                      {!s.isDefault && (
                        <button onClick={() => removeSet(s.id)} className="text-text-muted hover:text-status-down" title="Supprimer">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr className="bg-bg-tertiary">
                    <td colSpan={sets.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      {g}
                    </td>
                  </tr>
                  {caps
                    .filter((c) => c.group === g)
                    .map((c) => (
                      <tr key={c.key} className="border-b border-border">
                        <td className="px-4 py-2 text-text-secondary">{c.label}</td>
                        {sets.map((s) => {
                          const on = s.capabilities.includes(c.key);
                          return (
                            <td key={s.id} className="px-3 py-2 text-center">
                              <button
                                onClick={() => toggle(s, c.key)}
                                className={`inline-flex h-5 w-5 items-center justify-center rounded border ${
                                  on ? 'border-accent bg-accent/20 text-accent' : 'border-border text-transparent hover:border-accent/50'
                                }`}
                                title={on ? 'Activé' : 'Désactivé'}
                              >
                                <Check size={13} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
