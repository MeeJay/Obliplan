import type { Knex } from 'knex';

// Half-day precision: a leave request can start and/or end on a half-day.
// `start_period`/`end_period` are 'full' (whole day), 'am' (morning) or 'pm'
// (afternoon). The legacy `half_day` bool is kept for back-compat; days are now
// computed from the periods (a single am/pm day = 0.5; a multi-day range loses
// 0.5 when it starts in the afternoon and/or ends in the morning).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('leave_requests', (t) => {
    t.string('start_period', 4).notNullable().defaultTo('full');
    t.string('end_period', 4).notNullable().defaultTo('full');
  });

  await knex.raw(`
    ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_start_period_chk
      CHECK (start_period IN ('full','am','pm'))
  `);
  await knex.raw(`
    ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_end_period_chk
      CHECK (end_period IN ('full','am','pm'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_start_period_chk');
  await knex.raw('ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_end_period_chk');
  await knex.schema.alterTable('leave_requests', (t) => {
    t.dropColumn('start_period');
    t.dropColumn('end_period');
  });
}
