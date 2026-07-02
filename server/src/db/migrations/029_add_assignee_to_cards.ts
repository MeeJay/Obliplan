import type { Knex } from 'knex';

// Add an optional assignee to cards. Nullable so existing cards stay unassigned;
// ON DELETE SET NULL keeps the card when its assignee user is removed.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cards', (t) => {
    t.integer('assignee_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.index('assignee_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cards', (t) => {
    t.dropColumn('assignee_id');
  });
}
