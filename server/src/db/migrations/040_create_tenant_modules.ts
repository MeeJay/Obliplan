import type { Knex } from 'knex';

// Per-workspace module enablement. A workspace with no rows has every module
// enabled (default-all-on); a row with enabled=false hides the module in the
// nav and makes the server reject its routes. module_key is one of the fixed
// catalog keys in shared/src/modules.ts.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenant_modules', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('module_key', 32).notNullable();
    t.boolean('enabled').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['tenant_id', 'module_key']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenant_modules');
}
