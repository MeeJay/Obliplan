import type { Knex } from 'knex';

/**
 * Split the shift-change notification into two independent toggles:
 *   - shift_notify_at_change: notify AT the moment of the change (default off = opt-in),
 *   - shift_notify_before_min: notify this many minutes before (075, null = off).
 * Existing opted-in users (a lead time already set) keep the at-change alert, so nobody
 * silently loses the notification they already had.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('users'))) return;
  if (!(await knex.schema.hasColumn('users', 'shift_notify_at_change'))) {
    await knex.schema.alterTable('users', (t) => {
      t.boolean('shift_notify_at_change').notNullable().defaultTo(false);
    });
    await knex('users').whereNotNull('shift_notify_before_min').update({ shift_notify_at_change: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'shift_notify_at_change')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('shift_notify_at_change'));
  }
}
