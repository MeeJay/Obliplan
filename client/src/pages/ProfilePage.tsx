import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { UserAvatar } from '../components/common/UserAvatar';
import { Card, CardHeader, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { icsApi, gdprApi, authApi, downloadJson } from '../api';
import type { AppTheme } from '@obliplan/shared';

const ROLE_LABEL: Record<string, string> = { admin: 'Administrateur', manager: 'Manager', employe: 'Salarié' };
const THEMES: { value: AppTheme; label: string }[] = [
  { value: 'obli-operator', label: 'Operator' },
  { value: 'obli-daylight', label: 'Daylight' },
  { value: 'modern', label: 'Modern' },
  { value: 'neon', label: 'Neon' },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary">{value}</span>
    </div>
  );
}

function IcsSubscriptionCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    icsApi
      .me()
      .then((res) => setUrl(res.url))
      .catch(() => toast.error('Chargement du lien impossible'))
      .finally(() => setLoading(false));
  }, []);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Lien copié');
    } catch {
      toast.error('Copie impossible');
    }
  }

  async function doRegenerate() {
    setRegenerating(true);
    try {
      const res = await icsApi.regenerate();
      setUrl(res.url);
      setConfirmOpen(false);
      toast.success('Nouveau lien généré');
    } catch {
      toast.error('Régénération impossible');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-text-secondary">Abonnement calendrier (ICS)</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-text-secondary">
          Ajoutez votre planning à votre agenda Google/Apple/Outlook, l'agenda se met à jour tout seul. Ce lien est
          personnel et secret : ne le partagez pas.
        </p>

        {loading ? (
          <p className="text-sm text-text-muted">Chargement du lien…</p>
        ) : url ? (
          <>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-text-secondary">Lien d'abonnement</label>
              <input
                type="text"
                value={url}
                readOnly
                onFocus={(e) => e.target.select()}
                className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-primary"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {/* webcal:// = same URL, scheme swapped. Clicking it hands the feed straight to the
                  OS calendar app (Outlook / Apple Calendar), which won't subscribe from an https link. */}
              <a
                href={url.replace(/^https?:\/\//i, 'webcal://')}
                className="inline-flex items-center justify-center rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                S'abonner (Outlook / Apple)
              </a>
              <Button size="sm" variant="secondary" onClick={copy}>
                Copier le lien
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(true)}>
                Régénérer le lien
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              Outlook et Apple Calendar : cliquez sur « S'abonner ». Google Agenda : « Autres agendas » puis « À partir de
              l'URL » et collez le lien copié. Seuls les créneaux validés apparaissent (les brouillons non).
            </p>
          </>
        ) : (
          <p className="text-sm text-text-muted">Lien indisponible pour le moment.</p>
        )}

        <ConfirmDialog
          open={confirmOpen}
          title="Régénérer le lien d'abonnement ?"
          confirmLabel="Régénérer"
          loading={regenerating}
          onConfirm={() => void doRegenerate()}
          onCancel={() => setConfirmOpen(false)}
          message="L'ancien lien sera invalidé : votre agenda ne se mettra plus à jour tant que vous ne vous serez pas ré-abonné avec le nouveau lien."
        />
      </CardBody>
    </Card>
  );
}

function GdprExportCard() {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const data = await gdprApi.exportMe();
      downloadJson('obliplan-mes-donnees.json', data);
      toast.success('Données téléchargées');
    } catch {
      toast.error('Téléchargement impossible');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-text-secondary">Mes données personnelles (RGPD)</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-text-secondary">
          Téléchargez l'ensemble des données que Obliplan conserve à votre sujet (planning, congés, heures, récup,
          temps).
        </p>
        <Button size="sm" loading={downloading} onClick={download}>
          Télécharger mes données (JSON)
        </Button>
      </CardBody>
    </Card>
  );
}

function ObligateManagedCard() {
  // The Obligate account URL comes from the (public) SSO config, NOT user.foreignSourceUrl -
  // that column is never populated on provisioning, so the button would otherwise be missing.
  const [obligateUrl, setObligateUrl] = useState<string | null>(null);
  useEffect(() => {
    authApi
      .ssoConfig()
      .then((c) => setObligateUrl(c.obligateUrl ?? null))
      .catch(() => setObligateUrl(null));
  }, []);
  const href = obligateUrl ? `${obligateUrl.replace(/\/+$/, '')}/account` : null;

  return (
    <Card>
      <CardBody className="space-y-3 py-6 text-center">
        <h3 className="text-base font-medium text-text-primary">Profil géré par Obligate</h3>
        <p className="mx-auto max-w-md text-sm text-text-secondary">
          Votre profil, votre mot de passe et vos préférences (dont le thème) sont gérés de façon centralisée via
          Obligate (SSO), afin de rester cohérents entre vos applications Obli.
        </p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Ouvrir mon profil Obligate
          </a>
        )}
      </CardBody>
    </Card>
  );
}

