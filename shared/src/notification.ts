// ============================================================================
// In-app notification center. One row per recipient; events are fanned out into
// notifications by the notify dispatcher (server/src/services/notify.ts), which
// also best-effort emails the recipient when configured.
// ============================================================================

/** A single in-app notification addressed to one user. */
export interface Notification {
  id: number;
  tenantId: number;
  userId: number;
  /** Event kind, e.g. 'leave.submitted', 'card.assigned'. */
  type: string;
  title: string;
  body: string | null;
  /** In-app route the notification points at, e.g. '/conges'. */
  link: string | null;
  entityType: string | null;
  entityId: number | null;
  /** User who triggered the event (null once that user is deleted). */
  actorId: number | null;
  /** ISO timestamp when the recipient read it, or null while unread. */
  readAt: string | null;
  createdAt: string;
}
