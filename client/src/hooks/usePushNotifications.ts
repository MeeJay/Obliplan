import { useCallback, useEffect, useState } from 'react';
import { pushApi } from '../api';

/**
 * VAPID base64url public key → Uint8Array for PushManager.subscribe. Backed by an
 * explicit ArrayBuffer so the inferred type is `Uint8Array<ArrayBuffer>` (a valid
 * BufferSource) - a bare `new Uint8Array(len)` widens to ArrayBufferLike and no
 * longer satisfies applicationServerKey under the TS 5.7 typed-array generics.
 */
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

const supported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export interface PushState {
  /** The browser supports the Push API + service workers + notifications. */
  supported: boolean;
  /** The server has VAPID configured (push is actually usable). */
  enabled: boolean;
  /** This device currently has an active subscription. */
  subscribed: boolean;
  busy: boolean;
  /** The user blocked notifications - they must re-enable them in browser settings. */
  permissionDenied: boolean;
  /** Subscribe this device; resolves true when now subscribed, false if permission was refused. */
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
}

/**
 * Manage THIS device's Web Push subscription for the signed-in user. Everything
 * degrades gracefully: unsupported browser or server without VAPID → the caller
 * simply hides the opt-in. The service worker (registered in production) delivers
 * the notifications; in dev without VAPID `enabled` is false and the card is hidden.
 */
export function usePushNotifications(): PushState {
  const [enabled, setEnabled] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    (async () => {
      try {
        const info = await pushApi.publicKey();
        if (!alive) return;
        setEnabled(info.enabled);
        setPublicKey(info.publicKey);
        setPermissionDenied(Notification.permission === 'denied');
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (alive) setSubscribed(!!sub);
      } catch {
        /* ignore - the card stays hidden if we can't determine state */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !enabled || !publicKey) return false;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPermissionDenied(permission === 'denied');
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await pushApi.subscribe(sub.toJSON());
      setSubscribed(true);
      return true;
    } finally {
      setBusy(false);
    }
  }, [enabled, publicKey]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await pushApi.unsubscribe(sub.endpoint).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, enabled, subscribed, busy, permissionDenied, subscribe, unsubscribe };
}
