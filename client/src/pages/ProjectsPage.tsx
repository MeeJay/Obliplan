import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2, Columns3, List, Table2, Users, Timer, GanttChartSquare, ChevronDown, ChevronRight, Folder, Plus, Search } from 'lucide-react';
import type { Board, BoardDetail, BoardMember, Card, Client, TimeEntry, CardTimeTotal } from '@obliplan/shared';
import { boardApi, clientApi, timeEntryApi, userApi, type AssignableUser } from '../api';
import { useAuthStore } from '../store/authStore';
import { BoardView } from '../components/kanban/BoardView';
import { ListView } from '../components/kanban/ListView';
import { TableView } from '../components/kanban/TableView';
import { TimelineView } from '../components/kanban/TimelineView';
import { CardEditor } from '../components/kanban/CardEditor';
import { Button } from '../components/common/Button';
import { Card as UICard, CardHeader, CardBody } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Spinner } from '../components/common/Spinner';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { UserAvatar } from '../components/common/UserAvatar';
import { minToHm, todayIso } from '../utils/format';
import { cn } from '../utils/cn';

type BoardRole = BoardMember['role'];

const BOARD_ROLES: BoardRole[] = ['owner', 'admin', 'member', 'viewer'];
const BOARD_ROLE_LABEL: Record<BoardRole, string> = {
  owner: 'Propriétaire',
  admin: 'Admin',
  member: 'Membre',
  viewer: 'Lecteur',
};

type ProjectView = 'board' | 'list' | 'table' | 'timeline' | 'temps';
type AssigneeFilter = 'all' | 'me' | number;

const VIEWS: { key: ProjectView; label: string; icon: typeof Columns3 }[] = [
  { key: 'board', label: 'Board', icon: Columns3 },
  { key: 'list', label: 'Liste', icon: List },
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare },
  { key: 'temps', label: 'Temps', icon: Timer },
];

/** Persisted collapse state for the client folders in the project rail. */
const RAIL_COLLAPSE_KEY = 'obliplan.projects.railCollapsed';

/** A grouping of projects (boards) under a client, or under the "Sans client" catch-all. */
interface RailFolder {
  key: string;
  client: Client | null;
  boards: Board[];
}

