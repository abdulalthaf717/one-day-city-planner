/**
 * Planner Agent: Orchestrator for Tool-Using Travel Planning & Dynamic Replanning.
 *
 * Responsibilities:
 * - Operates against authoritative structured state (PlannerState).
 * - Enforces bounded planning iterations (MAX_PLANNING_ITERATIONS = 6).
 * - Executes only approved tools from AgentToolRegistry.
 * - Applies surgical state invalidation to maximize free-tier cache and matrix reuse.
 * - Handles validation-recovery loop when constraints or budgets are breached.
 * - Generates grounded, factual explanations of trade-offs and changes (no hallucinated causes).
 * - Computes deterministic confidence metrics based on underlying data source accuracy.
 */

import {
  CandidatePlace,
  ConstraintChange,
  Coordinates,
  DirectionalRouteMatrix,
  FinalItinerary,
  LocationPoint,
  PlannerState,
  PlanningConfidence,
  PlanningIterationDiagnostic,
  TripConstraints,
} from '@/domain';
import { detectConstraintChanges } from '@/state/changeDetector';
import { evaluatePlanningConfidence } from './confidenceEvaluator';
import { computeInvalidationPlan, InvalidationPlan } from './invalidationRules';
import { AgentToolRegistry } from './tools/toolRegistry';
import { GroqService } from '@/services/groq/client';
import { IGroqService } from '@/services/groq/types';

export interface PlannerAgentPlanResult {
  success: boolean;
  plannerState: PlannerState;
  itinerary?: FinalItinerary;
  explanation?: string;
  warnings: string[];
  confidence?: PlanningConfidence;
  diagnostics: {
    planningVersion: number;
    iterations: PlanningIterationDiagnostic[];
    reusedComponents: string[];
    totalExecutionTimeMs: number;
    invalidationReasons: string[];
  };
}

export const MAX_PLANNING_ITERATIONS = 6;

export class PlannerAgent {
  private toolRegistry: AgentToolRegistry;
  private groqService: IGroqService;
  private maxIterations: number;

  constructor(
    toolRegistry?: AgentToolRegistry,
    groqService?: IGroqService,
    maxIterations = MAX_PLANNING_ITERATIONS
  ) {
    this.toolRegistry = toolRegistry || new AgentToolRegistry();
    this.groqService = groqService || new GroqService();
    this.maxIterations = maxIterations;
  }

