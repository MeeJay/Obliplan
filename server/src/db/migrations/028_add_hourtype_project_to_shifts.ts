import type { Knex } from 'knex';

// Link a planning shift to an hour type (label/color) and a project (board).
// Both nullable so existing shifts stay unassigned; ON DELETE SET NULL keeps the
// shift when its hour type or board is removed.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('shifts', (t) => {
    t.integer('hour_type_id').nullable().references('id').inTable('hour_types').onDelete('SET NULL');
    t.integer('board_id').nullable().references('id').inTable('boards').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('shifts', (t) => {
    t.dropColumn('hour_type_id');
    t.dropColumn('board_id');
  });
}
