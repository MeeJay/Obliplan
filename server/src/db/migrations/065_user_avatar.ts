import type { Knex } from 'knex';

// Profile avatar for users. Holds a URL (synced from Obligate's profilePhotoUrl on
// SSO login) or a base64 data-URI (future local upload). Null → initials avatar.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.text('avatar').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('avatar');
  });
}
