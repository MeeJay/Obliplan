import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('boards', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('owner_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.text('description').nullable();
    t.timestamps(true, true);
    t.index(['tenant_id', 'owner_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('boards');
}