/** Small client badge for the rail/folders: the uploaded logo, else a colored initial chip. */
function ClientChip({ client }: { client: Client | null }) {
  if (!client) return <Folder size={18} className="shrink-0 text-text-muted" />;
  if (client.logo)
    return (
      <img
        src={client.logo}
        alt=""
        className="h-5 w-5 shrink-0 rounded border border-border object-cover"
      />
    );
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white"
      style={{ background: client.color || '#7c6cff' }}
    >
      {(client.name.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

export function ProjectsPage() {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isManager = useAuthStore((s) => s.isManager);
  const [boards, setBoards] = useState<Board[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BoardDetail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newClientId, setNewClientId] = useState<number | ''>('');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(RAIL_COLLAPSE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [view, setView] = useState<ProjectView>('board');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  // Card opened from the Timeline view (which, unlike Board/List/Table, hosts no editor of its own).
  const [timelineCard, setTimelineCard] = useState<Card | null>(null);

  const loadBoards = useCallback(async () => {
    const list = await boardApi.list();
    setBoards(list);
    setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    setLoading(false);
  }, []);

  const loadDetail = useCallback((id: number) => {
    boardApi.get(id).then(setDetail);
  }, []);

  useEffect(() => {
    loadBoards();
    clientApi.list().then(setClients);
    userApi.assignable().then(setAssignees);
  }, [loadBoards]);

  useEffect(() => {
    setTimelineCard(null);
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch {
      /* localStorage unavailable - folders just won't persist */
    }
  }, [collapsed]);

  const clientName = useCallback(
    (id: number | null) => (id == null ? null : clients.find((c) => c.id === id)?.name ?? null),
    [clients],
  );

  // Group the (searched) boards into collapsible client folders + a "Sans client" catch-all
  // (which also absorbs any board whose client isn't in the visible client list, so nothing hides).
  const folders = useMemo<RailFolder[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? boards.filter((b) => b.name.toLowerCase().includes(q)) : boards;
    const result: RailFolder[] = [];
    const known = new Set(clients.map((c) => c.id));
    for (const c of clients) {
      const bs = filtered.filter((b) => b.clientId === c.id);
      if (bs.length) result.push({ key: `client:${c.id}`, client: c, boards: bs });
    }
    const noClient = filtered.filter((b) => b.clientId == null || !known.has(b.clientId));
    if (noClient.length) result.push({ key: 'none', client: null, boards: noClient });
    return result;
  }, [boards, clients, query]);

  const resolvedAssigneeFilter = useMemo<number | null>(() => {
    if (assigneeFilter === 'all') return null;
    if (assigneeFilter === 'me') return currentUserId;
    return assigneeFilter;
  }, [assigneeFilter, currentUserId]);

  // Members panel is shown to whoever can mutate the team: tenant admin, the board
  // owner, or a board member with an owner/admin role.
  const canManageMembers = useMemo(() => {
    if (!detail || currentUserId == null) return false;
    if (isAdmin()) return true;
    if (detail.ownerId === currentUserId) return true;
    return (detail.members ?? []).some(
      (m) => m.userId === currentUserId && (m.role === 'owner' || m.role === 'admin'),
    );
  }, [detail, currentUserId, isAdmin]);

  // Who may log time FOR a teammate (and clean up an entry): tenant manager/admin,
  // the board owner, or a board owner/admin member. The server re-checks canManage.
  const canLogForOthers = useMemo(() => {
    if (!detail || currentUserId == null) return false;
    if (isManager()) return true;
    if (detail.ownerId === currentUserId) return true;
    return (detail.members ?? []).some(
      (m) => m.userId === currentUserId && (m.role === 'owner' || m.role === 'admin'),
    );
  }, [detail, currentUserId, isManager]);

  async function createBoard() {
    if (!newName.trim()) return;
    const board = await boardApi.create({
      name: newName.trim(),
      clientId: newClientId === '' ? null : newClientId,
    });
    setNewName('');
    setShowCreate(false);
    // Make sure the folder the new project lands in is expanded, so its selection is visible.
    const folderKey = board.clientId == null ? 'none' : `client:${board.clientId}`;
    setCollapsed((c) => ({ ...c, [folderKey]: false }));
    await loadBoards();
    setSelectedId(board.id);
    setDetail(board);
    toast.success('Projet créé');
  }

  async function removeBoard(id: number) {
    await boardApi.remove(id);
    setSelectedId(null);
    setDetail(null);
    setConfirmDelete(false);
    await loadBoards();
    toast.success('Projet supprimé');
  }

  if (loading) return <Spinner className="h-40" />;

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      {/* LEFT RAIL - projects grouped in collapsible client folders. */}
      <aside className="w-full shrink-0 md:w-60 md:border-r md:border-border md:pr-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-text-primary">Projets</h2>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un projet…"
            className="pl-8"
            aria-label="Rechercher un projet"
          />
        </div>

        <Button
          size="sm"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus size={15} className="mr-1.5" /> Nouveau projet
        </Button>

        {showCreate && (
          <div className="mt-2 space-y-2 rounded-md border border-border bg-bg-secondary p-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createBoard()}
              placeholder="Nom du projet"
              aria-label="Nom du projet"
              autoFocus
            />
            <Select
              aria-label="Client du projet"
              value={newClientId === '' ? '' : String(newClientId)}
              onChange={(e) => setNewClientId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Sans client</option>
              {clients
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
              ))}
            </Select>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
              <Button size="sm" onClick={createBoard} disabled={!newName.trim()}>
                Créer
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3 max-h-[45vh] space-y-1 overflow-y-auto md:max-h-[70vh] md:pr-1">
          {folders.length === 0 ? (
            <p className="px-2 py-4 text-sm text-text-muted">
              {query.trim() ? 'Aucun projet ne correspond.' : 'Aucun projet pour le moment.'}
            </p>
          ) : (
            folders.map((f) => {
              const isCollapsed = !!collapsed[f.key];
              return (
                <div key={f.key}>
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [f.key]: !c[f.key] }))}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-hover"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={14} className="shrink-0 text-text-muted" />
                    ) : (
                      <ChevronDown size={14} className="shrink-0 text-text-muted" />
                    )}
                    <ClientChip client={f.client} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                      {f.client ? f.client.name : 'Sans client'}
                    </span>
                    <span className="shrink-0 rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-muted">
                      {f.boards.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="mb-1 ml-4 space-y-0.5 border-l border-border pl-2">
                      {f.boards.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => setSelectedId(b.id)}
                          className={cn(
                            'block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                            selectedId === b.id
                              ? 'bg-accent text-white'
                              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                          )}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT AREA - view switcher, board and members panel (unchanged behaviour). */}
      <div className="min-w-0 flex-1">
      {detail ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-text-primary">{detail.name}</h3>
              {clientName(detail.clientId) && (
                <p className="text-xs text-text-muted">{clientName(detail.clientId)}</p>
              )}
            </div>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 text-sm text-status-down hover:underline"
            >
              <Trash2 size={14} /> Supprimer
            </button>
          </div>

          <ConfirmDialog
            open={confirmDelete}
            danger
            title="Supprimer ce projet ?"
            confirmLabel="Supprimer définitivement"
            message={
              <p>
                Le projet <strong className="text-text-primary">{detail.name}</strong> sera supprimé, avec ses cartes
                et le temps enregistré dessus. Cette action est <strong className="text-status-down">irréversible</strong>.
              </p>
            }
            onConfirm={() => void removeBoard(detail.id)}
            onCancel={() => setConfirmDelete(false)}
          />

          {canManageMembers && (
            <MembersPanel board={detail} assignees={assignees} onChanged={() => loadDetail(detail.id)} />
          )}

          <div className="flex flex-wrap items-center gap-3">
            {/* View switcher */}
            <div className="inline-flex rounded-md border border-border bg-bg-tertiary p-0.5">
              {VIEWS.map((v) => {
                const Icon = v.icon;
                return (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded px-3 py-1 text-sm transition-colors',
                      view === v.key ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary',
                    )}
                  >
                    <Icon size={14} /> {v.label}
                  </button>
                );
              })}
            </div>

            {/* Assignee filter (Timeline has its own grouping; the time panel doesn't use it) */}
            <div className={cn('ml-auto flex items-center gap-2', (view === 'temps' || view === 'timeline') && 'hidden')}>
              <span className="text-xs text-text-muted">Assigné :</span>
              <button
                onClick={() => setAssigneeFilter((f) => (f === 'me' ? 'all' : 'me'))}
                disabled={currentUserId == null}
                className={cn(
                  'rounded-md border px-2 py-1 text-sm',
                  assigneeFilter === 'me'
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-bg-tertiary text-text-secondary hover:text-text-primary',
                )}
              >
                Moi
              </button>
              <select
                value={String(assigneeFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setAssigneeFilter(v === 'all' || v === 'me' ? v : Number(v));
                }}
                className="rounded-md border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary"
              >
                <option value="all">Tous</option>
                {assignees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {view === 'board' && (
            <BoardView
              board={detail}
              onChanged={() => loadDetail(detail.id)}
              assignees={assignees}
              assigneeFilter={resolvedAssigneeFilter}
            />
          )}
          {view === 'list' && (
            <ListView
              board={detail}
              onChanged={() => loadDetail(detail.id)}
              assignees={assignees}
              assigneeFilter={resolvedAssigneeFilter}
            />
          )}
          {view === 'table' && (
            <TableView
              board={detail}
              onChanged={() => loadDetail(detail.id)}
              assignees={assignees}
              assigneeFilter={resolvedAssigneeFilter}
            />
          )}
          {view === 'timeline' && (
            <TimelineView
              board={detail}
              onChanged={() => loadDetail(detail.id)}
              assignees={assignees}
              onOpenCard={(c) => setTimelineCard(c)}
            />
          )}
          {view === 'temps' && (
            <TimePanel
              board={detail}
              assignees={assignees}
              currentUserId={currentUserId}
              canLogForOthers={canLogForOthers}
            />
          )}

          {/* Timeline opens the shared CardEditor here (mirrors how BoardView hosts it). */}
          {timelineCard && (
            <CardEditor
              key={timelineCard.id}
              boardId={detail.id}
              columns={detail.columns}
              sprints={detail.sprints}
              assignees={assignees}
              board={detail}
              card={timelineCard}
              defaultColumnId={timelineCard.columnId}
              onOpenCard={(c) => setTimelineCard(c)}
              onClose={() => setTimelineCard(null)}
              onSaved={() => loadDetail(detail.id)}
            />
          )}
        </div>
      ) : (
        <p className="text-text-secondary">
          Sélectionnez un projet dans la liste, ou créez-en un pour démarrer votre gestion de projet.
        </p>
      )}
      </div>
    </div>
  );
}

