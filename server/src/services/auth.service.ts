import { db } from '../db';
import { hashPassword, comparePassword } from '../utils/crypto';
import { MASTER_TENANT_ID } from '@obliplan/shared';
import type { User, UserPreferences, UserRole } from '@obliplan/shared';
import { logger } from '../utils/logger';

export interface UserRow {
  id: number;
  tenant_id: number;
  username: string;
  password_hash: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  contrat_id: number | null;
  manager_id: number | null;
  preferred_language: string | null;
  preferences: UserPreferences | string | null;
  recup_self_service: boolean | null;
  shift_notify_before_min: number | null;
  foreign_source: string | null;
  foreign_id: number | null;
  foreign_source_url: string | null;
  avatar: string | null;
  anonymized_at: Date | string | null;
  created_at: Date;
  updated_at: Date;
}

export function rowToUser(row: UserRow): User {
  const prefs =
    typeof row.preferences === 'string' ? (JSON.parse(row.preferences) as UserPreferences) : row.preferences;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email ?? null,
    role: row.role as UserRole,
    isActive: row.is_active,
    contratId: row.contrat_id ?? null,
    managerId: row.manager_id ?? null,
    preferences: prefs ?? null,
    preferredLanguage: row.preferred_language ?? 'fr',
    recupSelfService: row.recup_self_service ?? false,
    shiftNotifyBeforeMin: row.shift_notify_before_min ?? null,
    foreignSource: row.foreign_source ?? null,
    foreignId: row.foreign_id ?? null,
    foreignSourceUrl: row.foreign_source_url ?? null,
    avatar: row.avatar ?? null,
    hasPassword: row.password_hash !== null && row.password_hash !== '',
    anonymizedAt: row.anonymized_at
      ? typeof row.anonymized_at === 'string'
        ? row.anonymized_at
        : row.anonymized_at.toISOString()
      : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const authService = {
  async authenticate(username: string, password: string): Promise<User | null> {
    const row = await db<UserRow>('users').where({ username, is_active: true }).first();
    if (!row || !row.password_hash) return null; // SSO-only users can't password-login
    const valid = await comparePassword(password, row.password_hash);
    if (!valid) return null;
    return rowToUser(row);
  },

  async getUserById(id: number): Promise<User | null> {
    const row = await db<UserRow>('users').where({ id }).first();
    return row ? rowToUser(row) : null;
  },

  async createUser(data: {
    tenantId: number;
    username: string;
    password?: string | null;
    role?: string;
    displayName?: string | null;
    email?: string | null;
    contratId?: number | null;
    managerId?: number | null;
  }): Promise<User> {
    const passwordHash = data.password ? await hashPassword(data.password) : null;
    const [row] = await db<UserRow>('users')
      .insert({
        tenant_id: data.tenantId,
        username: data.username,
        password_hash: passwordHash,
        display_name: data.displayName ?? null,
        email: data.email ?? null,
        role: data.role ?? 'employe',
        contrat_id: data.contratId ?? null,
        manager_id: data.managerId ?? null,
        preferred_language: 'fr',
      })
      .returning('*');
    return rowToUser(row);
  },

  /** Bootstrap the local-auth admin (only if no admin exists yet). */
  async ensureDefaultAdmin(username: string, password: string): Promise<void> {
    const existing = await db('users').where({ role: 'admin' }).first();
    if (existing) return;

    const isWeak = password === 'admin123' || password.length < 12;
    if (isWeak) {
      logger.warn(
        'Default admin created with a weak/default password. Set DEFAULT_ADMIN_PASSWORD and change it after first login.',
      );
    }

    const admin = await this.createUser({
      tenantId: MASTER_TENANT_ID,
      username,
      password,
      role: 'admin',
      displayName: 'Administrator',
    });
    await db('user_tenants')
      .insert({ user_id: admin.id, tenant_id: MASTER_TENANT_ID, role: 'admin' })
      .onConflict(['user_id', 'tenant_id'])
      .ignore();
    logger.info(`Default admin "${username}" created`);
  },
};
