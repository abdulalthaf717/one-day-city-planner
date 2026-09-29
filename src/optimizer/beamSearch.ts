/**
 * Deterministic Bounded Beam Search Optimizer.
 *
 * Implements:
 * - Directional road transitions (A -> B != B -> A, zero fallback guessing)
 * - Immediate End-Point lookahead at every expansion step
 * - Opening hours compliance (including feasible wait adjustments)
 * - Hard budget validation
 * - Dynamic safety buffer policy
 * - Dominance pruning on (visitedMask, lastLocationId)
 * - Deterministic tie-breaking (100% reproducible, zero randomness)
 */

import {
  CandidatePlace,
  OptimizerScoreBreakdown,
} from '@/domain';
import {
  OptimizerInput,
  OptimizerOutput,
  ScheduledStopAssignment,
} from '@/domain/optimizer';
import { BufferPolicy } from './bufferPolicy';
import {
  evaluateOpeningHours,
  minutesToTimeString,
  timeStringToMinutes,
} from './openingHoursParser';
import { computeObjectiveScore } from './objectiveFunction';

export interface BeamState {
  visitedMask: number;
  lastLocationId: string;
  currentTimeMinutes: number;
  accumulatedTravelMinutes: number;
  accumulatedVisitMinutes: number;
  accumulatedDistanceMeters: number;
  accumulatedCost: number;
  unknownCostCount: number;
  unverifiedHoursCount: number;
  stops: ScheduledStopAssignment[];
  visitedCandidates: CandidatePlace[];
  score: number;
  scoreBreakdown: OptimizerScoreBreakdown;
}

export class BeamSearchOptimizer {
  private bufferPolicy: BufferPolicy;
  private readonly defaultBeamWidth = 150;

  constructor(customBufferPolicy?: BufferPolicy) {
    this.bufferPolicy = customBufferPolicy || new BufferPolicy();
  }

