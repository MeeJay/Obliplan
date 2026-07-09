import type { Knex } from 'knex';

// Administrative team management: a membership is now either a plain 'member' or a
// 'manager' of the team. A team manager manages every other member of the team (and,
// transitively/recursively, everyone THOSE members manage). This is orthogonal to the
// project-scope grants (team_permissions) that user_teams already carried.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('team_memberships', (t) => {
    t.string('role', 16).notNullable().defaultTo('member');
  });
  await knex.raw(`
    ALTER TABLE team_memberships ADD CONSTRAINT team_memberships_role_chk
      CHECK (role IN ('member','manager'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE team_memberships DROP CONSTRAINT IF EXISTS team_memberships_role_chk');
  await knex.schema.alterTable('team_memberships', (t) => {
    t.dropColumn('role');
  });
}
