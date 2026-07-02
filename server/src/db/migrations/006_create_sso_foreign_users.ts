import type { Knex } from 'knex';

// Links a local user to an external identity (e.g. Obligate). Supports
// multiple linked sources per local user.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sso_foreign_users', (t) => {
    t.increments('id').primary();
    t.string('foreign_source', 64).notNullable();
    t.integer('foreign_user_id').notNullable();
    t.integer('local_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.unique(['foreign_source', 'foreign_user_id']);
    t.index(['local_user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sso_foreign_users');
}
