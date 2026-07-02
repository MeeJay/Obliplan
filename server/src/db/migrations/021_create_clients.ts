import type { Knex } from 'knex';

// Clients (customers) of a tenant. Kanban boards (projects) belong to a client,
// giving each workspace a per-client view of its projects.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('clients', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.string('color', 9).nullable();
    t.string('contact', 200).nullable();
    t.text('notes').nullable();
    t.boolean('archived').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.index(['tenant_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('clients');
}
