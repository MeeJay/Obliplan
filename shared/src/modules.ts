/**
 * Per-workspace MODULE catalog. Admins can disable any of these on a given
 * workspace; disabled modules are hidden in the nav and rejected by the server.
 * Keys are fixed and mirror the `module_key` column of `tenant_modules`.
 * Default: every module is enabled (a workspace with no rows has all on).
 */
export interface ModuleDef {
  key: ModuleKey;
  label: string;
}

export type ModuleKey =
  | 'conges'
  | 'heures_sup'
  | 'recup'
  | 'projets'
  | 'taches'
  | 'temps'
  | 'clients';

export const MODULES: ModuleDef[] = [
  { key: 'conges', label: 'Congés' },
  { key: 'heures_sup', label: 'Heures sup' },
  { key: 'recup', label: 'Récupération' },
  { key: 'projets', label: 'Projets' },
  { key: 'taches', label: 'Tâches' },
  { key: 'temps', label: 'Suivi du temps' },
  { key: 'clients', label: 'Clients' },
];

export const MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

/** True when `key` is a known module catalog key. */
export function isModuleKey(key: string): key is ModuleKey {
  return (MODULE_KEYS as string[]).includes(key);
}
