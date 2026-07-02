import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('overtime_declarations', (t) => {
    t.text('decision_comment').nullable();
    t.integer('recup_minutes').notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('recup_mouvements', (t) => {
    t.integer('overtime_declaration_id')
      .nullable()
      .references('id')
      .inTable('overtime_declarations')
      .onDelete('CASCADE');
  });

  await knex.raw('ALTER TABLE recup_mouvements DROP CONSTRAINT IF EXISTS recup_source_chk');
  await knex.raw(`
    ALTER TABLE recup_mouvements ADD CONSTRAINT recup_source_chk
      CHECK (source IS NULL OR source IN ('manual','eligible','overtime'))
  `);
  // One linked récup credit per overtime declaration (idempotent sync).
  await knex.raw(`
    CREATE UNIQUE INDEX recup_overtime_decl_uniq
      ON recup_mouvements (overtime_declaration_id)
      WHERE overtime_declaration_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS recup_overtime_decl_uniq');
  // Remove the auto-generated overtime→récup traces before narrowing the CHECK back,
  // otherwise re-adding the constraint would fail validation on existing 'overtime' rows.
  await knex('recup_mouvements').where({ source: 'overtime' }).del();
  await knex.raw('ALTER TABLE recup_mouvements DROP CONSTRAINT IF EXISTS recup_source_chk');
  await knex.raw(`
    ALTER TABLE recup_mouvements ADD CONSTRAINT recup_source_chk
      CHECK (source IS NULL OR source IN ('manual','eligible'))
  `);
  await knex.schema.alterTable('recup_mouvements', (t) => t.dropColumn('overtime_declaration_id'));
  await knex.schema.alterTable('overtime_declarations', (t) => {
    t.dropColumn('decision_comment');
    t.dropColumn('recup_minutes');
  });
}
