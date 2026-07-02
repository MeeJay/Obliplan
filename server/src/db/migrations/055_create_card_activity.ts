import type { Knex } from 'knex';

// Per-card ACTIVITY feed: an append-only change history (created/assigned/moved/
// status/commented/updated). actor_id is nullable with ON DELETE SET NULL so a
// deleted user's entries survive. meta (jsonb) carries per-type details, e.g.
// { from, to } for a move or { assigneeId } for an assignment.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('card_activity', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('card_id').notNullable().references('id').inTable('cards').onDelete('CASCADE');
    t.integer('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('type', 24).notNullable();
    t.jsonb('meta').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['card_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('card_activity');
}
