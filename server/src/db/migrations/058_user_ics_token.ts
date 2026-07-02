import type { Knex } from 'knex';

// Personal iCalendar (.ics) subscription token: a long random per-user secret that
// lets a calendar client (Google/Apple/Outlook) poll the employee's OWN planning
// feed unauthenticated at /api/ics/:token.ics. Nullable - generated lazily on the
// first "subscribe". UNIQUE so a token resolves to exactly one user.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.string('ics_token', 64).nullable();
    t.unique(['ics_token']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropUnique(['ics_token']);
    t.dropColumn('ics_token');
  });
}
