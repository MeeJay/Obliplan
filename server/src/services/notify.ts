import { db } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';
import { mailerService, brandedEmail } from './mailer.service';
import { pushService } from './push.service';

/**
 * Universal event dispatcher. Persists one in-app notification per recipient
 * (via notificationService.createMany) and, when an `email` payload is supplied
 * AND SMTP is configured, best-effort emails each recipient (resolved from
 * users.email). EVERY failure is swallowed + logged - `notify` NEVER throws, so
 * the calling mutation is never blocked or rolled back.
 */
export interface NotifyOptions {
  recipientIds: number[];
  actorId?: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: number;
  email?: { subject: string; html: string };
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

/** Turn an in-app route (e.g. `/conges`) into an absolute URL for emails. */
function absoluteUrl(link: string): string {
  if (/^https?:\/\//i.test(link)) return link;
  return `${config.appUrl.replace(/\/$/, '')}${link.startsWith('/') ? '' : '/'}${link}`;
}

/**
 * Build the `email` payload from a notification's title/body/link, reusing the
 * mailer's shared Obli-branded wrapper so app + dispatcher e-mails stay
 * consistent. User-supplied text is escaped before being embedded.
 */
export function emailFor(
  subject: string,
  opts: { title: string; body?: string; link?: string },
): { subject: string; html: string } {
  const html = brandedEmail({
    title: escapeHtml(opts.title),
    bodyHtml: opts.body ? `<p style="margin:0;">${escapeHtml(opts.body)}</p>` : '',
    ...(opts.link ? { ctaLabel: `Ouvrir ${config.appName}`, ctaUrl: absoluteUrl(opts.link) } : {}),
  });
  return { subject, html };
}

/**
 * The `manager_id` of a tenant member (or null). Tenant-scoped via user_tenants,
 * mirroring userService.canManage. Used by emit points that notify a manager.
 */
export async function managerIdOf(tenantId: number, userId: number): Promise<number | null> {
  const row = await db('users')
    .join('user_tenants', 'users.id', 'user_tenants.user_id')
    .where({ 'users.id': userId, 'user_tenants.tenant_id': tenantId })
    .select('users.manager_id')
    .first<{ manager_id: number | null }>();
  return row?.manager_id ?? null;
}

export async function notify(tenantId: number, opts: NotifyOptions): Promise<void> {
  try {
    const recipientIds = [...new Set(opts.recipientIds)].filter((id) => Number.isFinite(id) && id > 0);
    if (!recipientIds.length) return;

    await notificationService.createMany(tenantId, recipientIds, {
      type: opts.type,
      title: opts.title,
      body: opts.body,
      link: opts.link,
      entityType: opts.entityType,
      entityId: opts.entityId,
      actorId: opts.actorId,
    });

    if (opts.email && (await mailerService.isConfigured())) {
      const email = opts.email;
      const rows = await db('users')
        .join('user_tenants', 'users.id', 'user_tenants.user_id')
        .where('user_tenants.tenant_id', tenantId)
        .whereIn('users.id', recipientIds)
        .whereNotNull('users.email')
        .distinct('users.id')
        .select<{ id: number; email: string }[]>('users.id', 'users.email');
      for (const r of rows) {
        if (!r.email) continue;
        try {
          const sent = await mailerService.sendMail(
            { to: r.email, subject: email.subject, html: email.html },
            { tenantId, template: opts.type },
          );
          if (!sent.ok) {
            logger.warn({ userId: r.id, type: opts.type, error: sent.error }, 'notify: email not sent');
          }
        } catch (err) {
          logger.warn({ err, userId: r.id, type: opts.type }, 'notify: email send failed (non-fatal)');
        }
      }
    }

    // Best-effort web push to each recipient's devices (no-op when VAPID unset);
    // pushService.sendToUsers never throws.
    await pushService.sendToUsers(recipientIds, {
      title: opts.title,
      body: opts.body,
      url: opts.link ? absoluteUrl(opts.link) : config.appUrl,
    });
  } catch (err) {
    logger.warn({ err, type: opts.type, tenantId }, 'notify: dispatch failed (non-fatal)');
  }
}
