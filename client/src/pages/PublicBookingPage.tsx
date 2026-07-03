import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Check, ArrowLeft } from 'lucide-react';
import type { PublicBookingPage as PublicPage, BookingSlot, AppointmentBooked } from '@obliplan/shared';
import { publicBookingApi } from '../api';

const WINDOW_DAYS = 14;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

type Selected = { date: string; slot: BookingSlot } | null;

export function PublicBookingPage() {
  const { token = '' } = useParams();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [from, setFrom] = useState<string>(todayIso());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState<Selected>(null);
  const [booked, setBooked] = useState<AppointmentBooked | null>(null);

  const load = useCallback(
    (start: string) => {
      setLoading(true);
      publicBookingApi
        .page(token, { from: start, to: addDays(start, WINDOW_DAYS - 1) })
        .then((p) => {
          setPage(p);
          setNotFound(false);
        })
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false));
    },
    [token],
  );

  useEffect(() => {
    load(from);
  }, [load, from]);

  const atStart = from <= todayIso();

  if (notFound) {
    return (
      <Shell>
        <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center shadow-card">
          <CalendarClock size={32} className="mx-auto mb-3 text-text-muted" />
          <h1 className="text-lg font-semibold text-text-primary">Page indisponible</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Ce lien de réservation n'existe pas ou n'est plus actif.
          </p>
        </div>
      </Shell>
    );
  }

  if (booked) {
    const confirmed = booked.status === 'confirmed';
    return (
      <Shell>
        <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center shadow-card">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-status-up/15 text-status-up">
            <Check size={24} />
          </div>
          <h1 className="text-lg font-semibold text-text-primary">
            {confirmed ? 'Rendez-vous confirmé' : 'Demande envoyée'}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {longDate(booked.date)} de {booked.start} à {booked.end}.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {confirmed
              ? 'Vous recevrez un e-mail de confirmation.'
              : 'Votre demande sera validée par votre interlocuteur. Vous serez averti par e-mail.'}
          </p>
          <button
            onClick={() => {
              setBooked(null);
              setSelected(null);
              load(from);
            }}
            className="mt-5 text-sm font-medium text-accent hover:underline"
          >
            Réserver un autre créneau
          </button>
        </div>
      </Shell>
    );
  }

  if (selected && page) {
    return (
      <Shell>
        <BookingForm
          token={token}
          hostName={page.hostName}
          selected={selected}
          onBack={() => setSelected(null)}
          onBooked={setBooked}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-xl border border-border bg-bg-secondary shadow-card">
        <div className="border-b border-border p-6">
          <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {page?.organization ?? 'Réservation'}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-text-primary">
            {page?.title || `Prendre rendez-vous avec ${page?.hostName ?? ''}`}
          </h1>
          {page?.intro && <p className="mt-2 text-sm text-text-secondary">{page.intro}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
            <Clock size={13} /> Créneaux de {page?.slotMinutes ?? 30} min · fuseau {page?.timezone ?? 'Europe/Paris'}
          </p>
        </div>

        {/* Navigation de période */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <button
            disabled={atStart}
            onClick={() => setFrom(addDays(from, -WINDOW_DAYS) < todayIso() ? todayIso() : addDays(from, -WINDOW_DAYS))}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={15} /> Précédent
          </button>
          <span className="text-xs text-text-muted">2 semaines</span>
          <button
            onClick={() => setFrom(addDays(from, WINDOW_DAYS))}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            Suivant <ChevronRight size={15} />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="py-10 text-center text-sm text-text-muted">Chargement des disponibilités…</p>
          ) : page && page.days.length > 0 ? (
            <div className="space-y-5">
              {page.days.map((day) => (
                <div key={day.date}>
                  <div className="mb-2 text-sm font-medium capitalize text-text-primary">{longDate(day.date)}</div>
                  <div className="flex flex-wrap gap-2">
                    {day.slots.map((slot) => (
                      <button
                        key={slot.start}
                        onClick={() => setSelected({ date: day.date, slot })}
                        className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent-hover"
                      >
                        {slot.start}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-text-muted">
              Aucun créneau disponible sur cette période. Essayez la période suivante.
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary px-4 py-10">
      <div className="mx-auto w-full max-w-lg">{children}</div>
      <p className="mx-auto mt-6 max-w-lg text-center text-xs text-text-muted">Propulsé par Obliplan</p>
    </div>
  );
}

function BookingForm({
  token,
  hostName,
  selected,
  onBack,
  onBooked,
}: {
  token: string;
  hostName: string;
  selected: NonNullable<Selected>;
  onBack: () => void;
  onBooked: (r: AppointmentBooked) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await publicBookingApi.book(token, {
        date: selected.date,
        start: selected.slot.start,
        end: selected.slot.end,
        name,
        email,
        subject: subject || null,
      });
      onBooked(result);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 409
          ? 'Ce créneau vient d\'être pris. Merci d\'en choisir un autre.'
          : 'La réservation a échoué. Merci de réessayer.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const field = 'w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary';

  return (
    <div className="rounded-xl border border-border bg-bg-secondary shadow-card">
      <div className="border-b border-border p-6">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft size={15} /> Retour
        </button>
        <h1 className="text-lg font-semibold text-text-primary">Confirmer le rendez-vous</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Avec {hostName} · {longDate(selected.date)} de {selected.slot.start} à {selected.slot.end}.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3 p-6">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-text-secondary">Nom complet</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-text-secondary">E-mail</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-text-secondary">Objet (optionnel)</label>
          <textarea rows={2} value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </div>
        {error && <p className="text-sm text-status-down">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {submitting ? 'Réservation…' : 'Réserver'}
        </button>
      </form>
    </div>
  );
}