  public runBeamSearch(input: OptimizerInput): OptimizerOutput {
    const startTimeMs = Date.now();
    const {
      constraints,
      candidates,
      routeMatrix,
      startLocation,
      endLocation,
      beamWidth = this.defaultBeamWidth,
    } = input;

    const startId = startLocation?.placeId || constraints.startingPoint.placeId || 'START';
    const endId = endLocation?.placeId || constraints.endPoint.placeId || 'END';

    const startMinutes = timeStringToMinutes(constraints.time.startTime);
    const deadlineMinutes = timeStringToMinutes(constraints.time.latestArrivalTime);
    const maxBudget = constraints.budget.total;
    const pax = constraints.numberOfPeople || 1;
    const travelMode = constraints.travelMode || 'drive';

    // Pruning and diagnostic counters
    let statesGenerated = 0;
    let statesPruned = 0;
    const pruningReasons: Record<string, number> = {
      missingMatrixRoute: 0,
      openingHoursClosed: 0,
      endDeadlineViolated: 0,
      budgetExceeded: 0,
      dominatedState: 0,
    };

    // Helper: Lookup directed matrix cell
    const getDirectedLeg = (
      fromId: string,
      toId: string
    ): { durationMinutes: number; distanceMeters: number } | null => {
      const key = `${fromId}::${toId}`;
      const cell = routeMatrix.matrix[key];
      if (cell && cell.status === 'OK' && cell.durationMinutes >= 0 && cell.distanceMeters >= 0) {
        return {
          durationMinutes: cell.durationMinutes,
          distanceMeters: cell.distanceMeters,
        };
      }
      return null;
    };

    // Check direct path from START to END
    const directLeg = getDirectedLeg(startId, endId);
    if (!directLeg) {
      return {
        isFeasible: false,
        orderedPlaceIds: [],
        schedule: [],
        plannedArrivalTimeAtEnd: minutesToTimeString(deadlineMinutes),
        totalTravelMinutes: 0,
        totalActivityMinutes: 0,
        totalBufferMinutes: 0,
        totalCost: 0,
        objectiveScore: 0,
        rejectionReasons: [
          `No feasible route found from starting point (${constraints.startingPoint.name}) to destination (${constraints.endPoint.name}) using travel mode "${travelMode}".`,
        ],
        diagnostics: {
          statesGenerated: 0,
          statesPruned: 0,
          feasiblePlansFound: 0,
          executionTimeMs: Date.now() - startTimeMs,
        },
      };
    }

    const directDistanceMeters = directLeg.distanceMeters;

    // Filter candidate pool to at most 15 items to respect computational & matrix boundaries
    const candidatePool = candidates.slice(0, 15);
    const candidateCount = candidatePool.length;

    // Initial root state at START
    const initialRequiredBuffer = this.bufferPolicy.calculateRequiredBuffer(
      directLeg.durationMinutes,
      travelMode
    );

    const initialScoreData = computeObjectiveScore({
      userInterests: constraints.interests,
      totalTravelMinutes: directLeg.durationMinutes,
      totalVisitMinutes: 0,
      totalDistanceMeters: directLeg.distanceMeters,
      directDistanceMeters,
      safetyBufferMinutes: deadlineMinutes - (startMinutes + directLeg.durationMinutes),
      requiredBufferMinutes: initialRequiredBuffer,
      deadlineMinutes,
      plannedEndMinutes: startMinutes + directLeg.durationMinutes,
      visitedPlaces: [],
      unknownCostCount: 0,
      unverifiedHoursCount: 0,
    });

    const rootState: BeamState = {
      visitedMask: 0,
      lastLocationId: startId,
      currentTimeMinutes: startMinutes,
      accumulatedTravelMinutes: 0,
      accumulatedVisitMinutes: 0,
      accumulatedDistanceMeters: 0,
      accumulatedCost: 0,
      unknownCostCount: 0,
      unverifiedHoursCount: 0,
      stops: [],
      visitedCandidates: [],
      score: initialScoreData.finalScore,
      scoreBreakdown: initialScoreData.breakdown,
    };

    let currentBeam: BeamState[] = [rootState];
    const completedFeasiblePlans: Array<{
      state: BeamState;
      finalTravelMinutes: number;
      finalDistanceMeters: number;
      finalArrivalMinutes: number;
      finalSafetyBufferMinutes: number;
      requiredBufferMinutes: number;
      finalScore: number;
      scoreBreakdown: OptimizerScoreBreakdown;
    }> = [];

    // Evaluate direct START -> END as a baseline completed plan
    const directEndArrival = startMinutes + directLeg.durationMinutes;
    const directBuffer = deadlineMinutes - directEndArrival;
    if (directEndArrival <= deadlineMinutes && directBuffer >= initialRequiredBuffer) {
      completedFeasiblePlans.push({
        state: rootState,
        finalTravelMinutes: directLeg.durationMinutes,
        finalDistanceMeters: directLeg.distanceMeters,
        finalArrivalMinutes: directEndArrival,
        finalSafetyBufferMinutes: directBuffer,
        requiredBufferMinutes: initialRequiredBuffer,
        finalScore: initialScoreData.finalScore,
        scoreBreakdown: initialScoreData.breakdown,
      });
    }

    // Maximum search depth: up to candidate count (capped at 10 stops per day)
    const maxDepth = Math.min(candidateCount, 10);

    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextStates: BeamState[] = [];

      for (const state of currentBeam) {
        for (let i = 0; i < candidateCount; i++) {
          // Check if candidate is already visited in this branch
          if ((state.visitedMask & (1 << i)) !== 0) {
            continue;
          }

          statesGenerated++;
          const cand = candidatePool[i];

          // Prevent visiting duplicate or near-identical named entities in the same itinerary
          const candNorm = cand.name.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
          const candRoot = candNorm
            .replace(/\b(phase|sector|block|gate|part|zone|ward|circle|stage)\s*\d+\b/g, '')
            .replace(/\b\d+\b/g, '')
            .trim();

          const isDuplicateVisited = state.visitedCandidates.some((v) => {
            const vNorm = v.name.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
            const vRoot = vNorm
              .replace(/\b(phase|sector|block|gate|part|zone|ward|circle|stage)\s*\d+\b/g, '')
              .replace(/\b\d+\b/g, '')
              .trim();

            if (vNorm && vNorm === candNorm) return true;
            if (candRoot && candRoot.length >= 4 && vRoot === candRoot) return true;
            if (v.category === cand.category) {
              const dLat = v.latitude - cand.latitude;
              const dLon = v.longitude - cand.longitude;
              if (Math.abs(dLat) < 0.003 && Math.abs(dLon) < 0.003) return true;
            }
            return false;
          });

          if (isDuplicateVisited) {
            statesPruned++;
            continue;
          }

          // 1. Directed travel leg from last location to candidate
          const legToCandidate = getDirectedLeg(state.lastLocationId, cand.id);
          if (!legToCandidate) {
            statesPruned++;
            pruningReasons.missingMatrixRoute++;
            continue;
          }

          // 2. Arrival time at candidate
          const arrivalAtCandidate = state.currentTimeMinutes + legToCandidate.durationMinutes;

          // 3. Opening hours check
          const openingEval = evaluateOpeningHours(
            typeof cand.openingHours === 'string' ? cand.openingHours : undefined,
            arrivalAtCandidate,
            cand.estimatedVisitDurationMinutes
          );

          if (!openingEval.isFeasible) {
            statesPruned++;
            pruningReasons.openingHoursClosed++;
            continue;
          }

          const effectiveArrival = openingEval.effectiveArrivalMinutes;
          const departureFromCandidate = openingEval.effectiveDepartureMinutes;

          // 4. End-Point Lookahead (can we reach END before deadline + buffer?)
          const legToEnd = getDirectedLeg(cand.id, endId);
          if (!legToEnd) {
            statesPruned++;
            pruningReasons.missingMatrixRoute++;
            continue;
          }

          const projectedTravelMinutes =
            state.accumulatedTravelMinutes + legToCandidate.durationMinutes + legToEnd.durationMinutes;
          const requiredBuffer = this.bufferPolicy.calculateRequiredBuffer(
            projectedTravelMinutes,
            travelMode
          );

          const plannedEndArrival = departureFromCandidate + legToEnd.durationMinutes;
          const remainingBufferAtEnd = deadlineMinutes - plannedEndArrival;

          if (plannedEndArrival > deadlineMinutes || remainingBufferAtEnd < requiredBuffer) {
            statesPruned++;
            pruningReasons.endDeadlineViolated++;
            continue;
          }

          // 5. Budget Check
          const candCost =
            (cand.cost.amountPerPerson || 0) * pax + (cand.cost.fixedEntryCost || 0);
          const nextAccumulatedCost = state.accumulatedCost + candCost;

          if (nextAccumulatedCost > maxBudget) {
            statesPruned++;
            pruningReasons.budgetExceeded++;
            continue;
          }

          // 6. Build Candidate Stop Assignment
          const stopAssignment: ScheduledStopAssignment = {
            placeId: cand.id,
            name: cand.name,
            arrivalTime: minutesToTimeString(effectiveArrival),
            departureTime: minutesToTimeString(departureFromCandidate),
            durationMinutes: cand.estimatedVisitDurationMinutes,
            travelMinutesFromPrevious: legToCandidate.durationMinutes,
            distanceMetersFromPrevious: legToCandidate.distanceMeters,
            estimatedCost: candCost,
            openingStatus: openingEval.status,
            costConfidence: cand.costSource,
            durationConfidence: cand.visitDurationSource,
          };

          const nextVisitedCandidates = [...state.visitedCandidates, cand];
          const nextStops = [...state.stops, stopAssignment];

          const isUnknownCost = cand.costSource === 'unknown';
          const isUnverifiedHours = openingEval.status === 'unverified';

          // 7. Calculate Objective Score
          const totalDistanceSoFar =
            state.accumulatedDistanceMeters + legToCandidate.distanceMeters + legToEnd.distanceMeters;
          const totalVisitSoFar =
            state.accumulatedVisitMinutes + cand.estimatedVisitDurationMinutes;

          const scoreResult = computeObjectiveScore({
            userInterests: constraints.interests,
            totalTravelMinutes: projectedTravelMinutes,
            totalVisitMinutes: totalVisitSoFar,
            totalDistanceMeters: totalDistanceSoFar,
            directDistanceMeters,
            safetyBufferMinutes: remainingBufferAtEnd,
            requiredBufferMinutes: requiredBuffer,
            deadlineMinutes,
            plannedEndMinutes: plannedEndArrival,
            visitedPlaces: nextVisitedCandidates,
            unknownCostCount: state.unknownCostCount + (isUnknownCost ? 1 : 0),
            unverifiedHoursCount: state.unverifiedHoursCount + (isUnverifiedHours ? 1 : 0),
          });

          const extendedState: BeamState = {
            visitedMask: state.visitedMask | (1 << i),
            lastLocationId: cand.id,
            currentTimeMinutes: departureFromCandidate,
            accumulatedTravelMinutes: state.accumulatedTravelMinutes + legToCandidate.durationMinutes,
            accumulatedVisitMinutes: totalVisitSoFar,
            accumulatedDistanceMeters: state.accumulatedDistanceMeters + legToCandidate.distanceMeters,
            accumulatedCost: nextAccumulatedCost,
            unknownCostCount: state.unknownCostCount + (isUnknownCost ? 1 : 0),
            unverifiedHoursCount: state.unverifiedHoursCount + (isUnverifiedHours ? 1 : 0),
            stops: nextStops,
            visitedCandidates: nextVisitedCandidates,
            score: scoreResult.finalScore,
            scoreBreakdown: scoreResult.breakdown,
          };

          nextStates.push(extendedState);

          // Record this completed plan to END
          completedFeasiblePlans.push({
            state: extendedState,
            finalTravelMinutes: projectedTravelMinutes,
            finalDistanceMeters: totalDistanceSoFar,
            finalArrivalMinutes: plannedEndArrival,
            finalSafetyBufferMinutes: remainingBufferAtEnd,
            requiredBufferMinutes: requiredBuffer,
            finalScore: scoreResult.finalScore,
            scoreBreakdown: scoreResult.breakdown,
          });
        }
      }

      if (nextStates.length === 0) {
        break; // No further states can be feasibly expanded
      }

      // 8. Dominance Pruning on (visitedMask, lastLocationId)
      // Discard states that have identical places & end with strictly worse time, cost, and score
      const stateGroups = new Map<string, BeamState[]>();
      for (const st of nextStates) {
        const groupKey = `${st.visitedMask}::${st.lastLocationId}`;
        const group = stateGroups.get(groupKey) || [];
        group.push(st);
        stateGroups.set(groupKey, group);
      }

      const nonDominatedStates: BeamState[] = [];
      for (const group of stateGroups.values()) {
        for (let a = 0; a < group.length; a++) {
          let dominated = false;
          for (let b = 0; b < group.length; b++) {
            if (a === b) continue;
            // State A is dominated by State B if B is strictly better or equal in time, cost, and score
            if (
              group[b].currentTimeMinutes <= group[a].currentTimeMinutes &&
              group[b].accumulatedCost <= group[a].accumulatedCost &&
              group[b].score >= group[a].score &&
              (group[b].currentTimeMinutes < group[a].currentTimeMinutes ||
                group[b].accumulatedCost < group[a].accumulatedCost ||
                group[b].score > group[a].score)
            ) {
              dominated = true;
              statesPruned++;
              pruningReasons.dominatedState++;
              break;
            }
          }
          if (!dominated) {
            nonDominatedStates.push(group[a]);
          }
        }
      }

      // 9. Deterministic Sorting & Beam Truncation
      // Sort by score desc, arrival time asc, lastLocationId asc (strictly reproducible tie-breaking)
      nonDominatedStates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.currentTimeMinutes !== b.currentTimeMinutes) return a.currentTimeMinutes - b.currentTimeMinutes;
        return a.lastLocationId.localeCompare(b.lastLocationId);
      });

      currentBeam = nonDominatedStates.slice(0, beamWidth);
    }

    // 10. Select Best Feasible Completed Plan
    if (completedFeasiblePlans.length === 0) {
      return {
        isFeasible: false,
        orderedPlaceIds: [],
        schedule: [],
        plannedArrivalTimeAtEnd: minutesToTimeString(deadlineMinutes),
        totalTravelMinutes: 0,
        totalActivityMinutes: 0,
        totalBufferMinutes: 0,
        totalCost: 0,
        objectiveScore: 0,
        rejectionReasons: [
          `Could not construct any feasible plan within the time window (${constraints.time.startTime}–${constraints.time.latestArrivalTime}) and budget (${constraints.budget.total}).`,
        ],
        diagnostics: {
          statesGenerated,
          statesPruned,
          feasiblePlansFound: 0,
          executionTimeMs: Date.now() - startTimeMs,
          pruningReasons,
        },
      };
    }

    // Sort completed plans by finalScore desc, arrival asc
    completedFeasiblePlans.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (a.finalArrivalMinutes !== b.finalArrivalMinutes) {
        return a.finalArrivalMinutes - b.finalArrivalMinutes;
      }
      return a.state.lastLocationId.localeCompare(b.state.lastLocationId);
    });

    // Highest-scoring feasible plan
    const winning = completedFeasiblePlans[0];
    const winningState = winning.state;

    return {
      isFeasible: true,
      orderedPlaceIds: winningState.stops.map((s) => s.placeId),
      schedule: winningState.stops,
      plannedArrivalTimeAtEnd: minutesToTimeString(winning.finalArrivalMinutes),
      totalTravelMinutes: winning.finalTravelMinutes,
      totalActivityMinutes: winningState.accumulatedVisitMinutes,
      totalBufferMinutes: winning.finalSafetyBufferMinutes,
      totalCost: winningState.accumulatedCost,
      objectiveScore: winning.finalScore,
      scoreBreakdown: winning.scoreBreakdown,
      diagnostics: {
        statesGenerated,
        statesPruned,
        feasiblePlansFound: completedFeasiblePlans.length,
        executionTimeMs: Date.now() - startTimeMs,
        pruningReasons,
      },
    };
  }
}
