import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('task_lists', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('owner_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.string('color', 16).notNullable().defaultTo('#4f9cf9');
    t.string('icon', 40).nullable();
    t.integer('group_id').nullable().references('id').inTable('list_groups').onDelete('SET NULL');
    t.integer('position').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['tenant_id', 'owner_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('task_lists');
}
