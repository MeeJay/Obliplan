import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  Clock,
  Plus,
  X,
  Link2,
  ListTree,
  MessageSquare,
  History,
  Send,
  Trash2,
  ArrowRight,
  Pencil,
  CheckCircle2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type {
  Card,
  BoardColumn,
  BoardDetail,
  Sprint,
  CardPriority,
  CardLinkType,
  CardComment,
  CardActivity,
} from '@obliplan/shared';
import { boardApi, timeEntryApi, type AssignableUser } from '../../api';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { UserAvatar } from '../common/UserAvatar';
import { relativeTime } from '../notifications/NotificationBell';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/cn';
import { minToHm } from '../../utils/format';
import { PRIORITIES, PRIORITY_META } from './cardMeta';

const LINK_TYPES: CardLinkType[] = ['blocks', 'relates', 'duplicates'];
/** Directional labels: index 0 = this card is the source, 1 = this card is the target. */
const LINK_LABEL: Record<CardLinkType, [string, string]> = {
  blocks: ['Bloque', 'Bloqué par'],
  relates: ['Lié à', 'Lié à'],
  duplicates: ['Duplique', 'Dupliqué par'],
};
/** Heuristic "done" column convention for the subtask progress count. */
const DONE_COLUMN_RE = /termin|fini|done|clos|achev/i;

