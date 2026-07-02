import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Trash2, Plus, X } from 'lucide-react';
import type { Tenant, User, PermissionSet } from '@obliplan/shared';
import { MODULES } from '@obliplan/shared';
import { tenantApi, userApi, moduleApi, permissionSetApi, type TenantMember } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';

export function WorkspacesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<PermissionSet[]>([]);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [renameVal, setRenameVal] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('employe');
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  const currentTenantId = useAuthStore((s) => s.currentTenantId);

  const loadTenants = useCallback(async () => {
    const [list, allUsers, sets] = await Promise.all([
      tenantApi.listAll(),
      userApi.list().catch(() => []),
      permissionSetApi.list().catch(() => []),
    ]);
    setTenants(list);
    setUsers(allUsers);
    setRoles(sets);
    setSelected((cur) => list.find((t) => t.id === cur?.id) ?? list[0] ?? null);
    setLoading(false);
  }, []);

  const loadMembers = useCallback((id: number) => {
    tenantApi.members(id).then(setMembers).catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (selected) {
      setRenameVal(selected.name);
      loadMembers(selected.id);
    }
  }, [selected, loadMembers]);

  // Module enablement is managed per selected workspace (admin can edit any).
  useEffect(() => {
    if (selected) moduleApi.getEnabledFor(selected.id).then(setEnabledModules).catch(() => setEnabledModules([]));
  }, [selected]);

  async function toggleModule(key: string, enabled: boolean) {
    if (!selected) return;
    try {
      const next = await moduleApi.setEnabledFor(selected.id, key, enabled);
      setEnabledModules(next);
      // Keep the live sidebar in sync when editing the active workspace.
      if (selected.id === currentTenantId) useAuthStore.setState({ modules: next });
      toast.success(enabled ? 'Module activé' : 'Module désactivé');
    } catch {
      toast.error('Échec de la mise à jour');
    }
  }

  async function createWorkspace() {
    if (!newName.trim()) return;
    try {
      const tenant = await tenantApi.create({ name: newName.trim() });
      setNewName('');
      await loadTenants();
      setSelected(tenant);
      toast.success('Workspace créé');
    } catch {
      toast.error('Échec de la création');
    }
  }

  async function rename() {
    if (!selected || !renameVal.trim() || renameVal === selected.name) return;
    try {
      const updated = await tenantApi.update(selected.id, { name: renameVal.trim() });
      setTenants((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      setSelected(updated);
      toast.success('Workspace renommé');
    } catch {
      toast.error('Échec du renommage');
    }
  }

  async function removeWorkspace(t: Tenant) {
    if (t.slug === 'default') {
      toast.error('Le workspace par défaut ne peut pas être supprimé');
      return;
    }
    try {
      await tenantApi.remove(t.id);
      setSelected(null);
      await loadTenants();
      toast.success('Workspace supprimé');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Suppression impossible');
    }
  }

  async function addMember() {
    if (!selected || !addUserId) return;
    try {
      await tenantApi.addMember(selected.id, { userId: Number(addUserId), role: addRole });
      setAddUserId('');
      loadMembers(selected.id);
      toast.success('Membre ajouté');
    } catch {
      toast.error('Échec de l\'ajout');
    }
  }

  async function removeMember(userId: number) {
    if (!selected) return;
    await tenantApi.removeMember(selected.id, userId);
    loadMembers(selected.id);
  }

  if (loading) return <Spinner className="h-40" />;

  const memberIds = new Set(members.map((m) => m.id));
  const candidates = users.filter((u) => !memberIds.has(u.id));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-text-primary">Workspaces</h1>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Workspace list + create */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Espaces</span>
          </CardHeader>
          <CardBody className="space-y-1">
            {tenants.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  selected?.id === t.id ? 'bg-bg-active text-text-primary' : 'text-text-secondary hover:bg-bg-hover'
                }`}
              >
                <Building2 size={14} className="shrink-0 text-text-muted" />
                <span className="flex-1 truncate">{t.name}</span>
                <span className="font-mono text-[10px] text-text-muted">{t.slug}</span>
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
                placeholder="Nouveau workspace"
                className="flex-1 rounded-md border border-border bg-bg-tertiary px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
              />
              <Button size="sm" onClick={createWorkspace}>
                <Plus size={14} />
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Detail */}
        {selected && (
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <span className="font-medium text-text-primary">{selected.name}</span>
                <button
                  onClick={() => removeWorkspace(selected)}
                  disabled={selected.slug === 'default'}
                  className="flex items-center gap-1 text-sm text-status-down hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  <Trash2 size={14} /> Supprimer
                </button>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex items-end gap-2">
                  <Input label="Nom" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} className="flex-1" />
                  <Button variant="secondary" onClick={rename}>
                    Renommer
                  </Button>
                </div>
                <p className="font-mono text-xs text-text-muted">slug : {selected.slug}</p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <span className="text-sm font-medium text-text-secondary">Modules</span>
              </CardHeader>
              <CardBody className="space-y-2">
                {MODULES.map((m) => {
                  const on = enabledModules.includes(m.key);
                  return (
                    <div
                      key={m.key}
                      className="flex items-center gap-3 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm"
                    >
                      <span className="flex-1 truncate text-text-primary">{m.label}</span>
                      <button
                        onClick={() => toggleModule(m.key, !on)}
                        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                          on ? 'bg-accent' : 'bg-bg-active'
                        }`}
                        role="switch"
                        aria-checked={on}
                        title={on ? 'Désactiver' : 'Activer'}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                            on ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <span className="text-sm font-medium text-text-secondary">Membres</span>
              </CardHeader>
              <CardBody className="space-y-3">
                {members.length === 0 ? (
                  <p className="text-sm text-text-muted">Aucun membre.</p>
                ) : (
                  <div className="space-y-1">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm">
                        <span className="flex-1 truncate text-text-primary">{m.displayName || m.username}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{m.tenantRole}</span>
                        <button onClick={() => removeMember(m.id)} className="text-text-muted hover:text-status-down" title="Retirer">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2 border-t border-border pt-3">
                  <Select label="Ajouter un membre" value={addUserId} onChange={(e) => setAddUserId(e.target.value)} className="flex-1">
                    <option value="">Sélectionner…</option>
                    {candidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName || u.username}
                      </option>
                    ))}
                  </Select>
                  <Select label="Rôle" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                    {roles.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                  <Button onClick={addMember} disabled={!addUserId}>
                    Ajouter
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
