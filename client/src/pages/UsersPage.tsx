import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { User, Contrat, UserRole, PermissionSet } from '@obliplan/shared';
import { userApi, contratApi, authApi, permissionSetApi, gdprApi, downloadJson } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface Draft {
  username: string;
  password: string;
  displayName: string;
  email: string;
  role: string;
  contratId: string;
  managerId: string;
}
const EMPTY: Draft = { username: '', password: '', displayName: '', email: '', role: 'employe', contratId: '', managerId: '' };

export function UsersPage() {
  const can = useAuthStore((s) => s.can);
  const canManage = can('users:manage');
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [users, setUsers] = useState<User[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [roles, setRoles] = useState<PermissionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [obligateActive, setObligateActive] = useState(false);
  const [anonymizingId, setAnonymizingId] = useState<number | null>(null);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);

  useEffect(() => {
    authApi.ssoConfig().then((c) => setObligateActive(c.obligateEnabled)).catch(() => setObligateActive(false));
  }, []);

  function load() {
    setLoading(true);
    Promise.all([userApi.list(), contratApi.list(), permissionSetApi.list()])
      .then(([u, c, ps]) => {
        setUsers(u);
        setContrats(c);
        setRoles(ps);
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function patch(id: number, data: Partial<User>) {
    try {
      const updated = await userApi.update(id, data);
      setUsers((list) => list.map((u) => (u.id === id ? updated : u)));
      toast.success('Salarié mis à jour');
    } catch {
      toast.error('Échec de la mise à jour');
    }
  }

  async function exportUser(u: User) {
    try {
      const data = await gdprApi.exportUser(u.id);
      downloadJson(`obliplan-donnees-${u.username || u.id}.json`, data);
      toast.success('Données exportées');
    } catch {
      toast.error("Échec de l'export");
    }
  }

  async function doAnonymize(u: User) {
    setAnonymizingId(u.id);
    try {
      await gdprApi.anonymize(u.id);
      toast.success('Salarié anonymisé');
      setConfirmUser(null);
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Échec de l'anonymisation");
    } finally {
      setAnonymizingId(null);
    }
  }

  async function createUser() {
    if (!draft) return;
    if (!draft.username.trim() || draft.password.length < 8) {
      toast.error('Identifiant requis et mot de passe ≥ 8 caractères');
      return;
    }
    setSaving(true);
    try {
      await userApi.create({
        username: draft.username.trim(),
        password: draft.password,
        displayName: draft.displayName || null,
        email: draft.email || null,
        role: draft.role,
        contratId: draft.contratId ? Number(draft.contratId) : null,
        managerId: draft.managerId ? Number(draft.managerId) : null,
      });
      toast.success('Salarié créé');
      setDraft(null);
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Échec de la création');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner className="h-40" />;

  const managers = users.filter((u) => u.role === 'manager' || u.role === 'admin');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Salariés</h2>
        {obligateActive ? (
          <span className="text-xs text-text-muted">Comptes gérés dans Obligate (SSO)</span>
        ) : (
          canManage && <Button onClick={() => setDraft({ ...EMPTY })}>Nouveau salarié</Button>
        )}
      </div>
      <Card>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-text-muted">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Rôle</th>
                <th className="px-4 py-2">Contrat</th>
                <th className="px-4 py-2">Manager</th>
                <th className="px-4 py-2">Actif</th>
                {canManage && <th className="px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const sso = u.foreignSource === 'obligate';
                const locked = sso || !canManage; // identity/role/active are Obligate-managed for SSO accounts
                const ctl = `rounded border border-border bg-bg-tertiary px-2 py-1 ${locked ? 'opacity-50' : ''}`;
                // Contrat & manager are Obli-local (absent from Obligate) → editable on SSO accounts too.
                const localCtl = `rounded border border-border bg-bg-tertiary px-2 py-1 ${!canManage ? 'opacity-50' : ''}`;
                return (
                <tr key={u.id} className="border-b border-border">
                  <td className="px-4 py-2 text-text-primary">
                    {u.displayName || u.username}
                    <span className="ml-2 text-xs text-text-muted">{u.email}</span>
                    {sso && (
                      <span className="ml-2 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">Obligate</span>
                    )}
                    {u.anonymizedAt && (
                      <span className="ml-2 rounded bg-status-down/15 px-1.5 py-0.5 text-[10px] text-status-down">Anonymisé</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={u.role}
                      disabled={locked}
                      onChange={(e) => patch(u.id, { role: e.target.value as UserRole })}
                      className={ctl}
                    >
                      {roles.map((r) => (
                        <option key={r.slug} value={r.slug}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={u.contratId ?? ''}
                      disabled={!canManage}
                      onChange={(e) => patch(u.id, { contratId: e.target.value ? Number(e.target.value) : null })}
                      className={localCtl}
                    >
                      <option value="">-</option>
                      {contrats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.libelle}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={u.managerId ?? ''}
                      disabled={!canManage}
                      onChange={(e) => patch(u.id, { managerId: e.target.value ? Number(e.target.value) : null })}
                      className={localCtl}
                    >
                      <option value="">-</option>
                      {managers
                        .filter((m) => m.id !== u.id)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName || m.username}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={u.isActive}
                      disabled={locked}
                      onChange={(e) => patch(u.id, { isActive: e.target.checked })}
                    />
                  </td>
                  {canManage && (
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => exportUser(u)}>
                          Exporter
                        </Button>
                        {!u.anonymizedAt && u.id !== currentUserId && (
                          <Button size="sm" variant="danger" onClick={() => setConfirmUser(u)}>
                            Anonymiser
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                );
              })}
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
            <h3 className="mb-4 text-lg font-semibold text-text-primary">Nouveau salarié</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Identifiant" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} autoFocus />
                <Input label="Mot de passe" type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
              </div>
              <Input label="Nom affiché" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
              <Input label="Email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              <div className="grid grid-cols-3 gap-3">
                <Select label="Rôle" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                  {roles.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.name}
                    </option>
                  ))}
                </Select>
                <Select label="Contrat" value={draft.contratId} onChange={(e) => setDraft({ ...draft, contratId: e.target.value })}>
                  <option value="">-</option>
                  {contrats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                    </option>
                  ))}
                </Select>
                <Select label="Manager" value={draft.managerId} onChange={(e) => setDraft({ ...draft, managerId: e.target.value })}>
                  <option value="">-</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.username}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Annuler
              </Button>
              <Button onClick={createUser} loading={saving}>
                Créer
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmUser}
        danger
        title="Anonymiser ce salarié ?"
        confirmLabel="Anonymiser définitivement"
        loading={anonymizingId === confirmUser?.id}
        onConfirm={() => confirmUser && doAnonymize(confirmUser)}
        onCancel={() => setConfirmUser(null)}
        message={
          <>
            <p>
              <strong className="text-text-primary">{confirmUser?.displayName || confirmUser?.username}</strong> - cette
              action est <strong className="text-status-down">irréversible</strong>.
            </p>
            <p className="mt-1.5">
              Elle efface l'identité (nom, e-mail, identifiant, lien SSO Obligate <em>côté Obliplan</em>, abonnement
              calendrier) mais <strong>conserve</strong> les enregistrements de planning et de paie, conformément à
              l'obligation légale de conservation.
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              Le compte Obligate de la personne n'est pas affecté.
            </p>
          </>
        }
      />
    </div>
  );
}
