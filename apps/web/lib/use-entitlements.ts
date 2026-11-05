'use client';

import { useQuery } from '@tanstack/react-query';
import type { FeatureKey, Tier } from '@nexo/types';
import { useApi } from '@/lib/api';

interface Entitlements {
  plan: Tier;
  planStatus: string;
  features: FeatureKey[];
}

/**
 * Plan entitlements for the current conjunto. Backend (`/me/entitlements`) is the
 * source of truth; this only drives UI hide/lock. While loading we optimistically
 * treat everything as enabled so gated nav items don't flash locked on each load.
 */
export function useEntitlements() {
  const api = useApi();
  const q = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.get<Entitlements>('/me/entitlements'),
    staleTime: 5 * 60 * 1000,
  });
  const features = q.data?.features;
  return {
    plan: q.data?.plan,
    planStatus: q.data?.planStatus,
    isLoading: q.isLoading,
    has: (key: FeatureKey): boolean => !features || features.includes(key),
  };
}
