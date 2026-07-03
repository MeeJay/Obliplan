import type { Knex } from 'knex';

// Idempotent backfill for booking columns that were added to migration 067 AFTER it had
// already been run on some environments (amending an applied migration does NOT replay it).
// Adds the missing columns only when absent, so it is a no-op on a DB created from the final
// 067. Without this, computeAvailability's `select('booking_exclude_projects')` throws (500),
// which surfaced as "Page indisponible" on the public booking page.

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('hour_types')) {
    if (!(await knex.schema.hasColumn('hour_types', 'booking_exclude_projects'))) {
      await knex.schema.alterTable('hour_types', (t) => {
        t.boolean('booking_exclude_projects').notNullable().defaultTo(true);
      });
    }
  }

  if (await knex.schema.hasTable('booking_pages')) {
    if (!(await knex.schema.hasColumn('booking_pages', 'validation_mode'))) {
      await knex.schema.alterTable('booking_pages', (t) => {
        t.string('validation_mode', 16).notNullable().defaultTo('manager');
      });
      // Add the CHECK only when we just created the column (avoids a duplicate-constraint error
      // on a DB that already has it from the final 067).
      await knex.raw(`
        ALTER TABLE booking_pages ADD CONSTRAINT booking_pages_validation_mode_chk
          CHECK (validation_mode IN ('manager','self','auto'))
      `);
    }
  }
}

export async function down(): Promise<void> {
  // No-op: these columns may legitimately have been created by 067 on other environments,
  // so dropping them here would be wrong. 067's own down() handles the fresh-install case.
}
