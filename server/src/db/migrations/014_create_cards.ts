import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cards', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('board_id').notNullable().references('id').inTable('boards').onDelete('CASCADE');
    t.integer('column_id').notNullable().references('id').inTable('board_columns').onDelete('CASCADE');
    t.integer('sprint_id').nullable().references('id').inTable('sprints').onDelete('SET NULL');
    t.string('title', 300).notNullable();
    t.text('description').nullable();
    t.integer('position').notNullable().defaultTo(0);
    t.integer('points').nullable();
    t.string('priority', 8).nullable();
    t.date('due_date').nullable();
    t.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['board_id', 'column_id']);
  });
  await knex.raw(`ALTER TABLE cards ADD CONSTRAINT cards_priority_chk CHECK (priority IN ('low','medium','high'))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cards');
}
