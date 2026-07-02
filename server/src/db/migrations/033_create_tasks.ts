import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tasks', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('list_id').notNullable().references('id').inTable('task_lists').onDelete('CASCADE');
    t.string('title', 500).notNullable();
    t.text('note').nullable();
    t.boolean('is_important').notNullable().defaultTo(false);
    t.boolean('is_completed').notNullable().defaultTo(false);
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.date('due_date').nullable();
    t.timestamp('reminder_at', { useTz: true }).nullable();
    t.date('my_day_date').nullable();
    t.integer('position').notNullable().defaultTo(0);
    t.integer('assignee_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['tenant_id', 'list_id']);
    t.index(['tenant_id', 'assignee_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tasks');
}
