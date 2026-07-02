import type { Knex } from 'knex';

// Per-team resource scope (Axis C): each row grants a team read-only or
// read-write access to a client, a project, or every resource (scope='all').
// scope_id targets the client/project id; 0 (the default) means "all of kind".
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('team_permissions', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('team_id').notNullable().references('id').inTable('user_teams').onDelete('CASCADE');
    t.string('scope', 16).notNullable();
    t.integer('scope_id').notNullable().defaultTo(0);
    t.string('level', 8).notNullable().defaultTo('ro');
    t.timestamps(true, true);
    t.index(['tenant_id', 'team_id']);
  });

  await knex.raw(`
    ALTER TABLE team_permissions ADD CONSTRAINT team_permissions_scope_chk
      CHECK (scope IN ('client','project','all'))
  `);
  await knex.raw(`
    ALTER TABLE team_permissions ADD CONSTRAINT team_permissions_level_chk
      CHECK (level IN ('ro','rw'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('team_permissions');
}
