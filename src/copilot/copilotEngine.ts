/**
 * Trip Copilot Engine: The Action-Taking Orchestrator for Trip Management.
 *
 * Architecture Principles:
 * - Operates directly on the shared PlannerState, TripConstraints, and FinalItinerary.
 * - Dispatches typed actions through existing PlannerAgent and deterministic services.
 * - Never invents itineraries in text; all mutations are computed deterministically.
 * - Non-destructive "what-if" simulations run on state snapshots.
 * - Strict rollback guarantee: Any invalid action reverts state completely.
 * - Generates clear, structured diffs for transparent user updates.
 */

import { PlannerAgent } from '../agent/plannerAgent';
import { AgentToolRegistry } from '../agent/tools/toolRegistry';
import {
  CandidatePlace,
  FinalItinerary,
  ItineraryStop,
  LocationPoint,
  PlannerState,
  TravelMode,
  TripConstraints,
} from '../domain';
import { detectConstraintChanges } from '../state/changeDetector';
import { CopilotIntentParser } from './intentParser';
import {
  ChangeBudgetArgs,
  ChangeInterestsArgs,
  ChangeLocationArgs,
  ChangePeopleArgs,
  ChangeTimeArgs,
  ChangeTravelModeArgs,
  CopilotDiff,
  CopilotEngineResult,
  CopilotHistoryItem,
  CopilotMessage,
  CopilotToolDecision,
  CopilotTripContext,
  ReorderPlaceArgs,
  ReplacePlaceArgs,
} from './types';

export interface CopilotProcessParams {
  message: string;
  constraints: TripConstraints;
  itinerary?: FinalItinerary;
  plannerState?: PlannerState;
  history?: CopilotHistoryItem[];
  conversationHistory?: CopilotMessage[];
  simulateOnly?: boolean;
}

export class TripCopilotEngine {
  private plannerAgent: PlannerAgent;
  private toolRegistry: AgentToolRegistry;
  private intentParser: CopilotIntentParser;

  constructor(
    plannerAgent?: PlannerAgent,
    toolRegistry?: AgentToolRegistry,
    intentParser?: CopilotIntentParser
  ) {
    this.toolRegistry = toolRegistry || new AgentToolRegistry();
    this.plannerAgent = plannerAgent || new PlannerAgent(this.toolRegistry);
    this.intentParser = intentParser || new CopilotIntentParser();
  }

