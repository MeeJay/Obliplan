import type { Knex } from 'knex';

/**
 * A user's chosen default workspace. On login the session lands on this tenant
 * (when the user still has access to it), instead of the lowest-id accessible one.
 * Only meaningful for multi-tenant users; nullable = "no preference, use the first".
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('users')) {
    if (!(await knex.schema.hasColumn('users', 'preferred_tenant_id'))) {
      await knex.schema.alterTable('users', (t) => {
        t.integer('preferred_tenant_id').nullable().references('id').inTable('tenants').onDelete('SET NULL');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'preferred_tenant_id')) {
    await knex.schema.alterTable('users', (t) => {
      t.dropColumn('preferred_tenant_id');
    });
  }
}
