import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('overtime_declarations', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('nature_id').notNullable().references('id').inTable('overtime_natures').onDelete('RESTRICT');
    t.date('date').notNullable();
    t.integer('minutes').notNullable();
    t.text('motif').nullable();
    t.string('status', 16).notNullable().defaultTo('en_attente');
    t.integer('decided_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('decided_at').nullable();
    t.timestamps(true, true);
    t.index(['tenant_id', 'user_id']);
    t.index(['tenant_id', 'status']);
  });

  await knex.raw(`
    ALTER TABLE overtime_declarations ADD CONSTRAINT overtime_declarations_status_chk
      CHECK (status IN ('en_attente','valide','refuse'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('overtime_declarations');
}
