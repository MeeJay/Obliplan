// ============================================================================
// HR-defined custom hour / activity types per tenant (Front, Back, Pause…).
// ============================================================================

/** A configurable hour/activity type per tenant. */
export interface HourType {
  id: number;
  tenantId: number;
  libelle: string;
  /** Short code, e.g. 'FRONT', 'BACK', 'PAUSE'. */
  code: string | null;
  color: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
