import type { Knex } from 'knex';

// User teams (Axis C of the permission matrix): a named group of tenant users.
// Membership scopes which clients/projects a team can see; can_create grants the
// team the right to spin up new projects. Mirrors Obliance team groups.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_teams', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('name', 120).notNullable();
    t.text('description').nullable();
    t.boolean('can_create').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.index(['tenant_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_teams');
}
