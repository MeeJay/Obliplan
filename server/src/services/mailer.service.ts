import nodemailer, { type Transporter } from 'nodemailer';
import { appConfigService } from './appConfig.service';
import { db } from '../db';
import { logger } from '../utils/logger';

// Real SMTP sender wired to the admin SMTP config (Settings → Serveur SMTP).
// The transporter is built lazily and cached; it is transparently rebuilt
// whenever the underlying SMTP config changes (we key the cache on a hash of
// the raw config, so no explicit invalidation hook into appConfigService is
// required). Every attempt is recorded in the email_log table. sendMail NEVER
// throws - callers (notably the notify dispatcher) treat e-mail as best-effort.

const ACCENT = '#7c6cff';

interface SmtpRaw {
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  user?: string | null;
  pass?: string | null;
  fromAddress?: string | null;
}

interface MailMeta {
  tenantId?: number | null;
  template?: string | null;
}

let cachedTransporter: Transporter | null = null;
let cachedHash = '';
let cachedFrom: string | null = null;

function hashSmtp(cfg: SmtpRaw): string {
  return JSON.stringify([cfg.host, cfg.port, cfg.secure, cfg.user, cfg.pass, cfg.fromAddress]);
}

/** Drop the cached transporter so the next send rebuilds it from fresh config. */
export function resetTransporter(): void {
  cachedTransporter = null;
  cachedHash = '';
  cachedFrom = null;
}

/** Returns a ready transporter + resolved from-address, or null when unconfigured. */
async function getTransporter(): Promise<{ transporter: Transporter; from: string } | null> {
  const cfg = await appConfigService.getSmtpRaw();
  if (!cfg.host || !cfg.fromAddress) return null;

  const hash = hashSmtp(cfg);
  if (!cachedTransporter || hash !== cachedHash) {
    cachedTransporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port ?? 587,
      secure: cfg.secure ?? false,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? '' } : undefined,
    });
    cachedHash = hash;
    cachedFrom = cfg.fromAddress;
  }
  return { transporter: cachedTransporter, from: cachedFrom ?? cfg.fromAddress };
}

/** Naive HTML → text fallback for clients that won't render the HTML part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wrap body HTML in the Obli-branded shell (accent #7c6cff header). Exported so
 * the notify dispatcher can reuse a single consistent template.
 */
export function brandedEmail(opts: { title: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string }): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<p style="margin:24px 0 0;">
           <a href="${opts.ctaUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">${opts.ctaLabel}</a>
         </p>`
      : '';
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:92%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,16,32,0.08);">
            <tr>
              <td style="background:${ACCENT};padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">Obliplan</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:18px;color:#16161f;">${opts.title}</h1>
                <div style="font-size:14px;line-height:1.6;color:#3a3a48;">${opts.bodyHtml}</div>
                ${cta}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid #ececf2;color:#9a9aa8;font-size:12px;">
                Cet e-mail vous est envoyé automatiquement par Obliplan.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function isConfigured(): Promise<boolean> {
  const cfg = await appConfigService.getSmtpRaw();
  return !!(cfg.host && cfg.fromAddress);
}

async function sendMail(
  msg: { to: string; subject: string; html: string; text?: string },
  meta: MailMeta = {},
): Promise<{ ok: boolean; error?: string }> {
  let status: 'sent' | 'failed' = 'failed';
  let error: string | undefined;

  try {
    const t = await getTransporter();
    if (!t) {
      error = 'SMTP non configuré';
    } else {
      await t.transporter.sendMail({
        from: t.from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? htmlToText(msg.html),
      });
      status = 'sent';
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: msg.to }, 'mailer.sendMail failed');
  }

  // Best-effort audit log - must never break the send result.
  try {
    await db('email_log').insert({
      tenant_id: meta.tenantId ?? null,
      recipient: msg.to,
      subject: msg.subject,
      template: meta.template ?? null,
      status,
      error: error ?? null,
    });
  } catch (logErr) {
    logger.error({ err: logErr }, 'mailer.email_log insert failed');
  }

  return status === 'sent' ? { ok: true } : { ok: false, error };
}

async function sendTest(to: string): Promise<{ ok: boolean; error?: string }> {
  const html = brandedEmail({
    title: 'Test de configuration SMTP',
    bodyHtml:
      '<p style="margin:0 0 12px;">Ceci est un e-mail de test envoyé depuis <strong>Obliplan</strong>.</p>' +
      '<p style="margin:0;">Si vous le recevez, votre serveur SMTP est correctement configuré et les notifications par e-mail pourront être envoyées.</p>',
  });
  return sendMail(
    {
      to,
      subject: 'Obliplan - Test SMTP',
      html,
      text: "Ceci est un e-mail de test envoyé depuis Obliplan. Si vous le recevez, votre serveur SMTP est correctement configuré.",
    },
    { template: 'smtp-test' },
  );
}

export const mailerService = {
  isConfigured,
  sendMail,
  sendTest,
};
