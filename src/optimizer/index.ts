/**
 * Deterministic Itinerary Optimizer & Assembler.
 *
 * Implements:
 * - Mathematical ordering & candidate selection via Bounded Beam Search
 * - Directional road transitions using precomputed matrix (never per-transition API queries)
 * - Dynamic safety buffer reservation
 * - Independent validation integration with DeterministicValidator
 * - Safe fallbacks (shorter plan or safe minimal START -> END)
 */

import {
  ActivityType,
  CandidatePlace,
  FinalItinerary,
  ItineraryStop,
  ItinerarySummary,
  LocationPoint,
  ValidationResult,
} from '@/domain';
import {
  OptimizerInput,
  OptimizerOutput,
} from '@/domain/optimizer';
import { DeterministicValidator } from '@/validator';
import { BeamSearchOptimizer } from './beamSearch';
import { BufferPolicy } from './bufferPolicy';
import { timeStringToMinutes } from './openingHoursParser';

export * from './bufferPolicy';
export * from './openingHoursParser';
export * from './objectiveFunction';
export * from './beamSearch';

export interface IItineraryOptimizer {
  optimize(input: OptimizerInput): OptimizerOutput;
  buildFinalItinerary(input: OptimizerInput, output: OptimizerOutput): FinalItinerary;
  optimizeAndValidate(input: OptimizerInput): {
    itinerary: FinalItinerary;
    validation: ValidationResult;
    output: OptimizerOutput;
  };
}

export class DeterministicOptimizer implements IItineraryOptimizer {
  private beamSearch: BeamSearchOptimizer;
  private bufferPolicy: BufferPolicy;
  private validator: DeterministicValidator;

  constructor(customBufferPolicy?: BufferPolicy) {
    this.bufferPolicy = customBufferPolicy || new BufferPolicy();
    this.beamSearch = new BeamSearchOptimizer(this.bufferPolicy);
    this.validator = new DeterministicValidator(this.bufferPolicy);
  }

  /**
   * Optimizes the sequence and selection of candidate stops.
   */
  public optimize(input: OptimizerInput): OptimizerOutput {
    return this.beamSearch.runBeamSearch(input);
  }

