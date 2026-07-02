import type { Knex } from 'knex';

// Key/value app configuration (Obligate URL + API key JSON, obligate_enabled flag…).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('app_config', (t) => {
    t.string('key', 128).primary();
    t.text('value').nullable();
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('app_config');
}
