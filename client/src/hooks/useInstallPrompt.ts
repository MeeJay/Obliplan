import { useSyncExternalStore } from 'react';

/**
 * `beforeinstallprompt` is not part of lib.dom, so we declare a minimal local
 * shape rather than reaching for `any` (which the strict/lint config forbids).
 */
interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

// ── Module-scope singleton ────────────────────────────────────────────────────
// `beforeinstallprompt` fires ONCE, early, on whatever route first loads. With
// client-side routing it never re-fires, so a listener attached only when the
// Profile card mounts would miss it entirely. We capture it at module scope (via
// initInstallPrompt() called from main.tsx at startup) and expose it through an
// external store so any component mounted later still sees the captured prompt.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialized = false;
const subscribers = new Set<() => void>();

function emit(): void {
  subscribers.forEach((cb) => cb());
}

/** Register the capture listeners exactly once, as early as possible. */
export function initInstallPrompt(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault(); // suppress Chrome's mini-infobar; we prompt on demand
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function getCanInstall(): boolean {
  return deferred !== null && !installed;
}

/**
 * Read the (module-scoped) install availability and trigger the native prompt.
 * On iOS/Safari the event never fires, so `canInstall` stays `false` and the
 * caller shows the manual Share-sheet hint instead.
 */
export function useInstallPrompt(): { canInstall: boolean; promptInstall: () => Promise<void> } {
  const canInstall = useSyncExternalStore(subscribe, getCanInstall, () => false);

  async function promptInstall(): Promise<void> {
    const evt = deferred;
    if (!evt) return;
    // A prompt can only be used once - consume it before awaiting.
    deferred = null;
    emit();
    try {
      await evt.prompt();
      await evt.userChoice;
    } catch {
      /* user dismissed or the prompt is unavailable - nothing to do */
    }
  }

  return { canInstall, promptInstall };
}
