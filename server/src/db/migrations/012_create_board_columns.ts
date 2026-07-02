import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('board_columns', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('board_id').notNullable().references('id').inTable('boards').onDelete('CASCADE');
    t.string('name', 120).notNullable();
    t.integer('position').notNullable().defaultTo(0);
    t.integer('wip_limit').nullable();
    t.timestamps(true, true);
    t.index(['board_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('board_columns');
}
