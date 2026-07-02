import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('time_entries', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('board_id').notNullable().references('id').inTable('boards').onDelete('CASCADE');
    t.integer('card_id').nullable().references('id').inTable('cards').onDelete('CASCADE');
    t.integer('minutes').notNullable().defaultTo(0);
    t.text('note').nullable();
    t.date('spent_on').nullable();
    t.boolean('is_running').notNullable().defaultTo(false);
    t.timestamp('started_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['tenant_id', 'user_id']);
    t.index(['board_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('time_entries');
}
