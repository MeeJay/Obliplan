import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sprints', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('board_id').notNullable().references('id').inTable('boards').onDelete('CASCADE');
    t.string('name', 160).notNullable();
    t.text('goal').nullable();
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.string('status', 16).notNullable().defaultTo('planned');
    t.timestamps(true, true);
    t.index(['board_id']);
  });
  await knex.raw(`ALTER TABLE sprints ADD CONSTRAINT sprints_status_chk CHECK (status IN ('planned','active','done'))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sprints');
}
