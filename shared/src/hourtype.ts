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
  /** When true, time worked under this hour-type is offered as free slots on the public
   *  meeting-booking page (e.g. "Back" bookable, "Front"/"Projet X" not). */
  bookable: boolean;
  /** When true (and bookable), a shift of this type that has a PROJECT attached is
   *  excluded from bookable slots (a project block = busy, not "libre RDV"). */
  bookingExcludeProjects: boolean;
  createdAt: string;
  updatedAt: string;
}
