import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, ExternalLink, RefreshCw, Check, X } from 'lucide-react';
import type { BookingPageConfig, BookingPageInput, Appointment } from '@obliplan/shared';
import { bookingApi } from '../api';
import { Card, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Spinner } from '../components/common/Spinner';

const SLOT_OPTIONS = [15, 20, 30, 45, 60, 90];

const STATUS_META: Record<Appointment['status'], { label: string; cls: string }> = {
  pending: { label: 'À confirmer', cls: 'bg-status-pending/15 text-status-pending' },
  confirmed: { label: 'Confirmé', cls: 'bg-status-up/15 text-status-up' },
  cancelled: { label: 'Annulé', cls: 'bg-status-down/15 text-status-down' },
};

const ddmm = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

export function BookingSettingsPage() {
  const [cfg, setCfg] = useState<BookingPageConfig | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [includePast, setIncludePast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function loadAppts(past: boolean) {
    bookingApi.appointments(past).then(setAppts).catch(() => setAppts([]));
  }

  useEffect(() => {
    Promise.all([bookingApi.me(), bookingApi.appointments(false)])
      .then(([c, a]) => {
        setCfg(c);
        setAppts(a);
      })
      .finally(() => setLoading(false));
  }, []);

  function patch<K extends keyof BookingPageConfig>(key: K, value: BookingPageConfig[K]) {
    setCfg((c) => (c ? { ...c, [key]: value } : c));
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    const payload: BookingPageInput = {
      title: cfg.title,
      intro: cfg.intro,
      slotMinutes: cfg.slotMinutes,
      bufferMinutes: cfg.bufferMinutes,
      minNoticeHours: cfg.minNoticeHours,
      horizonDays: cfg.horizonDays,
      workStart: cfg.workStart,
      workEnd: cfg.workEnd,
      validationMode: cfg.validationMode,
      isActive: cfg.isActive,
    };
    try {
      setCfg(await bookingApi.update(payload));
      toast.success('Page de réservation enregistrée');
    } catch {
      toast.error("Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!confirm('Régénérer le lien ? L\'ancien lien cessera immédiatement de fonctionner.')) return;
    try {
      setCfg(await bookingApi.regenerate());
      toast.success('Nouveau lien généré');
    } catch {
      toast.error('Échec de la régénération');
    }
  }

  function copyLink() {
    if (!cfg) return;
    navigator.clipboard.writeText(cfg.publicUrl).then(
      () => toast.success('Lien copié'),
      () => toast.error('Copie impossible'),
    );
  }

  async function setStatus(id: number, action: 'confirm' | 'cancel') {
    try {
      const updated = action === 'confirm' ? await bookingApi.confirm(id) : await bookingApi.cancel(id);
      setAppts((list) => list.map((a) => (a.id === id ? updated : a)));
      toast.success(action === 'confirm' ? 'Rendez-vous confirmé' : 'Rendez-vous annulé');
    } catch {
      toast.error('Action impossible');
    }
  }

  if (loading || !cfg) return <Spinner className="h-40" />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Rendez-vous</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Partagez un lien public pour que des personnes externes réservent un créneau avec vous. Les disponibilités sont
          celles de votre planning validé, sur les types d'heures marqués comme réservables. Un créneau vide de planning est
          considéré hors horaires de travail.
        </p>
      </div>

      {/* Publication + lien public */}
      <Card>
        <CardBody className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={cfg.isActive}
              onChange={(e) => patch('isActive', e.target.checked)}
            />
            <span className="text-sm font-medium text-text-primary">Page de réservation publiée</span>
          </label>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-muted">Lien public</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={cfg.publicUrl}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-secondary"
              />
              <Button variant="secondary" onClick={copyLink} title="Copier">
                <Copy size={15} />
              </Button>
              <a
                href={cfg.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-[38px] items-center justify-center rounded-md border border-border bg-bg-tertiary px-3 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                title="Ouvrir"
              >
                <ExternalLink size={15} />
              </a>
              <Button variant="secondary" onClick={regenerate} title="Régénérer le lien">
                <RefreshCw size={15} />
              </Button>
            </div>
            {!cfg.isActive && (
              <p className="text-xs text-status-pending">
                La page n'est pas publiée. Le lien renvoie une erreur tant que la case ci-dessus n'est pas cochée.
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Réglages */}
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Réglages</h3>

          <Input
            label="Titre (optionnel)"
            value={cfg.title ?? ''}
            onChange={(e) => patch('title', e.target.value || null)}
            placeholder="Prendre rendez-vous"
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-text-secondary">Message d'accueil (optionnel)</label>
            <textarea
              rows={2}
              value={cfg.intro ?? ''}
              onChange={(e) => patch('intro', e.target.value || null)}
              className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"
              placeholder="Choisissez un créneau qui vous convient."
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-text-secondary">Durée d'un créneau</label>
              <select
                value={cfg.slotMinutes}
                onChange={(e) => patch('slotMinutes', Number(e.target.value))}
                className="h-[38px] w-full rounded-md border border-border bg-bg-tertiary px-2 text-sm text-text-primary"
              >
                {SLOT_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Battement (min)"
              type="number"
              min={0}
              value={cfg.bufferMinutes}
              onChange={(e) => patch('bufferMinutes', Number(e.target.value))}
            />
            <Input
              label="Préavis (heures)"
              type="number"
              min={0}
              value={cfg.minNoticeHours}
              onChange={(e) => patch('minNoticeHours', Number(e.target.value))}
            />
            <Input
              label="Horizon (jours)"
              type="number"
              min={1}
              max={120}
              value={cfg.horizonDays}
              onChange={(e) => patch('horizonDays', Number(e.target.value))}
            />
            <Input
              label="Début de journée"
              type="time"
              value={cfg.workStart}
              onChange={(e) => patch('workStart', e.target.value)}
            />
            <Input
              label="Fin de journée"
              type="time"
              value={cfg.workEnd}
              onChange={(e) => patch('workEnd', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-text-secondary">Validation des réservations</label>
            <select
              value={cfg.validationMode}
              onChange={(e) => patch('validationMode', e.target.value as BookingPageConfig['validationMode'])}
              className="h-[38px] w-full rounded-md border border-border bg-bg-tertiary px-2 text-sm text-text-primary sm:w-80"
            >
              <option value="manager">Validée par mon manager (par défaut)</option>
              <option value="self">Validée par moi-même</option>
              <option value="auto">Confirmation automatique</option>
            </select>
            <p className="text-xs text-text-muted">
              {cfg.validationMode === 'manager'
                ? 'Chaque demande arrive en "à confirmer" et votre manager la valide. Il reçoit une notification et un e-mail.'
                : cfg.validationMode === 'self'
                  ? 'Chaque demande arrive en "à confirmer" et vous la validez vous-même. Vous recevez une notification et un e-mail.'
                  : 'Les réservations sont confirmées immédiatement. Vous êtes simplement informé.'}
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Demandes */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Demandes de rendez-vous</h3>
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={includePast}
                onChange={(e) => {
                  setIncludePast(e.target.checked);
                  loadAppts(e.target.checked);
                }}
              />
              Inclure le passé
            </label>
          </div>

          {appts.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Aucun rendez-vous.</p>
          ) : (
            <ul className="divide-y divide-border">
              {appts.map((a) => {
                const meta = STATUS_META[a.status];
                // The host can't self-confirm in 'manager' mode (only the manager can);
                // as a manager viewing a report's RDV (!mine) confirming is always allowed.
                const canConfirm = a.status === 'pending' && (!a.mine || cfg.validationMode !== 'manager');
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="w-16 shrink-0 text-sm font-semibold text-text-primary">{ddmm(a.date)}</div>
                    <div className="w-24 shrink-0 font-mono text-xs text-text-secondary">
                      {a.start}-{a.end}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-text-primary">{a.externalName}</span>
                        {!a.mine && (
                          <span className="shrink-0 rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                            Équipe · {a.hostName}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-text-muted">
                        {a.externalEmail}
                        {a.subject ? ` · ${a.subject}` : ''}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                    {a.status !== 'cancelled' && (
                      <div className="flex items-center gap-1.5">
                        {canConfirm && (
                          <button
                            onClick={() => setStatus(a.id, 'confirm')}
                            title="Confirmer"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-status-up transition-colors hover:bg-status-up/10"
                          >
                            <Check size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => setStatus(a.id, 'cancel')}
                          title="Annuler"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-status-down transition-colors hover:bg-status-down/10"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
