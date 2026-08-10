import type { Knex } from 'knex';

/**
 * Per-user "shift change" notification lead time, in minutes. NULL = disabled (default). When
 * set (e.g. 10), the user gets a push/in-app notification that many minutes before each shift
 * change, plus one at the change itself. Opt-in, set by the user in their profile.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('users'))) return;
  if (!(await knex.schema.hasColumn('users', 'shift_notify_before_min'))) {
    await knex.schema.alterTable('users', (t) => {
      t.integer('shift_notify_before_min').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'shift_notify_before_min')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('shift_notify_before_min'));
  }
}
