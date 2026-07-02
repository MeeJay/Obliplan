import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('task_steps', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.string('title', 500).notNullable();
    t.boolean('done').notNullable().defaultTo(false);
    t.integer('position').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['task_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('task_steps');
}
