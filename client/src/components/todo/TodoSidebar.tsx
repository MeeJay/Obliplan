import { useEffect, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  ChevronDown,
  ListTodo,
  Users,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Share2,
  Palette,
  FolderInput,
  Check,
  X,
} from 'lucide-react';
import type { SmartList, TaskList, ListGroup, ListShare, User } from '@obliplan/shared';
import { listApi } from '../../api';
import { cn } from '../../utils/cn';
import { SMART_LISTS, viewEquals, type TodoView } from './todoMeta';

/** Recolor palette for custom lists (mirrors the app's status/accent hues). */
const LIST_COLORS = ['#4f9cf9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#64748b'];

interface TodoSidebarProps {
  smartCounts: Record<SmartList, number>;
  lists: TaskList[];
  groups: ListGroup[];
  members: User[];
  view: TodoView;
  onSelect: (view: TodoView) => void;
  onNewList: (name: string) => void;
  onNewGroup: (name: string) => void;
  onToggleGroup: (group: ListGroup) => void;
  onChanged: () => void;
}

function MenuBtn({
  icon,
  label,
  onClick,
  danger,
  active,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-bg-hover',
        danger ? 'text-status-down' : active ? 'text-accent' : 'text-text-secondary',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {active && <Check size={12} />}
    </button>
  );
}

