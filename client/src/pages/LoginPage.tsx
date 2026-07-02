import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

// SSO state machine: never flash the local form while we're checking/redirecting.
type SsoState = 'checking' | 'redirecting' | 'unavailable' | 'local';

function Brand({ pulse = false }: { pulse?: boolean }) {
  const theme = useUiStore((s) => s.theme);
  // Dark lockup on the light (daylight) surface, white wordmark on the dark themes.
  const src = theme === 'obli-daylight' ? '/logo-daylight.svg' : '/logo.svg';
  return (
    <img
      src={src}
      alt="Obliplan"
      className={`mx-auto h-14 w-auto max-w-[260px] object-contain ${pulse ? 'animate-pulse' : ''}`}
    />
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [searchParams] = useSearchParams();
  const ssoFailed = searchParams.get('error') === 'sso_failed';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(ssoFailed ? 'Échec de la connexion SSO. Utilise la connexion locale.' : '');
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [ssoState, setSsoState] = useState<SsoState>(ssoFailed ? 'unavailable' : 'checking');

  function checkSso() {
    return fetch('/api/auth/sso-config')
      .then((r) => r.json())
      .then((d: { success: boolean; data?: { obligateEnabled: boolean; obligateUrl: string | null } }) => {
        // Redirect whenever Obligate is enabled + configured. The BROWSER does the
        // redirect, so we must NOT gate on a server-side reachability probe (the
        // Obliplan backend container often can't reach the same URL the browser can).
        if (d.success && d.data?.obligateEnabled && d.data.obligateUrl) {
          // Anti-loop: if we redirected < 15s ago and came back here, Obligate is broken.
          const last = sessionStorage.getItem('_sso_redirect_ts');
          if (last && Date.now() - parseInt(last) < 15000) {
            setSsoState('unavailable');
            return;
          }
          sessionStorage.setItem('_sso_redirect_ts', String(Date.now()));
          setSsoState('redirecting');
          window.location.href = '/auth/sso-redirect';
          return;
        }
        setSsoState('local');
      })
      .catch(() => setSsoState('unavailable'));
  }

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((d: { version?: string }) => setServerVersion(d.version ?? null))
      .catch(() => {});

    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { success?: boolean }) => {
        if (d.success) {
          navigate('/', { replace: true });
          return;
        }
        if (!ssoFailed) checkSso();
        else setSsoState('unavailable');
      })
      .catch(() => {
        if (!ssoFailed) checkSso();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll Obligate while unavailable - redirect as soon as it recovers.
  useEffect(() => {
    if (ssoState !== 'unavailable') return;
    const id = setInterval(checkSso, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssoState]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch {
      setError('Identifiant ou mot de passe invalide');
    }
  }

  if (ssoState === 'checking' || ssoState === 'redirecting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="space-y-3 text-center">
          <Brand pulse />
          <p className="text-sm text-text-secondary">
            {ssoState === 'redirecting' ? 'Redirection vers la connexion…' : 'Vérification de l\'authentification…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="relative w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <Brand />
          <p className="text-sm text-text-secondary">Gestion du temps de travail</p>
        </div>

        {ssoState === 'unavailable' && (
          <div className="rounded-lg border border-status-pending/30 bg-status-pending-bg p-3 text-sm text-status-pending">
            Connexion centralisée (Obligate) indisponible - authentification locale.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-border bg-bg-secondary p-6">
          <Input
            label="Identifiant"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <Input
            label="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && (
            <div className="rounded-md border border-status-down/30 bg-status-down-bg p-3">
              <p className="text-sm text-status-down">{error}</p>
            </div>
          )}
          <Button type="submit" className="w-full" loading={isLoading}>
            Se connecter
          </Button>
        </form>
      </div>

      <p className="fixed bottom-3 left-0 right-0 select-none text-center text-xs text-text-secondary/50">
        client v{__APP_VERSION__}
        {serverVersion && ` · serveur v${serverVersion}`}
      </p>
    </div>
  );
}
