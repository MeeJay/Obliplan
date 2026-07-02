import type { Knex } from 'knex';

// Traceable récupération movements. `semaine` is the Monday of the target week.
// Amount in minutes (positive); direction given by `sens` (credit | debit).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('recup_mouvements', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.date('semaine').notNullable();
    t.integer('heures_min').notNullable();
    t.string('sens', 8).notNullable();
    t.text('motif').nullable();
    t.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'user_id']);
  });

  await knex.raw(`
    ALTER TABLE recup_mouvements ADD CONSTRAINT recup_sens_chk
      CHECK (sens IN ('credit','debit'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('recup_mouvements');
}
