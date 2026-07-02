import type { Knex } from 'knex';

// In-app notification center. One row per recipient (fan-out is done in the
// notify dispatcher). `actor_id` is the user who triggered the event (nullable,
// SET NULL so deleting the actor keeps the recipient's history intact).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('type', 48).notNullable();
    t.text('title').notNullable();
    t.text('body').nullable();
    t.text('link').nullable();
    t.string('entity_type', 48).nullable();
    t.integer('entity_id').nullable();
    t.integer('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('read_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['tenant_id', 'user_id', 'read_at']);
    t.index(['tenant_id', 'user_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
}
