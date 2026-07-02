import type { Knex } from 'knex';

// Jours d'école for alternance contracts. Either a concrete `date`, or a
// recurring `weekday` (0=Sun..6=Sat) optionally bounded by period_start/end.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('jours_ecole', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.date('date').nullable();
    t.smallint('weekday').nullable();
    t.date('period_start').nullable();
    t.date('period_end').nullable();
    t.timestamps(true, true);
    t.index(['tenant_id', 'user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('jours_ecole');
}
