import type { Knex } from 'knex';

// Public meeting-booking ("réservation de créneau"):
//  - hour_types.bookable: which activity types offer their worked time as free slots.
//  - booking_pages: one token-gated public page per user (config + share token).
//  - appointments: slots booked by external, unauthenticated visitors.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('hour_types', (t) => {
    t.boolean('bookable').notNullable().defaultTo(false);
    // When true (default), a shift of this type that has a PROJECT attached is NOT
    // offered as a bookable slot (a project block = busy work, not "libre RDV").
    t.boolean('booking_exclude_projects').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('booking_pages', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    // 32-byte base64url secret gating the PUBLIC page (mirrors users.ics_token).
    t.string('token', 64).notNullable().unique();
    t.string('title', 160).nullable();
    t.text('intro').nullable();
    t.integer('slot_minutes').notNullable().defaultTo(30);
    t.integer('buffer_minutes').notNullable().defaultTo(0);
    t.integer('min_notice_hours').notNullable().defaultTo(12);
    t.integer('horizon_days').notNullable().defaultTo(30);
    // Daily clamp so an isolated late shift never exposes an off-hours slot.
    t.string('work_start', 5).notNullable().defaultTo('08:00');
    t.string('work_end', 5).notNullable().defaultTo('19:00');
    // Who validates a reservation: 'manager' (default) | 'self' | 'auto'.
    t.string('validation_mode', 16).notNullable().defaultTo('manager');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    // One booking page per user, per tenant.
    t.unique(['tenant_id', 'user_id']);
  });

  await knex.raw(`
    ALTER TABLE booking_pages ADD CONSTRAINT booking_pages_validation_mode_chk
      CHECK (validation_mode IN ('manager','self','auto'))
  `);

  await knex.schema.createTable('appointments', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    // The host the meeting is with.
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('booking_page_id').nullable().references('id').inTable('booking_pages').onDelete('SET NULL');
    t.date('date').notNullable();
    t.string('heure_debut', 5).notNullable();
    t.string('heure_fin', 5).notNullable();
    t.string('external_name', 160).notNullable();
    t.string('external_email', 254).notNullable();
    t.string('subject', 300).nullable();
    t.string('status', 16).notNullable().defaultTo('pending');
    // Lets the external visitor cancel their own appointment without an account.
    t.string('cancel_token', 64).notNullable().unique();
    t.timestamps(true, true);
    t.index(['tenant_id', 'user_id', 'date']);
  });

  await knex.raw(`
    ALTER TABLE appointments ADD CONSTRAINT appointments_status_chk
      CHECK (status IN ('pending','confirmed','cancelled'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('appointments');
  await knex.schema.dropTableIfExists('booking_pages');
  await knex.schema.alterTable('hour_types', (t) => {
    t.dropColumn('bookable');
    t.dropColumn('booking_exclude_projects');
  });
}
