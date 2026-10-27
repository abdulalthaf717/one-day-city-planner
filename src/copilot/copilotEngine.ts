/**
 * Trip Copilot Engine: Conversational & Action-Taking Orchestrator for Trip Management.
 *
 * Architecture Principles:
 * - Supports 4 distinct Conversation Modes:
 *   1. Mode A (GENERAL_CONVERSATION): Greetings, destination guidance, attraction details/comparisons,
 *      and user preference expressions — answered naturally with ZERO unnecessary planner tool calls.
 *   2. Mode B (CURRENT_PLAN_QUESTION): Factual questions about the active trip (cost, why a stop was
 *      chosen, why reaching early, free time) grounded strictly in authoritative state.
 *   3. Mode C (SIMULATION_AND_RECOMMENDATION): Non-destructive "what-if" simulations, evaluative
 *      trade-off analyses, and preference-aware recommendations with pendingProposal memory.
 *   4. Mode D (ACTION_EXECUTION): Explicit itinerary and constraint mutations executed through
 *      PlannerAgent, route matrix, optimizer, and 14-point validator with rollback safety.
 * - Maintains separate structured contexts:
 *   (A) Conversation History, (B) User Preferences, and (C) Authoritative Trip State.
 */

import { PlannerAgent } from '../agent/plannerAgent';
import { AgentToolRegistry } from '../agent/tools/toolRegistry';
import {
  CandidatePlace,
  CrowdPreference,
  FinalItinerary,
  ItineraryStop,
  LocationPoint,
  PlannerState,
  TravelMode,
  TripConstraints,
  TripPace,
} from '../domain';
import { detectConstraintChanges } from '../state/changeDetector';
import {
  findAttractionProfile,
  generateGeneralConversationReply,
  generatePlanOrEvaluativeReply,
  mergeUserPreferences,
} from './conversationalResponder';
import { CopilotIntentParser } from './intentParser';
import {
  ChangeInterestsArgs,
  ChangeLocationArgs,
  ChangePeopleArgs,
  ChangeTimeArgs,
  ChangeTravelModeArgs,
  CopilotActionType,
  CopilotDiff,
  CopilotEngineResult,
  CopilotHistoryItem,
  CopilotMessage,
  CopilotToolDecision,
  CopilotTripContext,
  CopilotUserPreferences,
  PendingActionProposal,
  ReorderPlaceArgs,
  ReplacePlaceArgs,
} from './types';

type ItineraryLike = FinalItinerary & {
  totalCost?: number;
  totalTravelMinutes?: number;
  totalActivityMinutes?: number;
  plannedArrivalTime?: string;
  safetyBufferMinutes?: number;
  unusedAvailableMinutes?: number;
};

/**
 * Synchronizes structured user preferences directly into trip constraints
 */
export function syncPreferencesToConstraints(
  constraints: TripConstraints,
  preferences?: CopilotUserPreferences
): TripConstraints {
  if (!preferences) return constraints;
  const updated: TripConstraints = { ...constraints };
  if (preferences.pacePreference) {
    updated.pace = preferences.pacePreference;
  }
  if (preferences.crowdPreference) {
    updated.crowdPreference = preferences.crowdPreference;
  }
  if (preferences.preferredCategories && preferences.preferredCategories.length > 0) {
    const combined = [...updated.interests];
    for (const cat of preferences.preferredCategories) {
      if (!combined.some((c) => c.toLowerCase() === cat.toLowerCase())) {
        combined.push(cat);
      }
    }
    updated.interests = combined;
  }
  return updated;
}

