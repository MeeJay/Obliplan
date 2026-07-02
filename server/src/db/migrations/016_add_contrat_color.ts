import type { Knex } from 'knex';

// Color tag for a contract (e.g. Responsable=red, Technicien=green) - gives the
// manager a clear visual on the team planning grid. Hex string like '#e03a3a'.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('contrats', (t) => {
    t.string('color', 9).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('contrats', (t) => {
    t.dropColumn('color');
  });
}
