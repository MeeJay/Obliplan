import { create } from 'zustand';
import type { Notification } from '@obliplan/shared';
import { notificationApi } from '../api';

const POLL_MS = 30_000;
// Module-level timer so a single interval is shared across every consumer of the
// store (the bell mounts once). Started on first use, cleared on unmount/logout.
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Foreground desktop notifications: fire a native OS toast for genuinely NEW items
// found by the poll (works while the tab is open, focused or not - no VAPID needed).
// `nativePrimed` gates the first pass so we don't replay history on login/refresh.
let lastNativeId = 0;
let nativePrimed = false;
// If the browser already has a web-push subscription, the service worker shows the
// toast on push - so we suppress the foreground one to avoid a duplicate.
let pushSubscribed = false;

async function refreshPushState(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    pushSubscribed = !!(reg && (await reg.pushManager.getSubscription()));
  } catch {
    pushSubscribed = false;
  }
}

function showNative(n: Notification): void {
  if (pushSubscribed) return;
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const native = new Notification(n.title, {
      body: n.body ?? undefined,
      icon: '/icon-192.png',
      tag: `obliplan-notif-${n.id}`, // dedupes if the same id surfaces twice
    });
    native.onclick = () => {
      window.focus();
      if (n.link) window.location.assign(n.link);
      native.close();
    };
  } catch {
    /* some browsers throw on new Notification() without a SW - ignore */
  }
}

interface NotificationState {
  items: Notification[];
  unread: number;
  loading: boolean;
  /** Load the recent list (also reconciles the unread count from it). */
  fetch: () => Promise<void>;
  /** Cheap poll: refresh just the unread badge count. */
  fetchUnread: () => Promise<void>;
  /** Poll the recent list, refresh the badge, and fire native toasts for new items. */
  poll: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Begin polling the unread count (idempotent). */
  startPolling: () => void;
  /** Stop polling (call on logout / bell unmount). */
  stopPolling: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const items = await notificationApi.list();
      set({ items, unread: items.filter((n) => !n.readAt).length, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchUnread: async () => {
    try {
      const { count } = await notificationApi.unreadCount();
      set({ unread: count });
    } catch {
      /* keep the last known value on a transient error */
    }
  },

  poll: async () => {
    try {
      const items = await notificationApi.list();
      set({ items, unread: items.filter((n) => !n.readAt).length });
      const maxId = items.reduce((m, n) => Math.max(m, n.id), 0);
      if (!nativePrimed) {
        // First pass after login/refresh: remember where we are, toast nothing.
        nativePrimed = true;
        lastNativeId = maxId;
        return;
      }
      items
        .filter((n) => n.id > lastNativeId && !n.readAt)
        .sort((a, b) => a.id - b.id)
        .forEach(showNative);
      if (maxId > lastNativeId) lastNativeId = maxId;
    } catch {
      /* keep the last known list/badge on a transient error */
    }
  },

  markRead: async (id) => {
    const target = get().items.find((n) => n.id === id);
    if (target?.readAt) return; // already read - nothing to do
    const now = new Date().toISOString();
    set((s) => ({
      items: s.items.map((n) => (n.id === id ? { ...n, readAt: now } : n)),
      unread: Math.max(0, s.unread - 1),
    }));
    try {
      await notificationApi.markRead(id);
    } catch {
      void get().fetchUnread(); // resync the badge if the write failed
    }
  },

  markAllRead: async () => {
    const now = new Date().toISOString();
    set((s) => ({
      items: s.items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
      unread: 0,
    }));
    try {
      await notificationApi.markAllRead();
    } catch {
      void get().fetch();
    }
  },

  startPolling: () => {
    void refreshPushState();
    void get().poll();
    if (pollTimer) return;
    pollTimer = setInterval(() => void get().poll(), POLL_MS);
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    // Reset native-toast tracking so a different user never inherits it.
    nativePrimed = false;
    lastNativeId = 0;
    // Drop any cached badge/list so a different user never sees the previous one.
    set({ items: [], unread: 0 });
  },
}));
