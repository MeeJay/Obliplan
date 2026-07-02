import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

// Demo dataset: 1 tenant, 1 manager, 3 employees with different contracts
// (35h no-sup, 39h with sup, alternance with jours d'école), one week of planning.
// Idempotent: everything is scoped to the 'demo' tenant and rebuilt on each run.

const DEMO_SLUG = 'demo';

function mondayOfCurrentWeek(): Date {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const m = new Date(now);
  m.setDate(now.getDate() - dow);
  m.setHours(0, 0, 0, 0);
  return m;
}

function isoDate(base: Date, addDays: number): string {
  const d = new Date(base);
  d.setDate(base.getDate() + addDays);
  return d.toISOString().slice(0, 10);
}

export async function seed(knex: Knex): Promise<void> {
  const monday = mondayOfCurrentWeek();
  const passwordHash = await bcrypt.hash('demo1234', 12);

  // ── Tenant ────────────────────────────────────────────────────────────────
  let tenant = await knex('tenants').where({ slug: DEMO_SLUG }).first<{ id: number }>();
  if (!tenant) {
    const [row] = await knex('tenants')
      .insert({ name: 'Demo SARL', slug: DEMO_SLUG })
      .returning('id');
    tenant = { id: (row as { id: number }).id ?? (row as unknown as number) };
  }
  const tenantId = tenant.id;

  // ── Wipe previous demo rows (FK-safe order) ────────────────────────────────
  await knex('leave_requests').where({ tenant_id: tenantId }).del();
  await knex('leave_types').where({ tenant_id: tenantId }).del();
  await knex('recup_mouvements').where({ tenant_id: tenantId }).del();
  await knex('shifts').where({ tenant_id: tenantId }).del();
  await knex('jours_ecole').where({ tenant_id: tenantId }).del();
  const demoUserIds = await knex('users').where({ tenant_id: tenantId }).pluck('id');
  if (demoUserIds.length) {
    await knex('user_tenants').whereIn('user_id', demoUserIds).del();
    await knex('users').where({ tenant_id: tenantId }).update({ contrat_id: null, manager_id: null });
    await knex('users').where({ tenant_id: tenantId }).del();
  }
  await knex('contrats').where({ tenant_id: tenantId }).del();

  // ── Contracts ──────────────────────────────────────────────────────────────
  const [c35] = await knex('contrats').insert({
    tenant_id: tenantId, libelle: '35h sans heures sup',
    heures_hebdo_base_min: 35 * 60, heures_sup_autorisees: false, alternance: false,
  }).returning('id');
  const [c39] = await knex('contrats').insert({
    tenant_id: tenantId, libelle: '39h avec heures sup',
    heures_hebdo_base_min: 39 * 60, heures_sup_autorisees: true, seuil_heures_sup_min: null, alternance: false,
  }).returning('id');
  const [cAlt] = await knex('contrats').insert({
    tenant_id: tenantId, libelle: 'Alternance 35h (jours d\'école)',
    heures_hebdo_base_min: 35 * 60, heures_sup_autorisees: false, alternance: true,
  }).returning('id');
  const id = (r: unknown) => (r as { id: number }).id ?? (r as unknown as number);

  // ── Users ──────────────────────────────────────────────────────────────────
  const [mgr] = await knex('users').insert({
    tenant_id: tenantId, username: 'manager', password_hash: passwordHash,
    display_name: 'Marie Manager', email: 'manager@demo.test', role: 'manager', is_active: true,
    preferred_language: 'fr',
  }).returning('id');
  const managerId = id(mgr);

  const [alice] = await knex('users').insert({
    tenant_id: tenantId, username: 'alice', password_hash: passwordHash,
    display_name: 'Alice (35h)', email: 'alice@demo.test', role: 'employe', is_active: true,
    contrat_id: id(c35), manager_id: managerId, preferred_language: 'fr',
  }).returning('id');
  const [bob] = await knex('users').insert({
    tenant_id: tenantId, username: 'bob', password_hash: passwordHash,
    display_name: 'Bob (39h + sup)', email: 'bob@demo.test', role: 'employe', is_active: true,
    contrat_id: id(c39), manager_id: managerId, preferred_language: 'fr',
  }).returning('id');
  const [chloe] = await knex('users').insert({
    tenant_id: tenantId, username: 'chloe', password_hash: passwordHash,
    display_name: 'Chloé (alternante)', email: 'chloe@demo.test', role: 'employe', is_active: true,
    contrat_id: id(cAlt), manager_id: managerId, preferred_language: 'fr',
  }).returning('id');
  const aliceId = id(alice), bobId = id(bob), chloeId = id(chloe);

  // ── Tenant memberships ─────────────────────────────────────────────────────
  await knex('user_tenants').insert([
    { user_id: managerId, tenant_id: tenantId, role: 'manager' },
    { user_id: aliceId, tenant_id: tenantId, role: 'employe' },
    { user_id: bobId, tenant_id: tenantId, role: 'employe' },
    { user_id: chloeId, tenant_id: tenantId, role: 'employe' },
  ]);

  // ── Leave types (config) ────────────────────────────────────────────────────
  await knex('leave_types').insert([
    { tenant_id: tenantId, libelle: 'Congés payés', code: 'CP', color: '#1edd8a', paid: true, reduces_attendu: true, allowance_days: 25, position: 0 },
    { tenant_id: tenantId, libelle: 'RTT', code: 'RTT', color: '#4f7bff', paid: true, reduces_attendu: true, allowance_days: 10, position: 1 },
    { tenant_id: tenantId, libelle: 'Arrêt maladie', code: 'MAL', color: '#e03a3a', paid: true, reduces_attendu: true, requires_justification: true, allowance_days: null, position: 2 },
    { tenant_id: tenantId, libelle: 'Sans solde', code: 'SS', color: '#8c93b6', paid: false, reduces_attendu: true, allowance_days: null, position: 3 },
  ]);

  // ── Jours d'école for Chloé: recurring Thursday + Friday ───────────────────
  await knex('jours_ecole').insert([
    { tenant_id: tenantId, user_id: chloeId, weekday: 4 },
    { tenant_id: tenantId, user_id: chloeId, weekday: 5 },
  ]);

  // ── Shifts (current week, validated) ───────────────────────────────────────
  type ShiftSeed = { user_id: number; day: number; debut: string; fin: string; pause: number; type?: string };
  const work: ShiftSeed[] = [];

  // Alice (35h base): Mon-Thu 7h, Fri 8h → 36h → 1h récup-eligible overflow.
  for (let d = 0; d < 4; d++) work.push({ user_id: aliceId, day: d, debut: '09:00', fin: '17:00', pause: 60 });
  work.push({ user_id: aliceId, day: 4, debut: '09:00', fin: '18:00', pause: 60 });

  // Bob (39h base, heures sup): Mon-Fri 8h → 40h → 1h heures sup.
  for (let d = 0; d < 5; d++) work.push({ user_id: bobId, day: d, debut: '09:00', fin: '18:00', pause: 60 });

  // Chloé (alternance): Mon-Wed 7h (Thu/Fri = école) → 21h = expected after 2 école days.
  for (let d = 0; d < 3; d++) work.push({ user_id: chloeId, day: d, debut: '09:00', fin: '17:00', pause: 60 });

  await knex('shifts').insert(
    work.map((s) => ({
      tenant_id: tenantId, user_id: s.user_id, date: isoDate(monday, s.day),
      heure_debut: s.debut, heure_fin: s.fin, pause_min: s.pause,
      type: s.type ?? 'travail', statut: 'valide', created_by: managerId, updated_by: managerId,
    })),
  );

  // École shifts for Chloé (neutral, illustrative).
  await knex('shifts').insert([4, 5].map((day) => ({
    tenant_id: tenantId, user_id: chloeId, date: isoDate(monday, day),
    heure_debut: null, heure_fin: null, pause_min: 0,
    type: 'ecole', statut: 'valide', created_by: managerId, updated_by: managerId,
  })));

  // Astreinte (on-call) for Bob on Saturday: 1 déclenchement + 2h30 → heures sup.
  await knex('shifts').insert({
    tenant_id: tenantId, user_id: bobId, date: isoDate(monday, 5),
    heure_debut: '20:00', heure_fin: '22:30', pause_min: 0,
    type: 'astreinte', statut: 'valide', created_by: managerId, updated_by: managerId,
  });
}