  /**
   * Assembles a complete, structured FinalItinerary object from optimizer output.
   */
  public buildFinalItinerary(
    input: OptimizerInput,
    output: OptimizerOutput
  ): FinalItinerary {
    const { constraints, candidates, routeMatrix, startLocation, endLocation } = input;

    const startLoc: LocationPoint = startLocation || {
      name: constraints.startingPoint.name,
      address: constraints.startingPoint.address,
      coordinates: constraints.startingPoint.coordinates,
      placeId: constraints.startingPoint.placeId || 'START',
      type: constraints.startingPoint.type,
    };

    const endLoc: LocationPoint = endLocation || {
      name: constraints.endPoint.name,
      address: constraints.endPoint.address,
      coordinates: constraints.endPoint.coordinates,
      placeId: constraints.endPoint.placeId || 'END',
      type: constraints.endPoint.type,
    };

    const candidateMap = new Map<string, CandidatePlace>(
      candidates.map((c) => [c.id, c])
    );

    const stops: ItineraryStop[] = [];
    const pax = constraints.numberOfPeople || 1;
    const currency = constraints.budget.currency || '₹';

    // 1. START STOP
    stops.push({
      id: startLoc.placeId || 'START',
      type: 'start' as ActivityType,
      title: startLoc.name,
      name: startLoc.name,
      placeId: startLoc.placeId || 'START',
      arrivalTime: constraints.time.startTime,
      departureTime: constraints.time.startTime,
      durationMinutes: 0,
      visitDurationMinutes: 0,
      travelFromPreviousMinutes: 0,
      travelFromPreviousMeters: 0,
      cost: { perPerson: 0, total: 0, isEstimate: false },
      estimatedCost: 0,
      verificationStatus: 'verified',
      notes: `Trip begins at starting point. Selected travel mode: ${constraints.travelMode}.`,
    });

    let previousLocationId = startLoc.placeId || 'START';

    // 2. INTERMEDIATE CANDIDATE STOPS
    for (const assignment of output.schedule) {
      const place = candidateMap.get(assignment.placeId);
      const isMeal = place?.category === 'restaurant' || place?.category === 'cafe';

      const perPersonCost = place?.cost.amountPerPerson || 0;
      const totalCost = assignment.estimatedCost ?? perPersonCost * pax;

      stops.push({
        id: assignment.placeId,
        type: isMeal ? ('meal' as ActivityType) : ('place' as ActivityType),
        title: place?.name || assignment.name || 'Attraction Visit',
        name: place?.name || assignment.name,
        placeId: assignment.placeId,
        place,
        arrivalTime: assignment.arrivalTime,
        departureTime: assignment.departureTime,
        durationMinutes: assignment.durationMinutes,
        visitDurationMinutes: assignment.durationMinutes,
        travelFromPreviousMinutes: assignment.travelMinutesFromPrevious,
        travelFromPreviousMeters: assignment.distanceMetersFromPrevious,
        estimatedCost: totalCost,
        openingStatus: assignment.openingStatus,
        costConfidence: assignment.costConfidence,
        durationConfidence: assignment.durationConfidence,
        cost: {
          perPerson: perPersonCost,
          total: totalCost,
          isEstimate: assignment.costConfidence === 'estimated',
        },
        travelFromPrevious: {
          distanceMeters: assignment.distanceMetersFromPrevious,
          durationMinutes: assignment.travelMinutesFromPrevious,
          mode: constraints.travelMode,
        },
        actionLinks: place?.actionLinks,
        verificationStatus: place?.verificationStatus || 'estimated',
        notes: place?.openingHours
          ? `Local hours: ${place.openingHours}`
          : 'Opening hours unverified by provider.',
      });

      previousLocationId = assignment.placeId;
    }

    // 3. FINAL LEG TO END
    const endKey = `${previousLocationId}::${endLoc.placeId || 'END'}`;
    const finalLeg = routeMatrix.matrix[endKey];
    const finalTravelMinutes = finalLeg?.durationMinutes || 0;
    const finalDistanceMeters = finalLeg?.distanceMeters || 0;

    stops.push({
      id: endLoc.placeId || 'END',
      type: 'end' as ActivityType,
      title: endLoc.name,
      name: endLoc.name,
      placeId: endLoc.placeId || 'END',
      arrivalTime: output.plannedArrivalTimeAtEnd,
      departureTime: output.plannedArrivalTimeAtEnd,
      durationMinutes: 0,
      visitDurationMinutes: 0,
      travelFromPreviousMinutes: finalTravelMinutes,
      travelFromPreviousMeters: finalDistanceMeters,
      cost: { perPerson: 0, total: 0, isEstimate: false },
      estimatedCost: 0,
      travelFromPrevious: {
        distanceMeters: finalDistanceMeters,
        durationMinutes: finalTravelMinutes,
        mode: constraints.travelMode,
      },
      verificationStatus: 'verified',
      notes: `Final destination deadline: ${constraints.time.latestArrivalTime} (Safety buffer: ${output.totalBufferMinutes}m).`,
    });

    // 4. ASSUMPTIONS & WARNINGS
    const assumptions: string[] = [
      `Travel durations are based on Geoapify road network data (${constraints.travelMode} mode with typical congestion).`,
      `Safety buffer of ${output.totalBufferMinutes} minutes reserved before arrival deadline.`,
    ];

    const warnings: string[] = [];
    let hasUncertainCost = false;

    for (const s of output.schedule) {
      if (s.costConfidence === 'uncertain' || s.costConfidence === 'unknown') {
        hasUncertainCost = true;
      }
      if (s.openingStatus === 'unverified') {
        warnings.push(`Opening hours for "${s.name || s.placeId}" are unverified.`);
      }
    }

    if (hasUncertainCost) {
      assumptions.push('Some places lack published ticket fees; costs reflect known & estimated amounts only.');
    }

    const budgetStatus =
      output.totalCost > constraints.budget.total
        ? 'exceeded'
        : hasUncertainCost
        ? 'uncertain'
        : 'within_budget';

    const summary: ItinerarySummary = {
      totalCost: output.totalCost,
      currency,
      totalTravelTimeMinutes: output.totalTravelMinutes,
      totalActivityTimeMinutes: output.totalActivityMinutes,
      safetyBufferMinutes: output.totalBufferMinutes,
      plannedArrivalTime: output.plannedArrivalTimeAtEnd,
      deadlineArrivalTime: constraints.time.latestArrivalTime,
      placeCount: output.schedule.length,
      majorAssumptions: assumptions,
      unavailableOrEstimatedInfo: warnings,
    };

    const startMin = timeStringToMinutes(constraints.time.startTime);
    const endMin = timeStringToMinutes(output.plannedArrivalTimeAtEnd);
    const totalTripMinutes = Math.max(0, endMin - startMin);

    const totalDistanceMeters =
      stops.reduce((sum, s) => sum + (s.travelFromPreviousMinutes ? (s.travelFromPrevious?.distanceMeters || 0) : 0), 0) +
      finalDistanceMeters;

    return {
      id: `itin_${Date.now()}`,
      version: 1,
      city: constraints.city,
      stops,
      summary,
      generatedAt: new Date().toISOString(),
      start: startLoc,
      end: endLoc,
      startTime: constraints.time.startTime,
      plannedEndTime: output.plannedArrivalTimeAtEnd,
      latestAllowedEndTime: constraints.time.latestArrivalTime,
      totalTravelMinutes: output.totalTravelMinutes,
      totalVisitMinutes: output.totalActivityMinutes,
      totalTripMinutes,
      totalDistanceMeters,
      estimatedTotalCost: output.totalCost,
      budget: constraints.budget.total,
      budgetStatus,
      safetyBufferMinutes: output.totalBufferMinutes,
      score: output.objectiveScore,
      scoreBreakdown: output.scoreBreakdown,
      feasibilityStatus: output.isFeasible ? 'FEASIBLE' : 'NO_FEASIBLE_ROUTE',
      warnings,
      assumptions,
    };
  }

  /**
   * Optimizes the plan, builds the final itinerary, and independently validates it.
   */
  public optimizeAndValidate(input: OptimizerInput): {
    itinerary: FinalItinerary;
    validation: ValidationResult;
    output: OptimizerOutput;
  } {
    let output = this.optimize(input);
    let itinerary = this.buildFinalItinerary(input, output);
    let validation = this.validator.validate(itinerary, input.constraints);

    // If validator found violations, attempt one revision pass by pruning the last added place
    if (!validation.isValid && output.schedule.length > 1) {
      const reducedCandidates = input.candidates.filter(
        (c) => c.id !== output.schedule[output.schedule.length - 1].placeId
      );
      output = this.optimize({ ...input, candidates: reducedCandidates });
      itinerary = this.buildFinalItinerary(input, output);
      validation = this.validator.validate(itinerary, input.constraints);
    }

    return { itinerary, validation, output };
  }
}
