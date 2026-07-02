import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BellOff } from 'lucide-react';
import { useNotificationStore } from '../store/notificationStore';
import { relativeTime } from '../components/notifications/NotificationBell';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { cn } from '../utils/cn';

export function NotificationsPage() {
  const { items, unread, loading, fetch, markRead, markAllRead } = useNotificationStore();

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text-primary">Notifications</h2>
        {unread > 0 && (
          <Button variant="secondary" size="sm" onClick={() => void markAllRead()}>
            Tout marquer lu ({unread})
          </Button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <Spinner className="h-40" />
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <BellOff size={28} className="text-text-muted" />
          <p className="text-sm text-text-secondary">Aucune notification pour le moment.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {items.map((n) => {
            const row = (
              <div
                className={cn(
                  'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bg-hover',
                  !n.readAt && 'bg-accent/[0.06]',
                )}
              >
                <span
                  className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', !n.readAt ? 'bg-accent' : 'bg-transparent')}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'text-sm',
                      !n.readAt ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary',
                    )}
                  >
                    {n.title}
                  </div>
                  {n.body && <div className="mt-0.5 text-[13px] text-text-muted">{n.body}</div>}
                </div>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-text-muted">
                  {relativeTime(n.createdAt)}
                </span>
              </div>
            );

            return n.link ? (
              <Link key={n.id} to={n.link} onClick={() => void markRead(n.id)} className="block">
                {row}
              </Link>
            ) : (
              <button key={n.id} onClick={() => void markRead(n.id)} className="block w-full text-left">
                {row}
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
