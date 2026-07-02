import type { Knex } from 'knex';

// RGPD "droit à l'effacement" (pseudonymisation): timestamp stamped when a departed
// salarié's identity is scrubbed (name/email/login/SSO link/calendar token cleared)
// while their planning/HR records are KEPT for the legal retention period. NULL = the
// account still carries a live identity.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.timestamp('anonymized_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('anonymized_at');
  });
}
