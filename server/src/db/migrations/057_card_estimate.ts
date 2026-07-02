import type { Knex } from 'knex';

// Per-card planned effort estimate (minutes). Feeds the Charge (workload) view:
// Σ estimate_min of a teammate's active (non-done) assigned cards, compared to
// their weekly contract capacity (base hours − approved leave this week).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cards', (t) => {
    t.integer('estimate_min').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cards', (t) => {
    t.dropColumn('estimate_min');
  });
}
