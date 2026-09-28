/**
 * Configurable Safety Buffer Policy.
 *
 * Prevents scheduling arrivals right at the user's deadline.
 * Adapts dynamically based on:
 * - Selected travel mode (driving has traffic volatility; walking is predictable)
 * - Total accumulated travel time across all itinerary legs
 * - Configurable bounds (min buffer, percentage factor, max buffer)
 */

import { TravelMode } from '@/domain';
import { BufferPolicyConfig } from '@/domain/optimizer';

export const DEFAULT_BUFFER_POLICY_CONFIG: BufferPolicyConfig = {
  minBufferMinutes: 15,
  travelPercentBuffer: 0.15, // 15% of total travel time
  maxBufferMinutes: 60,
  modeMultipliers: {
    drive: 1.25, // Motorized city traffic variance
    transit: 1.30, // Bus/metro connection delays
    walk: 1.0, // Stable pedestrian velocity
    bicycle: 1.05, // Slight cyclist variance
  },
};

export class BufferPolicy {
  private config: BufferPolicyConfig;

  constructor(customConfig?: Partial<BufferPolicyConfig>) {
    this.config = {
      ...DEFAULT_BUFFER_POLICY_CONFIG,
      ...customConfig,
      modeMultipliers: {
        ...DEFAULT_BUFFER_POLICY_CONFIG.modeMultipliers,
        ...customConfig?.modeMultipliers,
      },
    };
  }

  /**
   * Calculates the required safety buffer in minutes for a given accumulated transit time.
   *
   * Formula:
   * buffer = clamp(minBuffer, round(travelMinutes * travelPercent * modeMultiplier), maxBuffer)
   */
  public calculateRequiredBuffer(
    accumulatedTravelMinutes: number,
    mode: TravelMode = 'drive'
  ): number {
    const multiplier = this.config.modeMultipliers?.[mode] ?? 1.2;
    const dynamicMinutes = Math.round(
      accumulatedTravelMinutes * this.config.travelPercentBuffer * multiplier
    );

    return Math.min(
      this.config.maxBufferMinutes,
      Math.max(this.config.minBufferMinutes, dynamicMinutes)
    );
  }

  public getConfig(): BufferPolicyConfig {
    return { ...this.config };
  }
}
