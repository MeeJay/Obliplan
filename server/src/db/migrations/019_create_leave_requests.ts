import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('leave_requests', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('leave_type_id').notNullable().references('id').inTable('leave_types').onDelete('RESTRICT');
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.boolean('half_day').notNullable().defaultTo(false);
    t.decimal('days', 5, 1).notNullable().defaultTo(0);
    t.text('motif').nullable();
    t.string('status', 16).notNullable().defaultTo('en_attente');
    t.integer('decided_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('decided_at').nullable();
    t.text('decision_comment').nullable();
    t.timestamps(true, true);
    t.index(['tenant_id', 'user_id']);
    t.index(['tenant_id', 'status']);
  });

  await knex.raw(`
    ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_chk
      CHECK (status IN ('brouillon','en_attente','valide','refuse','annule'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('leave_requests');
}
