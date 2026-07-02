import type { Knex } from 'knex';

// Per-weekday WORK PATTERN for part-time / non-uniform contracts. `work_pattern`
// is a jsonb array of 7 entries [Mon,Tue,Wed,Thu,Fri,Sat,Sun] of EXPECTED MINUTES
// per weekday; null = legacy uniform base/5 Mon–Fri. `fte_percent` (0–100) is an
// informative full-time-equivalent display value. Both nullable for back-compat.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('contrats', (t) => {
    t.jsonb('work_pattern').nullable();
    t.integer('fte_percent').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('contrats', (t) => {
    t.dropColumn('work_pattern');
    t.dropColumn('fte_percent');
  });
}