/** Owner-only modal to share a list with colleagues (toggle per member). */
function ShareModal({
  list,
  members,
  onChanged,
  onClose,
}: {
  list: TaskList;
  members: User[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [shares, setShares] = useState<ListShare[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    listApi.shares(list.id).then(setShares).catch(() => setShares([]));
  }, [list.id]);

  const sharedIds = new Set(shares.map((s) => s.userId));

  async function toggle(userId: number) {
    setBusyId(userId);
    try {
      if (sharedIds.has(userId)) await listApi.unshare(list.id, userId);
      else await listApi.share(list.id, { userId, canEdit: true });
      setShares(await listApi.shares(list.id));
      onChanged();
    } catch {
      toast.error('Partage impossible');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-bg-secondary p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="truncate text-lg font-semibold text-text-primary">Partager « {list.name} »</h3>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary" title="Fermer">
            <X size={16} />
          </button>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun collègue à qui partager.</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {members.map((m) => {
              const on = sharedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  disabled={busyId === m.id}
                  onClick={() => toggle(m.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover disabled:opacity-50"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      on ? 'border-accent bg-accent text-white' : 'border-text-muted',
                    )}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 truncate text-text-primary">{m.displayName?.trim() || m.username}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function TodoSidebar({
  smartCounts,
  lists,
  groups,
  members,
  view,
  onSelect,
  onNewList,
  onNewGroup,
  onToggleGroup,
  onChanged,
}: TodoSidebarProps) {
  const [draft, setDraft] = useState('');
  const [groupDraft, setGroupDraft] = useState('');
  const [showGroupInput, setShowGroupInput] = useState(false);

  // List context-menu state (keyed by list id).
  const [menuId, setMenuId] = useState<number | null>(null);
  const [subMenu, setSubMenu] = useState<'color' | 'move' | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [shareList, setShareList] = useState<TaskList | null>(null);

  // Group context-menu state.
  const [groupMenuId, setGroupMenuId] = useState<number | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<number | null>(null);
  const [groupRenameId, setGroupRenameId] = useState<number | null>(null);
  const [groupRenameValue, setGroupRenameValue] = useState('');

  function submit() {
    if (!draft.trim()) return;
    onNewList(draft.trim());
    setDraft('');
  }

  function submitGroup() {
    if (groupDraft.trim()) onNewGroup(groupDraft.trim());
    setGroupDraft('');
    setShowGroupInput(false);
  }

  function closeMenu() {
    setMenuId(null);
    setSubMenu(null);
    setConfirmDeleteId(null);
  }

  // ── List mutations ──────────────────────────────────────────────────────────
  async function renameList(l: TaskList) {
    if (renameId !== l.id) return; // guard against the post-commit blur firing twice
    const name = renameValue.trim();
    setRenameId(null);
    if (name && name !== l.name) {
      await listApi.update(l.id, { name });
      onChanged();
    }
  }

  async function recolorList(l: TaskList, color: string) {
    closeMenu();
    await listApi.update(l.id, { color });
    onChanged();
  }

  async function moveList(l: TaskList, groupId: number | null) {
    closeMenu();
    await listApi.update(l.id, { groupId });
    onChanged();
  }

  async function deleteList(l: TaskList) {
    closeMenu();
    await listApi.remove(l.id);
    toast.success('Liste supprimée');
    if (viewEquals(view, { kind: 'list', id: l.id })) onSelect({ kind: 'smart', key: 'my_day' });
    onChanged();
  }

  // ── Group mutations ─────────────────────────────────────────────────────────
  async function renameGroup(g: ListGroup) {
    if (groupRenameId !== g.id) return; // guard against the post-commit blur firing twice
    const name = groupRenameValue.trim();
    setGroupRenameId(null);
    if (name && name !== g.name) {
      await listApi.updateGroup(g.id, { name });
      onChanged();
    }
  }

  async function deleteGroup(g: ListGroup) {
    setGroupMenuId(null);
    setConfirmDeleteGroupId(null);
    await listApi.removeGroup(g.id);
    toast.success('Groupe supprimé');
    onChanged();
  }

  const ungrouped = lists.filter((l) => !l.groupId);

  function renderListItem(l: TaskList) {
    const active = viewEquals(view, { kind: 'list', id: l.id });
    const owner = !l.shared;
    const renaming = renameId === l.id;
    const menuOpen = menuId === l.id;
    return (
      <div key={l.id}>
        <div
          className={cn(
            'group mb-0.5 flex items-center gap-1 rounded-[7px] pr-1.5 transition-colors',
            active ? 'bg-accent/10' : 'hover:bg-bg-hover',
          )}
        >
          {renaming ? (
            <div className="flex flex-1 items-center gap-3 px-3 py-1.5">
              <ListTodo size={16} style={{ color: l.color }} className="shrink-0" />
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameList(l);
                  if (e.key === 'Escape') setRenameId(null);
                }}
                onBlur={() => renameList(l)}
                className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
              />
            </div>
          ) : (
            <button
              onClick={() => onSelect({ kind: 'list', id: l.id })}
              className={cn(
                'flex flex-1 items-center gap-3 px-3 py-2 text-sm transition-colors',
                active ? 'text-accent-hover' : 'text-text-secondary group-hover:text-text-primary',
              )}
            >
              <ListTodo size={16} style={{ color: l.color }} className="shrink-0" />
              <span className="flex-1 truncate text-left">{l.name}</span>
              {(l.shared || (l.memberCount ?? 0) > 0) && <Users size={13} className="shrink-0 text-text-muted" />}
              {(l.taskCount ?? 0) > 0 && <span className="font-mono text-xs text-text-muted">{l.taskCount}</span>}
            </button>
          )}
          {owner && !renaming && (
            <button
              onClick={() => {
                setMenuId(menuOpen ? null : l.id);
                setSubMenu(null);
                setConfirmDeleteId(null);
              }}
              className={cn(
                'shrink-0 rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary',
                menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
              title="Options"
            >
              <MoreHorizontal size={15} />
            </button>
          )}
        </div>

        {menuOpen && owner && (
          <div className="mb-1 ml-3 mr-1.5 rounded-md border border-border bg-bg-tertiary p-1 text-sm shadow-card">
            {subMenu === null && (
              <>
                <MenuBtn
                  icon={<Pencil size={13} />}
                  label="Renommer"
                  onClick={() => {
                    setRenameId(l.id);
                    setRenameValue(l.name);
                    closeMenu();
                  }}
                />
                <MenuBtn icon={<Palette size={13} />} label="Couleur" onClick={() => setSubMenu('color')} />
                <MenuBtn icon={<FolderInput size={13} />} label="Déplacer vers" onClick={() => setSubMenu('move')} />
                <MenuBtn
                  icon={<Share2 size={13} />}
                  label="Partager"
                  onClick={() => {
                    setShareList(l);
                    closeMenu();
                  }}
                />
                {confirmDeleteId === l.id ? (
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-status-down">
                    <span className="text-xs">Supprimer ?</span>
                    <div className="flex gap-1">
                      <button onClick={() => deleteList(l)} className="rounded p-0.5 hover:bg-bg-hover" title="Confirmer">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="rounded p-0.5 hover:bg-bg-hover" title="Annuler">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <MenuBtn icon={<Trash2 size={13} />} label="Supprimer" danger onClick={() => setConfirmDeleteId(l.id)} />
                )}
              </>
            )}
            {subMenu === 'color' && (
              <div className="flex flex-wrap gap-1.5 p-1.5">
                {LIST_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => recolorList(l, c)}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-border"
                    style={{ backgroundColor: c }}
                    title={c}
                  >
                    {l.color.toLowerCase() === c.toLowerCase() && <Check size={12} className="text-white" />}
                  </button>
                ))}
              </div>
            )}
            {subMenu === 'move' && (
              <>
                <MenuBtn label="Aucun groupe" onClick={() => moveList(l, null)} active={l.groupId == null} />
                {groups.map((g) => (
                  <MenuBtn key={g.id} label={g.name} onClick={() => moveList(l, g.id)} active={l.groupId === g.id} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-bg-secondary">
      <div className="flex-1 overflow-y-auto px-2 pt-3">
        {/* Smart lists */}
        {SMART_LISTS.map((s) => {
          const active = viewEquals(view, { kind: 'smart', key: s.key });
          const count = smartCounts[s.key] ?? 0;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => onSelect({ kind: 'smart', key: s.key })}
              className={cn(
                'mb-0.5 flex w-full items-center gap-3 rounded-[7px] px-3 py-2 text-sm transition-colors',
                active ? 'bg-accent/10 text-accent-hover' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
              )}
            >
              <Icon size={16} style={{ color: s.color }} className="shrink-0" />
              <span className="flex-1 truncate text-left">{s.label}</span>
              {count > 0 && <span className="font-mono text-xs text-text-muted">{count}</span>}
            </button>
          );
        })}

        <div className="my-2 h-px bg-border" />

        {/* Ungrouped custom lists */}
        {ungrouped.map((l) => renderListItem(l))}

        {/* Groups */}
        {groups.map((g) => {
          const groupLists = lists.filter((l) => l.groupId === g.id);
          const gRenaming = groupRenameId === g.id;
          const gMenuOpen = groupMenuId === g.id;
          return (
            <div key={g.id} className="mt-1">
              <div className="group flex items-center gap-1 rounded-[7px] pr-1.5">
                {gRenaming ? (
                  <div className="flex flex-1 items-center gap-2 px-3 py-1.5">
                    <ChevronDown size={13} className="shrink-0 text-text-muted" />
                    <input
                      autoFocus
                      value={groupRenameValue}
                      onChange={(e) => setGroupRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameGroup(g);
                        if (e.key === 'Escape') setGroupRenameId(null);
                      }}
                      onBlur={() => renameGroup(g)}
                      className="flex-1 bg-transparent font-mono text-[11px] uppercase tracking-[0.1em] text-text-secondary focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => onToggleGroup(g)}
                    className="flex flex-1 items-center gap-2 px-3 py-1.5 text-text-muted transition-colors hover:text-text-secondary"
                  >
                    <ChevronDown size={13} className={cn('transition-transform duration-200', g.collapsed && '-rotate-90')} />
                    <span className="flex-1 truncate text-left font-mono text-[11px] uppercase tracking-[0.1em]">{g.name}</span>
                  </button>
                )}
                {!gRenaming && (
                  <button
                    onClick={() => {
                      setGroupMenuId(gMenuOpen ? null : g.id);
                      setConfirmDeleteGroupId(null);
                    }}
                    className={cn(
                      'shrink-0 rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary',
                      gMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                    title="Options du groupe"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                )}
              </div>

              {gMenuOpen && (
                <div className="mb-1 ml-3 mr-1.5 rounded-md border border-border bg-bg-tertiary p-1 shadow-card">
                  <MenuBtn
                    icon={<Pencil size={13} />}
                    label="Renommer"
                    onClick={() => {
                      setGroupRenameId(g.id);
                      setGroupRenameValue(g.name);
                      setGroupMenuId(null);
                    }}
                  />
                  {confirmDeleteGroupId === g.id ? (
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-status-down">
                      <span className="text-xs">Supprimer le groupe ?</span>
                      <div className="flex gap-1">
                        <button onClick={() => deleteGroup(g)} className="rounded p-0.5 hover:bg-bg-hover" title="Confirmer">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setConfirmDeleteGroupId(null)} className="rounded p-0.5 hover:bg-bg-hover" title="Annuler">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <MenuBtn icon={<Trash2 size={13} />} label="Supprimer" danger onClick={() => setConfirmDeleteGroupId(g.id)} />
                  )}
                </div>
              )}

              {!g.collapsed && groupLists.map((l) => <div key={l.id} className="pl-3">{renderListItem(l)}</div>)}
            </div>
          );
        })}
      </div>

      {/* New group composer (inline - no window.prompt) */}
      {showGroupInput && (
        <div className="flex items-center gap-2 border-t border-border p-2">
          <FolderPlus size={16} className="shrink-0 text-text-muted" />
          <input
            autoFocus
            value={groupDraft}
            onChange={(e) => setGroupDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitGroup();
              if (e.key === 'Escape') {
                setShowGroupInput(false);
                setGroupDraft('');
              }
            }}
            placeholder="Nouveau groupe"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>
      )}

      {/* New list composer */}
      <div className="flex items-center gap-2 border-t border-border p-2">
        <Plus size={16} className="shrink-0 text-text-muted" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Nouvelle liste"
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        <button
          onClick={() => setShowGroupInput((v) => !v)}
          title="Nouveau groupe"
          className="shrink-0 rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      {shareList && (
        <ShareModal list={shareList} members={members} onChanged={onChanged} onClose={() => setShareList(null)} />
      )}
    </aside>
  );
}
