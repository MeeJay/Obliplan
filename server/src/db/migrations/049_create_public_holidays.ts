import type { Knex } from 'knex';
import { frHolidays } from '../../utils/holidays';

// Public holidays: the global FR national set (tenant_id NULL) plus per-tenant
// custom rows. Leave-day counts and expected weekly hours skip these dates so a
// férié no longer consumes CP and is deducted from the attendu.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('public_holidays', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').nullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.date('date').notNullable();
    t.text('label').notNullable();
    t.string('region_code', 8).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['tenant_id', 'date']);
  });

  // Keep the global FR set idempotent: at most one global row per date.
  await knex.raw(`
    CREATE UNIQUE INDEX public_holidays_global_date_uniq
      ON public_holidays (date)
      WHERE tenant_id IS NULL
  `);

  // Seed the FR national holidays (tenant_id NULL) for currentYear-1 .. currentYear+2.
  // Dedupe by date first: in rare years a movable holiday lands on a fixed FR date,
  // which would otherwise violate the partial unique index above.
  const currentYear = new Date().getUTCFullYear();
  const byDate = new Map<string, { tenant_id: null; date: string; label: string; region_code: null }>();
  for (let year = currentYear - 1; year <= currentYear + 2; year++) {
    for (const h of frHolidays(year)) {
      if (!byDate.has(h.date)) byDate.set(h.date, { tenant_id: null, date: h.date, label: h.label, region_code: null });
    }
  }
  const rows = [...byDate.values()];
  if (rows.length) await knex('public_holidays').insert(rows);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('public_holidays');
}
