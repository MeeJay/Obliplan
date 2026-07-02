import type { Knex } from 'knex';

// Web Push subscriptions - one row per browser/device a user has opted in from.
// A subscription belongs to the USER (not a tenant): the same physical device
// receives that person's notifications across every tenant they belong to. The
// `endpoint` is the push service URL and is globally unique (re-subscribing the
// same device upserts on it). `p256dh`/`auth` are the client's encryption keys.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('push_subscriptions', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('endpoint').notNullable().unique();
    t.text('p256dh').notNullable();
    t.text('auth').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('push_subscriptions');
}
