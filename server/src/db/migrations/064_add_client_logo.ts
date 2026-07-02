import type { Knex } from 'knex';

// Give a client an optional LOGO. Stored as text (a small, client-side resized
// base64 data-URI or an external URL) so no file/blob infrastructure is needed;
// nullable → existing clients keep no logo and fall back to a colored initial.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('clients', (t) => {
    t.text('logo').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('clients', (t) => {
    t.dropColumn('logo');
  });
}
