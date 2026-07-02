import type { Knex } from 'knex';

// Column completion semantics + card start date.
// `board_columns.is_done` marks a column as a "done" lane (a card there = completed),
// enabling done/cycle analytics and completed styling. `cards.start_date` is an
// optional start of the card's [start, due] span for the Gantt/Timeline view.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('board_columns', (t) => {
    t.boolean('is_done').notNullable().defaultTo(false);
  });
  await knex.schema.alterTable('cards', (t) => {
    t.date('start_date').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('board_columns', (t) => {
    t.dropColumn('is_done');
  });
  await knex.schema.alterTable('cards', (t) => {
    t.dropColumn('start_date');
  });
}
