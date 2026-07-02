import type { Knex } from 'knex';

// Card HIERARCHY (subtasks via a self-FK parent_card_id) + DEPENDENCIES
// (card_links: blocks/relates/duplicates between two cards of the same board).
// parent_card_id is nullable with ON DELETE SET NULL so deleting a parent keeps
// its children (they become top-level). card_links cascade with their cards.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cards', (t) => {
    t.integer('parent_card_id').nullable().references('id').inTable('cards').onDelete('SET NULL');
    t.index('parent_card_id');
  });

  await knex.schema.createTable('card_links', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('board_id').notNullable().references('id').inTable('boards').onDelete('CASCADE');
    t.integer('source_card_id').notNullable().references('id').inTable('cards').onDelete('CASCADE');
    t.integer('target_card_id').notNullable().references('id').inTable('cards').onDelete('CASCADE');
    t.string('type', 12).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['source_card_id', 'target_card_id', 'type']);
    t.index(['board_id']);
  });
  await knex.raw(
    `ALTER TABLE card_links ADD CONSTRAINT card_links_type_chk CHECK (type IN ('blocks','relates','duplicates'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('card_links');
  await knex.schema.alterTable('cards', (t) => {
    t.dropColumn('parent_card_id');
  });
}
