import type { Knex } from 'knex';

// Récup redesign:
//  - users.recup_self_service: per-employee opt-in to the self récup view.
//  - recup_mouvements.source: provenance of a movement (manual | eligible).
//    A partial unique index makes the automatic "eligible" credit idempotent
//    per (tenant_id, user_id, semaine) - one auto-credit per validated week.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('recup_self_service').notNullable().defaultTo(false);
  });

  await knex.schema.alterTable('recup_mouvements', (t) => {
    t.string('source', 16).nullable();
  });

  await knex.raw(`
    ALTER TABLE recup_mouvements ADD CONSTRAINT recup_source_chk
      CHECK (source IS NULL OR source IN ('manual','eligible'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX recup_eligible_uniq
      ON recup_mouvements (tenant_id, user_id, semaine)
      WHERE source = 'eligible'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS recup_eligible_uniq');
  await knex.raw('ALTER TABLE recup_mouvements DROP CONSTRAINT IF EXISTS recup_source_chk');
  await knex.schema.alterTable('recup_mouvements', (t) => {
    t.dropColumn('source');
  });
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('recup_self_service');
  });
}
