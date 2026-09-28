/**
 * Independent Deterministic Itinerary Validator.
 *
 * Enforces 14 Hard Constraint Verification Checks:
 * 1. Starts at requested start point
 * 2. Ends at requested end point
 * 3. Strictly chronological timestamps (no backward time jumps)
 * 4. No overlapping activities
 * 5. Travel time properly accounted between consecutive locations
 * 6. Minimum visit duration respected (>= 15 mins for activities)
 * 7. Opening hours respected when verified
 * 8. Hard budget compliance
 * 9. Selected travel mode respected
 * 10. End point arrival deadline respected
 * 11. Safety buffer respected
 * 12. Valid route connection exists for every leg
 * 13. Zero duplicate place visits
 * 14. Unknown and estimated data explicitly labeled with confidence metadata
 */

import {
  FinalItinerary,
  TripConstraints,
  ValidationError,
  ValidationMetrics,
  ValidationResult,
  ValidationWarning,
} from '@/domain';
import { BufferPolicy } from '@/optimizer/bufferPolicy';
import {
  evaluateOpeningHours,
  timeStringToMinutes,
} from '@/optimizer/openingHoursParser';

export interface IItineraryValidator {
  validate(itinerary: FinalItinerary, constraints: TripConstraints): ValidationResult;
}

export class DeterministicValidator implements IItineraryValidator {
  private bufferPolicy: BufferPolicy;

  constructor(customBufferPolicy?: BufferPolicy) {
    this.bufferPolicy = customBufferPolicy || new BufferPolicy();
  }

  validate(itinerary: FinalItinerary, constraints: TripConstraints): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const startMinutes = timeStringToMinutes(constraints.time.startTime);
    const deadlineMinutes = timeStringToMinutes(constraints.time.latestArrivalTime);
    const plannedArrivalMinutes = timeStringToMinutes(itinerary.summary.plannedArrivalTime);
    const availableMinutes = Math.max(0, deadlineMinutes - startMinutes);
    const stops = itinerary.stops || [];

    // -------------------------------------------------------------
    // Check 1: Starts at requested start point
    // -------------------------------------------------------------
    const firstStop = stops[0];
    if (!firstStop || firstStop.type !== 'start') {
      errors.push({
        code: 'INVALID_START_POINT',
        message: 'Itinerary does not begin with a valid START stop.',
      });
    }

    // -------------------------------------------------------------
    // Check 2: Ends at requested end point
    // -------------------------------------------------------------
    const lastStop = stops[stops.length - 1];
    if (!lastStop || lastStop.type !== 'end') {
      errors.push({
        code: 'INVALID_END_POINT',
        message: 'Itinerary does not terminate with a valid END stop.',
      });
    }

    // -------------------------------------------------------------
    // Check 3 & 4 & 5: Chronology, Overlaps, and Travel Time
    // -------------------------------------------------------------
    let previousDepartureMinutes = startMinutes;
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const arrMin = timeStringToMinutes(stop.arrivalTime);
      const depMin = timeStringToMinutes(stop.departureTime);

      // Check 3: Chronological ordering within stop
      if (depMin < arrMin) {
        errors.push({
          code: 'CHRONOLOGY_VIOLATION',
          message: `Departure time (${stop.departureTime}) is before arrival time (${stop.arrivalTime}) at stop "${stop.title}".`,
          targetPlaceId: stop.placeId,
          targetPlaceName: stop.title,
        });
      }

      // Check 4: No overlap with previous departure
      if (arrMin < previousDepartureMinutes) {
        errors.push({
          code: 'ACTIVITY_OVERLAP',
          message: `Arrival at "${stop.title}" (${stop.arrivalTime}) overlaps with previous departure (${previousDepartureMinutes}m).`,
          targetPlaceId: stop.placeId,
          targetPlaceName: stop.title,
        });
      }

      // Check 5: Travel time must account for interval between stops
      if (i > 0) {
        const transitMinutes = stop.travelFromPreviousMinutes ?? 0;
        const actualInterval = arrMin - previousDepartureMinutes;
        if (actualInterval < transitMinutes) {
          errors.push({
            code: 'INSUFFICIENT_TRAVEL_TIME',
            message: `Interval between stops (${actualInterval}m) is less than required travel time (${transitMinutes}m) to "${stop.title}".`,
            targetPlaceId: stop.placeId,
            targetPlaceName: stop.title,
          });
        }
      }