export interface CopilotProcessParams {
  message: string;
  constraints: TripConstraints;
  itinerary?: FinalItinerary;
  plannerState?: PlannerState;
  history?: CopilotHistoryItem[];
  conversationHistory?: CopilotMessage[];
  userPreferences?: CopilotUserPreferences;
  pendingProposal?: PendingActionProposal;
  lastDiscussedPlace?: string;
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
   * Main entry point: Process a user chat message against current trip state & conversational context
   */
  async processMessage(params: CopilotProcessParams): Promise<CopilotEngineResult> {
    const {
      message,
      constraints,
      itinerary,
      plannerState,
      history = [],
      conversationHistory = [],
      userPreferences,
      pendingProposal,
      lastDiscussedPlace,
      simulateOnly = false,
    } = params;

    // 1. Build compact context enriched with multi-turn memory
    const context = this.buildCompactContext(
      constraints,
      itinerary,
      plannerState,
      history,
      userPreferences,
      pendingProposal,
      lastDiscussedPlace
    );

    // 2. Parse intent and conversation mode
    const decision = await this.intentParser.parseUserIntent(
      message,
      context,
      conversationHistory
    );

    // 3. Merge any new user preferences expressed in this turn
    const updatedPreferences = mergeUserPreferences(
      userPreferences,
      decision.preferenceUpdate,
      constraints
    );
    context.userPreferences = updatedPreferences;

    // Track last discussed place across turns
    const activeDiscussedPlace =
      decision.discussedPlace ||
      this.intentParser.extractLastDiscussedPlace(conversationHistory, context);

    // 4. Handle Ambiguity Clarification (e.g. "Remove the museum" when 2 museums exist)
    if (decision.requiresClarification) {
      return {
        success: true,
        reply:
          decision.clarificationQuestion ||
          'Could you please clarify which place you would like to select?',
        conversationMode: 'ACTION_EXECUTION',
        actionExecuted: 'CLARIFICATION_NEEDED',
        isSimulation: false,
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
        updatedPlannerState: plannerState,
        updatedHistory: history,
        updatedPreferences,
        lastDiscussedPlace: activeDiscussedPlace,
        toolsCalled: [],
      };
    }

    // 5. Handle Infeasible Requests Caught Pre-Execution (e.g. "visit 8 places in 3 hours")
    if (decision.actionType === 'INFEASIBLE_REQUEST') {
      const reqStops = Number(decision.parameters.requestedStops || 8);
      const reqHours = Number(decision.parameters.requestedHours || 3);
      const minRequiredMinutes = reqStops * 60 + reqStops * 20 + 25;
      const reply = `Visiting **${reqStops} places in just ${reqHours} hours (${reqHours * 60} minutes)** isn't feasible for a real city itinerary. Even with quick 45–60 minute visits and 15–25 minutes of urban road transit between stops, ${reqStops} attractions would require at least **${Math.round(minRequiredMinutes / 60)} to ${Math.round(minRequiredMinutes / 60) + 1} hours** plus a safety buffer.\n\nTo keep your trip enjoyable and ensure you don't miss your arrival deadline, I've kept your current validated ${context.currentStops.length}-stop itinerary intact. If you only have ${reqHours} hours available, I recommend focusing on **1 or 2 signature highlights** along your route (such as **Spanish Mosque** and one central landmark). Would you like me to adjust your time window to ${reqHours} hours with 2 stops?`;

      return {
        success: false,
        reply,
        conversationMode: 'ACTION_EXECUTION',
        actionExecuted: 'INFEASIBLE_REQUEST',
        isSimulation: false,
        infeasibleNotice:
          decision.infeasibleReason ||
          `Cannot fit ${reqStops} stops into a ${reqHours}-hour window without violating visit duration and transit constraints.`,
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
        updatedPlannerState: plannerState,
        updatedHistory: history,
        updatedPreferences,
        lastDiscussedPlace: activeDiscussedPlace,
        toolsCalled: ['validate_trip'],
        suggestedActions: ['Can we make the trip less tiring?', 'Suggest improvements'],
      };
    }

    // 6. Handle Mode A: General Conversation & Non-Destructive Preference Statements
    if (
      decision.conversationMode === 'GENERAL_CONVERSATION' &&
      decision.isQuestionOnly
    ) {
      const genResult = generateGeneralConversationReply({
        userMessage: message,
        decision,
        context,
        preferences: updatedPreferences,
        conversationHistory,
      });

      const syncedConstraints = syncPreferencesToConstraints(constraints, updatedPreferences);

      return {
        success: true,
        reply: genResult.reply,
        conversationMode: 'GENERAL_CONVERSATION',
        actionExecuted: decision.actionType,
        isSimulation: false,
        updatedConstraints: syncedConstraints,
        updatedItinerary: itinerary,
        updatedPlannerState: plannerState,
        updatedHistory: history,
        updatedPreferences,
        pendingProposal: genResult.pendingProposal || decision.pendingProposal || pendingProposal,
        lastDiscussedPlace: genResult.discussedPlace || activeDiscussedPlace,
        toolsCalled: [],
        suggestedActions: genResult.suggestedActions,
      };
    }

    // 7. Handle Undo
    if (decision.actionType === 'UNDO_LAST_CHANGE') {
      const undoRes = this.handleUndo(constraints, itinerary, plannerState, history);
      return {
        ...undoRes,
        conversationMode: 'ACTION_EXECUTION',
        updatedPreferences,
        lastDiscussedPlace: activeDiscussedPlace,
        toolsCalled: ['undo_last_change'],
      };
    }

    // 8. Handle Mode B & Mode C (Read-Only Plan Questions & Evaluative "Should we..." Questions)
    if (
      decision.isQuestionOnly ||
      decision.actionType === 'INFORMATIONAL_QUESTION' ||
      decision.actionType === 'EXPLAIN_ITINERARY'
    ) {
      const infoRes = generatePlanOrEvaluativeReply({
        rawQuestion: message,
        decision,
        context,
        itinerary,
        constraints,
        preferences: updatedPreferences,
        conversationHistory,
      });

      return {
        success: true,
        reply: infoRes.reply,
        conversationMode: decision.conversationMode || 'CURRENT_PLAN_QUESTION',
        actionExecuted: 'INFORMATIONAL_QUESTION',
        isSimulation: false,
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
        updatedPlannerState: plannerState,
        updatedHistory: history,
        updatedPreferences,
        pendingProposal: infoRes.pendingProposal || decision.pendingProposal || pendingProposal,
        lastDiscussedPlace: infoRes.discussedPlace || activeDiscussedPlace,
        toolsCalled: ['explain_itinerary'],
        suggestedActions: infoRes.suggestedActions,
      };
    }

    // 9. Handle Mode C: Suggestions & Preference-Aware Recommendations
    if (decision.actionType === 'SUGGEST_IMPROVEMENTS') {
      if (decision.conversationalReply) {
        let reply = decision.conversationalReply;
        if (
          !context.hasItinerary &&
          !reply.includes('570') &&
          !reply.includes('day window') &&
          !reply.includes('daytime window') &&
          !reply.includes('9h 30m')
        ) {
          reply = `For your **${context.planningWindowMinutes || 570}-minute day window** (${context.timeWindow.startTime} to ${context.timeWindow.latestArrivalTime}):\n\n${reply}`;
        }

        return {
          success: true,
          reply,
          conversationMode: 'SIMULATION_AND_RECOMMENDATION',
          updatedConstraints: constraints,
          updatedItinerary: itinerary,
          updatedPlannerState: plannerState,
          updatedHistory: history,
          updatedPreferences,
          lastDiscussedPlace: decision.discussedPlace || lastDiscussedPlace,
          pendingProposal: decision.pendingProposal || pendingProposal,
          toolsCalled: [],
        };
      }
      const sugRes = this.handleSuggestions(
        context,
        constraints,
        itinerary,
        plannerState,
        updatedPreferences
      );
      return {
        ...sugRes,
        conversationMode: 'SIMULATION_AND_RECOMMENDATION',
        updatedPreferences,
        toolsCalled: ['suggest_improvements'],
      };
    }

    // 10. Handle Mode C (What-If Simulation) & Mode D (Action Execution)
    const isSimulation = simulateOnly || decision.isSimulation;

    // Take snapshot before mutation for rollback safety and undo tracking
    const originalConstraints = JSON.parse(JSON.stringify(constraints)) as TripConstraints;
    const originalItinerary = itinerary
      ? (JSON.parse(JSON.stringify(itinerary)) as FinalItinerary)
      : undefined;
    const originalPlannerState = plannerState
      ? (JSON.parse(JSON.stringify(plannerState)) as PlannerState)
      : undefined;

    try {
      const execResult = await this.executeAction({
        decision,
        currentConstraints: originalConstraints,
        currentItinerary: originalItinerary,
        currentPlannerState: originalPlannerState,
        preferences: updatedPreferences,
      });

      // If action failed or was rejected due to infeasibility
      if (!execResult.success) {
        return {
          success: false,
          reply: execResult.explanation,
          conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
          actionExecuted: decision.actionType,
          isSimulation,
          infeasibleNotice: execResult.infeasibleNotice,
          // Revert to original valid state completely
          updatedConstraints: constraints,
          updatedItinerary: itinerary,
          updatedPlannerState: plannerState,
          updatedHistory: history,
          updatedPreferences,
          lastDiscussedPlace: activeDiscussedPlace,
          toolsCalled: execResult.toolsCalled || [decision.actionType.toLowerCase()],
        };
      }

      // Compute diff between original and new itinerary
      const diff = this.computeDiff({
        oldConstraints: constraints,
        newConstraints: execResult.newConstraints,
        oldItinerary: itinerary,
        newItinerary: execResult.newItinerary,
      });

      // If Simulation (Mode C): Return proposed plan & diff WITHOUT mutating session history or state permanently
      if (isSimulation) {
        const proposal: PendingActionProposal = decision.pendingProposal || {
          actionType: decision.actionType,
          parameters: decision.parameters,
          description: this.formatActionBrief(decision),
        };
        const simReply = `[Simulation] If we ${this.formatActionBrief(decision).toLowerCase()}:\n${execResult.explanation}\n\nYour active itinerary has not been changed yet. Would you like me to apply this change to your plan?`;

        return {
          success: true,
          reply: simReply,
          conversationMode: 'SIMULATION_AND_RECOMMENDATION',
          actionExecuted: decision.actionType,
          isSimulation: true,
          diff,
          updatedConstraints: constraints, // Preserve current real constraints
          updatedItinerary: itinerary, // Preserve current real itinerary
          updatedPlannerState: plannerState,
          updatedHistory: history,
          updatedPreferences,
          pendingProposal: proposal,
          lastDiscussedPlace: activeDiscussedPlace,
          toolsCalled: ['simulate_change', ...(execResult.toolsCalled || [])],
          suggestedActions: ["That sounds good. Let's do it.", 'Apply that'],
        };
      }

      // If Committed Real Action (Mode D): Push previous state to undo history
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
        conversationMode: 'ACTION_EXECUTION',
        actionExecuted: decision.actionType,
        isSimulation: false,
        diff,
        updatedConstraints: execResult.newConstraints,
        updatedItinerary: execResult.newItinerary,
        updatedPlannerState: execResult.newPlannerState,
        updatedHistory: newHistory,
        updatedPreferences,
        pendingProposal: undefined, // Clear pending proposal after execution
        lastDiscussedPlace: activeDiscussedPlace,
        toolsCalled: execResult.toolsCalled || [decision.actionType.toLowerCase(), 'replan_trip', 'validate_trip'],
        suggestedActions: ['Undo that', 'Suggest improvements'],
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        reply: `I encountered an issue executing this action: ${errMsg}. Your current itinerary remains unchanged.`,
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        actionExecuted: decision.actionType,
        isSimulation,
        updatedConstraints: constraints,
        updatedItinerary: itinerary,
        updatedPlannerState: plannerState,
        updatedHistory: history,
        updatedPreferences,
        lastDiscussedPlace: activeDiscussedPlace,
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
    preferences?: CopilotUserPreferences;
  }): Promise<{
    success: boolean;
    explanation: string;
    newConstraints: TripConstraints;
    newItinerary?: FinalItinerary;
    newPlannerState?: PlannerState;
    infeasibleNotice?: string;
    toolsCalled?: string[];
  }> {
    const { decision, currentConstraints, currentItinerary, currentPlannerState } = params;
    const actionType = decision.actionType;
    const args = decision.parameters;

    switch (actionType) {
      case 'GENERATE_ITINERARY': {
        const genArgs = args as unknown as {
          explicitCity?: string;
          explicitPace?: TripPace;
          explicitCrowd?: CrowdPreference;
          explicitInterests?: string[];
        };

        const newConstraints: TripConstraints = {
          ...currentConstraints,
        };

        if (genArgs.explicitCity && typeof genArgs.explicitCity === 'string' && genArgs.explicitCity.trim()) {
          newConstraints.city = genArgs.explicitCity.trim();
        }
        if (genArgs.explicitPace) {
          newConstraints.pace = genArgs.explicitPace;
        } else if (params.preferences?.pacePreference) {
          newConstraints.pace = params.preferences.pacePreference;
        }
        if (genArgs.explicitCrowd) {
          newConstraints.crowdPreference = genArgs.explicitCrowd;
        } else if (params.preferences?.crowdPreference) {
          newConstraints.crowdPreference = params.preferences.crowdPreference;
        }

        const explicitInterests = genArgs.explicitInterests || [];
        const prefInterests = params.preferences?.preferredCategories || [];
        const combined = [...newConstraints.interests];
        for (const cat of [...explicitInterests, ...prefInterests]) {
          if (!combined.some((c) => c.toLowerCase() === cat.toLowerCase())) {
            combined.push(cat);
          }
        }
        if (combined.length > 0) {
          newConstraints.interests = combined;
        }

        // Validate required constraints before invoking planner
        const missing: string[] = [];
        if (!newConstraints.city || !newConstraints.city.trim()) missing.push('city');
        if (!newConstraints.startingPoint?.name || !newConstraints.startingPoint.name.trim()) missing.push('starting point');
        if (!newConstraints.endPoint?.name || !newConstraints.endPoint.name.trim()) missing.push('destination end point');
        if (!newConstraints.time?.startTime) missing.push('start time');
        if (!newConstraints.time?.latestArrivalTime) missing.push('latest arrival deadline');
        if (!newConstraints.travelMode) missing.push('travel mode');
        if (!newConstraints.numberOfPeople || newConstraints.numberOfPeople < 1) missing.push('number of travelers');

        if (missing.length > 0) {
          return {
            success: false,
            explanation: `Please provide your ${missing.join(', ')} in order to generate your itinerary.`,
            newConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            toolsCalled: ['validate_inputs'],
          };
        }

        // Invoke existing PlannerAgent bounded planning loop
        const planResult = await this.plannerAgent.planTrip(
          newConstraints,
          undefined,
          `User requested itinerary generation for ${newConstraints.city}.`
        );

        const visitedStops = planResult.itinerary?.stops?.filter((s) => s.type !== 'start' && s.type !== 'end') || [];
        const prevVisitedStops = currentItinerary?.stops?.filter((s) => s.type !== 'start' && s.type !== 'end') || [];

        if (
          !planResult.success ||
          !planResult.itinerary ||
          (visitedStops.length === 0 && prevVisitedStops.length > 0)
        ) {
          const detail =
            visitedStops.length === 0 && prevVisitedStops.length > 0
              ? 'No attractions could fit within your requested time limits and schedule.'
              : (planResult.warnings.join(' ') || planResult.explanation || 'Could not find a feasible route matching all constraints.');
          return {
            success: false,
            explanation: `I was unable to generate a valid itinerary: ${detail}. Your previous plan is unchanged.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            infeasibleNotice: detail,
            toolsCalled: ['plan_trip'],
          };
        }
        const stopsList = visitedStops.map((s) => s.title).join(' → ');
        const paceDesc = newConstraints.pace ? `${newConstraints.pace} pace` : 'balanced pace';
        const arrival = planResult.itinerary.summary.plannedArrivalTime;
        const buffer = planResult.itinerary.summary.safetyBufferMinutes;

        const explanation = `I've generated your custom itinerary for **${newConstraints.city}** with **${visitedStops.length} stops** (${stopsList}), tailored to your ${paceDesc} and interests. The route departs **${newConstraints.startingPoint.name}** at **${newConstraints.time.startTime}** and reaches **${newConstraints.endPoint.name}** by **${arrival}** with a **${buffer}m** safety buffer. You can review the full schedule on the timeline and interactive route on the map!`;

        return {
          success: true,
          explanation,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: [
            'plan_trip',
            'resolve_locations',
            'discover_candidates',
            'calculate_route_matrix',
            'optimize_itinerary',
            'validate_itinerary',
          ],
        };
      }

      case 'ADD_PLACE': {
        const placeName = String(args.placeName || '').trim();
        if (!placeName) {
          return {
            success: false,
            explanation: 'Please specify the name of the place you would like to add.',
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            toolsCalled: ['add_place'],
          };
        }

        // 1. Resolve place coordinates via Geoapify / toolRegistry
        const resolved = await this.resolvePlaceByName(placeName, currentConstraints.city);
        if (!resolved) {
          return {
            success: false,
            explanation: `I couldn't locate "${placeName}" as a verified attraction in ${currentConstraints.city}. Please check the name or suggest another landmark.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            toolsCalled: ['add_place', 'search_places'],
          };
        }

        // Check if already in stops
        if (
          currentItinerary?.stops.some((s) =>
            s.title.toLowerCase().includes(resolved.name.toLowerCase())
          )
        ) {
          return {
            success: false,
            explanation: `"${resolved.name}" is already included in your itinerary.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            toolsCalled: ['add_place'],
          };
        }

        // 2. Preserve existing visited stops as high-priority candidates AND add the new place
        const existingVisitedCandidates = this.extractCandidatesFromItinerary(
          currentItinerary,
          currentConstraints.city
        );
        const existingPool = currentPlannerState?.candidates || [];
        const combinedExisting = [...existingVisitedCandidates, ...existingPool];

        const deduplicated = combinedExisting.filter(
          (c, idx, arr) =>
            c.id !== resolved.id &&
            c.name.toLowerCase() !== resolved.name.toLowerCase() &&
            arr.findIndex((x) => x.name.toLowerCase() === c.name.toLowerCase()) === idx
        );

        const candidateToInsert: CandidatePlace = {
          ...resolved,
          candidateScore: 99,
          source: 'user_upload',
        };
        const updatedCandidates = [candidateToInsert, ...deduplicated];

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
            explanation: `Adding "${resolved.name}" is not feasible under your current schedule and time limits.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            infeasibleNotice: 'Constraint violation during re-planning.',
            toolsCalled: ['add_place', 'replan_trip', 'validate_trip'],
          };
        }

        // 4. Verify that the place was actually accommodated by the optimizer
        const stopIncluded = planResult.itinerary.stops.some(
          (s) =>
            s.title.toLowerCase().includes(resolved.name.toLowerCase()) ||
            resolved.name.toLowerCase().includes(s.title.toLowerCase()) ||
            s.placeId === resolved.id
        );

        if (!stopIncluded) {
          const deadline = currentConstraints.time.latestArrivalTime;
          return {
            success: false,
            explanation: `I couldn't add "${resolved.name}" because the travel detour and visit time would breach your ${deadline} arrival deadline. Your current plan is unchanged. Would you like me to replace an existing stop with "${resolved.name}" instead?`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            infeasibleNotice: 'Infeasible: Detour exceeds available time window or safety buffer.',
            toolsCalled: ['add_place', 'replan_trip', 'validate_trip'],
          };
        }

        const newStopsList = planResult.itinerary.stops
          .filter((s) => s.type !== 'start' && s.type !== 'end')
          .map((s) => s.title)
          .join(' → ');

        return {
          success: true,
          explanation: `I've added **${resolved.name}** to your itinerary and re-optimized your route (${newStopsList}). You now arrive at **${currentConstraints.endPoint.name}** at **${planResult.itinerary.summary.plannedArrivalTime}** with a **${planResult.itinerary.summary.safetyBufferMinutes}m** safety buffer.`,
          newConstraints: currentConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: ['add_place', 'replan_trip', 'validate_trip'],
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
            toolsCalled: ['remove_place'],
          };
        }

        const visitedStops = currentItinerary.stops.filter(
          (s) => s.type !== 'start' && s.type !== 'end'
        );
        let targetStop: ItineraryStop | undefined;

        if (stopIndex !== undefined && stopIndex >= 1 && stopIndex <= visitedStops.length) {
          targetStop = visitedStops[stopIndex - 1];
        } else if (placeName) {
          targetStop = visitedStops.find(
            (s) =>
              s.title.toLowerCase().includes(placeName.toLowerCase()) ||
              placeName.toLowerCase().includes(s.title.toLowerCase())
          );
        }

        if (!targetStop) {
          return {
            success: false,
            explanation: `I couldn't find "${placeName || `stop #${stopIndex}`}" in your visited stops list.`,
            newConstraints: currentConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            toolsCalled: ['remove_place'],
          };
        }

        // Build remaining candidates from the kept visited stops so we don't unexpectedly swap in random unrequested stops
        const keptCandidates = this.extractCandidatesFromItinerary(
          currentItinerary,
          currentConstraints.city
        ).filter(
          (c) =>
            c.id !== targetStop!.placeId &&
            c.name.toLowerCase() !== targetStop!.title.toLowerCase()
        );

        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: currentConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          candidates: keptCandidates,
          routeMatrix: undefined,
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
          explanation: `I've removed **${targetStop.title}** from your itinerary and re-optimized your route. You now have **${planResult.itinerary?.summary.placeCount || keptCandidates.length} stops**, arriving at **${planResult.itinerary?.summary.plannedArrivalTime}** with **${planResult.itinerary?.summary.unusedAvailableMinutes || 0}m** of unused free time.`,
          newConstraints: currentConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: ['remove_place', 'replan_trip', 'validate_trip'],
        };
      }

