import type { Knex } from 'knex';

/**
 * Half-day support for full-day absence blocks (congé / absence / récup) drawn in the planning.
 * day_period: 'full' (whole day, default), 'am' (morning) or 'pm' (afternoon). A half-day block
 * neutralises only 0.5 of the day's expected hours in the weekly counter, so a manager can post
 * a morning congé and the employee still owes the afternoon. Only meaningful for the neutralising
 * types; ignored on timed shifts.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('shifts'))) return;
  if (!(await knex.schema.hasColumn('shifts', 'day_period'))) {
    await knex.schema.alterTable('shifts', (t) => {
      t.string('day_period', 4).notNullable().defaultTo('full');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('shifts', 'day_period')) {
    await knex.schema.alterTable('shifts', (t) => t.dropColumn('day_period'));
  }
}
