import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('username', 100).notNullable().unique();
    // Nullable: SSO-only (Obligate) users have no local password.
    t.string('password_hash', 255).nullable();
    t.string('display_name', 200).nullable();
    t.string('email', 255).nullable();
    // App role: 'admin' | 'manager' | 'employe'.
    t.string('role', 16).notNullable().defaultTo('employe');
    t.boolean('is_active').notNullable().defaultTo(true);
    // Contract drives this user's work-time calculation.
    t.integer('contrat_id').nullable().references('id').inTable('contrats').onDelete('SET NULL');
    // Manager responsible for this user's planning (self-FK).
    t.integer('manager_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('preferred_language', 10).defaultTo('fr');
    t.jsonb('preferences').defaultTo('{}');
    // SSO foreign linkage (null for local accounts).
    t.string('foreign_source', 64).nullable();
    t.integer('foreign_id').nullable();
    t.string('foreign_source_url', 512).nullable();
    t.timestamps(true, true);
    t.index(['tenant_id']);
    t.index(['manager_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
