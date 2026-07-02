import type { Knex } from 'knex';

// Board MEMBERSHIP: a project now has a real team. Each member has a role
// (owner/admin/member/viewer) that drives visibility and member management.
// Existing boards are back-filled with their owner as the sole 'owner' member
// so they keep working unchanged.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('board_members', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('board_id').notNullable().references('id').inTable('boards').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('role', 8).notNullable().defaultTo('member');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['board_id', 'user_id']);
    t.index(['tenant_id']);
  });
  await knex.raw(
    `ALTER TABLE board_members ADD CONSTRAINT board_members_role_chk CHECK (role IN ('owner','admin','member','viewer'))`,
  );

  // Back-fill: every existing board's owner becomes its 'owner' member.
  await knex.raw(`
    INSERT INTO board_members (tenant_id, board_id, user_id, role)
    SELECT tenant_id, id, owner_id, 'owner' FROM boards
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('board_members');
}
