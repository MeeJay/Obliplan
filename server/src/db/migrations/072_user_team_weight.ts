import type { Knex } from 'knex';

/**
 * Ordering weight for administrative teams. Lower weight = higher priority, so a
 * team's members sort first in the team planning / overview grids. Default 0 =
 * legacy behaviour (ties fall back to team name, then employee name).
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('user_teams')) {
    if (!(await knex.schema.hasColumn('user_teams', 'weight'))) {
      await knex.schema.alterTable('user_teams', (t) => {
        t.integer('weight').notNullable().defaultTo(0);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('user_teams', 'weight')) {
    await knex.schema.alterTable('user_teams', (t) => {
      t.dropColumn('weight');
    });
  }
}
