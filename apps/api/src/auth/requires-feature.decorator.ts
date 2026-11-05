import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '@nexo/types';

export const FEATURE_KEY = 'requiredFeature';

/**
 * Gate a controller/route behind a plan feature (Phase 14). Must be paired with
 * FeatureGuard (which runs after ClerkAuthGuard). Example:
 *   @UseGuards(ClerkAuthGuard, FeatureGuard)
 *   @RequiresFeature('asambleas')
 */
export const RequiresFeature = (feature: FeatureKey) => SetMetadata(FEATURE_KEY, feature);
