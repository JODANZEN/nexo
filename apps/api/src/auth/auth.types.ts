/**
 * The authenticated user context attached to every request by ClerkAuthGuard.
 * conjuntoId is the tenant boundary — see CLAUDE.md "Multi-Tenancy & Security".
 */
export interface AuthUser {
  userId: string;
  conjuntoId: string | null;
  unitId: string | null;
  role: string | null;
  // 'OWNER' | 'TENANT' | ... — needed for UNIT_OWNER document visibility (blueprint 2.2).
  occupancyType: string | null;
}
