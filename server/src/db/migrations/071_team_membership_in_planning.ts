import type { Knex } from 'knex';

/**
 * Whether a team member's OWN planning is part of the team roster.
 * Lets you designate a management-only member (role='manager', in_planning=false):
 * they gain visibility over the team without their own planning appearing in it.
 * Default true = current behaviour (every member is in the roster).
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('team_memberships')) {
    if (!(await knex.schema.hasColumn('team_memberships', 'in_planning'))) {
      await knex.schema.alterTable('team_memberships', (t) => {
        t.boolean('in_planning').notNullable().defaultTo(true);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('team_memberships', 'in_planning')) {
    await knex.schema.alterTable('team_memberships', (t) => {
      t.dropColumn('in_planning');
    });
  }
}
