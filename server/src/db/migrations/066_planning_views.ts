import type { Knex } from 'knex';

// Per-user saved planning "vues": named presets of which Axis-C teams stay visible
// in the team planning views. Owner-scoped AND tenant-scoped (a view belongs to one
// user in one tenant). `team_ids` is a jsonb array of user_teams ids ([] = all teams).
// Unique (tenant_id, user_id, name) so a user can't have two views with the same name.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('planning_views', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('name', 80).notNullable();
    t.jsonb('team_ids').notNullable().defaultTo('[]');
    t.timestamps(true, true);
    t.unique(['tenant_id', 'user_id', 'name']);
    t.index(['tenant_id', 'user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('planning_views');
}
