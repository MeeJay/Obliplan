import type { Knex } from 'knex';

// Audit trail of every outbound e-mail the mailer attempts to send. tenant_id is
// nullable because some mails (e.g. the SMTP self-test) are not bound to a
// workspace. status is constrained to 'sent' | 'failed'; error holds the SMTP
// failure message when status='failed'.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('email_log', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').nullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.text('recipient').notNullable();
    t.text('subject').notNullable();
    t.string('template', 64).nullable();
    t.string('status', 8).notNullable();
    t.text('error').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['tenant_id', 'created_at']);
  });

  await knex.raw(`
    ALTER TABLE email_log ADD CONSTRAINT email_log_status_chk
      CHECK (status IN ('sent','failed'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('email_log');
}