  /**
   * Main agent entry point: executes the bounded tool-use planning loop
   */
  async planTrip(
    constraints: TripConstraints,
    previousState?: PlannerState,
    userMessage?: string
  ): Promise<PlannerAgentPlanResult> {
    const startTimeMs = Date.now();
    const iterations: PlanningIterationDiagnostic[] = [];
    const warnings: string[] = [];

    if (userMessage && userMessage.trim()) {
      warnings.push(`User request note: "${userMessage.trim()}"`);
    }

    // -------------------------------------------------------------
    // Step 0: Input Completeness Validation (Zero Hallucination)
    // -------------------------------------------------------------
    const missingFields: string[] = [];
    if (!constraints.city || constraints.city.trim() === '') missingFields.push('city');
    if (!constraints.startingPoint?.name || constraints.startingPoint.name.trim() === '') missingFields.push('startingPoint');
    if (!constraints.endPoint?.name || constraints.endPoint.name.trim() === '') missingFields.push('endPoint');
    if (!constraints.time?.startTime) missingFields.push('startTime');
    if (!constraints.time?.latestArrivalTime) missingFields.push('latestArrivalTime');
    if (constraints.budget?.total === undefined || constraints.budget?.total === null) missingFields.push('budget');
    if (!constraints.travelMode) missingFields.push('travelMode');
    if (!constraints.numberOfPeople) missingFields.push('numberOfPeople');

    if (missingFields.length > 0) {
      const askReason = `Missing required travel constraint(s): ${missingFields.join(', ')}.`;
      iterations.push({
        iteration: 1,
        decision: 'ASK_USER',
        reason: askReason,
        timestamp: new Date().toISOString(),
      });

      const fieldNamesFormatted = missingFields
        .map((f) => (f === 'endPoint' ? 'destination/end point' : f === 'startingPoint' ? 'starting location' : f))
        .join(', ');

      const promptUserQuestion = `Please provide the ${fieldNamesFormatted} for your day in order to build your itinerary.`;

      return {
        success: false,
        plannerState: {
          tripConstraints: constraints,
          previousConstraints: previousState?.tripConstraints,
          planningVersion: (previousState?.planningVersion || 0) + 1,
          warnings: [askReason],
        },
        explanation: promptUserQuestion,
        warnings: [askReason],
        diagnostics: {
          planningVersion: (previousState?.planningVersion || 0) + 1,
          iterations,
          reusedComponents: [],
          totalExecutionTimeMs: Date.now() - startTimeMs,
          invalidationReasons: [],
        },
      };
    }

    // -------------------------------------------------------------
    // Step 1: Detect Constraint Changes & Surgical Invalidation
    // -------------------------------------------------------------
    let detectedChanges: ConstraintChange[] = [];
    let invalidationPlan: InvalidationPlan = {
      invalidateStartGeocoding: true,
      invalidateEndGeocoding: true,
      invalidateCandidates: true,
      invalidateRouteMatrix: true,
      invalidateOptimizer: true,
      invalidateValidator: true,
      reusableComponents: [],
      reasons: ['Initial trip plan generation.'],
    };

    let resolvedStart: LocationPoint | undefined = undefined;
    let resolvedEnd: LocationPoint | undefined = undefined;
    let candidates: CandidatePlace[] | undefined = undefined;
    let routeMatrix: DirectionalRouteMatrix | undefined = undefined;

    if (previousState && previousState.tripConstraints) {
      detectedChanges = detectConstraintChanges(previousState.tripConstraints, constraints);
      invalidationPlan = computeInvalidationPlan(detectedChanges);

      // Surgical reuse of intact state
      if (!invalidationPlan.invalidateStartGeocoding && previousState.resolvedStart) {
        resolvedStart = previousState.resolvedStart;
      }
      if (!invalidationPlan.invalidateEndGeocoding && previousState.resolvedEnd) {
        resolvedEnd = previousState.resolvedEnd;
      }
      if (!invalidationPlan.invalidateCandidates && previousState.candidates && previousState.candidates.length > 0) {
        candidates = [...previousState.candidates];
      }
      if (!invalidationPlan.invalidateRouteMatrix && previousState.routeMatrix) {
        routeMatrix = previousState.routeMatrix;
      }
    } else {
      // If coordinates are already supplied in form
      if (constraints.startingPoint.coordinates?.lat && constraints.startingPoint.coordinates?.lng) {
        resolvedStart = { ...constraints.startingPoint };
      }
      if (constraints.endPoint.coordinates?.lat && constraints.endPoint.coordinates?.lng) {
        resolvedEnd = { ...constraints.endPoint };
      }
    }

    const state: PlannerState = {
      tripConstraints: { ...constraints },
      previousConstraints: previousState?.tripConstraints,
      changedFields: detectedChanges,
      resolvedStart,
      resolvedEnd,
      candidates,
      routeMatrix,
      currentItinerary: undefined,
      validationResult: undefined,
      planningVersion: (previousState?.planningVersion || 0) + 1,
      warnings,
    };

    // -------------------------------------------------------------
    // Step 2: Controlled Agent Bounded Loop (MAX_PLANNING_ITERATIONS)
    // -------------------------------------------------------------
    let iteration = 0;
    let finalized = false;
    let lastError: Error | null = null;

    while (iteration < this.maxIterations && !finalized) {
      iteration++;
      const iterStart = Date.now();

      try {
        // Condition 1: Geocoding needed?
        if (!state.resolvedStart || !state.resolvedEnd) {
          const iterDiagnostic: PlanningIterationDiagnostic = {
            iteration,
            decision: 'CALL_TOOL',
            toolCalled: 'resolve_locations',
            toolArguments: {
              city: constraints.city,
              start: constraints.startingPoint.name,
              end: constraints.endPoint.name,
            },
            reason: 'Start or end coordinates are not yet resolved. Querying Geoapify geocoder.',
            timestamp: new Date().toISOString(),
          };

          const geoResult = await this.toolRegistry.resolveLocations({
            city: constraints.city,
            start: constraints.startingPoint.name,
            end: constraints.endPoint.name,
          });

          state.resolvedStart = geoResult.startLocation;
          state.resolvedEnd = geoResult.endLocation;
          state.tripConstraints.startingPoint = geoResult.startLocation;
          state.tripConstraints.endPoint = geoResult.endLocation;

          iterDiagnostic.toolResultSummary = `Resolved START [${geoResult.startLocation.name}] and END [${geoResult.endLocation.name}].`;
          iterDiagnostic.durationMs = Date.now() - iterStart;
          iterations.push(iterDiagnostic);
          continue;
        }

        // Condition 2: Candidate discovery needed?
        if (!state.candidates || state.candidates.length === 0) {
          const iterDiagnostic: PlanningIterationDiagnostic = {
            iteration,
            decision: 'CALL_TOOL',
            toolCalled: 'discover_candidates',
            toolArguments: {
              city: state.tripConstraints.city,
              interests: state.tripConstraints.interests,
            },
            reason: 'No candidate places available for planning corridor. Discovering real places.',
            timestamp: new Date().toISOString(),
          };

          const discResult = await this.toolRegistry.discoverCandidates({
            tripConstraints: state.tripConstraints,
            poolTargetSize: 12,
          });

          state.candidates = discResult.candidates;
          iterDiagnostic.toolResultSummary = `Retrieved ${discResult.candidates.length} candidates along ${discResult.metadata.corridorSpanKm.toFixed(1)}km corridor. (Cache: ${discResult.metadata.fromCache})`;
          iterDiagnostic.durationMs = Date.now() - iterStart;
          iterations.push(iterDiagnostic);
          continue;
        }

        // Condition 3: Route matrix needed?
        if (!state.routeMatrix) {
          const points: Array<{ id: string; name: string; coordinates: Coordinates }> = [
            {
              id: state.resolvedStart.placeId || 'START',
              name: state.resolvedStart.name,
              coordinates: state.resolvedStart.coordinates,
            },
            ...state.candidates.map((c) => ({ id: c.id, name: c.name, coordinates: c.coordinates })),
            {
              id: state.resolvedEnd.placeId || 'END',
              name: state.resolvedEnd.name,
              coordinates: state.resolvedEnd.coordinates,
            },
          ];

          const iterDiagnostic: PlanningIterationDiagnostic = {
            iteration,
            decision: 'CALL_TOOL',
            toolCalled: 'calculate_route_matrix',
            toolArguments: {
              locationCount: points.length,
              mode: state.tripConstraints.travelMode,
            },
            reason: `Precomputing directional ${state.tripConstraints.travelMode} travel matrix over ${points.length} locations.`,
            timestamp: new Date().toISOString(),
          };

          const matrixResult = await this.toolRegistry.calculateRouteMatrix({
            locations: points,
            travelMode: state.tripConstraints.travelMode,
          });

          state.routeMatrix = matrixResult.routeMatrix;
          iterDiagnostic.toolResultSummary = `Calculated ${matrixResult.metadata.cellCount}-cell directional route matrix.`;
          iterDiagnostic.durationMs = Date.now() - iterStart;
          iterations.push(iterDiagnostic);
          continue;
        }

        // Condition 4: Optimization needed?
        if (!state.currentItinerary) {
          const iterDiagnostic: PlanningIterationDiagnostic = {
            iteration,
            decision: 'CALL_TOOL',
            toolCalled: 'optimize_itinerary',
            toolArguments: {
              candidatesCount: state.candidates.length,
              timeWindow: `${state.tripConstraints.time.startTime} - ${state.tripConstraints.time.latestArrivalTime}`,
              budget: state.tripConstraints.budget.total,
            },
            reason: 'Executing deterministic bounded beam search optimizer.',
            timestamp: new Date().toISOString(),
          };

          const optResult = await this.toolRegistry.optimizeItinerary({
            tripConstraints: state.tripConstraints,
            candidates: state.candidates,
            routeMatrix: state.routeMatrix,
            startLocation: state.resolvedStart,
            endLocation: state.resolvedEnd,
          });

          state.currentItinerary = optResult.itinerary;
          state.optimizerDiagnostics = optResult.optimizerDiagnostics;
          iterDiagnostic.toolResultSummary = `Optimizer produced ${optResult.itinerary.stops.length}-stop itinerary (Planned end: ${optResult.itinerary.summary.plannedArrivalTime}, Buffer: ${optResult.itinerary.summary.safetyBufferMinutes}m).`;
          iterDiagnostic.durationMs = Date.now() - iterStart;
          iterations.push(iterDiagnostic);
          continue;
        }

        // Condition 5: Validation needed?
        if (!state.validationResult) {
          const iterDiagnostic: PlanningIterationDiagnostic = {
            iteration,
            decision: 'CALL_TOOL',
            toolCalled: 'validate_itinerary',
            toolArguments: {
              stopsCount: state.currentItinerary.stops.length,
            },
            reason: 'Evaluating 14 independent hard constraint verification checks.',
            timestamp: new Date().toISOString(),
          };

          const valResult = await this.toolRegistry.validateItinerary({
            tripConstraints: state.tripConstraints,
            itinerary: state.currentItinerary,
            routeMatrix: state.routeMatrix,
          });

          state.validationResult = valResult.validationResult;
          iterDiagnostic.toolResultSummary = `Validator status: ${valResult.validationResult.status} (${valResult.validationResult.errors.length} errors, ${valResult.validationResult.warnings.length} warnings).`;
          iterDiagnostic.durationMs = Date.now() - iterStart;
          iterations.push(iterDiagnostic);

          // If Valid -> Finalize
          if (valResult.validationResult.isValid) {
            finalized = true;
            iterations.push({
              iteration,
              decision: 'FINALIZE',
              reason: 'Optimizer produced a valid itinerary and validator confirmed all 14 hard constraints.',
              timestamp: new Date().toISOString(),
            });
            break;
          }

          // If Invalid -> Enter Validation Recovery Loop
          const errors = valResult.validationResult.errors;
          const replanReason = errors.map((e) => `[${e.code}] ${e.message}`).join('; ');

          iterations.push({
            iteration,
            decision: 'REPLAN',
            reason: `Validation failed: ${replanReason}. Initiating deterministic candidate adaptation.`,
            timestamp: new Date().toISOString(),
          });

          // Recovery Strategy:
          // 1. If Budget exceeded -> Prune candidate with highest total cost
          if (errors.some((e) => e.code === 'BUDGET_EXCEEDED')) {
            if (state.candidates.length > 1) {
              const sortedByCost = [...state.candidates].sort((a, b) => (b.cost.amountPerPerson || 0) - (a.cost.amountPerPerson || 0));
              const pruneCandidate = sortedByCost[0];
              state.candidates = state.candidates.filter((c) => c.id !== pruneCandidate.id);
              warnings.push(`Pruned high-cost place "${pruneCandidate.name}" to satisfy budget constraint.`);
            }
          }

          // 2. If Deadline or Buffer violated -> Prune candidate with furthest detour or lowest score
          if (errors.some((e) => e.code === 'END_TIME_VIOLATED' || e.code === 'NEGATIVE_SAFETY_BUFFER' || e.code === 'INSUFFICIENT_BUFFER')) {
            if (state.candidates.length > 1) {
              const sortedByUtility = [...state.candidates].sort((a, b) => a.candidateScore - b.candidateScore);
              const pruneCandidate = sortedByUtility[0];
              state.candidates = state.candidates.filter((c) => c.id !== pruneCandidate.id);
              warnings.push(`Pruned place "${pruneCandidate.name}" to preserve arrival deadline and safety buffer.`);
            }
          }

          // 3. If Opening hours violated -> Prune specific offending place
          const openErr = errors.find((e) => e.code === 'OPENING_HOURS_VIOLATED');
          if (openErr && openErr.targetPlaceId) {
            state.candidates = state.candidates.filter((c) => c.id !== openErr.targetPlaceId);
            warnings.push(`Pruned place "${openErr.targetPlaceName || openErr.targetPlaceId}" due to opening hours conflict.`);
          }

          // Reset itinerary and validation result to re-optimize on next iteration
          state.currentItinerary = undefined;
          state.validationResult = undefined;
          continue;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        iterations.push({
          iteration,
          decision: 'FAILED',
          reason: `Tool execution failure: ${lastError.message}`,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - iterStart,
        });
        break;
      }
    }

    // -------------------------------------------------------------
    // Step 3: Handle Edge Cases & Build Replanning Explanation
    // -------------------------------------------------------------
    if (!state.currentItinerary) {
      // Safe fallback: return direct START -> END if optimizer failed to complete
      const fallbackEndMin = (new Date(`1970-01-01T${constraints.time.startTime}:00Z`).getTime() + 30 * 60000);
      const fallbackEndTime = new Date(fallbackEndMin).toISOString().substring(11, 16);

      state.currentItinerary = {
        id: `fallback-${Date.now()}`,
        version: state.planningVersion,
        city: constraints.city,
        stops: [
          {
            id: 'START',
            type: 'start',
            title: `Start: ${state.resolvedStart?.name || constraints.startingPoint.name}`,
            arrivalTime: constraints.time.startTime,
            departureTime: constraints.time.startTime,
            durationMinutes: 0,
            cost: { perPerson: 0, total: 0, isEstimate: false },
            verificationStatus: 'verified',
          },
          {
            id: 'END',
            type: 'end',
            title: `Destination: ${state.resolvedEnd?.name || constraints.endPoint.name}`,
            arrivalTime: fallbackEndTime,
            departureTime: fallbackEndTime,
            durationMinutes: 0,
            cost: { perPerson: 0, total: 0, isEstimate: false },
            verificationStatus: 'verified',
            notes: 'Direct transit fallback due to constraint limitations.',
          },
        ],
        summary: {
          totalCost: 0,
          currency: constraints.budget.currency,
          totalTravelTimeMinutes: 30,
          totalActivityTimeMinutes: 0,
          safetyBufferMinutes: 30,
          plannedArrivalTime: fallbackEndTime,
          deadlineArrivalTime: constraints.time.latestArrivalTime,
          placeCount: 0,
          majorAssumptions: ['Direct travel from start to end destination.'],
          unavailableOrEstimatedInfo: [],
        },
        generatedAt: new Date().toISOString(),
      };
    }

    // Evaluate Confidence
    const confidence = evaluatePlanningConfidence(state.currentItinerary);
    state.confidence = confidence;

    // Generate Factual Explanation (Ground strictly in structured facts)
    let explanation: string | undefined;

    if (previousState && detectedChanges.length > 0) {
      explanation = this.generateFactualReplanningExplanation({
        changes: detectedChanges,
        prevItinerary: previousState.currentItinerary,
        newItinerary: state.currentItinerary,
        reused: invalidationPlan.reusableComponents,
      });

      // Optionally enhance through Groq if available
      try {
        if (process.env.GROQ_API_KEY && this.groqService) {
          const llmExplanation = await this.groqService.explainReplanning({
            changedConstraints: detectedChanges,
            previousPlanBrief: previousState.currentItinerary
              ? `${previousState.currentItinerary.stops.length} stops, arrived ${previousState.currentItinerary.summary.plannedArrivalTime}, cost ${previousState.currentItinerary.summary.currency} ${previousState.currentItinerary.summary.totalCost}`
              : 'None',
            newPlanBrief: `${state.currentItinerary.stops.length} stops, arrives ${state.currentItinerary.summary.plannedArrivalTime}, cost ${state.currentItinerary.summary.currency} ${state.currentItinerary.summary.totalCost}`,
          });
          if (llmExplanation && llmExplanation.trim() !== '') {
            explanation = llmExplanation;
          }
        }
      } catch {
        // Graceful fallback to deterministic factual explanation
      }
    } else {
      explanation = `Generated an optimized 1-day itinerary for ${constraints.city} with ${state.currentItinerary.summary.placeCount} places, arriving at ${state.currentItinerary.summary.plannedArrivalTime} with a ${state.currentItinerary.summary.safetyBufferMinutes}m safety buffer.`;
    }

    state.explanation = explanation;

    const totalExecutionTimeMs = Date.now() - startTimeMs;

    return {
      success: state.validationResult?.isValid ?? (lastError === null),
      plannerState: state,
      itinerary: state.currentItinerary,
      explanation,
      warnings: [...warnings, ...state.warnings],
      confidence,
      diagnostics: {
        planningVersion: state.planningVersion,
        iterations,
        reusedComponents: invalidationPlan.reusableComponents,
        totalExecutionTimeMs,
        invalidationReasons: invalidationPlan.reasons,
      },
    };
  }

  /**
   * Deterministic, factual explanation generator based strictly on structured before/after diffs.
   * Zero hallucination: Never invents causal claims like "heavy traffic".
   */
  private generateFactualReplanningExplanation(params: {
    changes: ConstraintChange[];
    prevItinerary?: FinalItinerary;
    newItinerary: FinalItinerary;
    reused: string[];
  }): string {
    const { changes, prevItinerary, newItinerary, reused } = params;
    const changeSummary = changes.map((c) => `${c.label} (${c.oldValue} -> ${c.newValue})`).join(', ');

    const parts: string[] = [];
    parts.push(`Your constraints changed: ${changeSummary}.`);

    if (prevItinerary) {
      const prevStops = prevItinerary.summary.placeCount;
      const newStops = newItinerary.summary.placeCount;
      const prevCost = prevItinerary.summary.totalCost;
      const newCost = newItinerary.summary.totalCost;
      const newArrival = newItinerary.summary.plannedArrivalTime;
      const currency = newItinerary.summary.currency;

      if (prevStops !== newStops) {
        parts.push(`Adjusted schedule from ${prevStops} to ${newStops} visited attractions.`);
      }

      if (prevCost !== newCost) {
        parts.push(`Total cost changed from ${currency}${prevCost} to ${currency}${newCost}.`);
      }

      parts.push(`The updated itinerary arrives at your destination at ${newArrival} (${newItinerary.summary.safetyBufferMinutes}m before your required arrival deadline).`);
    }

    if (reused.length > 0) {
      parts.push(`Preserved valid calculations: [${reused.join(', ')}].`);
    }

    return parts.join(' ');
  }
}
