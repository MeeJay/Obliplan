// ============================================================================
// Clients (customers) of a tenant. Kanban boards (projects) belong to a client.
// ============================================================================

export interface Client {
  id: number;
  tenantId: number;
  name: string;
  color: string | null;
  contact: string | null;
  notes: string | null;
  /** Optional logo: a small base64 data-URI (client-side resized) or an external URL. null = none. */
  logo: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
