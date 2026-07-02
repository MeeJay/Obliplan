import crypto from 'crypto';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { userService } from './user.service';
import { contratService } from './contrat.service';
import { rowToShift } from './shift.service';
import { leaveRequestService } from './leaveRequest.service';
import { overtimeDeclarationService } from './overtimeDeclaration.service';
import { recupService } from './recup.service';
import { timeEntryService } from './timeEntry.service';

/**
 * RGPD toolkit - droit d'accès/portabilité (export) + droit à l'effacement
 * (pseudonymisation). Every dataset gathered here is scoped to BOTH the tenant
 * and the subject user; the profile comes through `rowToUser`, which already
 * excludes `password_hash` and `ics_token`, so no secret can leak into an export.
 */
export const gdprService = {
  /**
   * Assemble ALL personal data Obliplan holds about `userId` within `tenantId`.
   * The subject is resolved through `userService.getById` (membership-scoped →
   * null for a non-member, so the caller answers 404). Returns null when the
   * subject is not a member of the tenant.
   */
  async exportUserData(
    tenantId: number,
    userId: number,
    opts: { allTenants?: boolean } = {},
  ): Promise<Record<string, unknown> | null> {
    const profile = await userService.getById(userId, tenantId);
    if (!profile) return null;

    // Membership rows for the subject (which tenants they belong to + their role).
    // A confined tenant admin exporting someone else only sees membership in THIS
    // tenant (no cross-tenant bleed); the subject's own export (or a platform
    // admin) gets the full list, which is their right of access / portability.
    const membershipQuery = opts.allTenants
      ? db('user_tenants').where({ user_id: userId })
      : db('user_tenants').where({ user_id: userId, tenant_id: tenantId });
    const memberships = await membershipQuery.select('tenant_id', 'role').orderBy('tenant_id');

    const contrat = profile.contratId ? await contratService.getById(profile.contratId, tenantId) : null;

    // Shifts have no dedicated "all for user" service method; query directly with
    // the SAME columns rowToShift consumes (no secret columns on this table).
    const shiftRows = await db('shifts')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy(['date', 'heure_debut']);
    const shifts = shiftRows.map(rowToShift);

    const [leaveRequests, overtimeDeclarations, recupMouvements, timeEntries] = await Promise.all([
      leaveRequestService.getForUser(tenantId, userId),
      overtimeDeclarationService.getForUser(tenantId, userId),
      recupService.getForUser(tenantId, userId),
      timeEntryService.listForUser(tenantId, userId),
    ]);

    return {
      subject: profile, // already secret-free (rowToUser excludes password_hash & ics_token); carries `id`
      memberships,
      contrat,
      shifts,
      leaveRequests,
      overtimeDeclarations,
      recupMouvements,
      timeEntries,
    };
  },

  /**
   * Pseudonymise a departed salarié: scrub the identity (login/password/name/email/
   * preferences/SSO link/calendar token) and deactivate the account, while KEEPING
   * every planning & HR record (French labour law requires multi-year retention).
   * NOT a hard delete.
   *
   * Guards (throw AppError): self-anonymise (400); non-member/cross-tenant target
   * (404); a target that belongs to more than one tenant may only be anonymised by
   * a platform admin (409).
   */
  async anonymizeUser(
    tenantId: number,
    actorId: number,
    actorIsPlatformAdmin: boolean,
    userId: number,
  ): Promise<'ok'> {
    if (userId === actorId) {
      throw new AppError(400, 'Vous ne pouvez pas anonymiser votre propre compte.');
    }

    // Membership-scoped: a non-member of the acting tenant is not exportable/anonymisable.
    const target = await userService.getById(userId, tenantId);
    if (!target) throw new AppError(404, 'Salarié introuvable');

    const distinct = await db('user_tenants')
      .where({ user_id: userId })
      .countDistinct<{ count: string | number }[]>({ count: 'tenant_id' })
      .first();
    const tenantCount = Number(distinct?.count ?? 0);
    if (tenantCount > 1 && !actorIsPlatformAdmin) {
      throw new AppError(
        409,
        "Ce compte appartient à plusieurs espaces ; seul un administrateur de la plateforme peut l'anonymiser.",
      );
    }

    const oldEmail = target.email; // captured before the scrub, to purge outbound mail addressed to them

    // One atomic unit: a half-scrubbed record (identity nulled but SSO link or
    // mail trail surviving) would leave a re-identification vector, so commit or
    // roll back the whole erasure together.
    await db.transaction(async (trx) => {
      // Keep the UNIQUE(username) constraint: base pseudonym is unambiguous (embeds
      // the id); append a short random suffix only on the pathological collision.
      let username = `anon_${userId}`;
      const clash = await trx('users').where({ username }).andWhereNot({ id: userId }).first('id');
      if (clash) username = `anon_${userId}_${crypto.randomBytes(4).toString('hex')}`;

      await trx('users')
        .where({ id: userId })
        .update({
          username,
          password_hash: null,
          display_name: null,
          email: null,
          preferences: null,
          foreign_source: null,
          foreign_id: null,
          foreign_source_url: null,
          ics_token: null,
          is_active: false,
          anonymized_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      // The AUTHORITATIVE SSO link table is a direct re-identification key mapping
      // the local id back to the external Obligate identity, and would silently
      // re-provision (un-anonymise) the account on the next SSO login. Erase it.
      await trx('sso_foreign_users').where({ local_user_id: userId }).del();

      // Outbound-mail audit log addressed to the subject: not covered by the
      // labour-law retention basis, so it is a residual PII vector - purge it.
      if (oldEmail) await trx('email_log').where({ recipient: oldEmail }).del();

      // Notifications addressed to the subject, or about the subject's own actions
      // (their name is denormalised into title/body in colleagues' history) - purge.
      await trx('notifications')
        .where((q) => q.where({ user_id: userId }).orWhere({ actor_id: userId }))
        .del();
    });

    // Planning/HR records (shifts, leave_requests, overtime, récup, time_entries) are
    // intentionally KEPT for the legal retention obligation.
    return 'ok';
  },
};