function InstallAppCard() {
  const { canInstall, promptInstall } = useInstallPrompt();

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-text-secondary">Installer l'application</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-text-secondary">
          Installez Obliplan sur votre appareil pour un accès en un tap, même hors-ligne.
        </p>
        <Button size="sm" disabled={!canInstall} onClick={() => void promptInstall()}>
          Installer
        </Button>
        <p className="text-xs text-text-muted">
          Sur iPhone/iPad : bouton Partager → «&nbsp;Sur l'écran d'accueil&nbsp;».
        </p>
      </CardBody>
    </Card>
  );
}

function PushNotificationsCard() {
  const { supported, enabled, subscribed, busy, permissionDenied, subscribe, unsubscribe } = usePushNotifications();
  // Hidden when the browser can't do push OR the server has no VAPID configured.
  if (!supported || !enabled) return null;

  async function toggle() {
    try {
      if (subscribed) {
        await unsubscribe();
        toast.success('Notifications désactivées sur cet appareil.');
      } else {
        const ok = await subscribe();
        if (ok) toast.success('Notifications activées sur cet appareil.');
        else toast('Notifications non autorisées.');
      }
    } catch {
      toast.error('Impossible de modifier les notifications.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-text-secondary">Notifications push</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-text-secondary">
          Recevez les alertes Obliplan (congés, heures sup, planning…) sur cet appareil, même l'application fermée.
        </p>
        {permissionDenied ? (
          <p className="text-xs text-status-down">
            Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur pour les activer.
          </p>
        ) : (
          <Button
            size="sm"
            variant={subscribed ? 'secondary' : 'primary'}
            loading={busy}
            onClick={() => void toggle()}
          >
            {subscribed ? 'Désactiver sur cet appareil' : 'Activer les notifications'}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

/** Opt-in to shift-change notifications: an alert `lead` minutes before each change + one at it. */
function ShiftNotifyCard() {
  const user = useAuthStore((s) => s.user);
  const checkSession = useAuthStore((s) => s.checkSession);
  const [busy, setBusy] = useState(false);
  const current = user?.shiftNotifyBeforeMin ?? null;

  async function save(min: number | null) {
    setBusy(true);
    try {
      await authApi.setShiftNotify(min);
      await checkSession();
      toast.success(min ? `Alerte ${min} min avant chaque changement de créneau.` : 'Alertes de créneau désactivées.');
    } catch {
      toast.error('Impossible de modifier ce réglage.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-text-secondary">Notifications de créneau</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-text-secondary">
          Soyez prévenu avant chaque changement de créneau (ex Back → Front), puis au moment du changement.
          Utilise les notifications push ci-dessus.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-text-secondary">Me prévenir</label>
          <select
            value={current ?? 'off'}
            disabled={busy}
            onChange={(e) => void save(e.target.value === 'off' ? null : Number(e.target.value))}
            className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="off">Désactivé</option>
            <option value="5">5 min avant</option>
            <option value="10">10 min avant</option>
            <option value="15">15 min avant</option>
            <option value="30">30 min avant</option>
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              try {
                await authApi.testNotify();
                toast.success('Notif de test envoyée : vérifiez la cloche 🔔');
              } catch {
                toast.error("Échec de l'envoi de la notif de test.");
              }
            }}
          >
            Envoyer une notif de test
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function ProfilePage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useUiStore();
  if (!user) return null;

  const cleanUsername = user.username.startsWith('og_') ? user.username.slice(3) : user.username;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-4">
        <UserAvatar avatar={user.avatar} username={user.username} size={56} />
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{user.displayName || cleanUsername}</h2>
          <p className="font-mono text-xs uppercase tracking-wider text-accent">{ROLE_LABEL[user.role] ?? user.role}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-text-secondary">Compte</span>
        </CardHeader>
        <CardBody className="py-1">
          <Row label="Identifiant" value={cleanUsername} />
          <Row label="Email" value={user.email || '-'} />
          <Row label="Rôle" value={ROLE_LABEL[user.role] ?? user.role} />
          <Row label="Authentification" value={user.foreignSource === 'obligate' ? 'Obligate (SSO)' : 'Locale'} />
        </CardBody>
      </Card>

      {user.foreignSource === 'obligate' && <ObligateManagedCard />}

      <IcsSubscriptionCard />

      <InstallAppCard />

      <PushNotificationsCard />

      <ShiftNotifyCard />

      <GdprExportCard />

      {/* Local accounts keep the theme picker here; Obligate accounts manage it via the SSO card above. */}
      {user.foreignSource !== 'obligate' && (
        <Card>
          <CardHeader>
            <span className="text-sm font-medium text-text-secondary">Apparence</span>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((th) => (
                <button
                  key={th.value}
                  onClick={() => setTheme(th.value)}
                  className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                    theme === th.value
                      ? 'border-accent bg-accent/10 text-accent-hover'
                      : 'border-border bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {th.label}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
