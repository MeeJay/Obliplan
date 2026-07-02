import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('shifts', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.date('date').notNullable();
    // Local HH:mm; null for full-day non-work types (conge, repos…).
    t.string('heure_debut', 5).nullable();
    t.string('heure_fin', 5).nullable();
    t.integer('pause_min').notNullable().defaultTo(0);
    t.string('type', 16).notNullable().defaultTo('travail');
    t.string('statut', 16).notNullable().defaultTo('brouillon');
    t.text('note').nullable();
    t.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.integer('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['tenant_id', 'user_id', 'date']);
  });

  await knex.raw(`
    ALTER TABLE shifts ADD CONSTRAINT shifts_type_chk
      CHECK (type IN ('travail','repos','recup','conge','absence','ecole'))
  `);
  await knex.raw(`
    ALTER TABLE shifts ADD CONSTRAINT shifts_statut_chk
      CHECK (statut IN ('brouillon','valide'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('shifts');
}
