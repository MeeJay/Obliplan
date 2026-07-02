import type { Knex } from 'knex';

// Permission sets (global, not tenant-scoped): a named bundle of capabilities,
// keyed by slug. user_tenants.role stores a slug → resolves per-tenant rights.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('permission_sets', (t) => {
    t.increments('id').primary();
    t.string('name', 64).notNullable();
    t.string('slug', 64).notNullable().unique();
    t.jsonb('capabilities').notNullable().defaultTo('[]');
    t.boolean('is_default').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  // Default sets matching the built-in app roles (slugs admin/manager/employe).
  await knex('permission_sets').insert([
    {
      name: 'Admin',
      slug: 'admin',
      is_default: true,
      capabilities: JSON.stringify([
        'planning:read_team', 'planning:write', 'recup:manage',
        'leave:validate', 'leave:types:manage',
        'contrats:manage', 'users:manage', 'tenants:manage', 'settings:manage',
        'clients:manage', 'projects:create',
      ]),
    },
    {
      name: 'Manager',
      slug: 'manager',
      is_default: true,
      capabilities: JSON.stringify([
        'planning:read_team', 'planning:write', 'recup:manage', 'leave:validate', 'projects:create',
      ]),
    },
    {
      name: 'Salarié',
      slug: 'employe',
      is_default: true,
      capabilities: JSON.stringify(['projects:create']),
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('permission_sets');
}
