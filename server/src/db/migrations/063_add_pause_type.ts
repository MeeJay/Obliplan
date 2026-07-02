import type { Knex } from 'knex';

// Add the 'pause' shift type - a lunch/break slot that is NOT worked time (excluded
// from réalisé and from the worked-hour caps) but carries a time range, so a workday
// can show "Front 09-12 · Pause 12-13 · Front 13-18" instead of only repos/congé.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_type_chk');
  await knex.raw(`
    ALTER TABLE shifts ADD CONSTRAINT shifts_type_chk
      CHECK (type IN ('travail','pause','repos','recup','conge','absence','ecole','astreinte'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Reclassify any existing pauses as repos so the narrower CHECK can be re-applied.
  await knex('shifts').where({ type: 'pause' }).update({ type: 'repos' });
  await knex.raw('ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_type_chk');
  await knex.raw(`
    ALTER TABLE shifts ADD CONSTRAINT shifts_type_chk
      CHECK (type IN ('travail','repos','recup','conge','absence','ecole','astreinte'))
  `);
}