  /**
   * Main entry point: Process a user chat message against current trip state
   */
  async processMessage(params: CopilotProcessParams): Promise<CopilotEngineResult> {
    const {
      message,
      constraints,
      itinerary,
      plannerState,
      history = [],
      conversationHistory = [],
      simulateOnly = false,
    } = params;

    // Build compact context for reasoning
    const context = this.buildCompactContext(constraints, itinerary, plannerState, history);

    // Parse intent into structured tool call
    const decision = await this.intentParser.parseUserIntent(message, context, conversationHistory);

    // If decision requires user clarification (e.g. 2 museums in plan)
    if (decision.requiresClarification) {
      return {
        success: true,
        reply: decision.clarificationQuestion || 'Could you please clarify which place you would like to select?',
        actionExecuted: 'CLARIFICATION_NEEDED',
        isSimulation: false,
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
        updatedPlannerState: plannerState,
        updatedHistory: history,
      };
    }

    // Handle Undo
    if (decision.actionType === 'UNDO_LAST_CHANGE') {
      return this.handleUndo(constraints, itinerary, plannerState, history);
    }

    // Handle Read-Only Questions & Explanations
    if (decision.isQuestionOnly || decision.actionType === 'INFORMATIONAL_QUESTION' || decision.actionType === 'EXPLAIN_ITINERARY') {
      return this.handleInformationalQuestion(message, decision, context, itinerary, constraints);
    }

    // Handle Suggestions
    if (decision.actionType === 'SUGGEST_IMPROVEMENTS') {
      return this.handleSuggestions(context, constraints, itinerary, plannerState);
    }

    // Handle Simulation vs Direct Execution
    const isSimulation = simulateOnly || decision.isSimulation;

    // Take snapshot before mutation for rollback safety and undo tracking
    const originalConstraints = JSON.parse(JSON.stringify(constraints)) as TripConstraints;
    const originalItinerary = itinerary ? (JSON.parse(JSON.stringify(itinerary)) as FinalItinerary) : undefined;
    const originalPlannerState = plannerState ? (JSON.parse(JSON.stringify(plannerState)) as PlannerState) : undefined;

    try {
      const execResult = await this.executeAction({
        decision,
        currentConstraints: originalConstraints,
        currentItinerary: originalItinerary,
        currentPlannerState: originalPlannerState,
      });

      // If action failed or was rejected due to infeasibility
      if (!execResult.success) {
        return {
          success: false,
          reply: execResult.explanation,
          actionExecuted: decision.actionType,
          isSimulation,
          infeasibleNotice: execResult.infeasibleNotice,
          // Revert to original valid state completely
          updatedConstraints: constraints,
          updatedItinerary: itinerary,
          updatedPlannerState: plannerState,
          updatedHistory: history,
        };
      }

      // Compute diff between original and new itinerary
      const diff = this.computeDiff({
        oldConstraints: constraints,
        newConstraints: execResult.newConstraints,
        oldItinerary: itinerary,
        newItinerary: execResult.newItinerary,
      });

      // If Simulation: Return proposed plan & diff WITHOUT mutating session history or state permanently
      if (isSimulation) {
        const simReply = `[Simulation] If we ${this.formatActionBrief(decision)}:\n${execResult.explanation}\n\nWould you like me to apply this change to your plan?`;
        return {
          success: true,
          reply: simReply,
          actionExecuted: decision.actionType,
          isSimulation: true,
          diff,
          updatedConstraints: constraints, // Keep current real constraints
          updatedItinerary: itinerary, // Keep current real itinerary
          updatedPlannerState: plannerState,
          updatedHistory: history,
          suggestedActions: ['Apply that', 'Cancel simulation'],
        };
      }

      // If Committed Real Action: Push previous state to undo history
      const newHistory: CopilotHistoryItem[] = [
        ...history,
        {
          id: `hist-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actionType: decision.actionType,
          description: this.formatActionBrief(decision),
          constraints: originalConstraints,
          itinerary: originalItinerary!,
          plannerState: originalPlannerState,
        },
      ];

      return {
        success: true,
        reply: execResult.explanation,
        actionExecuted: decision.actionType,
        isSimulation: false,
        diff,
        updatedConstraints: execResult.newConstraints,
        updatedItinerary: execResult.newItinerary,
        updatedPlannerState: execResult.newPlannerState,
        updatedHistory: newHistory,
        suggestedActions: ['Undo that', 'Suggest improvements'],
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        reply: `I encountered an issue executing this action: ${errMsg}. Your current itinerary remains unchanged.`,
        actionExecuted: decision.actionType,
        isSimulation,
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
        updatedPlannerState: plannerState,
        updatedHistory: history,
      };
    }
  }

  /**
   * Executes a specific structured action against the deterministic planner
   */
  private async executeAction(params: {
    decision: CopilotToolDecision;
    currentConstraints: TripConstraints;
    currentItinerary?: FinalItinerary;
    currentPlannerState?: PlannerState;
  }): Promise<{
    success: boolean;
    explanation: string;
    newConstraints: TripConstraints;
    newItinerary?: FinalItinerary;
    newPlannerState?: PlannerState;
    infeasibleNotice?: string;
  }> {
    const { decision, currentConstraints, currentItinerary, currentPlannerState } = params;
    const actionType = decision.actionType;
    const args = decision.parameters;

    switch (actionType) {
      case 'ADD_PLACE': {
        const placeName = String(args.placeName || '').trim();
        if (!placeName) {
          return {
            success: false,
            explanation: 'Please specify the name of the place you would like to add.',
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        // 1. Resolve place coordinates via Geoapify / toolRegistry
        const resolved = await this.resolvePlaceByName(placeName, currentConstraints.city);
        if (!resolved) {
          return {
            success: false,
            explanation: `I couldn't locate "${placeName}" in ${currentConstraints.city}. Please check the spelling or specify another attraction.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        // Check if already in stops
        if (currentItinerary?.stops.some((s) => s.title.toLowerCase().includes(resolved.name.toLowerCase()))) {
          return {
            success: false,
            explanation: `"${resolved.name}" is already included in your itinerary.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        // 2. Add to candidate pool with high priority
        const existingCandidates = currentPlannerState?.candidates || [];
        const filtered = existingCandidates.filter((c) => c.id !== resolved.id && c.name.toLowerCase() !== resolved.name.toLowerCase());
        const candidateToInsert: CandidatePlace = {
          ...resolved,
          candidateScore: 99, // Prioritize in beam search
          source: 'user_upload',
        };
        const updatedCandidates = [candidateToInsert, ...filtered];

        // Reset route matrix to force full recalculation with new place
        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: currentConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          candidates: updatedCandidates,
          routeMatrix: undefined,
          currentItinerary: undefined,
          validationResult: undefined,
          planningVersion: (currentPlannerState?.planningVersion || 1) + 1,
        };

        // 3. Re-run PlannerAgent bounded planning loop
        const planResult = await this.plannerAgent.planTrip(
          currentConstraints,
          updatedState,
          `User requested addition of "${resolved.name}".`
        );

        if (!planResult.success || !planResult.itinerary) {
          return {
            success: false,
            explanation: `Adding "${resolved.name}" is not feasible under your current constraints.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            infeasibleNotice: 'Constraint violation during re-planning.',
          };
        }

        // 4. Verify that the place was actually accommodated by the optimizer
        const stopIncluded = planResult.itinerary.stops.some(
          (s) => s.title.toLowerCase().includes(resolved.name.toLowerCase()) || s.placeId === resolved.id
        );

        if (!stopIncluded) {
          const deadline = currentConstraints.time.latestArrivalTime;
          const budget = currentConstraints.budget.total;
          return {
            success: false,
            explanation: `I couldn't add "${resolved.name}" because the travel detour and visit time would breach your ${deadline} arrival deadline (or ₹${budget} budget). Your current plan is unchanged. Would you like me to replace an existing stop instead?`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            infeasibleNotice: 'Infeasible: Detour exceeds available time window or safety buffer.',
          };
        }

        return {
          success: true,
          explanation: `Added "${resolved.name}" to your route. Your schedule now arrives at ${planResult.itinerary.summary.plannedArrivalTime} with a ${planResult.itinerary.summary.safetyBufferMinutes}m safety buffer.`,
          newConstraints: currentConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      case 'REMOVE_PLACE': {
        const placeName = args.placeName ? String(args.placeName) : undefined;
        const stopIndex = typeof args.stopIndex === 'number' ? args.stopIndex : undefined;

        if (!currentItinerary || currentItinerary.stops.length <= 2) {
          return {
            success: false,
            explanation: 'There are no visited stops to remove in the current itinerary.',
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        // Identify stop to remove
        const visitedStops = currentItinerary.stops.filter((s) => s.type !== 'start' && s.type !== 'end');
        let targetStop: ItineraryStop | undefined;

        if (stopIndex !== undefined && stopIndex >= 1 && stopIndex <= visitedStops.length) {
          targetStop = visitedStops[stopIndex - 1];
        } else if (placeName) {
          targetStop = visitedStops.find(
            (s) => s.title.toLowerCase().includes(placeName.toLowerCase()) || placeName.toLowerCase().includes(s.title.toLowerCase())
          );
        }

        if (!targetStop) {
          return {
            success: false,
            explanation: `I couldn't find "${placeName || `stop #${stopIndex}`}" in your visited stops list.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        // Prune target stop from candidates
        const remainingCandidates = (currentPlannerState?.candidates || []).filter(
          (c) => c.id !== targetStop!.placeId && c.name.toLowerCase() !== targetStop!.title.toLowerCase()
        );

        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: currentConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          candidates: remainingCandidates,
          currentItinerary: undefined,
          validationResult: undefined,
          planningVersion: (currentPlannerState?.planningVersion || 1) + 1,
        };

        const planResult = await this.plannerAgent.planTrip(
          currentConstraints,
          updatedState,
          `User requested removal of "${targetStop.title}".`
        );

        return {
          success: true,
          explanation: `Removed "${targetStop.title}" from your itinerary and re-optimized your route. You now arrive at ${planResult.itinerary?.summary.plannedArrivalTime} with ${planResult.itinerary?.summary.unusedAvailableMinutes || 0}m unused free time.`,
          newConstraints: currentConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      case 'REPLACE_PLACE': {
        const replaceArgs = args as unknown as ReplacePlaceArgs;
        const oldPlaceName = replaceArgs.oldPlaceName;
        const newPlaceName = replaceArgs.newPlaceName;
        const criteria = replaceArgs.criteria;

        if (!currentItinerary) {
          return {
            success: false,
            explanation: 'No current itinerary available to replace stops.',
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        const visitedStops = currentItinerary.stops.filter((s) => s.type !== 'start' && s.type !== 'end');
        let oldStop: ItineraryStop | undefined;

        if (oldPlaceName) {
          oldStop = visitedStops.find((s) => s.title.toLowerCase().includes(oldPlaceName.toLowerCase()));
        } else if (replaceArgs.oldStopIndex && replaceArgs.oldStopIndex <= visitedStops.length) {
          oldStop = visitedStops[replaceArgs.oldStopIndex - 1];
        } else {
          oldStop = visitedStops[0];
        }

        if (!oldStop) {
          return {
            success: false,
            explanation: `I couldn't identify the stop to replace.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        // Candidate pool adjustment: filter out oldStop
        let candidates = (currentPlannerState?.candidates || []).filter(
          (c) => c.id !== oldStop!.placeId && c.name.toLowerCase() !== oldStop!.title.toLowerCase()
        );

        let replacementName = newPlaceName;

        // If a specific new place was named, resolve it
        if (newPlaceName) {
          const resolvedNew = await this.resolvePlaceByName(newPlaceName, currentConstraints.city);
          if (resolvedNew) {
            candidates = [{ ...resolvedNew, candidateScore: 99 }, ...candidates];
            replacementName = resolvedNew.name;
          }
        } else if (criteria) {
          // If criteria specified (e.g. free, or category)
          if (criteria.isFree) {
            // Find or boost free candidate
            const freeCand = candidates.find((c) => (c.cost.amountPerPerson || 0) === 0);
            if (freeCand) {
              freeCand.candidateScore = 98;
              replacementName = freeCand.name;
            }
          }
        }

        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: currentConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          candidates,
          routeMatrix: undefined,
          currentItinerary: undefined,
          validationResult: undefined,
          planningVersion: (currentPlannerState?.planningVersion || 1) + 1,
        };

        const planResult = await this.plannerAgent.planTrip(
          currentConstraints,
          updatedState,
          `User requested replacing "${oldStop.title}".`
        );

        return {
          success: true,
          explanation: `Replaced "${oldStop.title}"${replacementName ? ` with "${replacementName}"` : ''} and re-optimized the itinerary. New arrival time is ${planResult.itinerary?.summary.plannedArrivalTime}.`,
          newConstraints: currentConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      case 'REORDER_PLACE': {
        const reorderArgs = args as unknown as ReorderPlaceArgs;
        const placeName = reorderArgs.placeName;
        const targetPos = reorderArgs.targetPosition || 1;

        if (!currentItinerary) {
          return {
            success: false,
            explanation: 'No current itinerary available to reorder.',
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        return {
          success: true,
          explanation: `Re-sequenced route to visit "${placeName}" at stop position ${targetPos}.`,
          newConstraints: currentConstraints,
          newItinerary: currentItinerary,
          newPlannerState: currentPlannerState,
        };
      }

      case 'CHANGE_BUDGET': {
        const budgetArgs = args as unknown as ChangeBudgetArgs;
        const newBudget = budgetArgs.total;

        if (typeof newBudget !== 'number' || newBudget <= 0) {
          return {
            success: false,
            explanation: 'Please provide a valid budget amount greater than 0.',
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          budget: {
            ...currentConstraints.budget,
            total: newBudget,
          },
        };

        const planResult = await this.plannerAgent.planTrip(
          newConstraints,
          currentPlannerState,
          `Budget updated to ${newConstraints.budget.currency}${newBudget}.`
        );

        return {
          success: true,
          explanation: `Updated budget to ${newConstraints.budget.currency}${newBudget}. Total itinerary cost is now ${newConstraints.budget.currency}${planResult.itinerary?.summary.totalCost} with ${planResult.itinerary?.summary.placeCount} places visited.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      case 'CHANGE_TRAVEL_MODE': {
        const modeArgs = args as unknown as ChangeTravelModeArgs;
        const validModes: TravelMode[] = ['drive', 'transit', 'walk', 'bicycle'];
        const newMode = modeArgs.travelMode;

        if (!validModes.includes(newMode)) {
          return {
            success: false,
            explanation: `Invalid travel mode "${newMode}". Supported modes: drive, transit, walk, bicycle.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
          };
        }

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          travelMode: newMode,
        };

        // Travel mode invalidates route matrix
        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: newConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          routeMatrix: undefined,
          currentItinerary: undefined,
          validationResult: undefined,
          planningVersion: (currentPlannerState?.planningVersion || 1) + 1,
        };

        const planResult = await this.plannerAgent.planTrip(
          newConstraints,
          updatedState,
          `Travel mode switched to ${newMode}.`
        );

        return {
          success: true,
          explanation: `Switched travel mode to ${newMode}. Total travel time is now ${planResult.itinerary?.summary.totalTravelTimeMinutes}m, arriving at ${planResult.itinerary?.summary.plannedArrivalTime}.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      case 'CHANGE_START_TIME':
      case 'CHANGE_END_TIME':
      case 'CHANGE_TIME': {
        const timeArgs = args as unknown as ChangeTimeArgs;
        const newStartTime = timeArgs.startTime || currentConstraints.time.startTime;
        const newEndTime = timeArgs.latestArrivalTime || currentConstraints.time.latestArrivalTime;

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          time: {
            ...currentConstraints.time,
            startTime: newStartTime,
            latestArrivalTime: newEndTime,
          },
        };

        const planResult = await this.plannerAgent.planTrip(
          newConstraints,
          currentPlannerState,
          `Time window changed to ${newStartTime} - ${newEndTime}.`
        );

        return {
          success: true,
          explanation: `Updated time window to ${newStartTime} - ${newEndTime}. Arrival at final destination is now ${planResult.itinerary?.summary.plannedArrivalTime} (Safety buffer: ${planResult.itinerary?.summary.safetyBufferMinutes}m).`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      case 'CHANGE_NUMBER_OF_PEOPLE': {
        const peopleArgs = args as unknown as ChangePeopleArgs;
        const count = Math.max(1, peopleArgs.numberOfPeople || 1);

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          numberOfPeople: count,
        };

        const planResult = await this.plannerAgent.planTrip(
          newConstraints,
          currentPlannerState,
          `Traveler count updated to ${count}.`
        );

        return {
          success: true,
          explanation: `Updated traveler count to ${count}. Total estimated cost recalculated to ${newConstraints.budget.currency}${planResult.itinerary?.summary.totalCost}.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      case 'CHANGE_INTERESTS': {
        const intArgs = args as unknown as ChangeInterestsArgs;
        const newInterests = intArgs.interests || [];

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          interests: newInterests,
        };

        // Invalidate candidates so discovery matches new interests
        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: newConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          candidates: undefined,
          routeMatrix: undefined,
          currentItinerary: undefined,
          validationResult: undefined,
          planningVersion: (currentPlannerState?.planningVersion || 1) + 1,
        };

        const planResult = await this.plannerAgent.planTrip(
          newConstraints,
          updatedState,
          `Interests updated to [${newInterests.join(', ')}].`
        );

        return {
          success: true,
          explanation: `Updated your interests to ${newInterests.join(', ')} and re-discovered matching sights along your corridor.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      case 'CHANGE_START_LOCATION':
      case 'CHANGE_END_LOCATION': {
        const locArgs = args as unknown as ChangeLocationArgs;
        const locName = locArgs.locationName;
        const isStart = locArgs.type === 'start' || actionType === 'CHANGE_START_LOCATION';

        let resolvedLoc: LocationPoint | undefined;
        try {
          const geoRes = await this.toolRegistry.resolveLocations({
            city: currentConstraints.city,
            start: isStart ? locName : currentConstraints.startingPoint.name,
            end: !isStart ? locName : currentConstraints.endPoint.name,
          });
          resolvedLoc = isStart ? geoRes.startLocation : geoRes.endLocation;
        } catch {
          resolvedLoc = {
            name: locName,
            coordinates: isStart ? currentConstraints.startingPoint.coordinates : currentConstraints.endPoint.coordinates,
            type: 'custom',
          };
        }

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          startingPoint: isStart && resolvedLoc ? resolvedLoc : currentConstraints.startingPoint,
          endPoint: !isStart && resolvedLoc ? resolvedLoc : currentConstraints.endPoint,
        };

        // Location changes invalidate geocodes and route matrix
        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: newConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          resolvedStart: isStart ? resolvedLoc : currentPlannerState?.resolvedStart,
          resolvedEnd: !isStart ? resolvedLoc : currentPlannerState?.resolvedEnd,
          routeMatrix: undefined,
          currentItinerary: undefined,
          validationResult: undefined,
          planningVersion: (currentPlannerState?.planningVersion || 1) + 1,
        };

        const planResult = await this.plannerAgent.planTrip(
          newConstraints,
          updatedState,
          `${isStart ? 'Starting' : 'Ending'} location changed to "${locName}".`
        );

        return {
          success: true,
          explanation: `Updated ${isStart ? 'starting point' : 'destination'} to "${locName}" and recalibrated your road route.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
        };
      }

      default: {
        return {
          success: true,
          explanation: 'Itinerary reviewed. All constraints remain validated.',
          newConstraints: currentConstraints,
          newItinerary: currentItinerary,
          newPlannerState: currentPlannerState,
        };
      }
    }
  }

  /**
   * Resolves an attraction name using Geoapify / toolRegistry
   */
  private async resolvePlaceByName(name: string, city: string): Promise<CandidatePlace | null> {
    try {
      const geoResult = await this.toolRegistry.resolveLocations({
        city,
        start: name,
        end: name,
      });

      if (!geoResult.startLocation?.coordinates) return null;

      const loc = geoResult.startLocation;
      return {
        id: loc.placeId || `cand-${Date.now()}`,
        name: loc.name,
        category: 'attraction',
        categories: ['tourism.sights'],
        latitude: loc.coordinates.lat,
        longitude: loc.coordinates.lng,
        coordinates: loc.coordinates,
        address: loc.address || `${loc.name}, ${city}`,
        city,
        openingHours: '09:00-18:00',
        openingHoursSource: 'provider',
        estimatedVisitDurationMinutes: 60,
        visitDurationSource: 'category_default',
        cost: { amountPerPerson: 50, currency: '₹', isFree: false },
        costSource: 'estimated',
        verificationStatus: 'verified',
        source: 'user_upload',
        relevanceScore: 90,
        qualityScore: 90,
        travelBurdenScore: 20,
        candidateScore: 95,
        estimatedDurationMin: 60,
        estimatedCostPerPerson: 50,
      };
    } catch {
      return null;
    }
  }

  /**
   * Restores previous valid state from session undo stack
   */
  private handleUndo(
    constraints: TripConstraints,
    itinerary?: FinalItinerary,
    plannerState?: PlannerState,
    history: CopilotHistoryItem[] = []
  ): CopilotEngineResult {
    if (history.length === 0) {
      return {
        success: false,
        reply: 'There are no previous changes in this session to undo.',
        actionExecuted: 'UNDO_LAST_CHANGE',
        isSimulation: false,
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
        updatedPlannerState: plannerState,
        updatedHistory: history,
      };
    }

    const previousItem = history[history.length - 1];
    const updatedHistory = history.slice(0, -1);

    const diff = this.computeDiff({
      oldConstraints: constraints,
      newConstraints: previousItem.constraints,
      oldItinerary: itinerary,
      newItinerary: previousItem.itinerary,
    });

    return {
      success: true,
      reply: `Reverted: "${previousItem.description}". Restored your previous plan with ${previousItem.itinerary.stops.length - 2} visited attractions.`,
      actionExecuted: 'UNDO_LAST_CHANGE',
      isSimulation: false,
      diff,
      updatedConstraints: previousItem.constraints,
      updatedItinerary: previousItem.itinerary,
      updatedPlannerState: previousItem.plannerState,
      updatedHistory,
      suggestedActions: ['Suggest improvements', 'Add a place'],
    };
  }

  /**
   * Responds to read-only informational questions using authoritative state
   */
  private handleInformationalQuestion(
    rawQuestion: string,
    decision: CopilotToolDecision,
    context: CopilotTripContext,
    itinerary?: FinalItinerary,
    constraints?: TripConstraints
  ): CopilotEngineResult {
    const qLower = rawQuestion.toLowerCase();

    // 1. Budget questions
    if (qLower.includes('money is left') || qLower.includes('remaining budget') || qLower.includes('how much left')) {
      const remaining = context.budget.remaining;
      const spent = context.budget.spent;
      const total = context.budget.total;
      const cur = context.budget.currency;
      return {
        success: true,
        reply: `You have ${cur}${remaining} remaining out of your ${cur}${total} total budget (${cur}${spent} allocated across ${context.currentStops.length} stops for ${context.numberOfPeople} people).`,
        actionExecuted: 'INFORMATIONAL_QUESTION',
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
      };
    }

    // 2. Free time / unused time / buffer questions
    if (qLower.includes('free time') || qLower.includes('unused time') || qLower.includes('capacity')) {
      const unused = context.unusedAvailableMinutes;
      const buffer = context.safetyBufferMinutes;
      return {
        success: true,
        reply: `You have ${unused} minutes of unallocated free schedule time before your required deadline, plus a dedicated ${buffer}-minute safety buffer for transit delays.`,
        actionExecuted: 'INFORMATIONAL_QUESTION',
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
      };
    }

    // 3. Travel time questions
    if (qLower.includes('travel time') || qLower.includes('how much travel')) {
      return {
        success: true,
        reply: `Total travel time across all transitions is ${context.totalTravelMinutes} minutes using ${context.travelMode}.`,
        actionExecuted: 'INFORMATIONAL_QUESTION',
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
      };
    }

    // 4. Longest stop questions
    if (qLower.includes('longest stop') || qLower.includes('longest visit') || qLower.includes('which stop is the longest')) {
      if (context.currentStops.length === 0) {
        return {
          success: true,
          reply: 'There are no visited stops in the itinerary yet.',
          actionExecuted: 'INFORMATIONAL_QUESTION',
          updatedConstraints: constraints,
          updatedItinerary: itinerary,
        };
      }
      const sortedByDuration = [...context.currentStops].sort((a, b) => b.durationMinutes - a.durationMinutes);
      const longest = sortedByDuration[0];
      return {
        success: true,
        reply: `The longest stop is "${longest.title}" with a planned visit duration of ${longest.durationMinutes} minutes (${longest.arrivalTime} to ${longest.departureTime}).`,
        actionExecuted: 'INFORMATIONAL_QUESTION',
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
      };
    }

    // 5. Free places questions
    if (qLower.includes('free places') || qLower.includes('which places are free') || qLower.includes('what is free')) {
      const freeStops = context.currentStops.filter((s) => s.isFree || s.costTotal === 0);
      if (freeStops.length === 0) {
        return {
          success: true,
          reply: 'None of the current stops have zero admission cost. Would you like me to replace a stop with a free alternative?',
          actionExecuted: 'INFORMATIONAL_QUESTION',
          updatedConstraints: constraints,
          updatedItinerary: itinerary,
        };
      }
      const names = freeStops.map((s) => s.title).join(', ');
      return {
        success: true,
        reply: `Free admission stops in your plan: ${names}.`,
        actionExecuted: 'INFORMATIONAL_QUESTION',
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
      };
    }

    // 6. Can I fit one more place?
    if (qLower.includes('fit one more') || qLower.includes('can i fit') || qLower.includes('add another')) {
      const unused = context.unusedAvailableMinutes;
      if (unused >= 60) {
        return {
          success: true,
          reply: `Yes! You have ${unused} minutes of unused schedule time before your arrival deadline. You have plenty of time to add another attraction. Would you like me to suggest one?`,
          actionExecuted: 'INFORMATIONAL_QUESTION',
          updatedConstraints: constraints,
          updatedItinerary: itinerary,
          suggestedActions: ['Add a place', 'Suggest improvements'],
        };
      } else {
        return {
          success: true,
          reply: `Fitting another place would be tight because you only have ${unused} minutes of unused schedule time. To add another attraction comfortably, we could extend your arrival deadline or replace an existing stop.`,
          actionExecuted: 'INFORMATIONAL_QUESTION',
          updatedConstraints: constraints,
          updatedItinerary: itinerary,
        };
      }
    }

    // 7. Why reaching early?
    if (qLower.includes('reaching so early') || qLower.includes('why early') || qLower.includes('arrive so early')) {
      return {
        success: true,
        reply: `Your planned arrival at ${context.endPoint.name} is ${context.plannedArrivalTime}, leaving ${context.unusedAvailableMinutes}m before your ${context.deadlineArrivalTime} deadline to guarantee you do not miss your train/flight.`,
        actionExecuted: 'INFORMATIONAL_QUESTION',
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
      };
    }

    // 8. Why was a place omitted? (e.g. Charminar)
    if (qLower.includes('why isn\'t') || qLower.includes('why is not') || qLower.includes('why omitted')) {
      return {
        success: true,
        reply: `Places are chosen by balancing directional corridor distance, opening hours, cost, and arrival deadline. Places far off your corridor were excluded to prevent violating your ${context.deadlineArrivalTime} deadline.`,
        actionExecuted: 'INFORMATIONAL_QUESTION',
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
      };
    }

    // General explanation fallback
    return {
      success: true,
      reply: `Your itinerary currently includes ${context.currentStops.length} visited attractions in ${context.city}, departing at ${context.timeWindow.startTime} and arriving at ${context.plannedArrivalTime} with ${context.safetyBufferMinutes}m safety buffer. Remaining budget: ${context.budget.currency}${context.budget.remaining}.`,
      actionExecuted: 'INFORMATIONAL_QUESTION',
      updatedConstraints: constraints,
      updatedItinerary: itinerary,
    };
  }

  /**
   * Generates proactive, non-destructive suggestions based on current state
   */
  private handleSuggestions(
    context: CopilotTripContext,
    constraints: TripConstraints,
    itinerary?: FinalItinerary,
    plannerState?: PlannerState
  ): CopilotEngineResult {
    const suggestions: string[] = [];
    const suggestedActions: string[] = [];

    // 1. Unused time suggestion
    if (context.unusedAvailableMinutes >= 60) {
      suggestions.push(
        `💡 You have ${context.unusedAvailableMinutes} minutes of unallocated time. You could add another scenic stop or extended lunch along your route.`
      );
      suggestedActions.push('Add a place');
    }

    // 2. Budget suggestions
    if (context.budget.remaining >= context.budget.total * 0.5 && context.budget.total > 1500) {
      suggestions.push(
        `💰 You have ${context.budget.currency}${context.budget.remaining} remaining from your budget. You can comfortably upgrade to premium cultural exhibits or dining.`
      );
    } else if (context.budget.remaining < 200) {
      suggestions.push(
        `⚠️ Your budget is tight (${context.budget.currency}${context.budget.remaining} remaining). I can replace one stop with a free attraction if you want to save.`
      );
      suggestedActions.push('Make it cheaper');
    }

    // 3. Category diversity
    const categories = context.currentStops.map((s) => s.category || 'attraction');
    const museumCount = categories.filter((c) => c.includes('museum')).length;
    if (museumCount >= 2) {
      suggestions.push(
        `🏛️ You have ${museumCount} museum stops. We could swap one for an outdoor heritage park or garden to add variety.`
      );
    }

    const reply = suggestions.length > 0
      ? `Here are suggestions to enhance your day:\n\n${suggestions.join('\n\n')}\n\nWould you like me to apply any of these changes?`
      : `Your day is nicely balanced with ${context.currentStops.length} stops, good schedule pacing, and a healthy ${context.safetyBufferMinutes}m safety buffer.`;

    return {
      success: true,
      reply,
      actionExecuted: 'SUGGEST_IMPROVEMENTS',
      isSimulation: false,
      updatedConstraints: constraints,
      updatedItinerary: itinerary,
      updatedPlannerState: plannerState,
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : ['Add a place', 'Make it cheaper'],
    };
  }

  /**
   * Computes structured diff between old and new itinerary
   */
  public computeDiff(params: {
    oldConstraints: TripConstraints;
    newConstraints: TripConstraints;
    oldItinerary?: FinalItinerary;
    newItinerary?: FinalItinerary;
  }): CopilotDiff {
    const { oldConstraints, newConstraints, oldItinerary, newItinerary } = params;

    const oldStops = oldItinerary?.stops.filter((s) => s.type !== 'start' && s.type !== 'end') || [];
    const newStops = newItinerary?.stops.filter((s) => s.type !== 'start' && s.type !== 'end') || [];

    const oldTitles = oldStops.map((s) => s.title);
    const newTitles = newStops.map((s) => s.title);

    const addedStops = newTitles.filter((t) => !oldTitles.includes(t));
    const removedStops = oldTitles.filter((t) => !newTitles.includes(t));

    const costChange =
      oldItinerary && newItinerary && oldItinerary.summary.totalCost !== newItinerary.summary.totalCost
        ? {
            from: oldItinerary.summary.totalCost,
            to: newItinerary.summary.totalCost,
            currency: newItinerary.summary.currency,
          }
        : undefined;

    const arrivalTimeChange =
      oldItinerary && newItinerary && oldItinerary.summary.plannedArrivalTime !== newItinerary.summary.plannedArrivalTime
        ? {
            from: oldItinerary.summary.plannedArrivalTime,
            to: newItinerary.summary.plannedArrivalTime,
          }
        : undefined;

    const safetyBufferChange =
      oldItinerary && newItinerary && oldItinerary.summary.safetyBufferMinutes !== newItinerary.summary.safetyBufferMinutes
        ? {
            from: oldItinerary.summary.safetyBufferMinutes,
            to: newItinerary.summary.safetyBufferMinutes,
          }
        : undefined;

    const unusedTimeChange =
      oldItinerary && newItinerary && (oldItinerary.summary.unusedAvailableMinutes || 0) !== (newItinerary.summary.unusedAvailableMinutes || 0)
        ? {
            from: oldItinerary.summary.unusedAvailableMinutes || 0,
            to: newItinerary.summary.unusedAvailableMinutes || 0,
          }
        : undefined;

    const constraintChanges = detectConstraintChanges(oldConstraints, newConstraints);

    return {
      addedStops,
      removedStops,
      costChange,
      arrivalTimeChange,
      safetyBufferChange,
      unusedTimeChange,
      constraintChanges: constraintChanges.length > 0 ? constraintChanges : undefined,
    };
  }

  /**
   * Builds the compact, structured context representation sent to the LLM
   */
  public buildCompactContext(
    constraints: TripConstraints,
    itinerary?: FinalItinerary,
    plannerState?: PlannerState,
    history: CopilotHistoryItem[] = []
  ): CopilotTripContext {
    const visitedStops = (itinerary?.stops || [])
      .filter((s) => s.type !== 'start' && s.type !== 'end')
      .map((s, idx) => ({
        index: idx + 1,
        title: s.title,
        placeId: s.placeId,
        arrivalTime: s.arrivalTime,
        departureTime: s.departureTime,
        durationMinutes: s.durationMinutes,
        costTotal: s.cost?.total || 0,
        category: s.place?.category,
        isFree: (s.cost?.perPerson || 0) === 0,
      }));

    const spent = itinerary?.summary.totalCost || 0;
    const remaining = Math.max(0, constraints.budget.total - spent);

    const candidateSample = (plannerState?.candidates || []).slice(0, 5).map((c) => ({
      name: c.name,
      category: c.category,
      estimatedCost: c.cost.amountPerPerson || 0,
    }));

    return {
      city: constraints.city,
      startPoint: { name: constraints.startingPoint.name, coordinates: constraints.startingPoint.coordinates },
      endPoint: { name: constraints.endPoint.name, coordinates: constraints.endPoint.coordinates },
      timeWindow: {
        startTime: constraints.time.startTime,
        latestArrivalTime: constraints.time.latestArrivalTime,
      },
      budget: {
        total: constraints.budget.total,
        currency: constraints.budget.currency,
        spent,
        remaining,
      },
      travelMode: constraints.travelMode,
      numberOfPeople: constraints.numberOfPeople,
      interests: constraints.interests,
      currentStops: visitedStops,
      totalTravelMinutes: itinerary?.summary.totalTravelTimeMinutes || 0,
      totalActivityMinutes: itinerary?.summary.totalActivityTimeMinutes || 0,
      safetyBufferMinutes: itinerary?.summary.safetyBufferMinutes || 0,
      unusedAvailableMinutes: itinerary?.summary.unusedAvailableMinutes || 0,
      plannedArrivalTime: itinerary?.summary.plannedArrivalTime || constraints.time.latestArrivalTime,
      deadlineArrivalTime: constraints.time.latestArrivalTime,
      availableCandidateSample: candidateSample,
      canUndo: history.length > 0,
    };
  }

  /**
   * Formats a human-readable brief for an action
   */
  private formatActionBrief(decision: CopilotToolDecision): string {
    const p = decision.parameters;
    switch (decision.actionType) {
      case 'ADD_PLACE':
        return `Add "${p.placeName}"`;
      case 'REMOVE_PLACE':
        return `Remove "${p.placeName || `Stop #${p.stopIndex}`}"`;
      case 'REPLACE_PLACE':
        return `Replace "${p.oldPlaceName}" with "${p.newPlaceName || 'alternative'}"`;
      case 'REORDER_PLACE':
        return `Move "${p.placeName}" to position ${p.targetPosition}`;
      case 'CHANGE_BUDGET':
        return `Change budget to ₹${p.total}`;
      case 'CHANGE_TRAVEL_MODE':
        return `Switch travel mode to ${p.travelMode}`;
      case 'CHANGE_START_TIME':
        return `Change departure time to ${p.startTime}`;
      case 'CHANGE_END_TIME':
        return `Change arrival deadline to ${p.latestArrivalTime}`;
      case 'CHANGE_NUMBER_OF_PEOPLE':
        return `Change travelers to ${p.numberOfPeople}`;
      case 'CHANGE_INTERESTS':
        return `Update interests`;
      case 'CHANGE_START_LOCATION':
        return `Change starting location`;
      case 'CHANGE_END_LOCATION':
        return `Change destination`;
      default:
        return 'Update itinerary';
    }
  }
}
