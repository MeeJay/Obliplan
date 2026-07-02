import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Notification } from '@obliplan/shared';
import { useNotificationStore } from '../../store/notificationStore';
import { cn } from '../../utils/cn';

/** ISO timestamp → short French relative label ("il y a 5 min", "il y a 2 h", …). */
export function relativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "à l'instant";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

const notifSupported = typeof window !== 'undefined' && 'Notification' in window;

export function NotificationBell() {
  const { items, unread, fetch, markRead, markAllRead, startPolling, stopPolling } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission>(notifSupported ? Notification.permission : 'denied');
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  async function enableDesktop() {
    if (!notifSupported) return;
    try {
      setPerm(await Notification.requestPermission());
    } catch {
      /* ignore */
    }
  }

  // Poll the unread badge while the bell is mounted (i.e. while authenticated).
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Load the recent list each time the panel opens.
  useEffect(() => {
    if (open) void fetch();
  }, [open, fetch]);

  // Dismiss on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openNotification(n: Notification) {
    void markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  const recent = items.slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        className="relative flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="text-sm font-semibold text-text-primary">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-[12px] font-medium text-accent transition-colors hover:text-accent-hover"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Offer desktop (OS) toasts once, while the app is open - no server push needed. */}
          {notifSupported && perm === 'default' && (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-accent/[0.06] px-3.5 py-2">
              <span className="text-[12px] text-text-secondary">Recevoir les alertes sur le bureau ?</span>
              <button
                onClick={() => void enableDesktop()}
                className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Activer
              </button>
            </div>
          )}

          <div className="max-h-[360px] overflow-y-auto">
            {recent.length === 0 ? (
              <div className="px-3.5 py-10 text-center text-[13px] text-text-muted">Aucune notification</div>
            ) : (
              recent.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={cn(
                    'flex w-full items-start gap-2 border-b border-border/60 px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-bg-hover',
                    !n.readAt && 'bg-accent/[0.06]',
                  )}
                >
                  <span
                    className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', !n.readAt ? 'bg-accent' : 'bg-transparent')}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'truncate text-[13px]',
                        !n.readAt ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary',
                      )}
                    >
                      {n.title}
                    </div>
                    {n.body && <div className="line-clamp-2 text-[12px] text-text-muted">{n.body}</div>}
                    <div className="mt-0.5 text-[11px] text-text-muted">{relativeTime(n.createdAt)}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-3.5 py-2.5 text-center text-[12.5px] font-medium text-accent transition-colors hover:bg-bg-hover"
          >
            Voir toutes les notifications
          </Link>
        </div>
      )}
    </div>
  );
}