interface Mentionable {
  id: number;
  name: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Render a comment body, highlighting `@Name` tokens (known members first, then bare words). */
function renderCommentBody(body: string, names: string[]): ReactNode[] {
  const known = [...names].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const alt = known.length > 0 ? `${known.join('|')}|[\\wÀ-ÿ]+` : '[\\wÀ-ÿ]+';
  const re = new RegExp(`@(?:${alt})`, 'g');
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <span key={key++} className="rounded bg-accent/15 px-1 font-medium text-accent">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

interface CardEditorProps {
  boardId: number;
  columns: BoardColumn[];
  sprints: Sprint[];
  assignees: AssignableUser[];
  card?: Card | null;
  defaultColumnId: number;
  /** Full board payload - enables member-sourced assignees, subtasks and dependencies. */
  board?: BoardDetail;
  /** Open another card (used to jump into a subtask). */
  onOpenCard?: (card: Card) => void;
  onClose: () => void;
  onSaved: () => void;
}

export function CardEditor({
  boardId,
  columns,
  sprints,
  assignees,
  card,
  defaultColumnId,
  board,
  onOpenCard,
  onClose,
  onSaved,
}: CardEditorProps) {
  const [title, setTitle] = useState(card?.title ?? '');
  const [description, setDescription] = useState(card?.description ?? '');
  const [columnId, setColumnId] = useState(card?.columnId ?? defaultColumnId);
  const [sprintId, setSprintId] = useState<number | null>(card?.sprintId ?? null);
  const [priority, setPriority] = useState<CardPriority | ''>(card?.priority ?? '');
  const [points, setPoints] = useState(card?.points != null ? String(card.points) : '');
  // Planned effort in hours (persisted as estimateMin minutes).
  const [estimateH, setEstimateH] = useState(
    card?.estimateMin != null ? String(Number((card.estimateMin / 60).toFixed(2))) : '',
  );
  const [startDate, setStartDate] = useState(card?.startDate ?? '');
  const [dueDate, setDueDate] = useState(card?.dueDate ?? '');
  const [assigneeId, setAssigneeId] = useState<number | null>(card?.assigneeId ?? null);
  const [saving, setSaving] = useState(false);
  const [timeMin, setTimeMin] = useState<number | null>(null);

  // Subtask + dependency editor state (only meaningful for an existing card on a board).
  const [newSubtask, setNewSubtask] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState<number | ''>('');
  const [linkType, setLinkType] = useState<CardLinkType>('blocks');
  const [linkBusy, setLinkBusy] = useState(false);

  // Comments + activity feed (existing card only).
  const me = useAuthStore((s) => s.user);
  const [comments, setComments] = useState<CardComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [activity, setActivity] = useState<CardActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  // @mention autocomplete state.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<Mentionable[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef(0);

  // Assignee options come from the board's team; fall back to the global pool if empty.
  const assigneeOptions = useMemo<{ id: number; name: string }[]>(() => {
    const members = board?.members ?? [];
    const opts = members.length > 0
      ? members.map((m) => ({ id: m.userId, name: m.userName }))
      : assignees.map((u) => ({ id: u.id, name: u.displayName || u.username }));
    // Keep a current assignee who is no longer a board member visible/selectable.
    if (assigneeId != null && !opts.some((o) => o.id === assigneeId)) {
      const known = assignees.find((u) => u.id === assigneeId);
      opts.push({ id: assigneeId, name: known ? known.displayName || known.username : `#${assigneeId}` });
    }
    return opts;
  }, [board, assignees, assigneeId]);

  const columnName = useMemo(() => new Map(columns.map((c) => [c.id, c.name])), [columns]);
  const cardById = useMemo(() => new Map((board?.cards ?? []).map((c) => [c.id, c])), [board]);

  const subtasks = useMemo(
    () => (board && card ? board.cards.filter((c) => c.parentCardId === card.id) : []),
    [board, card],
  );
  const subtaskDone = useMemo(
    () => subtasks.filter((c) => DONE_COLUMN_RE.test(columnName.get(c.columnId) ?? '')).length,
    [subtasks, columnName],
  );

  const links = useMemo(
    () => (board && card ? board.links.filter((l) => l.sourceCardId === card.id || l.targetCardId === card.id) : []),
    [board, card],
  );
  const blockedByCount = useMemo(
    () => links.filter((l) => l.targetCardId === card?.id && l.type === 'blocks').length,
    [links, card],
  );
  // Cards selectable as a dependency target: any board card except this one.
  const linkCandidates = useMemo(
    () => (board && card ? board.cards.filter((c) => c.id !== card.id) : []),
    [board, card],
  );

  // Members eligible for @mention + name resolution for the activity feed.
  const memberPool = useMemo<Mentionable[]>(
    () => (board?.members ?? []).map((m) => ({ id: m.userId, name: m.userName })),
    [board],
  );
  const memberNames = useMemo(() => memberPool.map((m) => m.name), [memberPool]);
  const userName = useMemo(() => new Map(memberPool.map((m) => [m.id, m.name])), [memberPool]);

  // Filtered @mention suggestions for the live composer query.
  const mentionMatches = useMemo<Mentionable[]>(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return memberPool.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, memberPool]);

  // Comment authors may delete their own; board managers may delete any.
  const isBoardManager = useMemo(() => {
    if (!me) return false;
    // Mirror the server (boardService.isBoardManager): tenant admin, board owner, or a board
    // owner/admin member - NOT a plain tenant 'manager'.
    if (me.role === 'admin') return true;
    if (board?.ownerId === me.id) return true;
    const mem = board?.members.find((m) => m.userId === me.id);
    return mem?.role === 'owner' || mem?.role === 'admin';
  }, [me, board]);

  const cardId = card?.id;

  function reloadComments() {
    if (cardId == null) return;
    setCommentsLoading(true);
    boardApi
      .comments(cardId)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }
  function reloadActivity() {
    if (cardId == null) return;
    setActivityLoading(true);
    boardApi
      .activity(cardId)
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false));
  }

  // Load comments + activity whenever the editor opens (or jumps to) an existing card.
  useEffect(() => {
    setCommentBody('');
    setMentioned([]);
    setMentionQuery(null);
    setComments([]);
    setActivity([]);
    if (cardId == null) return;
    let alive = true;
    setCommentsLoading(true);
    setActivityLoading(true);
    boardApi
      .comments(cardId)
      .then((c) => alive && setComments(c))
      .catch(() => alive && setComments([]))
      .finally(() => alive && setCommentsLoading(false));
    boardApi
      .activity(cardId)
      .then((a) => alive && setActivity(a))
      .catch(() => alive && setActivity([]))
      .finally(() => alive && setActivityLoading(false));
    return () => {
      alive = false;
    };
  }, [cardId]);

  function onComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const caret = e.target.selectionStart ?? value.length;
    caretRef.current = caret;
    setCommentBody(value);
    // Active mention token: an '@' at line-start or after whitespace, up to the caret.
    const m = /(?:^|\s)@([^\s@]*)$/.exec(value.slice(0, caret));
    setMentionQuery(m ? m[1] : null);
  }

  function insertMention(member: Mentionable) {
    const caret = caretRef.current;
    const before = commentBody.slice(0, caret);
    const after = commentBody.slice(caret);
    const replaced = before.replace(/(^|\s)@([^\s@]*)$/, (_full, pre: string) => `${pre}@${member.name} `);
    const newBody = replaced + after;
    const newCaret = replaced.length;
    setCommentBody(newBody);
    setMentioned((prev) => (prev.some((p) => p.id === member.id) ? prev : [...prev, member]));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(newCaret, newCaret);
        caretRef.current = newCaret;
      }
    });
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionMatches[0]);
        return;
      }
    }
    if (mentionQuery !== null && e.key === 'Escape') {
      setMentionQuery(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submitComment();
    }
  }

  async function submitComment() {
    if (cardId == null) return;
    const body = commentBody.trim();
    if (!body) return;
    // Keep only mentions whose '@Name' token still survives in the final body.
    const mentions = Array.from(
      new Set(mentioned.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id)),
    );
    setCommentBusy(true);
    try {
      await boardApi.addComment(cardId, { body, mentions });
      setCommentBody('');
      setMentioned([]);
      setMentionQuery(null);
      reloadComments();
      reloadActivity();
    } catch {
      toast.error('Échec de l\'envoi du commentaire');
    } finally {
      setCommentBusy(false);
    }
  }

  async function deleteComment(id: number) {
    try {
      await boardApi.removeComment(id);
      reloadComments();
      reloadActivity();
    } catch {
      toast.error('Suppression impossible');
    }
  }

  function describeActivity(a: CardActivity): { icon: LucideIcon; label: string } {
    const meta = (a.meta ?? {}) as Record<string, unknown>;
    switch (a.type) {
      case 'created':
        return { icon: Plus, label: 'a créé la carte' };
      case 'assigned': {
        const raw = meta.assigneeId;
        const id = typeof raw === 'number' ? raw : null;
        const name = id != null ? userName.get(id) ?? `#${id}` : null;
        return { icon: UserPlus, label: name ? `a assigné à ${name}` : 'a retiré l\'assignation' };
      }
      case 'moved': {
        const raw = meta.to ?? meta.toColumn ?? meta.column ?? meta.toColumnId;
        const to = typeof raw === 'number' ? columnName.get(raw) : typeof raw === 'string' ? raw : undefined;
        return { icon: ArrowRight, label: to ? `a déplacé vers ${to}` : 'a déplacé la carte' };
      }
      case 'status':
        return { icon: CheckCircle2, label: 'a changé le statut' };
      case 'commented':
        return { icon: MessageSquare, label: 'a commenté' };
      case 'updated':
      default:
        return { icon: Pencil, label: 'a mis à jour la carte' };
    }
  }

  // Accumulated time logged against this card (board totals filtered to the card).
  useEffect(() => {
    if (!card) return;
    let alive = true;
    timeEntryApi
      .totals(boardId)
      .then((totals) => {
        if (alive) setTimeMin(totals.find((t) => t.cardId === card.id)?.minutes ?? 0);
      })
      .catch(() => {
        if (alive) setTimeMin(null);
      });
    return () => {
      alive = false;
    };
  }, [card, boardId]);

  async function save() {
    if (!title.trim()) {
      toast.error('Titre requis');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        columnId,
        sprintId,
        title: title.trim(),
        description: description || null,
        priority: (priority || null) as CardPriority | null,
        points: points ? Number(points) : null,
        estimateMin: estimateH ? Math.round(Number(estimateH) * 60) : null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        assigneeId,
      };
      if (card) await boardApi.updateCard(card.id, payload);
      else await boardApi.addCard(boardId, payload);
      toast.success('Carte enregistrée');
      onSaved();
      onClose();
    } catch {
      toast.error('Échec de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!card) return;
    setSaving(true);
    try {
      await boardApi.removeCard(card.id);
      toast.success('Carte supprimée');
      onSaved();
      onClose();
    } catch {
      toast.error('Échec de la suppression');
    } finally {
      setSaving(false);
    }
  }

  async function addSubtask() {
    if (!card || !newSubtask.trim()) return;
    setSubBusy(true);
    try {
      await boardApi.addCard(boardId, {
        columnId: card.columnId,
        title: newSubtask.trim(),
        parentCardId: card.id,
      });
      setNewSubtask('');
      onSaved();
    } catch {
      toast.error('Échec de l\'ajout');
    } finally {
      setSubBusy(false);
    }
  }

  async function addLink() {
    if (!card || linkTargetId === '') return;
    setLinkBusy(true);
    try {
      await boardApi.addLink(card.id, { targetCardId: linkTargetId, type: linkType });
      setLinkTargetId('');
      setLinkType('blocks');
      onSaved();
    } catch {
      toast.error('Lien impossible');
    } finally {
      setLinkBusy(false);
    }
  }

  async function removeLink(linkId: number) {
    setLinkBusy(true);
    try {
      await boardApi.removeLink(linkId);
      onSaved();
    } catch {
      toast.error('Suppression impossible');
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-bg-secondary p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold text-text-primary">{card ? 'Modifier' : 'Nouvelle'} carte</h3>
        <div className="space-y-3">
          <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Colonne" value={columnId} onChange={(e) => setColumnId(Number(e.target.value))}>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Sprint"
              value={sprintId ?? ''}
              onChange={(e) => setSprintId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select label="Priorité" value={priority} onChange={(e) => setPriority(e.target.value as CardPriority | '')}>
              <option value="">-</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
            <Input label="Points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
            <Input
              label="Estimation (h)"
              type="number"
              min="0"
              step="any"
              value={estimateH}
              onChange={(e) => setEstimateH(e.target.value)}
            />
            <Input label="Début" type="date" value={startDate ?? ''} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Échéance" type="date" value={dueDate ?? ''} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Assigné</label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAssigneeId(null)}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs',
                  assigneeId === null
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-bg-tertiary text-text-secondary hover:text-text-primary',
                )}
              >
                Non assigné
              </button>
              {assigneeOptions.map((u) => {
                const name = u.name;
                const active = assigneeId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    title={name}
                    onClick={() => setAssigneeId(u.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs',
                      active
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border bg-bg-tertiary text-text-secondary hover:text-text-primary',
                    )}
                  >
                    <UserAvatar username={name} size={20} />
                    <span className="max-w-[7rem] truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {board && card && (
            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <ListTree size={14} className="text-text-muted" />
                Sous-tâches
                {subtasks.length > 0 && (
                  <span className="rounded bg-bg-active px-1.5 py-0.5 text-xs font-normal text-text-muted">
                    {subtaskDone}/{subtasks.length} terminées
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {subtasks.map((st) => {
                  const done = DONE_COLUMN_RE.test(columnName.get(st.columnId) ?? '');
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onOpenCard?.(st)}
                      className="flex w-full items-center gap-2 rounded-md border border-border bg-bg-tertiary px-2 py-1 text-left text-sm hover:border-accent/50"
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', done ? 'bg-status-up' : 'bg-text-muted')} />
                      <span className={cn('flex-1 truncate text-text-primary', done && 'text-text-muted line-through')}>
                        {st.title}
                      </span>
                      <span className="text-xs text-text-muted">{columnName.get(st.columnId)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                  placeholder="Nouvelle sous-tâche"
                  className="flex-1 rounded-md border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <Button size="sm" variant="secondary" onClick={addSubtask} loading={subBusy} disabled={!newSubtask.trim()}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          )}

          {board && card && (
            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <Link2 size={14} className="text-text-muted" />
                Dépendances
                {blockedByCount > 0 && (
                  <span className="rounded border border-status-down/40 bg-status-down/15 px-1.5 py-0.5 text-xs font-normal text-status-down">
                    Bloqué par {blockedByCount}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {links.map((l) => {
                  const isSource = l.sourceCardId === card.id;
                  const otherId = isSource ? l.targetCardId : l.sourceCardId;
                  const other = cardById.get(otherId);
                  const label = LINK_LABEL[l.type][isSource ? 0 : 1];
                  return (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-bg-tertiary px-2 py-1 text-sm"
                    >
                      <span className="shrink-0 rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-muted">{label}</span>
                      <span className="flex-1 truncate text-text-primary">{other?.title ?? `#${otherId}`}</span>
                      <button
                        onClick={() => removeLink(l.id)}
                        disabled={linkBusy}
                        title="Retirer le lien"
                        className="text-text-muted hover:text-status-down disabled:opacity-50"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                {links.length === 0 && <p className="text-xs text-text-muted">Aucune dépendance.</p>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value as CardLinkType)}
                  className="rounded-md border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary"
                >
                  {LINK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {LINK_LABEL[t][0]}
                    </option>
                  ))}
                </select>
                <select
                  value={linkTargetId === '' ? '' : String(linkTargetId)}
                  onChange={(e) => setLinkTargetId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="min-w-0 flex-1 rounded-md border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary"
                >
                  <option value="">Choisir une carte…</option>
                  {linkCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="secondary" onClick={addLink} loading={linkBusy} disabled={linkTargetId === ''}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          )}

          {card && (
            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <MessageSquare size={14} className="text-text-muted" />
                Commentaires
                {comments.length > 0 && (
                  <span className="rounded bg-bg-active px-1.5 py-0.5 text-xs font-normal text-text-muted">
                    {comments.length}
                  </span>
                )}
              </div>
              {commentsLoading ? (
                <p className="text-xs text-text-muted">Chargement…</p>
              ) : (
                <div className="space-y-2.5">
                  {comments.map((c) => {
                    const canDelete = (c.authorId != null && c.authorId === me?.id) || isBoardManager;
                    return (
                      <div key={c.id} className="group flex gap-2">
                        <UserAvatar username={c.authorName} size={24} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-text-primary">{c.authorName}</span>
                            <span className="text-[11px] text-text-muted">{relativeTime(c.createdAt)}</span>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => deleteComment(c.id)}
                                title="Supprimer le commentaire"
                                className="ml-auto text-text-muted opacity-0 transition hover:text-status-down group-hover:opacity-100"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm text-text-secondary">
                            {renderCommentBody(c.body, memberNames)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {comments.length === 0 && <p className="text-xs text-text-muted">Aucun commentaire.</p>}
                </div>
              )}
              <div className="relative mt-2">
                <textarea
                  ref={composerRef}
                  value={commentBody}
                  onChange={onComposerChange}
                  onKeyDown={onComposerKeyDown}
                  rows={2}
                  placeholder="Écrire un commentaire… (@ pour mentionner)"
                  className="w-full resize-none rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
                {mentionMatches.length > 0 && (
                  <div className="absolute left-2 right-2 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-md border border-border bg-bg-secondary py-1 shadow-card">
                    {mentionMatches.map((mt) => (
                      <button
                        key={mt.id}
                        type="button"
                        // onMouseDown (not onClick) so the textarea keeps focus through the pick.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertMention(mt);
                        }}
                        className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm text-text-primary hover:bg-bg-active"
                      >
                        <UserAvatar username={mt.name} size={20} />
                        <span className="truncate">{mt.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-1.5 flex justify-end">
                  <Button size="sm" onClick={submitComment} loading={commentBusy} disabled={!commentBody.trim()}>
                    <Send size={13} className="mr-1" /> Commenter
                  </Button>
                </div>
              </div>
            </div>
          )}

          {card && (
            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <History size={14} className="text-text-muted" />
                Activité
              </div>
              {activityLoading ? (
                <p className="text-xs text-text-muted">Chargement…</p>
              ) : activity.length === 0 ? (
                <p className="text-xs text-text-muted">Aucune activité.</p>
              ) : (
                <div className="space-y-1.5">
                  {activity.map((a) => {
                    const { icon: Icon, label } = describeActivity(a);
                    return (
                      <div key={a.id} className="flex items-center gap-2 text-xs text-text-muted">
                        <Icon size={13} className="shrink-0 text-text-muted" />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-text-secondary">{a.actorName}</span> {label}
                        </span>
                        <span className="shrink-0">{relativeTime(a.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {card && timeMin != null && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Clock size={13} /> Temps passé : <span className="font-mono text-text-secondary">{minToHm(timeMin)}</span>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-between">
          {card ? (
            <Button variant="danger" onClick={remove} loading={saving}>
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={save} loading={saving}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