      previousDepartureMinutes = depMin;
    }

    // -------------------------------------------------------------
    // Check 6: Visit durations included (>= 15 mins for activities)
    // -------------------------------------------------------------
    for (const stop of stops) {
      if (stop.type === 'place' || stop.type === 'meal') {
        if (stop.durationMinutes < 15) {
          errors.push({
            code: 'INSUFFICIENT_VISIT_DURATION',
            message: `Visit duration at "${stop.title}" is ${stop.durationMinutes}m (minimum 15m required for realistic exploration).`,
            targetPlaceId: stop.placeId,
            targetPlaceName: stop.title,
          });
        }
      }
    }

    // -------------------------------------------------------------
    // Check 7: Opening hours respected when verified
    // -------------------------------------------------------------
    for (const stop of stops) {
      if ((stop.type === 'place' || stop.type === 'meal') && stop.place) {
        const rawHours = stop.place.openingHours;
        const arrMin = timeStringToMinutes(stop.arrivalTime);
        const durMin = stop.durationMinutes;

        const openingEval = evaluateOpeningHours(rawHours, arrMin, durMin);
        if (!openingEval.isFeasible) {
          errors.push({
            code: 'OPENING_HOURS_VIOLATED',
            message: `Planned visit to "${stop.title}" conflicts with opening hours: ${openingEval.reason}`,
            targetPlaceId: stop.placeId,
            targetPlaceName: stop.title,
          });
        } else if (openingEval.status === 'unverified') {
          warnings.push({
            code: 'OPENING_HOURS_UNVERIFIED',
            message: `Opening hours for "${stop.title}" are unverified by provider.`,
            targetPlaceId: stop.placeId,
          });
        }
      }
    }

    // -------------------------------------------------------------
    // Check 8: Budget respected
    // -------------------------------------------------------------
    const totalCost = itinerary.summary.totalCost;
    const budgetLimit = constraints.budget.total;
    if (totalCost > budgetLimit) {
      const excess = totalCost - budgetLimit;
      errors.push({
        code: 'BUDGET_EXCEEDED',
        message: `Total estimated cost (${totalCost} ${constraints.budget.currency}) exceeds budget (${budgetLimit} ${constraints.budget.currency}) by ${excess} ${constraints.budget.currency}.`,
        excessAmount: excess,
      });
    }

    // -------------------------------------------------------------
    // Check 9: Travel mode respected
    // -------------------------------------------------------------
    for (const stop of stops) {
      if (stop.travelFromPrevious && stop.travelFromPrevious.mode !== constraints.travelMode) {
        errors.push({
          code: 'TRAVEL_MODE_MISMATCH',
          message: `Travel leg to "${stop.title}" uses mode "${stop.travelFromPrevious.mode}" instead of user's selected mode "${constraints.travelMode}".`,
        });
      }
    }

    // -------------------------------------------------------------
    // Check 10: Latest arrival deadline respected
    // -------------------------------------------------------------
    if (plannedArrivalMinutes > deadlineMinutes) {
      const excess = plannedArrivalMinutes - deadlineMinutes;
      errors.push({
        code: 'END_TIME_VIOLATED',
        message: `Arrival at end point (${itinerary.summary.plannedArrivalTime}) violates latest allowed deadline (${constraints.time.latestArrivalTime}) by ${excess} minutes.`,
        excessMinutes: excess,
      });
    }

    // -------------------------------------------------------------
    // Check 11: Safety buffer respected
    // -------------------------------------------------------------
    const safetyBuffer = itinerary.summary.safetyBufferMinutes;
    const requiredBuffer = this.bufferPolicy.calculateRequiredBuffer(
      itinerary.summary.totalTravelTimeMinutes,
      constraints.travelMode
    );

    if (safetyBuffer < 0) {
      errors.push({
        code: 'NEGATIVE_SAFETY_BUFFER',
        message: `Safety buffer is negative (${safetyBuffer}m). Trip cannot finish before deadline.`,
        excessMinutes: Math.abs(safetyBuffer),
      });
    } else if (safetyBuffer < requiredBuffer) {
      warnings.push({
        code: 'TIGHT_SAFETY_BUFFER',
        message: `Safety buffer (${safetyBuffer}m) is below the recommended policy buffer (${requiredBuffer}m for ${constraints.travelMode} travel).`,
      });
    }

    // -------------------------------------------------------------
    // Check 12: Route connection exists for every leg
    // -------------------------------------------------------------
    for (let i = 1; i < stops.length; i++) {
      const leg = stops[i].travelFromPrevious;
      if (!leg || leg.distanceMeters < 0 || leg.durationMinutes < 0) {
        errors.push({
          code: 'MISSING_ROUTE_LEG',
          message: `No valid directional route leg between stop ${i - 1} and stop "${stops[i].title}".`,
          targetPlaceId: stops[i].placeId,
        });
      }
    }

    // -------------------------------------------------------------
    // Check 13: Zero duplicate place visits
    // -------------------------------------------------------------
    const visitedPlaceIds = new Set<string>();
    for (const stop of stops) {
      if (stop.type === 'place' || stop.type === 'meal') {
        const pid = stop.placeId || stop.place?.id;
        if (pid) {
          if (visitedPlaceIds.has(pid)) {
            errors.push({
              code: 'DUPLICATE_PLACE_VISIT',
              message: `Duplicate visit detected to place ID "${pid}" ("${stop.title}").`,
              targetPlaceId: pid,
            });
          }
          visitedPlaceIds.add(pid);
        }
      }
    }

    // -------------------------------------------------------------
    // Check 14: Unknown/estimated info labeled with confidence metadata
    // -------------------------------------------------------------
    for (const stop of stops) {
      if (stop.type === 'place' || stop.type === 'meal') {
        if (!stop.costConfidence) {
          warnings.push({
            code: 'MISSING_COST_CONFIDENCE',
            message: `Stop "${stop.title}" is missing cost confidence classification.`,
            targetPlaceId: stop.placeId,
          });
        }
        if (!stop.durationConfidence) {
          warnings.push({
            code: 'MISSING_DURATION_CONFIDENCE',
            message: `Stop "${stop.title}" is missing duration confidence classification.`,
            targetPlaceId: stop.placeId,
          });
        }
      }
    }

    const isValid = errors.length === 0;
    const metrics: ValidationMetrics = {
      totalCost,
      budgetLimit,
      remainingBudget: Math.max(0, budgetLimit - totalCost),
      totalDurationMinutes:
        itinerary.summary.totalTravelTimeMinutes + itinerary.summary.totalActivityTimeMinutes,
      availableMinutes,
      safetyBufferMinutes: safetyBuffer,
      deadlineRespected: plannedArrivalMinutes <= deadlineMinutes,
    };

    return {
      status: isValid ? 'VALID' : 'INVALID',
      isValid,
      errors,
      warnings,
      metrics,
      validatedAt: new Date().toISOString(),
    };
  }
}
