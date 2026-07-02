import type { Knex } from 'knex';

// Link planned 'recup' shifts to an auto-generated récup debit movement:
//  - recup_mouvements.shift_id: FK → shifts(id) ON DELETE CASCADE (the shift owns
//    its trace; deleting the shift removes the debit).
//  - source 'recup-shift' added to recup_source_chk.
//  - partial unique index: one linked debit per shift (idempotent sync).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('recup_mouvements', (t) => {
    t.integer('shift_id').nullable().references('id').inTable('shifts').onDelete('CASCADE');
  });

  await knex.raw('ALTER TABLE recup_mouvements DROP CONSTRAINT IF EXISTS recup_source_chk');
  await knex.raw(`
    ALTER TABLE recup_mouvements ADD CONSTRAINT recup_source_chk
      CHECK (source IS NULL OR source IN ('manual','eligible','overtime','recup-shift'))
  `);

  // One linked récup debit per planned shift (idempotent sync).
  await knex.raw(`
    CREATE UNIQUE INDEX recup_shift_uniq
      ON recup_mouvements (shift_id)
      WHERE shift_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS recup_shift_uniq');
  // Remove the auto-generated planning→récup traces before narrowing the CHECK back,
  // otherwise re-adding the constraint would fail validation on existing 'recup-shift' rows.
  await knex('recup_mouvements').where({ source: 'recup-shift' }).del();
  await knex.raw('ALTER TABLE recup_mouvements DROP CONSTRAINT IF EXISTS recup_source_chk');
  await knex.raw(`
    ALTER TABLE recup_mouvements ADD CONSTRAINT recup_source_chk
      CHECK (source IS NULL OR source IN ('manual','eligible','overtime'))
  `);
  await knex.schema.alterTable('recup_mouvements', (t) => t.dropColumn('shift_id'));
}
