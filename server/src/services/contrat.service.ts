import { db } from '../db';
import type { Contrat } from '@obliplan/shared';

interface ContratRow {
  id: number;
  tenant_id: number;
  libelle: string;
  heures_hebdo_base_min: number;
  heures_sup_autorisees: boolean;
  seuil_heures_sup_min: number | null;
  alternance: boolean;
  pays: string | null;
  ferie_worked_coeff: number | string | null;
  color: string | null;
  work_pattern: number[] | string | null;
  fte_percent: number | null;
  created_at: Date;
  updated_at: Date;
}

/** pg jsonb comes back as an array (or a string on some setups), or null. Guard non-array → null. */
function parseWorkPattern(v: number[] | string | null): number[] | null {
  if (v == null) return null;
  const arr = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return Array.isArray(arr) ? (arr as number[]) : null;
}

export function rowToContrat(r: ContratRow): Contrat {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    libelle: r.libelle,
    heuresHebdoBaseMin: r.heures_hebdo_base_min,
    heuresSupAutorisees: r.heures_sup_autorisees,
    seuilHeuresSupMin: r.seuil_heures_sup_min,
    alternance: r.alternance,
    pays: r.pays ?? 'FR',
    // decimal comes back as a string on some pg setups → coerce; default 1 when the column
    // is missing on a not-yet-migrated row.
    ferieWorkedCoeff: r.ferie_worked_coeff == null ? 1 : Number(r.ferie_worked_coeff),
    color: r.color ?? null,
    workPattern: parseWorkPattern(r.work_pattern),
    ftePercent: r.fte_percent ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface ContratInput {
  libelle: string;
  heuresHebdoBaseMin: number;
  heuresSupAutorisees: boolean;
  seuilHeuresSupMin?: number | null;
  alternance: boolean;
  pays?: string;
  ferieWorkedCoeff?: number;
  color?: string | null;
  workPattern?: number[] | null;
  ftePercent?: number | null;
}

export const contratService = {
  async getAll(tenantId: number | null): Promise<Contrat[]> {
    const q = db<ContratRow>('contrats').orderBy('libelle');
    if (tenantId !== null) q.where({ tenant_id: tenantId });
    return (await q).map(rowToContrat);
  },

  async getById(id: number, tenantId: number | null): Promise<Contrat | null> {
    const q = db<ContratRow>('contrats').where({ id });
    if (tenantId !== null) q.andWhere({ tenant_id: tenantId });
    const row = await q.first();
    return row ? rowToContrat(row) : null;
  },

  async create(tenantId: number, data: ContratInput): Promise<Contrat> {
    const [row] = await db<ContratRow>('contrats')
      .insert({
        tenant_id: tenantId,
        libelle: data.libelle,
        heures_hebdo_base_min: data.heuresHebdoBaseMin,
        heures_sup_autorisees: data.heuresSupAutorisees,
        seuil_heures_sup_min: data.seuilHeuresSupMin ?? null,
        alternance: data.alternance,
        pays: data.pays ?? 'FR',
        ferie_worked_coeff: data.ferieWorkedCoeff ?? 1,
        color: data.color ?? null,
        work_pattern: data.workPattern != null ? JSON.stringify(data.workPattern) : null,
        fte_percent: data.ftePercent ?? null,
      })
      .returning('*');
    return rowToContrat(row);
  },

  async update(id: number, tenantId: number, data: Partial<ContratInput>): Promise<Contrat | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.libelle !== undefined) patch.libelle = data.libelle;
    if (data.heuresHebdoBaseMin !== undefined) patch.heures_hebdo_base_min = data.heuresHebdoBaseMin;
    if (data.heuresSupAutorisees !== undefined) patch.heures_sup_autorisees = data.heuresSupAutorisees;
    if (data.seuilHeuresSupMin !== undefined) patch.seuil_heures_sup_min = data.seuilHeuresSupMin;
    if (data.alternance !== undefined) patch.alternance = data.alternance;
    if (data.pays !== undefined) patch.pays = data.pays;
    if (data.ferieWorkedCoeff !== undefined) patch.ferie_worked_coeff = data.ferieWorkedCoeff;
    if (data.color !== undefined) patch.color = data.color;
    if (data.workPattern !== undefined) {
      patch.work_pattern = data.workPattern != null ? JSON.stringify(data.workPattern) : null;
    }
    if (data.ftePercent !== undefined) patch.fte_percent = data.ftePercent;
    const [row] = await db<ContratRow>('contrats')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    return row ? rowToContrat(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    const n = await db('contrats').where({ id, tenant_id: tenantId }).del();
    return n > 0;
  },
};
