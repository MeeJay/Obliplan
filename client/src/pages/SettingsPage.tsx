import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Info, Server, Cpu, HardDrive, Database, Clock, ArrowLeftRight, Eye, EyeOff, Mail, Send, CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SystemInfo, ObligateConfig, SmtpConfig, PublicHoliday } from '@obliplan/shared';
import { appConfigApi, holidayApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { cn } from '../utils/cn';

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="font-mono text-xs text-text-primary">{value}</span>
    </div>
  );
}

function ColTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
      {icon} {children}
    </p>
  );
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50',
        on ? 'bg-accent' : 'bg-bg-hover',
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}j`, h && `${h}h`, `${m}min`].filter(Boolean).join(' ');
}

function formatHolidayDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
  });
}

export function SettingsPage() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [systemLoading, setSystemLoading] = useState(true);

  const [obligate, setObligate] = useState<ObligateConfig | null>(null);
  const [obligateUrl, setObligateUrl] = useState('');
  const [obligateApiKey, setObligateApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [smtp, setSmtp] = useState<SmtpConfig | null>(null);
  const [smtpForm, setSmtpForm] = useState({ host: '', port: '587', secure: false, user: '', pass: '', fromAddress: '' });

  const currentUser = useAuthStore((s) => s.user);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  const canManageHolidays = useAuthStore((s) => s.can('planning:write'));
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [holidayYear, setHolidayYear] = useState(() => new Date().getFullYear());
  const [newHoliday, setNewHoliday] = useState({ date: '', label: '' });

  useEffect(() => {
    if (currentUser?.email) setTestEmail((prev) => prev || currentUser.email || '');
  }, [currentUser?.email]);

  useEffect(() => {
    appConfigApi.getSystem().then(setSystem).catch(() => setSystem(null)).finally(() => setSystemLoading(false));
    appConfigApi.getObligate().then((c) => {
      setObligate(c);
      setObligateUrl(c.url ?? '');
    });
    appConfigApi.getSmtp().then((s) => {
      setSmtp(s);
      setSmtpForm({
        host: s.host ?? '',
        port: s.port != null ? String(s.port) : '587',
        secure: s.secure,
        user: s.user ?? '',
        pass: '',
        fromAddress: s.fromAddress ?? '',
      });
    });
  }, []);

  useEffect(() => {
    setHolidaysLoading(true);
    holidayApi
      .list(holidayYear)
      .then(setHolidays)
      .catch(() => setHolidays([]))
      .finally(() => setHolidaysLoading(false));
  }, [holidayYear]);

  async function addHoliday() {
    const date = newHoliday.date;
    const label = newHoliday.label.trim();
    if (!date || !label) {
      toast.error('Renseignez une date et un libellé');
      return;
    }
    try {
      await holidayApi.addCustom({ date, label });
      setNewHoliday({ date: '', label: '' });
      setHolidays(await holidayApi.list(holidayYear));
      toast.success('Jour férié ajouté');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Échec de l'ajout du jour férié");
    }
  }

  async function removeHoliday(id: number) {
    try {
      await holidayApi.remove(id);
      setHolidays((list) => list.filter((h) => h.id !== id));
      toast.success('Jour férié supprimé');
    } catch {
      toast.error('Échec de la suppression');
    }
  }

  async function saveObligate(patch: { url?: string | null; apiKey?: string | null; enabled?: boolean }) {
    try {
      const updated = await appConfigApi.patchObligate(patch);
      setObligate(updated);
      if ('apiKey' in patch) setObligateApiKey('');
      toast.success('Configuration Obligate enregistrée');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Échec de l\'enregistrement Obligate');
    }
  }

  async function saveSmtp() {
    try {
      const updated = await appConfigApi.patchSmtp({
        host: smtpForm.host || null,
        port: smtpForm.port ? Number(smtpForm.port) : null,
        secure: smtpForm.secure,
        user: smtpForm.user || null,
        pass: smtpForm.pass || undefined,
        fromAddress: smtpForm.fromAddress || null,
      });
      setSmtp(updated);
      setSmtpForm((f) => ({ ...f, pass: '' }));
      toast.success('Serveur SMTP enregistré');
    } catch {
      toast.error('Échec de l\'enregistrement SMTP');
    }
  }

  async function sendTestEmail() {
    const to = testEmail.trim();
    if (!to) {
      toast.error('Renseignez une adresse destinataire');
      return;
    }
    setTesting(true);
    try {
      const result = await appConfigApi.testSmtp(to);
      if (result.ok) toast.success(`E-mail de test envoyé à ${to}`);
      else toast.error(result.error || "Échec de l'envoi du test");
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Échec de l'envoi du test");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-text-primary">Paramètres</h1>
        <p className="text-sm text-text-muted">Configuration globale de l'instance (administration).</p>
      </div>

      {/* ── À propos ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Info size={18} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">À propos</h2>
        </div>
        <div className="rounded-lg bg-bg-secondary p-5">
          {systemLoading ? (
            <p className="animate-pulse text-sm text-text-muted">Chargement…</p>
          ) : system ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <ColTitle icon={<Server size={12} />}>Versions</ColTitle>
                <AboutRow label="Serveur" value={`v${system.appVersion}`} />
                <AboutRow label="Client" value={`v${__APP_VERSION__}`} />
                <AboutRow label="Node.js" value={system.nodeVersion} />
              </div>
              <div className="space-y-2">
                <ColTitle icon={<Clock size={12} />}>Instance</ColTitle>
                <AboutRow label="Uptime" value={formatUptime(system.uptimeSeconds)} />
                <AboutRow label="Environnement" value={system.environment.isDocker ? 'Docker' : 'Natif'} />
                <AboutRow label="Plateforme" value={system.environment.platform} />
                <AboutRow label="Cœurs CPU" value={String(system.cpu.cores)} />
              </div>
              <div className="space-y-2">
                <ColTitle icon={<HardDrive size={12} />}>Mémoire</ColTitle>
                <AboutRow label="Process RSS" value={`${system.memory.processRssMb} Mo`} />
                <AboutRow label="Heap utilisé" value={`${system.memory.processHeapMb} Mo`} />
                <AboutRow label="Système libre" value={`${system.memory.systemFreeMb} / ${system.memory.systemTotalMb} Mo`} />
              </div>
              <div className="space-y-2">
                <ColTitle icon={<Cpu size={12} />}>Charge CPU</ColTitle>
                <AboutRow label="1 min" value={String(system.cpu.loadAvg1)} />
                <AboutRow label="5 min" value={String(system.cpu.loadAvg5)} />
                <AboutRow label="15 min" value={String(system.cpu.loadAvg15)} />
              </div>
              <div className="space-y-2">
                <ColTitle icon={<Database size={12} />}>Base de données</ColTitle>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">PostgreSQL</span>
                  <span className={cn('flex items-center gap-1.5 text-xs font-medium', system.environment.dbStatus === 'ok' ? 'text-status-up' : 'text-status-down')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', system.environment.dbStatus === 'ok' ? 'bg-status-up' : 'bg-status-down')} />
                    {system.environment.dbStatus === 'ok' ? 'Connectée' : 'Erreur'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Impossible de charger les informations système.</p>
          )}
        </div>
      </section>

      {/* ── Serveur SMTP ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Mail size={18} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Serveur SMTP</h2>
          {smtp?.host && <span className="rounded bg-status-up/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-up">CONFIGURÉ</span>}
        </div>
        <div className="space-y-4 rounded-lg bg-bg-secondary p-5">
          <p className="text-sm text-text-muted">
            Serveur d'envoi d'e-mails utilisé pour les notifications (demandes de congé, validations, affectations…).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Hôte" placeholder="smtp.example.com" value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} />
            <Input label="Port" type="number" value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: e.target.value })} />
            <Input label="Utilisateur" value={smtpForm.user} onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })} />
            <Input
              label={`Mot de passe${smtp?.passSet ? ' (défini)' : ''}`}
              type="password"
              placeholder={smtp?.passSet ? '••••••••••••' : ''}
              value={smtpForm.pass}
              onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })}
            />
            <Input label="Adresse d'expéditeur" placeholder="no-reply@example.com" value={smtpForm.fromAddress} onChange={(e) => setSmtpForm({ ...smtpForm, fromAddress: e.target.value })} />
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <Toggle on={smtpForm.secure} onClick={() => setSmtpForm({ ...smtpForm, secure: !smtpForm.secure })} />
                TLS (secure)
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveSmtp}>Enregistrer</Button>
          </div>

          {/* ── Tester l'envoi ── */}
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Tester l'envoi</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Destinataire du test"
                  type="email"
                  placeholder="vous@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={sendTestEmail} disabled={testing}>
                <Send size={14} className="mr-1.5" />
                {testing ? 'Envoi…' : "Envoyer un test"}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              Envoie un e-mail de vérification à cette adresse avec la configuration ci-dessus (enregistrez d'abord vos modifications).
            </p>
          </div>
        </div>
      </section>

      {/* ── Obligate SSO Gateway ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <ArrowLeftRight size={16} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Obligate SSO Gateway</h2>
        </div>
        <div className="space-y-4 rounded-lg bg-bg-secondary p-5">
          <p className="text-sm text-text-muted">
            Connecte cette application à votre passerelle SSO Obligate (authentification centralisée + navigation inter-apps).
            Enregistrez d'abord l'app dans Obligate, puis collez la clé API ici.
          </p>
          <div className="rounded-md border border-status-pending/30 bg-status-pending-bg p-3 text-sm text-status-pending">
            Une fois activé, l'authentification locale est désactivée - les utilisateurs se connectent via Obligate.
            Si la passerelle devient injoignable, l'authentification locale est automatiquement rétablie en secours.
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="text-sm font-medium text-text-secondary">URL Obligate</label>
              {obligate?.url && (
                <a href={obligate.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">Ouvrir ↗</a>
              )}
            </div>
            <input
              type="url"
              placeholder="https://obligate.example.com"
              value={obligateUrl}
              onChange={(e) => setObligateUrl(e.target.value)}
              onBlur={() => { if (obligateUrl !== (obligate?.url ?? '')) void saveObligate({ url: obligateUrl || null }); }}
              className="w-full rounded-lg bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Clé API
              {obligate?.apiKeySet && (
                <span className="ml-2 rounded border border-status-up/20 bg-status-up/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-up">DÉFINIE</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={obligate?.apiKeySet ? '••••••••••••••••••••••••••••••••' : 'Collez la clé API depuis Obligate…'}
                value={obligateApiKey}
                onChange={(e) => setObligateApiKey(e.target.value)}
                onBlur={() => { if (obligateApiKey.trim()) void saveObligate({ apiKey: obligateApiKey.trim() }); }}
                className="w-full rounded-lg bg-bg-primary px-3 py-2 pr-8 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              Générez cette clé dans <span className="font-medium text-text-secondary">Obligate → Connected Apps → Add App</span>.
            </p>
          </div>

          {obligate?.url && obligate.apiKeySet && (
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium text-text-primary">Activer le SSO</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Une fois activé, la page de connexion redirige vers Obligate. Les utilisateurs sont provisionnés à la première connexion.
                </p>
              </div>
              <Toggle on={obligate.enabled} onClick={() => void saveObligate({ enabled: !obligate.enabled })} />
            </div>
          )}
        </div>
      </section>

      {/* ── Jours fériés ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays size={18} className="text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Jours fériés</h2>
        </div>
        <div className="space-y-4 rounded-lg bg-bg-secondary p-5">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-text-muted">
              Jours fériés nationaux et jours fériés personnalisés. Ils ne consomment pas de congé et sont déduits des heures attendues.
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setHolidayYear((y) => y - 1)}
                title="Année précédente"
                className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="w-12 text-center text-sm font-semibold text-text-primary">{holidayYear}</span>
              <button
                type="button"
                onClick={() => setHolidayYear((y) => y + 1)}
                title="Année suivante"
                className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {holidaysLoading ? (
              <li className="animate-pulse px-3 py-3 text-sm text-text-muted">Chargement…</li>
            ) : holidays.length === 0 ? (
              <li className="px-3 py-3 text-sm text-text-muted">Aucun jour férié pour {holidayYear}.</li>
            ) : (
              holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-44 shrink-0 font-mono text-xs capitalize text-text-muted">{formatHolidayDate(h.date)}</span>
                    <span className="truncate text-sm text-text-primary">{h.label}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {h.tenantId === null ? (
                      <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">National</span>
                    ) : (
                      <>
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Personnalisé</span>
                        {canManageHolidays && (
                          <button
                            type="button"
                            onClick={() => void removeHoliday(h.id)}
                            title="Supprimer"
                            className="text-text-muted transition-colors hover:text-status-down"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>

          {canManageHolidays && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Ajouter un jour férié</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input
                  label="Date"
                  type="date"
                  value={newHoliday.date}
                  onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                />
                <div className="flex-1">
                  <Input
                    label="Libellé"
                    placeholder="Pont de l'Ascension…"
                    value={newHoliday.label}
                    onChange={(e) => setNewHoliday({ ...newHoliday, label: e.target.value })}
                  />
                </div>
                <Button onClick={addHoliday}>
                  <Plus size={14} className="mr-1.5" />
                  Ajouter
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
