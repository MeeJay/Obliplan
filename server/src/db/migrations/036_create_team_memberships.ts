import type { Knex } from 'knex';

// Membership join table: which tenant users belong to which team.
// Composite primary key (team_id, user_id) - a user appears once per team.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('team_memberships', (t) => {
    t.integer('team_id').notNullable().references('id').inTable('user_teams').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.primary(['team_id', 'user_id']);
    t.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('team_memberships');
}
