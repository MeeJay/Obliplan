import type { Knex } from 'knex';

// Add the 'astreinte' (on-call) shift type. On-call time counts as heures sup
// and each astreinte event is one "déclenchement" (call-out).
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_type_chk');
  await knex.raw(`
    ALTER TABLE shifts ADD CONSTRAINT shifts_type_chk
      CHECK (type IN ('travail','repos','recup','conge','absence','ecole','astreinte'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_type_chk');
  await knex.raw(`
    ALTER TABLE shifts ADD CONSTRAINT shifts_type_chk
      CHECK (type IN ('travail','repos','recup','conge','absence','ecole'))
  `);
}
