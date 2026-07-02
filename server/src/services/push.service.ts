import webpush from 'web-push';
import { db } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';

// Web Push (PWA notifications). DISABLED unless both VAPID keys are configured in
// the environment; every other layer degrades gracefully (the client hides the
// opt-in, notify() skips the push step). VAPID details are set once at load.
let enabled = Boolean(config.vapidPublicKey && config.vapidPrivateKey);
if (enabled) {
  try {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  } catch (err) {
    // A malformed VAPID key/subject must not crash startup - just disable push.
    enabled = false;
    logger.warn({ err }, 'push: invalid VAPID configuration - web push disabled');
  }
}

interface SubInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export const pushService = {
  /** True only when both VAPID keys are configured (env). */
  isEnabled(): boolean {
    return enabled;
  },

  /** The VAPID public key the client needs to subscribe, or null when disabled. */
  publicKey(): string | null {
    return enabled ? config.vapidPublicKey : null;
  },

  /** Upsert a device subscription for a user (endpoint is globally unique). */
  async subscribe(userId: number, sub: SubInput): Promise<void> {
    await db('push_subscriptions')
      .insert({ user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
      .onConflict('endpoint')
      .merge({ user_id: userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
  },

  /** Remove one of the user's device subscriptions. */
  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    await db('push_subscriptions').where({ user_id: userId, endpoint }).del();
  },

  /**
   * Best-effort fan-out to the given users' devices. NEVER throws (so a push
   * failure can never break the audited mutation that triggered it). A 404/410
   * from the push service means the subscription is gone → prune it.
   */
  async sendToUsers(userIds: number[], payload: PushPayload): Promise<void> {
    if (!enabled) return;
    const ids = [...new Set(userIds)].filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return;
    try {
      const subs = await db<SubRow>('push_subscriptions')
        .whereIn('user_id', ids)
        .select('id', 'endpoint', 'p256dh', 'auth');
      const body = JSON.stringify(payload);
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await db('push_subscriptions')
                .where({ id: s.id })
                .del()
                .catch(() => {});
            } else {
              logger.warn({ err, subId: s.id }, 'push: send failed (non-fatal)');
            }
          }
        }),
      );
    } catch (err) {
      logger.warn({ err }, 'push: fan-out failed (non-fatal)');
    }
  },
};