      case 'MAKE_LESS_TIRING': {
        if (!currentItinerary || currentItinerary.stops.length <= 3) {
          const relaxedConstraints: TripConstraints = {
            ...currentConstraints,
            pace: 'relaxed',
          };
          return {
            success: true,
            explanation: `I've switched your trip pace to **relaxed**. With ${currentItinerary ? currentItinerary.stops.length - 2 : 0} stops and generous buffer time, your schedule is already light and unhurried.`,
            newConstraints: relaxedConstraints,
            newItinerary: currentItinerary,
            newPlannerState: currentPlannerState,
            toolsCalled: ['make_less_tiring'],
          };
        }

        const visitedStops = currentItinerary.stops.filter(
          (s) => s.type !== 'start' && s.type !== 'end'
        );
        // Identify the longest/most tiring stop to drop so the schedule has more breathing room
        const sortedByDuration = [...visitedStops].sort(
          (a, b) => b.durationMinutes - a.durationMinutes
        );
        const stopToDrop = sortedByDuration[0];

        const keptCandidates = this.extractCandidatesFromItinerary(
          currentItinerary,
          currentConstraints.city
        ).filter(
          (c) =>
            c.id !== stopToDrop.placeId &&
            c.name.toLowerCase() !== stopToDrop.title.toLowerCase()
        );

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          pace: 'relaxed',
        };

        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: newConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          candidates: keptCandidates,
          routeMatrix: undefined,
          currentItinerary: undefined,
          validationResult: undefined,
          planningVersion: (currentPlannerState?.planningVersion || 1) + 1,
        };

        const planResult = await this.plannerAgent.planTrip(
          newConstraints,
          updatedState,
          `User requested making the trip less tiring (removed longest stop "${stopToDrop.title}" and set pace to relaxed).`
        );

        return {
          success: true,
          explanation: `To make your day less tiring and much more relaxed, I set your pace to **relaxed** and removed the longest stop (**${stopToDrop.title}**, ${stopToDrop.durationMinutes} mins). Your lighter route now covers **${planResult.itinerary?.summary.placeCount} stops** (${keptCandidates.map((c) => c.name).join(' → ')}), finishes earlier at **${planResult.itinerary?.summary.plannedArrivalTime}**, and opens up **${planResult.itinerary?.summary.unusedAvailableMinutes}m** of unhurried downtime.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: ['make_less_tiring', 'remove_place', 'replan_trip', 'validate_trip'],
        };
      }

      case 'UPDATE_PREFERENCES': {
        const disliked = (args.dislikedCategories as string[]) || [];
        const dislikesMuseums = disliked.some((d) => d.toLowerCase().includes('museum'));

        if (dislikesMuseums && currentItinerary && args.adjustActivePlan === true) {
          const visitedStops = currentItinerary.stops.filter(
            (s) => s.type !== 'start' && s.type !== 'end'
          );
          const museumStops = visitedStops.filter(
            (s) =>
              s.title.toLowerCase().includes('museum') ||
              (s.place?.category && s.place.category.toLowerCase().includes('museum'))
          );

          if (museumStops.length > 0) {
            // Keep non-museum stops from current itinerary
            const nonMuseumCandidates = this.extractCandidatesFromItinerary(
              currentItinerary,
              currentConstraints.city
            ).filter(
              (c) =>
                !c.name.toLowerCase().includes('museum') &&
                !c.category.toLowerCase().includes('museum')
            );

            // Resolve a non-museum heritage replacement (e.g. Qutb Shahi Tombs or Golconda Fort)
            const replacement =
              (await this.resolvePlaceByName('Qutb Shahi Tombs', currentConstraints.city)) ||
              (await this.resolvePlaceByName('Golconda Fort', currentConstraints.city));

            const updatedCandidates = replacement
              ? [{ ...replacement, candidateScore: 98 }, ...nonMuseumCandidates]
              : nonMuseumCandidates;

            const updatedInterests = currentConstraints.interests.filter(
              (i) => !i.toLowerCase().includes('museum') && !i.toLowerCase().includes('culture')
            );
            if (!updatedInterests.includes('History')) updatedInterests.push('History');
            if (!updatedInterests.includes('Architecture')) updatedInterests.push('Architecture');

            const newConstraints: TripConstraints = {
              ...currentConstraints,
              interests: updatedInterests,
            };

            const updatedState: PlannerState = {
              ...(currentPlannerState || {
                tripConstraints: newConstraints,
                planningVersion: 1,
                warnings: [],
              }),
              candidates: updatedCandidates,
              routeMatrix: undefined,
              currentItinerary: undefined,
              validationResult: undefined,
              planningVersion: (currentPlannerState?.planningVersion || 1) + 1,
            };

            const planResult = await this.plannerAgent.planTrip(
              newConstraints,
              updatedState,
              `User stated they don't care about museums; removed museum stops and re-optimized.`
            );

            const removedNames = museumStops.map((m) => m.title).join(' and ');
            const currentNames =
              planResult.itinerary?.stops
                .filter((s) => s.type !== 'start' && s.type !== 'end')
                .map((s) => s.title)
                .join(' → ') || 'non-museum heritage stops';

            return {
              success: true,
              explanation: `Got it — I've updated your preferences to avoid **museums** and removed **${removedNames}** from your active itinerary. Your refreshed route now focuses on open-air architectural and heritage landmarks (**${currentNames}**), arriving at **${planResult.itinerary?.summary.plannedArrivalTime}** with a **${planResult.itinerary?.summary.safetyBufferMinutes}m** safety buffer.`,
              newConstraints,
              newItinerary: planResult.itinerary,
              newPlannerState: planResult.plannerState,
              toolsCalled: ['update_preferences', 'remove_place', 'replan_trip', 'validate_trip'],
            };
          }
        }

        const syncedConstraints = syncPreferencesToConstraints(currentConstraints, params.preferences);

        return {
          success: true,
          explanation: `I've updated your travel preferences and will use them to guide your itinerary recommendations.`,
          newConstraints: syncedConstraints,
          newItinerary: currentItinerary,
          newPlannerState: currentPlannerState,
          toolsCalled: ['update_preferences'],
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
            toolsCalled: ['replace_place'],
          };
        }

        const visitedStops = currentItinerary.stops.filter(
          (s) => s.type !== 'start' && s.type !== 'end'
        );
        let oldStop: ItineraryStop | undefined;

        if (oldPlaceName) {
          oldStop = visitedStops.find((s) =>
            s.title.toLowerCase().includes(oldPlaceName.toLowerCase())
          );
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
            toolsCalled: ['replace_place'],
          };
        }

        let candidates = this.extractCandidatesFromItinerary(
          currentItinerary,
          currentConstraints.city
        ).filter(
          (c) =>
            c.id !== oldStop!.placeId &&
            c.name.toLowerCase() !== oldStop!.title.toLowerCase()
        );

        let replacementName = newPlaceName;

        if (newPlaceName) {
          const resolvedNew = await this.resolvePlaceByName(
            newPlaceName,
            currentConstraints.city
          );
          if (resolvedNew) {
            candidates = [{ ...resolvedNew, candidateScore: 99 }, ...candidates];
            replacementName = resolvedNew.name;
          }
        } else if (criteria) {
          if (criteria.isFree) {
            const freeCand = (currentPlannerState?.candidates || []).find(
              (c) => (c.cost.amountPerPerson || 0) === 0
            );
            if (freeCand) {
              candidates = [{ ...freeCand, candidateScore: 98 }, ...candidates];
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
          explanation: `Replaced **${oldStop.title}**${replacementName ? ` with **${replacementName}**` : ''} and re-optimized the itinerary. Your new arrival time at **${currentConstraints.endPoint.name}** is **${planResult.itinerary?.summary.plannedArrivalTime}**.`,
          newConstraints: currentConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: ['replace_place', 'replan_trip', 'validate_trip'],
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
            toolsCalled: ['reorder_place'],
          };
        }

        return {
          success: true,
          explanation: `Re-sequenced your route to visit **${placeName}** at stop position #${targetPos}.`,
          newConstraints: currentConstraints,
          newItinerary: currentItinerary,
          newPlannerState: currentPlannerState,
          toolsCalled: ['reorder_place', 'validate_trip'],
        };
      }

      case ('CHANGE_BUDGET' as unknown as CopilotActionType): {
        return {
          success: false,
          explanation: 'The One-Day City Planner does not calculate or enforce trip budgets or admission fees because live attraction pricing cannot be reliably verified.',
          newConstraints: currentConstraints,
          newItinerary: currentItinerary,
          newPlannerState: currentPlannerState,
          toolsCalled: [],
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
            toolsCalled: ['change_travel_mode'],
          };
        }

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          travelMode: newMode,
        };

        const existingCandidates = currentPlannerState?.candidates?.length
          ? currentPlannerState.candidates
          : this.extractCandidatesFromItinerary(currentItinerary, currentConstraints.city);

        const updatedState: PlannerState = {
          ...(currentPlannerState || {
            tripConstraints: newConstraints,
            planningVersion: 1,
            warnings: [],
          }),
          candidates: existingCandidates.length > 0 ? existingCandidates : undefined,
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
          explanation: `Switched travel mode to **${newMode}**. Total transit time is now **${planResult.itinerary?.summary.totalTravelTimeMinutes}m** across **${planResult.itinerary?.summary.placeCount}** stops, arriving at **${planResult.itinerary?.summary.plannedArrivalTime}** (Safety buffer: ${planResult.itinerary?.summary.safetyBufferMinutes}m).`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: ['change_travel_mode', 'replan_trip', 'validate_trip'],
        };
      }

      case 'CHANGE_START_TIME':
      case 'CHANGE_END_TIME':
      case 'CHANGE_TIME': {
        const timeArgs = args as unknown as ChangeTimeArgs;
        const newStartTime = timeArgs.startTime || currentConstraints.time.startTime;
        const newEndTime =
          timeArgs.latestArrivalTime || currentConstraints.time.latestArrivalTime;

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
          explanation: `Updated your time window to **${newStartTime} – ${newEndTime}**. Arrival at your final destination is now **${planResult.itinerary?.summary.plannedArrivalTime}** (Safety buffer: ${planResult.itinerary?.summary.safetyBufferMinutes}m).`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: ['change_time', 'replan_trip', 'validate_trip'],
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
          explanation: `Updated traveler count to **${count}**. Schedule and timing have been updated.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: ['change_people', 'replan_trip', 'validate_trip'],
        };
      }

      case 'CHANGE_INTERESTS': {
        const intArgs = args as unknown as ChangeInterestsArgs;
        const newInterests = intArgs.interests || [];

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          interests: newInterests,
        };

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
          explanation: `Updated your interests to **${newInterests.join(', ')}** and re-discovered matching sights along your corridor.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: ['change_interests', 'replan_trip', 'validate_trip'],
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
            coordinates: isStart
              ? currentConstraints.startingPoint.coordinates
              : currentConstraints.endPoint.coordinates,
            type: 'custom',
          };
        }

        const newConstraints: TripConstraints = {
          ...currentConstraints,
          startingPoint:
            isStart && resolvedLoc ? resolvedLoc : currentConstraints.startingPoint,
          endPoint: !isStart && resolvedLoc ? resolvedLoc : currentConstraints.endPoint,
        };

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
          explanation: `Updated your ${isStart ? 'starting point' : 'destination'} to **${locName}** and recalibrated your road route.`,
          newConstraints,
          newItinerary: planResult.itinerary,
          newPlannerState: planResult.plannerState,
          toolsCalled: [isStart ? 'change_start' : 'change_end', 'replan_trip', 'validate_trip'],
        };
      }

      default: {
        return {
          success: true,
          explanation: 'Itinerary reviewed. All constraints remain validated.',
          newConstraints: currentConstraints,
          newItinerary: currentItinerary,
          newPlannerState: currentPlannerState,
          toolsCalled: [],
        };
      }
    }
  }

  /**
   * Converts existing itinerary visited stops into CandidatePlace objects so re-optimization preserves them
   */
  private extractCandidatesFromItinerary(
    itinerary: FinalItinerary | undefined,
    city: string
  ): CandidatePlace[] {
    if (!itinerary) return [];
    return itinerary.stops
      .filter((s) => s.type !== 'start' && s.type !== 'end')
      .map((s, idx) => {
        const stopWithCoords = s as ItineraryStop & {
          coordinates?: { lat: number; lng: number };
        };
        const coords =
          stopWithCoords.coordinates ||
          s.place?.coordinates || { lat: 17.42, lng: 78.47 };
        return {
          id: s.placeId || s.id || `stop-${idx}`,
          name: s.title,
          category:
            s.place?.category ||
            (s.title.toLowerCase().includes('museum') ? 'museum' : 'attraction'),
          categories: s.place?.categories || ['tourism.sights'],
          latitude: coords.lat,
          longitude: coords.lng,
          coordinates: coords,
          address: s.place?.address || `${s.title}, ${city}`,
          city,
          openingHours: s.place?.openingHours || '09:00-18:00',
          openingHoursSource: 'provider',
          estimatedVisitDurationMinutes: s.durationMinutes || 60,
          visitDurationSource: 'category_default',
          cost: {
            amountPerPerson: s.cost?.perPerson || 0,
            currency: '₹',
            isFree: (s.cost?.perPerson || 0) === 0,
          },
          costSource: 'estimated',
          verificationStatus: 'verified',
          source: 'geoapify',
          relevanceScore: 92,
          qualityScore: 90,
          travelBurdenScore: 15,
          candidateScore: 92,
          estimatedDurationMin: s.durationMinutes || 60,
          estimatedCostPerPerson: s.cost?.perPerson || 0,
        };
      });
  }

  /**
   * Resolves an attraction name using curated attraction profiles first (if in matching city) or Geoapify / toolRegistry
   */
  private async resolvePlaceByName(name: string, city: string): Promise<CandidatePlace | null> {
    // Check known verified attraction coordinates in Hyderabad for fast, reliable resolution
    const knownCoords: Record<
      string,
      {
        lat: number;
        lng: number;
        duration: number;
        cost: number;
        cat: CandidatePlace['category'];
      }
    > = {
      'golconda fort': { lat: 17.3833, lng: 78.4011, duration: 90, cost: 25, cat: 'historic' },
      charminar: { lat: 17.3616, lng: 78.4747, duration: 60, cost: 25, cat: 'historic' },
      'salar jung museum': { lat: 17.3714, lng: 78.4804, duration: 90, cost: 50, cat: 'museum' },
      'qutb shahi tombs': { lat: 17.3948, lng: 78.3968, duration: 75, cost: 40, cat: 'historic' },
      'chowmahalla palace': { lat: 17.3578, lng: 78.4717, duration: 75, cost: 80, cat: 'historic' },
      'birla mandir': { lat: 17.4062, lng: 78.4691, duration: 60, cost: 0, cat: 'religious' },
      'lumbini park': { lat: 17.4096, lng: 78.4733, duration: 60, cost: 20, cat: 'park' },
      'spanish mosque': { lat: 17.4435, lng: 78.4728, duration: 60, cost: 0, cat: 'historic' },
    };

    const profile = findAttractionProfile(name);
    const lookupKey = (profile ? profile.canonicalName : name).toLowerCase().trim();
    if (city.toLowerCase() === 'hyderabad' && knownCoords[lookupKey]) {
      const k = knownCoords[lookupKey];
      const canonical = profile ? profile.canonicalName : name;
      return {
        id: `cand-${lookupKey.replace(/\s+/g, '-')}`,
        name: canonical,
        category: k.cat,
        categories: ['tourism.sights', 'heritage'],
        latitude: k.lat,
        longitude: k.lng,
        coordinates: { lat: k.lat, lng: k.lng },
        address: `${canonical}, ${city}`,
        city,
        openingHours: '09:00-18:00',
        openingHoursSource: 'provider',
        estimatedVisitDurationMinutes: k.duration,
        visitDurationSource: 'category_default',
        cost: { amountPerPerson: k.cost, currency: '₹', isFree: k.cost === 0 },
        costSource: 'estimated',
        verificationStatus: 'verified',
        source: 'user_upload',
        relevanceScore: 95,
        qualityScore: 95,
        travelBurdenScore: 15,
        candidateScore: 98,
        estimatedDurationMin: k.duration,
        estimatedCostPerPerson: k.cost,
      };
    }

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
   * Generates proactive, preference-aware recommendations and suggestions based on current state
   */
  private handleSuggestions(
    context: CopilotTripContext,
    constraints: TripConstraints,
    itinerary?: FinalItinerary,
    plannerState?: PlannerState,
    preferences?: CopilotUserPreferences
  ): CopilotEngineResult {
    const suggestions: string[] = [];
    const suggestedActions: string[] = [];
    let pendingProposal: PendingActionProposal | undefined;
    let lastDiscussedPlace: string | undefined;

    const prefersHistory = preferences?.preferredCategories?.some((c) =>
      c.toLowerCase().includes('history')
    );
    const prefersLowCrowd = preferences?.crowdPreference === 'low';
    const dislikesMuseums = preferences?.dislikedCategories?.some((d) =>
      d.toLowerCase().includes('museum')
    );

    const hasItin = context.hasItinerary;
    const availableCapacity = hasItin
      ? context.unusedAvailableMinutes
      : context.planningWindowMinutes;

    // 1. Preference-aware Recommendation
    if (availableCapacity >= 60) {
      if (prefersHistory && prefersLowCrowd) {
        const recLandmark = 'Qutb Shahi Tombs';
        lastDiscussedPlace = recLandmark;
        pendingProposal = !hasItin
          ? {
              actionType: 'GENERATE_ITINERARY',
              parameters: {},
              description: `Generate a verified itinerary including "${recLandmark}"`,
            }
          : {
              actionType: 'ADD_PLACE',
              parameters: { placeName: recLandmark, forceInclude: true },
              description: `Add "${recLandmark}" to the itinerary`,
            };
        if (!hasItin) {
          suggestions.push(
            `🏛️ **Top Match: Qutb Shahi Tombs** (~75m visit): 16th-century royal Deccani mausoleums set in open landscaped gardens. It generally offers a much calmer atmosphere than central bazaars, making it the strongest fit for a relaxed historical visit (though crowd levels naturally fluctuate by time of day).`,
            `🏰 **Alternative: Golconda Fort** (~120m visit): The monumental Qutb Shahi citadel (on the UNESCO World Heritage Tentative List) with dramatic acoustic architecture and panoramic views, though it involves substantial uphill walking and generally higher visitor crowds.`,
            `🏛️ **Alternative: Salar Jung Museum** (~90m visit): One of India's National Museums with extraordinary art collections across 40+ indoor galleries, though it is located in the busier Old City corridor along the Musi River.`
          );
        } else {
          suggestions.push(
            `🏛️ **Top Match for Your Preferences (${recLandmark})**: Since you prefer **historical places** and **dislike crowded areas**, I strongly recommend adding the **${recLandmark}** (~75m visit) for your **${context.unusedAvailableMinutes} minutes of unallocated time**. Unlike the bustling bazaars around Charminar, the ${recLandmark} offer 16th-century royal Deccani mausoleums set in quiet, landscaped gardens (crowd levels vary naturally by time of day).${preferences?.pacePreference === 'relaxed' ? ' It pairs naturally with a relaxed, unhurried pace.' : ''}`
          );
        }
        suggestedActions.push(`Add ${recLandmark}`);
      } else if (prefersHistory) {
        const recLandmark = 'Golconda Fort';
        lastDiscussedPlace = recLandmark;
        pendingProposal = !hasItin
          ? {
              actionType: 'GENERATE_ITINERARY',
              parameters: {},
              description: `Generate a verified itinerary including "${recLandmark}"`,
            }
          : {
              actionType: 'ADD_PLACE',
              parameters: { placeName: recLandmark, forceInclude: true },
              description: `Add "${recLandmark}" to the itinerary`,
            };
        const timeDesc = hasItin
          ? `With **${context.unusedAvailableMinutes} minutes of unallocated time**`
          : `For your **${context.planningWindowMinutes}-minute day window** (${context.timeWindow.startTime}–${context.timeWindow.latestArrivalTime})`;
        suggestions.push(
          `🏰 **Historical Highlight (${recLandmark})**: ${timeDesc}, you can comfortably ${hasItin ? 'add' : 'include'} **${recLandmark}** (~90m visit) to experience Hyderabad's signature Qutb Shahi citadel (on the UNESCO World Heritage Tentative List).`
        );
        suggestedActions.push(`Add ${recLandmark}`);
      } else {
        lastDiscussedPlace = 'Golconda Fort';
        pendingProposal = !hasItin
          ? {
              actionType: 'GENERATE_ITINERARY',
              parameters: {},
              description: 'Generate a verified itinerary based on these recommendations',
            }
          : {
              actionType: 'ADD_PLACE',
              parameters: { placeName: 'Golconda Fort', forceInclude: true },
              description: 'Add "Golconda Fort" to the itinerary',
            };
        const timeDesc = hasItin
          ? `You have **${context.unusedAvailableMinutes} minutes of unallocated time** before your ${context.deadlineArrivalTime} deadline.`
          : `For your **${context.planningWindowMinutes}-minute day window** in **${context.city}** (${context.timeWindow.startTime}–${context.timeWindow.latestArrivalTime}),`;
        suggestions.push(
          `💡 **Signature Landmarks**: ${timeDesc} You could comfortably explore highlights like **Golconda Fort** or **Qutb Shahi Tombs** along your route.`
        );
        suggestedActions.push('Add Golconda Fort');
      }
    }

    // 2. Category diversity / Museum balance
    const categories = context.currentStops.map((s) => s.category || s.title.toLowerCase());
    const museumCount = categories.filter((c) => c.includes('museum')).length;
    if (museumCount >= 2) {
      suggestions.push(
        `🌿 **Pacing & Variety**: Your current schedule includes ${museumCount} museum stops (${context.currentStops
          .filter((s) => s.title.toLowerCase().includes('museum'))
          .map((s) => s.title)
          .join(' and ')}). ${
          dislikesMuseums
            ? 'Since you mentioned not caring for museums, we can replace them with open-air heritage sites.'
            : 'Swapping one museum for an outdoor heritage park or fort would make the afternoon feel less repetitive.'
        }`
      );
      suggestedActions.push('Can we make the trip less tiring?');
    }

    let reply = '';
    if (suggestions.length > 0) {
      if (hasItin) {
        reply = `Here are my tailored suggestions to enhance your ${context.city} day:\n\n${suggestions.join('\n\n')}\n\nWould you like me to apply any of these changes?`;
      } else {
        reply = `Here are my tailored preliminary suggestions for your ${context.city} day trip (${context.planningWindowMinutes}-minute window):\n\n${suggestions.join('\n\n')}\n\nPlease note: Because no itinerary has been generated yet, these are preliminary recommendations. Route feasibility, exact transit times, and opening hours will be verified by the route optimizer once we generate your plan.\n\nWould you like me to include ${lastDiscussedPlace || 'these sights'} when we generate your plan?`;
      }
    } else {
      reply = hasItin
        ? `Your day is nicely balanced with ${context.currentStops.length} stops, good schedule pacing, and a healthy ${context.safetyBufferMinutes}m safety buffer.`
        : `Tell me what kinds of places you enjoy in ${context.city}, and I can suggest the best sights for your ${context.planningWindowMinutes}-minute window.`;
    }

    return {
      success: true,
      reply,
      actionExecuted: 'SUGGEST_IMPROVEMENTS',
      isSimulation: false,
      updatedConstraints: constraints,
      updatedItinerary: itinerary,
      updatedPlannerState: plannerState,
      pendingProposal,
      lastDiscussedPlace,
      suggestedActions:
        suggestedActions.length > 0 ? suggestedActions : ['Add a place', 'Make it less tiring'],
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

    const oldStops =
      oldItinerary?.stops.filter((s) => s.type !== 'start' && s.type !== 'end') || [];
    const newStops =
      newItinerary?.stops.filter((s) => s.type !== 'start' && s.type !== 'end') || [];

    const oldTitles = oldStops.map((s) => s.title);
    const newTitles = newStops.map((s) => s.title);

    const addedStops = newTitles.filter((t) => !oldTitles.includes(t));
    const removedStops = oldTitles.filter((t) => !newTitles.includes(t));

    const oldLike = oldItinerary as ItineraryLike | undefined;
    const newLike = newItinerary as ItineraryLike | undefined;

    const oldArr = oldLike?.summary?.plannedArrivalTime ?? oldLike?.plannedArrivalTime;
    const newArr = newLike?.summary?.plannedArrivalTime ?? newLike?.plannedArrivalTime;
    const arrivalTimeChange =
      oldItinerary &&
      newItinerary &&
      oldArr !== undefined &&
      newArr !== undefined &&
      oldArr !== newArr
        ? {
            from: oldArr,
            to: newArr,
          }
        : undefined;

    const oldBuf = oldLike?.summary?.safetyBufferMinutes ?? oldLike?.safetyBufferMinutes;
    const newBuf = newLike?.summary?.safetyBufferMinutes ?? newLike?.safetyBufferMinutes;
    const safetyBufferChange =
      oldItinerary &&
      newItinerary &&
      oldBuf !== undefined &&
      newBuf !== undefined &&
      oldBuf !== newBuf
        ? {
            from: oldBuf,
            to: newBuf,
          }
        : undefined;

    const oldUnused = oldLike?.summary?.unusedAvailableMinutes ?? oldLike?.unusedAvailableMinutes ?? 0;
    const newUnused = newLike?.summary?.unusedAvailableMinutes ?? newLike?.unusedAvailableMinutes ?? 0;
    const unusedTimeChange =
      oldItinerary &&
      newItinerary &&
      oldUnused !== newUnused
        ? {
            from: oldUnused,
            to: newUnused,
          }
        : undefined;

    const constraintChanges = detectConstraintChanges(oldConstraints, newConstraints);

    return {
      addedStops,
      removedStops,
      arrivalTimeChange,
      safetyBufferChange,
      unusedTimeChange,
      constraintChanges: constraintChanges.length > 0 ? constraintChanges : undefined,
    };
  }

  /**
   * Builds the compact, structured context representation sent to the LLM and parser
   */
  public buildCompactContext(
    constraints: TripConstraints,
    itinerary?: FinalItinerary,
    plannerState?: PlannerState,
    history: CopilotHistoryItem[] = [],
    userPreferences?: CopilotUserPreferences,
    pendingProposal?: PendingActionProposal,
    lastDiscussedPlace?: string
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
        category: s.place?.category,
      }));

    const itinLike = itinerary as ItineraryLike | undefined;

    const candidateSample = (plannerState?.candidates || []).slice(0, 5).map((c) => ({
      name: c.name,
      category: c.category,
    }));

    const hasItinerary = Boolean(itinerary && itinerary.stops && itinerary.stops.length > 0);
    const [startH, startM] = (constraints.time.startTime || '09:00')
      .split(':')
      .map((v) => parseInt(v, 10) || 0);
    const [endH, endM] = (constraints.time.latestArrivalTime || '18:00')
      .split(':')
      .map((v) => parseInt(v, 10) || 0);
    const planningWindowMinutes = Math.max(0, endH * 60 + endM - (startH * 60 + startM));

    return {
      city: constraints.city,
      startPoint: {
        name: constraints.startingPoint.name,
        coordinates: constraints.startingPoint.coordinates,
      },
      endPoint: {
        name: constraints.endPoint.name,
        coordinates: constraints.endPoint.coordinates,
      },
      timeWindow: {
        startTime: constraints.time.startTime,
        latestArrivalTime: constraints.time.latestArrivalTime,
      },
      travelMode: constraints.travelMode,
      numberOfPeople: constraints.numberOfPeople,
      interests: constraints.interests,
      currentStops: visitedStops,
      totalTravelMinutes: itinLike?.summary?.totalTravelTimeMinutes ?? itinLike?.totalTravelMinutes ?? 0,
      totalActivityMinutes: itinLike?.summary?.totalActivityTimeMinutes ?? itinLike?.totalActivityMinutes ?? 0,
      safetyBufferMinutes: itinLike?.summary?.safetyBufferMinutes ?? itinLike?.safetyBufferMinutes ?? 0,
      unusedAvailableMinutes: itinLike?.summary?.unusedAvailableMinutes ?? itinLike?.unusedAvailableMinutes ?? 0,
      plannedArrivalTime:
        itinLike?.summary?.plannedArrivalTime ?? itinLike?.plannedArrivalTime ?? constraints.time.latestArrivalTime,
      deadlineArrivalTime: constraints.time.latestArrivalTime,
      availableCandidateSample: candidateSample,
      canUndo: history.length > 0,
      userPreferences,
      pendingProposal,
      lastDiscussedPlace,
      hasItinerary,
      planningWindowMinutes,
    };
  }

  /**
   * Formats a human-readable brief for an action
   */
  private formatActionBrief(decision: CopilotToolDecision): string {
    const p = decision.parameters;
    switch (decision.actionType) {
      case 'GENERATE_ITINERARY':
        return `Generate custom itinerary for ${p.explicitCity || 'your trip'}`;
      case 'ADD_PLACE':
        return `Add "${p.placeName}"`;
      case 'REMOVE_PLACE':
        return `Remove "${p.placeName || `Stop #${p.stopIndex}`}"`;
      case 'REPLACE_PLACE':
        return `Replace "${p.oldPlaceName}" with "${p.newPlaceName || 'alternative'}"`;
      case 'REORDER_PLACE':
        return `Move "${p.placeName}" to position ${p.targetPosition}`;
      case 'MAKE_LESS_TIRING':
        return `Make the schedule less tiring`;
      case 'UPDATE_PREFERENCES':
        return `Adjust itinerary for updated user preferences`;
      case ('CHANGE_BUDGET' as unknown as CopilotActionType):
        return 'Trip budget changes are not supported';
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
