import type { Knex } from 'knex';

/**
 * Country scope for public holidays. `pays` is an ISO code (FR, MG…), or NULL = universal
 * (applies to every contract whatever its country - preserves the legacy behaviour of
 * tenant-custom holidays). A contract observes a holiday iff pays IS NULL OR pays = its own.
 * The global national set (tenant_id NULL) is tagged 'FR', so a non-FR contract stops
 * inheriting French holidays.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('public_holidays'))) return;
  if (!(await knex.schema.hasColumn('public_holidays', 'pays'))) {
    await knex.schema.alterTable('public_holidays', (t) => {
      t.string('pays', 2).nullable();
    });
    // The pre-existing global set is the French national calendar → tag it FR.
    await knex('public_holidays').whereNull('tenant_id').update({ pays: 'FR' });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('public_holidays', 'pays')) {
    await knex.schema.alterTable('public_holidays', (t) => t.dropColumn('pays'));
  }
}
