import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('leave_types', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('libelle', 120).notNullable();
    t.string('code', 16).notNullable();
    t.string('color', 9).nullable();
    t.boolean('paid').notNullable().defaultTo(true);
    t.boolean('reduces_attendu').notNullable().defaultTo(true);
    t.boolean('requires_justification').notNullable().defaultTo(false);
    // Annual allowance in days; null = no balance tracking (maladie, sans solde…).
    t.decimal('allowance_days', 5, 1).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('position').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['tenant_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('leave_types');
}
