import { Mail, Copy, X, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PlanningAppointment } from '@obliplan/shared';

const STATUS_META: Record<PlanningAppointment['status'], { label: string; cls: string }> = {
  pending: { label: 'À confirmer', cls: 'bg-status-pending/15 text-status-pending' },
  confirmed: { label: 'Confirmé', cls: 'bg-status-up/15 text-status-up' },
  cancelled: { label: 'Annulé', cls: 'bg-status-down/15 text-status-down' },
};

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Detail card for a booked meeting: full name + a clickable mailto so the host can
 *  actually contact the external person. Rendered as a centered modal. */
export function AppointmentDetailModal({ appt, onClose }: { appt: PlanningAppointment; onClose: () => void }) {
  const meta = STATUS_META[appt.status];
  const mailto = `mailto:${appt.email}?subject=${encodeURIComponent(
    `Rendez-vous du ${appt.date} ${appt.start}`,
  )}`;

  function copyEmail() {
    navigator.clipboard.writeText(appt.email).then(
      () => toast.success('E-mail copié'),
      () => toast.error('Copie impossible'),
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-bg-secondary p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
              <CalendarClock size={16} />
            </span>
            <div>
              <div className="text-sm font-semibold text-text-primary">Rendez-vous</div>
              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                {meta.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary" title="Fermer">
            <X size={18} />
          </button>
        </div>

        <dl className="space-y-2.5 text-sm">
          <div>
            <dt className="text-xs font-medium text-text-muted">Personne</dt>
            <dd className="text-text-primary">{appt.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">E-mail</dt>
            <dd className="flex items-center gap-2">
              <a href={mailto} className="min-w-0 truncate text-accent hover:underline">
                {appt.email}
              </a>
              <button onClick={copyEmail} title="Copier l'e-mail" className="shrink-0 text-text-muted hover:text-text-primary">
                <Copy size={13} />
              </button>
            </dd>
          </div>
          {appt.subject && (
            <div>
              <dt className="text-xs font-medium text-text-muted">Objet</dt>
              <dd className="text-text-primary">{appt.subject}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium text-text-muted">Créneau</dt>
            <dd className="capitalize text-text-primary">
              {longDate(appt.date)} · {appt.start}–{appt.end}
            </dd>
          </div>
        </dl>

        <a
          href={mailto}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <Mail size={15} /> Contacter par e-mail
        </a>
      </div>
    </div>
  );
}
