import type { Knex } from 'knex';

// Board-less time tracking: a time entry may now be logged with no specific project.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('time_entries', (t) => {
    t.integer('board_id').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Board-less rows can't be re-tied to a board; drop them before restoring NOT NULL.
  await knex('time_entries').whereNull('board_id').del();
  await knex.schema.alterTable('time_entries', (t) => {
    t.integer('board_id').notNullable().alter();
  });
}
