import type { Knex } from 'knex';

// Session table for connect-pg-simple (createTableIfMissing is disabled).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('session', (t) => {
    t.string('sid').primary().notNullable();
    t.json('sess').notNullable();
    t.timestamp('expire', { useTz: false }).notNullable().index();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('session');
}
