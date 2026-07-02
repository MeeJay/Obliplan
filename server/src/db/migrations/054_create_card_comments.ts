import type { Knex } from 'knex';

// Per-card COMMENTS (the discussion thread on a card). author_id is nullable with
// ON DELETE SET NULL so a deleted user's comments survive as authored by "-".
// Comments cascade away with their card / tenant.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('card_comments', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('card_id').notNullable().references('id').inTable('cards').onDelete('CASCADE');
    t.integer('author_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.text('body').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['card_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('card_comments');
}
