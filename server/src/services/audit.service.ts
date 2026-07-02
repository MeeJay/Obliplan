import crypto from 'crypto';
import { db } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { AuditEntry, AuditVerifyResult } from '@obliplan/shared';

/** Advisory-lock namespace (arbitrary constant) so per-tenant audit locks never
 *  collide with any other `pg_advisory_xact_lock` user in the app. */
const AUDIT_LOCK_NAMESPACE = 2833;

// ── Row shapes ────────────────────────────────────────────────────────────────
interface AuditRow {
  id: number;
  tenant_id: number;
  actor_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  /** CANONICAL JSON string (byte-stable) or null - the exact hashed bytes. */
  meta: string | null;
  prev_hash: string | null;
  hash: string;
  created_at: Date;
}

interface AuditListRow extends AuditRow {
  actor_display_name: string | null;
  actor_username: string | null;
}

/** The fields folded into a row's hash (see `computeHash`). */
interface HashInput {
  tenantId: number;
  actorId: number | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  metaCanonical: string | null;
  createdAtIso: string;
}

/**
 * Deterministic JSON: `JSON.stringify` with a replacer that RECURSIVELY SORTS
 * object keys, so the emitted bytes are identical regardless of insertion order.
 * Used for BOTH the hash input AND the stored `meta` text, so a row hashes the
 * same on write and on verify.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const src = val as Record<string, unknown>;
      return Object.keys(src)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = src[k];
          return acc;
        }, {});
    }
    return val;
  });
}

/**
 * `hash = HMAC-SHA256(auditSecret, canonicalJson([prevHash, ...fields]))`.
 *
 * - KEYED (HMAC): an actor with only DB write access lacks `config.auditSecret`
 *   (env-held, never in the DB), so they cannot recompute the chain to hide an edit.
 * - STRUCTURED encoding (a canonical JSON array, not a '|'-delimited join): element
 *   boundaries are unambiguous, so no field value can forge a neighbouring boundary.
 * - `createdAtIso` MUST come from the value actually stored (a JS Date's toISOString),
 *   never a fresh now(), or verify won't match.
 */
function computeHash(prevHash: string | null, row: HashInput): string {
  const payload = canonicalJson([
    prevHash ?? null,
    row.tenantId,
    row.actorId ?? null,
    row.action,
    row.entityType ?? null,
    row.entityId ?? null,
    row.metaCanonical ?? null,
    row.createdAtIso,
  ]);
  return crypto.createHmac('sha256', config.auditSecret).update(payload).digest('hex');
}

/** Anonymised accounts (username `anon_%`, display_name scrubbed) must never leak
 *  their pre-anonymisation identity through the trail. */
function resolveActorName(displayName: string | null, username: string | null): string | null {
  if (username && username.startsWith('anon_')) return 'Salarié anonymisé';
  return displayName ?? username;
}

function parseMeta(meta: string | null): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    return JSON.parse(meta) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AuditRecordOptions {
  entityType?: string;
  entityId?: number;
  meta?: Record<string, unknown>;
}

export const auditService = {
  canonicalJson,

  /**
   * Append one row to the tenant's hash chain. BEST-EFFORT: the whole body is
   * wrapped in try/catch and NEVER throws, so a logging failure can never block
   * or roll back the audited mutation. A per-tenant transaction-scoped ADVISORY
   * LOCK (not a row lock) serialises concurrent appends - `.forUpdate()` on the
   * tip row would NOT prevent a fork on the genesis insert (nothing to lock) nor
   * under READ COMMITTED (EvalPlanQual won't re-scan for a newer committed tip).
   */
  async record(
    tenantId: number,
    actorId: number | null,
    action: string,
    opts?: AuditRecordOptions,
  ): Promise<void> {
    try {
      await db.transaction(async (trx) => {
        // Serialise all appends for this tenant on a lock that exists independently
        // of the chain rows; auto-released on commit/rollback.
        await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [AUDIT_LOCK_NAMESPACE, tenantId]);
        const last = await trx<AuditRow>('audit_log')
          .where({ tenant_id: tenantId })
          .orderBy('id', 'desc')
          .first();
        const prevHash = last?.hash ?? null;
        const createdAt = new Date();
        const metaCanonical = opts?.meta ? canonicalJson(opts.meta) : null;
        const entityType = opts?.entityType ?? null;
        const entityId = opts?.entityId ?? null;
        const hash = computeHash(prevHash, {
          tenantId,
          actorId,
          action,
          entityType,
          entityId,
          metaCanonical,
          createdAtIso: createdAt.toISOString(),
        });
        await trx('audit_log').insert({
          tenant_id: tenantId,
          actor_id: actorId,
          action,
          entity_type: entityType,
          entity_id: entityId,
          meta: metaCanonical,
          prev_hash: prevHash,
          hash,
          created_at: createdAt,
        });
      });
    } catch (err) {
      logger.warn({ err, action, tenantId }, 'audit.record failed (non-fatal)');
    }
  },

  /** Newest-first, tenant-scoped list; joins users to resolve `actorName`. */
  async list(
    tenantId: number,
    opts?: { limit?: number; offset?: number; action?: string },
  ): Promise<AuditEntry[]> {
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;
    const rows = await db<AuditRow>('audit_log as a')
      .leftJoin('users as u', 'a.actor_id', 'u.id')
      .where('a.tenant_id', tenantId)
      .modify((qb) => {
        if (opts?.action) qb.where('a.action', opts.action);
      })
      .orderBy('a.id', 'desc')
      .limit(limit)
      .offset(offset)
      .select<AuditListRow[]>(
        'a.id',
        'a.tenant_id',
        'a.actor_id',
        'a.action',
        'a.entity_type',
        'a.entity_id',
        'a.meta',
        'a.created_at',
        'u.display_name as actor_display_name',
        'u.username as actor_username',
      );
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      actorId: r.actor_id,
      actorName: r.actor_id === null ? null : resolveActorName(r.actor_display_name, r.actor_username),
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      meta: parseMeta(r.meta),
      createdAt: r.created_at.toISOString(),
    }));
  },

  /**
   * Walk the whole chain (asc by id), recomputing each row's hash from the
   * running prevHash and the row's STORED bytes (created_at/meta verbatim). The
   * first row whose stored `hash` ≠ recomputed OR whose stored `prev_hash` ≠ the
   * running prev is the break (an edit, a deletion breaking linkage, or a
   * reorder). Genesis row: prevHash is null (prev_hash must be null, '' in hash).
   */
  async verifyChain(tenantId: number): Promise<AuditVerifyResult> {
    const rows = await db<AuditRow>('audit_log').where({ tenant_id: tenantId }).orderBy('id', 'asc');
    let prevHash: string | null = null;
    let checked = 0;
    for (const r of rows) {
      checked += 1;
      const recomputed = computeHash(prevHash, {
        tenantId: r.tenant_id,
        actorId: r.actor_id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        metaCanonical: r.meta,
        createdAtIso: r.created_at.toISOString(),
      });
      if (r.prev_hash !== prevHash || r.hash !== recomputed) {
        return { ok: false, checked, firstBrokenId: r.id };
      }
      prevHash = r.hash;
    }
    return { ok: true, checked, firstBrokenId: null };
  },
};
