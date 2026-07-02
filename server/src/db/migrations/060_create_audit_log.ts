import type { Knex } from 'knex';

// Tamper-evident audit trail - an APPEND-ONLY per-tenant hash chain. Each row's
// `hash = HMAC-SHA256(auditSecret, canonical(prev_hash, row))`; editing, reordering,
// or breaking the linkage of any past row makes the recomputed hash diverge and the
// verify endpoint pinpoints the first break. LIMITATIONS by design: a pure back-linked
// chain does NOT detect TAIL TRUNCATION (deleting the most-recent rows leaves a shorter
// but internally-consistent chain), and the HMAC only resists an attacker WITHOUT the
// application key - an attacker holding both DB write access AND the key could rewrite
// and re-key the whole chain. `actor_id` is a PLAIN immutable integer (NOT a FK): it is
// folded into the hash, so a SET NULL/CASCADE on a hard user-delete must never rewrite
// it. The display name is resolved live via a leftJoin (missing user → '-', anonymised
// user → "Salarié anonymisé"), so no PII is frozen into the trail. `meta` is a CANONICAL
// JSON string (text, NOT jsonb) so the hashed bytes stay byte-stable across reads.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_log', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('actor_id').nullable(); // immutable historical id, deliberately NOT a FK (hashed field)
    t.string('action', 64).notNullable();
    t.string('entity_type', 48).nullable();
    t.integer('entity_id').nullable();
    t.text('meta').nullable();
    t.string('prev_hash', 64).nullable();
    t.string('hash', 64).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['tenant_id', 'id']);
  });
  // Hard backstop against a forked chain (incl. two genesis rows, whose prev_hash is
  // NULL): at most one row per (tenant, prev_hash). COALESCE folds NULL→'' because SQL
  // NULLs are distinct in a plain UNIQUE. A residual race loses its (best-effort) insert
  // instead of silently corrupting the chain; the advisory lock in record() prevents it.
  await knex.raw(
    "CREATE UNIQUE INDEX audit_log_tenant_prevhash_uniq ON audit_log (tenant_id, COALESCE(prev_hash, ''))",
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_log');
}
