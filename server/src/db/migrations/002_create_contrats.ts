import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('contrats', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('libelle', 200).notNullable();
    // Base weekly hours stored in minutes (35h = 2100).
    t.integer('heures_hebdo_base_min').notNullable();
    // false → overflow becomes récup; true → overflow counted as heures sup.
    t.boolean('heures_sup_autorisees').notNullable().defaultTo(false);
    // Optional threshold (minutes) above which overflow counts as heures sup.
    t.integer('seuil_heures_sup_min').nullable();
    // Alternance → uses jours d'école to reduce the expected weekly hours.
    t.boolean('alternance').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.index(['tenant_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('contrats');
}