interface MembersPanelProps {
  board: BoardDetail;
  assignees: AssignableUser[];
  onChanged: () => void;
}

/** Collapsible team panel: list/add/role-change/remove board members. */
function MembersPanel({ board, assignees, onChanged }: MembersPanelProps) {
  const [open, setOpen] = useState(false);
  const [addUserId, setAddUserId] = useState<number | ''>('');
  const [addRole, setAddRole] = useState<BoardRole>('member');
  const [busy, setBusy] = useState(false);

  const members = board.members ?? [];
  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const addable = useMemo(() => assignees.filter((u) => !memberIds.has(u.id)), [assignees, memberIds]);

  async function add() {
    if (addUserId === '') return;
    setBusy(true);
    try {
      await boardApi.addMember(board.id, { userId: addUserId, role: addRole });
      setAddUserId('');
      setAddRole('member');
      onChanged();
      toast.success('Membre ajouté');
    } catch {
      toast.error('Ajout impossible');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: number, role: BoardRole) {
    setBusy(true);
    try {
      await boardApi.updateMember(board.id, userId, { role });
      onChanged();
    } catch {
      toast.error('Modification impossible');
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: number) {
    setBusy(true);
    try {
      await boardApi.removeMember(board.id, userId);
      onChanged();
      toast.success('Membre retiré');
    } catch {
      toast.error('Retrait impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-text-primary"
      >
        <Users size={15} className="text-text-muted" />
        Équipe
        <span className="rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-muted">{members.length}</span>
        <span className="ml-auto text-xs text-text-muted">{open ? 'Masquer' : 'Gérer'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2">
                <UserAvatar username={m.userName} size={22} />
                <span className="flex-1 truncate text-sm text-text-primary">{m.userName}</span>
                <Select
                  aria-label={`Rôle de ${m.userName}`}
                  value={m.role}
                  onChange={(e) => changeRole(m.userId, e.target.value as BoardRole)}
                  disabled={busy}
                  className="w-36 py-1"
                >
                  {BOARD_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {BOARD_ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
                <button
                  onClick={() => remove(m.userId)}
                  disabled={busy}
                  title="Retirer du tableau"
                  className="text-text-muted hover:text-status-down disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {members.length === 0 && <p className="text-xs text-text-muted">Aucun membre.</p>}
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <Select
              label="Ajouter un membre"
              value={addUserId === '' ? '' : String(addUserId)}
              onChange={(e) => setAddUserId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-48"
            >
              <option value="">Choisir…</option>
              {addable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.username}
                </option>
              ))}
            </Select>
            <Select
              label="Rôle"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as BoardRole)}
              className="w-36"
            >
              {BOARD_ROLES.map((r) => (
                <option key={r} value={r}>
                  {BOARD_ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={add} loading={busy} disabled={addUserId === ''}>
              Ajouter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface TimePanelProps {
  board: BoardDetail;
  assignees: AssignableUser[];
  currentUserId: number | null;
  /** Board owner/admin or tenant manager: may log time for a teammate + delete entries. */
  canLogForOthers: boolean;
}

const emptyTimeForm = () => ({ cardId: '', hours: '', minutes: '', note: '', spentOn: todayIso() });

/**
 * Board "Temps" view: surfaces logged time ON the project - grand total, per-card
 * breakdown, recent entries - and lets a manager log time for a teammate (counts as
 * work done; deleting an entry is the "incident" cleanup).
 */
function TimePanel({ board, assignees, currentUserId, canLogForOthers }: TimePanelProps) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [totals, setTotals] = useState<CardTimeTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyTimeForm);
  const [salarieId, setSalarieId] = useState<number | ''>(currentUserId ?? '');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([timeEntryApi.forBoard(board.id), timeEntryApi.totals(board.id)])
      .then(([e, t]) => {
        setEntries(e);
        setTotals(t);
      })
      .catch(() => toast.error('Chargement du temps impossible'))
      .finally(() => setLoading(false));
  }, [board.id]);

  useEffect(load, [load]);

  // Keep the "Salarié" picker defaulted to me whenever the actor changes.
  useEffect(() => {
    setSalarieId(currentUserId ?? '');
  }, [currentUserId]);

  // Teammates the actor may LOG time for (admin → all, manager → reports) - matches the server's
  // canManage, so the picker never offers someone the server would 403. Empty for non-managers.
  const [manageable, setManageable] = useState<AssignableUser[]>([]);
  useEffect(() => {
    if (canLogForOthers) userApi.manageable().then(setManageable).catch(() => setManageable([]));
    else setManageable([]);
  }, [canLogForOthers]);
  const otherTargets = useMemo(() => manageable.filter((u) => u.id !== currentUserId), [manageable, currentUserId]);

  const cardTitleById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of board.cards) m.set(c.id, c.title);
    return m;
  }, [board.cards]);

  const cardLabel = useCallback(
    (cardId: number | null) =>
      cardId == null ? 'Temps projet (sans tâche)' : cardTitleById.get(cardId) ?? `#${cardId}`,
    [cardTitleById],
  );

  const grandTotal = useMemo(() => totals.reduce((s, t) => s + t.minutes, 0), [totals]);

  // Newest first (spentOn then id). Running timers (minutes 0, no logged work yet) are excluded.
  const sortedEntries = useMemo(
    () =>
      entries
        .filter((e) => !e.isRunning)
        .sort((a, b) => (b.spentOn ?? '').localeCompare(a.spentOn ?? '') || b.id - a.id),
    [entries],
  );

  const sortedTotals = useMemo(
    () => [...totals].sort((a, b) => b.minutes - a.minutes),
    [totals],
  );

  const canDelete = useCallback(
    (e: TimeEntry) => canLogForOthers || e.userId === currentUserId,
    [canLogForOthers, currentUserId],
  );

  async function submit() {
    const minutes = (Number(form.hours) || 0) * 60 + (Number(form.minutes) || 0);
    if (minutes <= 0) {
      toast.error('Durée invalide');
      return;
    }
    const target = salarieId === '' ? currentUserId : Number(salarieId);
    const forTeammate = target != null && target !== currentUserId;
    setSaving(true);
    try {
      await timeEntryApi.create({
        boardId: board.id,
        cardId: form.cardId ? Number(form.cardId) : null,
        userId: forTeammate ? target : undefined,
        minutes,
        note: form.note || null,
        spentOn: form.spentOn || null,
      });
      toast.success('Temps enregistré comme travail effectué');
      setForm((f) => ({ ...f, hours: '', minutes: '', note: '' }));
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await timeEntryApi.remove(id);
      toast.success('Entrée supprimée');
      load();
    } catch {
      toast.error('Suppression impossible');
    }
  }

  if (loading) return <Spinner className="h-32" />;

  return (
    <div className="space-y-4">
      {/* Total + per-card breakdown */}
      <UICard>
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">Temps effectué sur le projet</span>
          <span className="font-mono text-lg font-semibold text-text-primary">{minToHm(grandTotal)}</span>
        </CardHeader>
        <CardBody>
          {sortedTotals.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun temps enregistré sur ce projet.</p>
          ) : (
            <div className="space-y-1">
              {sortedTotals.map((t) => (
                <div
                  key={t.cardId ?? 'board'}
                  className="flex items-center gap-3 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm"
                >
                  <span className="flex-1 truncate text-text-primary">{cardLabel(t.cardId)}</span>
                  <span className="font-mono font-semibold text-text-primary">{minToHm(t.minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </UICard>

      {/* Add time (optionally for a teammate) */}
      <UICard>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Ajouter du temps</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Select
              label="Tâche (optionnel)"
              className="col-span-2"
              value={form.cardId}
              onChange={(e) => setForm({ ...form, cardId: e.target.value })}
            >
              <option value="">Projet entier</option>
              {board.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
            {canLogForOthers && otherTargets.length > 0 ? (
              <Select
                label="Salarié"
                className="col-span-2"
                value={salarieId === '' ? '' : String(salarieId)}
                onChange={(e) => setSalarieId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {currentUserId != null && <option value={currentUserId}>Moi</option>}
                {otherTargets.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.username}
                  </option>
                ))}
              </Select>
            ) : (
              <Input label="Salarié" className="col-span-2" value="Moi" disabled readOnly />
            )}
            <Input
              label="Heures"
              type="number"
              min={0}
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: e.target.value })}
            />
            <Input
              label="Minutes"
              type="number"
              min={0}
              max={59}
              value={form.minutes}
              onChange={(e) => setForm({ ...form, minutes: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Input
              label="Date"
              type="date"
              className="col-span-2"
              value={form.spentOn}
              onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
            />
            <Input
              label="Note (optionnel)"
              className="col-span-2 sm:col-span-3"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            <div className="col-span-2 flex items-end sm:col-span-1">
              <Button className="w-full" onClick={submit} loading={saving}>
                Ajouter
              </Button>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Ce temps est comptabilisé comme travail effectué sur le projet (le supprimer l'annule).
          </p>
        </CardBody>
      </UICard>

      {/* Recent entries */}
      <UICard>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Entrées récentes</span>
        </CardHeader>
        <CardBody>
          {sortedEntries.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune entrée.</p>
          ) : (
            <div className="space-y-1">
              {sortedEntries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-text-muted">{e.spentOn ?? '-'}</span>
                  <span className="truncate text-text-primary">{e.userName ?? `#${e.userId}`}</span>
                  <span className="truncate text-text-secondary">
                    · {e.cardId == null ? 'Temps projet (sans tâche)' : e.cardTitle ?? cardLabel(e.cardId)}
                  </span>
                  <span className="flex-1 truncate text-text-muted">{e.note}</span>
                  <span className="font-mono font-semibold text-text-primary">{minToHm(e.minutes)}</span>
                  {canDelete(e) && (
                    <button
                      onClick={() => remove(e.id)}
                      className="text-text-muted hover:text-status-down"
                      title="Supprimer (incident)"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </UICard>
    </div>
  );
}
