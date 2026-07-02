import type { Knex } from 'knex';

// Link a board (project) to a client. Nullable so existing/internal boards stay
// unassigned; ON DELETE SET NULL keeps boards when their client is removed.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('boards', (t) => {
    t.integer('client_id').nullable().references('id').inTable('clients').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('boards', (t) => {
    t.dropColumn('client_id');
  });
}
