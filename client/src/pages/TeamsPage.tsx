import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import type { UserTeam, TeamScope, TeamLevel, User, Client, Board } from '@obliplan/shared';
import { teamApi, userApi, clientApi, boardApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { Card, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';

interface PermRow {
  scope: TeamScope;
  scopeId: number;
  level: TeamLevel;
}

interface Draft {
  id?: number;
  name: string;
  description: string;
  canCreate: boolean;
  memberIds: number[];
  perms: PermRow[];
}

const EMPTY: Draft = { name: '', description: '', canCreate: false, memberIds: [], perms: [] };

const SCOPE_LABEL: Record<TeamScope, string> = {
  all: 'Toutes les ressources',
  client: 'Client',
  project: 'Projet',
};

function userLabel(u: User): string {
  const name = u.username.startsWith('og_') ? u.username.slice(3) : u.username;
  return u.displayName?.trim() || name;
}

export function TeamsPage() {
  const can = useAuthStore((s) => s.can);
  const canManage = can('users:manage');

  const [teams, setTeams] = useState<UserTeam[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [t, u, c, b] = await Promise.all([teamApi.list(), userApi.list(), clientApi.list(), boardApi.listAll()]);
      setTeams(t);
      setUsers(u);
      setClients(c);
      setBoards(b);
      const counts = await Promise.all(t.map((team) => teamApi.members(team.id)));
      setMemberCounts(Object.fromEntries(t.map((team, i) => [team.id, counts[i].length])));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function openNew() {
    setDraft({ ...EMPTY, perms: [] });
  }

  async function openEdit(team: UserTeam) {
    const [memberIds, perms] = await Promise.all([teamApi.members(team.id), teamApi.permissions(team.id)]);
    setDraft({
      id: team.id,
      name: team.name,
      description: team.description ?? '',
      canCreate: team.canCreate,
      memberIds,
      perms: perms.map((p) => ({ scope: p.scope, scopeId: p.scopeId, level: p.level })),
    });
  }

  function toggleMember(id: number) {
    if (!draft) return;
    const has = draft.memberIds.includes(id);
    setDraft({ ...draft, memberIds: has ? draft.memberIds.filter((m) => m !== id) : [...draft.memberIds, id] });
  }

  function addPerm() {
    if (!draft) return;
    setDraft({ ...draft, perms: [...draft.perms, { scope: 'all', scopeId: 0, level: 'ro' }] });
  }
  function updatePerm(idx: number, patch: Partial<PermRow>) {
    if (!draft) return;
    setDraft({ ...draft, perms: draft.perms.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  }
  function removePerm(idx: number) {
    if (!draft) return;
    setDraft({ ...draft, perms: draft.perms.filter((_, i) => i !== idx) });
  }

  async function save() {
    if (!draft || !draft.name.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    setSaving(true);
    try {
      const fields = { name: draft.name.trim(), description: draft.description || null, canCreate: draft.canCreate };
      const team = draft.id ? await teamApi.update(draft.id, fields) : await teamApi.create(fields);
      await teamApi.setMembers(team.id, draft.memberIds);
      await teamApi.setPermissions(
        team.id,
        draft.perms.map((p) => ({ scope: p.scope, scopeId: p.scope === 'all' ? 0 : p.scopeId, level: p.level })),
      );
      toast.success('Équipe enregistrée');
      setDraft(null);
      await load();
    } catch {
      toast.error("Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await teamApi.remove(id);
      toast.success('Équipe supprimée');
      await load();
    } catch {
      toast.error('Suppression impossible');
    }
  }

  if (loading) return <Spinner className="h-40" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Équipes</h2>
          <p className="text-sm text-text-muted">Groupes d'utilisateurs et périmètre d'accès aux clients / projets.</p>
        </div>
        {canManage && <Button onClick={openNew}>Nouvelle équipe</Button>}
      </div>

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-text-muted">
              <tr>
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Membres</th>
                <th className="px-4 py-2">Création projets</th>
                {canManage && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-b border-border">
                  <td className="px-4 py-2 font-medium text-text-primary">{t.name}</td>
                  <td className="px-4 py-2 text-text-secondary">{t.description || '-'}</td>
                  <td className="px-4 py-2 text-text-secondary">{memberCounts[t.id] ?? 0}</td>
                  <td className="px-4 py-2">
                    {t.canCreate ? (
                      <span className="text-status-up">Autorisée</span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <button className="mr-3 text-accent hover:underline" onClick={() => void openEdit(t)}>
                        Éditer
                      </button>
                      <button className="text-status-down hover:underline" onClick={() => void remove(t.id)}>
                        Suppr.
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {teams.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-6 text-center text-text-muted">
                    Aucune équipe. Créez-en une pour regrouper des utilisateurs et définir leur périmètre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDraft(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-bg-secondary p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-text-primary">
              {draft.id ? 'Modifier' : 'Nouvelle'} équipe
            </h3>

            <div className="space-y-4">
              <Input
                label="Nom"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-text-secondary">Description (optionnel)</label>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.canCreate}
                  onChange={(e) => setDraft({ ...draft, canCreate: e.target.checked })}
                />
                Les membres peuvent créer des projets
              </label>

              {/* Members */}
              <div>
                <div className="mb-2 text-sm font-medium text-text-secondary">Membres</div>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border bg-bg-tertiary p-2">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 px-1 py-0.5 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        checked={draft.memberIds.includes(u.id)}
                        onChange={() => toggleMember(u.id)}
                      />
                      {userLabel(u)}
                    </label>
                  ))}
                  {users.length === 0 && <div className="px-1 text-sm text-text-muted">Aucun utilisateur.</div>}
                </div>
              </div>

              {/* Resource scope */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-text-secondary">Périmètre des ressources</span>
                  <Button variant="secondary" size="sm" onClick={addPerm}>
                    <Plus size={14} className="mr-1" /> Ajouter
                  </Button>
                </div>
                <div className="space-y-2">
                  {draft.perms.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select
                        className="flex-1"
                        value={p.scope}
                        onChange={(e) => updatePerm(idx, { scope: e.target.value as TeamScope, scopeId: 0 })}
                      >
                        {(['all', 'client', 'project'] as TeamScope[]).map((s) => (
                          <option key={s} value={s}>
                            {SCOPE_LABEL[s]}
                          </option>
                        ))}
                      </Select>
                      {p.scope === 'client' && (
                        <Select
                          className="flex-1"
                          value={p.scopeId}
                          onChange={(e) => updatePerm(idx, { scopeId: Number(e.target.value) })}
                        >
                          <option value={0}>- Choisir -</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      )}
                      {p.scope === 'project' && (
                        <Select
                          className="flex-1"
                          value={p.scopeId}
                          onChange={(e) => updatePerm(idx, { scopeId: Number(e.target.value) })}
                        >
                          <option value={0}>- Choisir -</option>
                          {boards.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </Select>
                      )}
                      <Select
                        className="w-32"
                        value={p.level}
                        onChange={(e) => updatePerm(idx, { level: e.target.value as TeamLevel })}
                      >
                        <option value="ro">Lecture</option>
                        <option value="rw">Lecture / écriture</option>
                      </Select>
                      <button
                        className="shrink-0 text-text-muted transition-colors hover:text-status-down"
                        onClick={() => removePerm(idx)}
                        title="Retirer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {draft.perms.length === 0 && (
                    <div className="rounded-md border border-dashed border-border px-3 py-3 text-center text-sm text-text-muted">
                      Aucun périmètre. Sans règle, l'équipe n'a accès à aucune ressource.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Annuler
              </Button>
              <Button onClick={save} loading={saving}>
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
