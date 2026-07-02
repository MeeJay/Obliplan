import type { Knex } from 'knex';

// Legal leave accrual (e.g. CP 2,5 j/mois). A leave type can either grant a
// fixed annual allowance ('fixed_annual', the legacy behaviour) or accrue days
// per month within an acquisition period ('monthly'). `accrual_rate_per_month`
// is the per-month rate (e.g. 2.50 for CP); `period_start_month` (1–12) is the
// anchor month of the acquisition period (e.g. 6 = June for CP). Balances are
// computed on the fly - no new tables, no cron.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('leave_types', (t) => {
    t.string('accrual_mode', 16).notNullable().defaultTo('fixed_annual');
    t.decimal('accrual_rate_per_month', 5, 2).nullable();
    t.integer('period_start_month').notNullable().defaultTo(1);
  });

  await knex.raw(`
    ALTER TABLE leave_types ADD CONSTRAINT leave_types_accrual_mode_chk
      CHECK (accrual_mode IN ('fixed_annual','monthly'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE leave_types DROP CONSTRAINT IF EXISTS leave_types_accrual_mode_chk');
  await knex.schema.alterTable('leave_types', (t) => {
    t.dropColumn('accrual_mode');
    t.dropColumn('accrual_rate_per_month');
    t.dropColumn('period_start_month');
  });
}
