import type { Knex } from 'knex';

/**
 * Per-contract public-holiday rules.
 * - pays: ISO country code (FR, MG…) of the contract. A contract only observes the public
 *   holidays of its own country (see 074), so a team abroad (e.g. Madagascar) gets ITS
 *   holidays and works FR holidays as normal days. Default 'FR'.
 * - ferie_worked_coeff: multiplier applied to hours WORKED on an observed public holiday
 *   when crediting heures sup (2.0 = +100%). Default 1.0 = worked holiday credited 1:1.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('contrats'))) return;
  if (!(await knex.schema.hasColumn('contrats', 'pays'))) {
    await knex.schema.alterTable('contrats', (t) => {
      t.string('pays', 2).notNullable().defaultTo('FR');
    });
  }
  if (!(await knex.schema.hasColumn('contrats', 'ferie_worked_coeff'))) {
    await knex.schema.alterTable('contrats', (t) => {
      t.decimal('ferie_worked_coeff', 4, 2).notNullable().defaultTo(1);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('contrats', 'ferie_worked_coeff')) {
    await knex.schema.alterTable('contrats', (t) => t.dropColumn('ferie_worked_coeff'));
  }
  if (await knex.schema.hasColumn('contrats', 'pays')) {
    await knex.schema.alterTable('contrats', (t) => t.dropColumn('pays'));
  }
}
