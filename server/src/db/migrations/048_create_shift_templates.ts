import type { Knex } from 'knex';

// Reusable named shift templates (Skello/Combo-style) a manager applies to a day.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('shift_templates', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('name', 80).notNullable();
    t.string('heure_debut', 5).notNullable();
    t.string('heure_fin', 5).notNullable();
    t.integer('pause_min').notNullable().defaultTo(0);
    t.string('type', 16).notNullable().defaultTo('travail');
    t.integer('hour_type_id').nullable().references('id').inTable('hour_types').onDelete('SET NULL');
    t.integer('board_id').nullable().references('id').inTable('boards').onDelete('SET NULL');
    t.string('color', 7).nullable();
    t.timestamps(true, true);
    t.index(['tenant_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('shift_templates');
}
