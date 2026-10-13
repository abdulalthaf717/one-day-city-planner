/**
 * Intent Parser for Trip Copilot Chatbot.
 *
 * Responsibilities:
 * - Understands natural language requests in the context of the CURRENT TRIP.
 * - Resolves conversational references ("the museum", "second stop", "last stop").
 * - Detects ambiguity and requests clarification instead of guessing.
 * - Distinguishes between explicit actions, read-only questions, simulations, and suggestions.
 * - Employs a hybrid architecture: Groq LLM tool-calling with a rock-solid deterministic NLP fallback.
 */

import { GroqService } from '../services/groq/client';
import { COPILOT_TOOL_DEFINITIONS } from './tools';
import {
  CopilotActionType,
  CopilotMessage,
  CopilotToolDecision,
  CopilotTripContext,
} from './types';
import { TravelMode } from '../domain';

export class CopilotIntentParser {
  private groqService?: GroqService;

  constructor(groqService?: GroqService) {
    this.groqService = groqService || new GroqService();
  }

  /**
   * Main entry point: Parses user message into a structured tool decision
   */
  async parseUserIntent(
    userMessage: string,
    context: CopilotTripContext,
    conversationHistory: CopilotMessage[] = []
  ): Promise<CopilotToolDecision> {
    const rawTrimmed = userMessage.trim();

    // 1. First run deterministic pattern analysis (detects ambiguity, simulations, exact undo)
    const ruleBasedDecision = this.parseRuleBased(rawTrimmed, context, conversationHistory);

    // If rule-based clearly identifies ambiguity, undo, or a clean rule match, we can use or prioritize it
    if (ruleBasedDecision.requiresClarification) {
      return ruleBasedDecision;
    }

    if (ruleBasedDecision.actionType === 'UNDO_LAST_CHANGE') {
      return ruleBasedDecision;
    }

    // 2. If Groq is configured and available, query Groq for nuanced natural-language comprehension
    if (process.env.GROQ_API_KEY) {
      try {
        const groqDecision = await this.queryGroqForIntent(rawTrimmed, context, conversationHistory);
        if (groqDecision) {
          // If Groq returned a valid decision, check if it detected simulation or questions accurately
          if (ruleBasedDecision.isSimulation) {
            groqDecision.isSimulation = true;
          }
          return groqDecision;
        }
      } catch (err) {
        // Fallback to rule-based parser on any Groq error / timeout / rate-limit
        console.warn('[CopilotIntentParser] Groq parsing failed, falling back to rule engine:', (err as Error).message);
      }
    }

    // 3. Fallback to deterministic NLP rule engine
    return ruleBasedDecision;
  }

  /**
   * Deterministic rule-based semantic parser
   */
  public parseRuleBased(
    text: string,
    context: CopilotTripContext,
    conversationHistory: CopilotMessage[] = []
  ): CopilotToolDecision {
    const lower = text.toLowerCase().trim();

    // -------------------------------------------------------------
    // Check 1: Confirmation / Apply Last Simulation or Suggestion
    // -------------------------------------------------------------
    const isApplyConfirmation =
      /^(apply that|apply it|apply the change|apply change|yes please|confirm|make that change|go ahead|do it)\b/i.test(
        lower
      ) ||
      (lower === 'yes' || lower === 'apply');

    if (isApplyConfirmation && conversationHistory.length > 0) {
      // Find the last assistant message with an action or simulation
      const lastAssistant = [...conversationHistory].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant && lastAssistant.actionExecuted) {
        return {
          actionType: lastAssistant.actionExecuted,
          parameters: lastAssistant.diff ? {} : {},
          isSimulation: false,
          isQuestionOnly: false,
          requiresClarification: false,
          reasoning: 'User confirmed applying previously simulated or suggested action.',
        };
      }
    }

    // -------------------------------------------------------------
    // Check 2: Undo Requests
    // -------------------------------------------------------------
    if (
      /^(undo|undo that|undo my last change|revert|go back|go back to the previous plan|cancel last change)\b/i.test(
        lower
      )
    ) {
      return {
        actionType: 'UNDO_LAST_CHANGE',
        parameters: {},
        isSimulation: false,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: 'User requested reverting the last itinerary state change.',
      };
    }

    // -------------------------------------------------------------
    // Check 3: Simulation Prefix Detection ("What if...", "Could I...", "Suppose...")
    // -------------------------------------------------------------
    const isSimulation =
      /^(what if|how about if|could we|could i|can we try|suppose we|suppose i|simulate|what happens if)\b/i.test(
        lower
      );

    // -------------------------------------------------------------
    // Check 4: Suggestions Request
    // -------------------------------------------------------------
    if (
      /(suggest improvements|any suggestions|how can i improve|improve this plan|make it better|suggest something)\b/i.test(
        lower
      )
    ) {
      return {
        actionType: 'SUGGEST_IMPROVEMENTS',
        parameters: {},
        isSimulation: false,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: 'User requested proactive itinerary improvement suggestions.',
      };
    }

    // -------------------------------------------------------------
    // Check 5: Read-Only Informational Questions
    // -------------------------------------------------------------
    const isQuestion =
      /^(why|how much|how many|what is|what's|which|can i fit|is there|are there|tell me about)\b/i.test(lower) ||
      lower.includes('?') ||
      lower.includes('how much money') ||
      lower.includes('free time') ||
      lower.includes('travel time') ||
      lower.includes('longest');

    if (isQuestion && !isSimulation && !lower.startsWith('can we add') && !lower.startsWith('can i add')) {
      return {
        actionType: 'INFORMATIONAL_QUESTION',
        parameters: { question: text },
        isSimulation: false,
        isQuestionOnly: true,
        requiresClarification: false,
        reasoning: 'User asked a read-only question regarding current trip state.',
      };
    }

    // -------------------------------------------------------------
    // Check 6: Replace Stop
    // -------------------------------------------------------------
    const replaceMatch = lower.match(
      /(?:replace|swap)\s+(?:the\s+)?(.+?)\s+with\s+(.+)/i
    );
    if (replaceMatch) {
      const oldTarget = replaceMatch[1].trim();
      const newTarget = replaceMatch[2].trim();

      const resolvedOld = this.resolveStopReference(oldTarget, context);
      if (resolvedOld.ambiguous) {
        return {
          actionType: 'CLARIFICATION_NEEDED',
          parameters: {},
          isSimulation,
          isQuestionOnly: false,
          requiresClarification: true,
          clarificationQuestion: resolvedOld.clarificationQuestion,
          reasoning: 'Multiple stops match the requested replacement target.',
        };
      }

      // Check if new target is pure criteria or a named place
      const isPureCriteria =
        /^(something free|a free place|free|something cheaper|something historical|a historical place|a museum|another museum)$/i.test(
          newTarget.trim()
        );
      const isFree = newTarget.includes('free');
      const isHistory = newTarget.includes('history') || newTarget.includes('historical');
      const isMuseum = newTarget.includes('museum') && isPureCriteria;

      return {
        actionType: 'REPLACE_PLACE',
        parameters: {
          oldPlaceName: resolvedOld.stopTitle || oldTarget,
          oldStopIndex: resolvedOld.stopIndex,
          newPlaceName: !isPureCriteria ? newTarget : undefined,
          criteria: {
            isFree: isFree || undefined,
            interest: isHistory ? 'History' : undefined,
            category: isMuseum ? 'museum' : undefined,
          },
        },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Replace stop "${resolvedOld.stopTitle || oldTarget}" with "${newTarget}".`,
      };
    }

    // -------------------------------------------------------------
    // Check 7: Remove Stop
    // -------------------------------------------------------------
    const removeMatch = lower.match(
      /(?:remove|drop|delete|skip|exclude|take out|don't want to visit|dont want to visit|i don't want to go to|i dont want to go to|do not want to visit)\s+(?:the\s+)?(.+)/i
    );
    if (removeMatch) {
      const targetStr = removeMatch[1].replace(/[.?!]$/, '').trim();
      const resolved = this.resolveStopReference(targetStr, context);

      if (resolved.ambiguous) {
        return {
          actionType: 'CLARIFICATION_NEEDED',
          parameters: {},
          isSimulation,
          isQuestionOnly: false,
          requiresClarification: true,
          clarificationQuestion: resolved.clarificationQuestion,
          reasoning: 'Multiple stops match the requested removal target.',
        };
      }

      return {
        actionType: 'REMOVE_PLACE',
        parameters: {
          placeName: resolved.stopTitle || targetStr,
          stopIndex: resolved.stopIndex,
        },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Remove stop "${resolved.stopTitle || targetStr}" from itinerary.`,
      };
    }

    // -------------------------------------------------------------
    // Check 8: Reorder / Move Stop
    // -------------------------------------------------------------
    const reorderMatch = lower.match(
      /(?:move|reorder|shift)\s+(?:the\s+)?(.+?)\s+(?:before|after|to|as)\s+(.+)/i
    );
    if (reorderMatch) {
      const placeStr = reorderMatch[1].trim();
      const targetStr = reorderMatch[2].trim();

      const resolved = this.resolveStopReference(placeStr, context);
      let targetPos = 1;
      if (targetStr.includes('first') || targetStr.includes('1')) targetPos = 1;
      else if (targetStr.includes('second') || targetStr.includes('2')) targetPos = 2;
      else if (targetStr.includes('third') || targetStr.includes('3')) targetPos = 3;
      else if (targetStr.includes('last')) targetPos = Math.max(1, context.currentStops.length);

      return {
        actionType: 'REORDER_PLACE',
        parameters: {
          placeName: resolved.stopTitle || placeStr,
          targetPosition: targetPos,
        },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Reorder stop "${resolved.stopTitle || placeStr}" to position ${targetPos}.`,
      };
    }

    // -------------------------------------------------------------
    // Check 9: Add Place
    // -------------------------------------------------------------
    const addMatch = lower.match(
      /(?:add|include|visit|put|insert|can we add|can i add)\s+(?:the\s+)?(.+)/i
    );
    if (addMatch) {
      const placeStr = addMatch[1]
        .replace(/[.?!]$/, '')
        .replace(/\b(to the trip|to the itinerary|to my day|in the plan)\b/gi, '')
        .trim();

      // Check if place is already in current itinerary
      const alreadyPresent = context.currentStops.find(
        (s) => s.title.toLowerCase().includes(placeStr.toLowerCase()) || placeStr.toLowerCase().includes(s.title.toLowerCase())
      );

      if (alreadyPresent) {
        return {
          actionType: 'INFORMATIONAL_QUESTION',
          parameters: {
            reply: `"${alreadyPresent.title}" is already in your itinerary (Stop #${alreadyPresent.index}).`,
          },
          isSimulation: false,
          isQuestionOnly: true,
          requiresClarification: false,
          reasoning: 'Place is already included in current plan.',
        };
      }

      return {
        actionType: 'ADD_PLACE',
        parameters: {
          placeName: placeStr,
          forceInclude: true,
        },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Add attraction "${placeStr}" to trip itinerary.`,
      };
    }

    // -------------------------------------------------------------
    // Check 10: Change Budget
    // -------------------------------------------------------------
    const budgetMatch =
      lower.match(/(?:budget|money|cost|spend|limit)\s+(?:is|to|of)?\s*(?:only\s*)?(?:₹|rs\.?|inr|\$)?\s*(\d+)/i) ||
      lower.match(/(?:budget|money|cost|spend|limit).*?(?:₹|rs\.?|inr|\$)\s*(\d+)/i) ||
      lower.match(/(?:reduce|increase|change|set)\s+(?:the\s+)?budget\s+to\s*(?:₹|rs\.?|inr|\$)?\s*(\d+)/i);

    if (budgetMatch) {
      const budgetAmount = parseInt(budgetMatch[1], 10);
      return {
        actionType: 'CHANGE_BUDGET',
        parameters: { total: budgetAmount },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update total trip budget to ₹${budgetAmount}.`,
      };
    }

    if (lower.includes('make it cheaper') || lower.includes('reduce budget')) {
      const currentBudget = context.budget.total;
      const reducedBudget = Math.max(500, Math.round((currentBudget * 0.7) / 100) * 100);
      return {
        actionType: 'CHANGE_BUDGET',
        parameters: { total: reducedBudget },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Reduce budget from ₹${currentBudget} to ₹${reducedBudget} to make itinerary cheaper.`,
      };
    }

    // -------------------------------------------------------------
    // Check 11: Change Travel Mode
    // -------------------------------------------------------------
    const modeMatch = lower.match(
      /(?:walk|drive|transit|bicycle|cycle|bike|car|metro|bus)\s+(?:instead|mode)/i
    ) || lower.match(/(?:switch|change)\s+(?:travel\s+)?mode\s+to\s+(walk|drive|transit|bicycle)/i) ||
      lower.match(/^(?:walk|drive|take transit|cycle)\b/i);

    if (modeMatch || lower.includes('walk') || lower.includes('transit') || lower.includes('drive') || lower.includes('bicycle')) {
      let targetMode: TravelMode = 'drive';
      if (lower.includes('walk')) targetMode = 'walk';
      else if (lower.includes('transit') || lower.includes('metro') || lower.includes('bus')) targetMode = 'transit';
      else if (lower.includes('bicycle') || lower.includes('cycle') || lower.includes('bike')) targetMode = 'bicycle';
      else if (lower.includes('drive') || lower.includes('car')) targetMode = 'drive';

      if (targetMode !== context.travelMode || isSimulation) {
        return {
          actionType: 'CHANGE_TRAVEL_MODE',
          parameters: { travelMode: targetMode },
          isSimulation,
          isQuestionOnly: false,
          requiresClarification: false,
          reasoning: `Switch travel mode from "${context.travelMode}" to "${targetMode}".`,
        };
      }
    }

    // -------------------------------------------------------------
    // Check 12: Change Time (Start / End)
    // -------------------------------------------------------------
    const timeMatch = lower.match(
      /(?:start|leave|depart)\s+(?:at|by)\s*(\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?)/i
    );
    if (timeMatch) {
      const parsedTime = this.normalizeTimeToHHMM(timeMatch[1]);
      return {
        actionType: 'CHANGE_START_TIME',
        parameters: { startTime: parsedTime },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update departure start time to ${parsedTime}.`,
      };
    }

    const reachMatch = lower.match(
      /(?:reach|arrive|reach by|reach the station by|end at|finish by)\s*(?:at|by)?\s*(\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?)/i
    );
    if (reachMatch) {
      const parsedTime = this.normalizeTimeToHHMM(reachMatch[1]);
      return {
        actionType: 'CHANGE_END_TIME',
        parameters: { latestArrivalTime: parsedTime },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update latest arrival deadline to ${parsedTime}.`,
      };
    }

    // -------------------------------------------------------------
    // Check 13: Change People Count
    // -------------------------------------------------------------
    const peopleMatch = lower.match(
      /(\d+)\s*(?:of us|people|pax|travelers|friends|persons)/i
    ) || lower.match(/(?:there are|we are)\s+(\d+)/i);

    if (peopleMatch) {
      const count = parseInt(peopleMatch[1], 10);
      return {
        actionType: 'CHANGE_NUMBER_OF_PEOPLE',
        parameters: { numberOfPeople: count },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update traveler count to ${count}.`,
      };
    }

    // -------------------------------------------------------------
    // Check 14: Change Interests
    // -------------------------------------------------------------
    if (lower.includes('interests') || lower.includes('want history') || lower.includes('forget food') || lower.includes('more nature')) {
      const newInterests: string[] = [];
      if (lower.includes('history')) newInterests.push('History');
      if (lower.includes('nature')) newInterests.push('Nature');
      if (lower.includes('architecture')) newInterests.push('Architecture');
      if (lower.includes('culture') || lower.includes('cultural')) newInterests.push('Culture');
      if (lower.includes('food') && !lower.includes('forget food') && !lower.includes('no food')) newInterests.push('Food');

      if (newInterests.length > 0) {
        return {
          actionType: 'CHANGE_INTERESTS',
          parameters: { interests: newInterests, mode: 'replace' },
          isSimulation,
          isQuestionOnly: false,
          requiresClarification: false,
          reasoning: `Update user interests to [${newInterests.join(', ')}].`,
        };
      }
    }

    // -------------------------------------------------------------
    // Check 15: Change End / Start Location
    // -------------------------------------------------------------
    const endLocMatch = lower.match(/(?:end at|destination is|actually end at|arrive at)\s+([a-z0-9\s,.-]+)/i);
    if (endLocMatch && !reachMatch) {
      const dest = endLocMatch[1].trim();
      return {
        actionType: 'CHANGE_END_LOCATION',
        parameters: { locationName: dest, type: 'end' },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update trip destination point to "${dest}".`,
      };
    }

    // Default: treat as informational or conversational question
    return {
      actionType: 'INFORMATIONAL_QUESTION',
      parameters: { question: text },
      isSimulation: false,
      isQuestionOnly: true,
      requiresClarification: false,
      reasoning: 'User asked an informational question about the current plan.',
    };
  }

  /**
   * Resolves fuzzy / conversational stop references ("the museum", "second stop", "last stop")
   */
  private resolveStopReference(
    reference: string,
    context: CopilotTripContext
  ): {
    stopTitle?: string;
    stopIndex?: number;
    ambiguous: boolean;
    clarificationQuestion?: string;
  } {
    const refLower = reference.toLowerCase().trim();
    const stops = context.currentStops;

    if (stops.length === 0) {
      return { ambiguous: false };
    }

    // 1. Ordinal references
    if (refLower.includes('first') || refLower === '1' || refLower === 'stop 1' || refLower === 'place 1') {
      return { stopTitle: stops[0].title, stopIndex: 1, ambiguous: false };
    }
    if (refLower.includes('second') || refLower === '2' || refLower === 'stop 2' || refLower === 'place 2') {
      if (stops.length >= 2) return { stopTitle: stops[1].title, stopIndex: 2, ambiguous: false };
    }
    if (refLower.includes('third') || refLower === '3' || refLower === 'stop 3' || refLower === 'place 3') {
      if (stops.length >= 3) return { stopTitle: stops[2].title, stopIndex: 3, ambiguous: false };
    }
    if (refLower.includes('last') || refLower.includes('final stop')) {
      const lastStop = stops[stops.length - 1];
      return { stopTitle: lastStop.title, stopIndex: stops.length, ambiguous: false };
    }

    // 2. Exact or substring match
    const exactMatches = stops.filter((s) => s.title.toLowerCase().includes(refLower));
    if (exactMatches.length === 1) {
      return { stopTitle: exactMatches[0].title, stopIndex: exactMatches[0].index, ambiguous: false };
    }

    // 3. Category match (e.g. "the museum", "the fort", "the park")
    let categoryTerm = '';
    if (refLower.includes('museum')) categoryTerm = 'museum';
    else if (refLower.includes('fort')) categoryTerm = 'fort';
    else if (refLower.includes('park') || refLower.includes('garden')) categoryTerm = 'park';
    else if (refLower.includes('market') || refLower.includes('bazaar')) categoryTerm = 'market';
    else if (refLower.includes('mosque') || refLower.includes('temple')) categoryTerm = 'religious';

    if (categoryTerm) {
      const categoryMatches = stops.filter(
        (s) =>
          s.title.toLowerCase().includes(categoryTerm) ||
          (s.category && s.category.toLowerCase().includes(categoryTerm))
      );

      if (categoryMatches.length === 1) {
        return {
          stopTitle: categoryMatches[0].title,
          stopIndex: categoryMatches[0].index,
          ambiguous: false,
        };
      }

      if (categoryMatches.length > 1) {
        const names = categoryMatches.map((s) => s.title).join(' and ');
        return {
          ambiguous: true,
          clarificationQuestion: `I found ${categoryMatches.length} ${categoryTerm}s in your plan: ${names}. Which one would you like to choose?`,
        };
      }
    }

    // 4. Default: check if any stop partially matches words
    const words = refLower.split(/\s+/).filter((w) => w.length > 3);
    const partialMatches = stops.filter((s) => words.some((w) => s.title.toLowerCase().includes(w)));
    if (partialMatches.length === 1) {
      return { stopTitle: partialMatches[0].title, stopIndex: partialMatches[0].index, ambiguous: false };
    }
    if (partialMatches.length > 1) {
      const names = partialMatches.map((s) => s.title).join(' and ');
      return {
        ambiguous: true,
        clarificationQuestion: `I found multiple matching places in your plan: ${names}. Which one do you mean?`,
      };
    }

    return { ambiguous: false };
  }

  /**
   * Helper to normalize natural time strings (e.g. "10", "10 am", "18:30", "6pm") to HH:mm
   */
  private normalizeTimeToHHMM(raw: string): string {
    const trimmed = raw.trim().toLowerCase();
    const isPM = trimmed.includes('pm');
    const isAM = trimmed.includes('am');
    const numPart = trimmed.replace(/[a-z\s]/g, '');

    if (numPart.includes(':')) {
      const [hStr, mStr] = numPart.split(':');
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    let hour = parseInt(numPart, 10);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    // Default afternoon heuristic if naked 1-7
    if (!isAM && !isPM && hour >= 1 && hour <= 7) hour += 12;

    return `${hour.toString().padStart(2, '0')}:00`;
  }

  /**
   * Optional Groq LLM tool calling execution with 10s timeout
   */
  private async queryGroqForIntent(
    userMessage: string,
    context: CopilotTripContext,
    conversationHistory: CopilotMessage[]
  ): Promise<CopilotToolDecision | null> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) return null;

    const Groq = (await import('groq-sdk')).default;
    const client = new Groq({ apiKey, timeout: 10000 });

    const systemPrompt = `You are the Trip Copilot intent parser for an agentic travel planner.
You evaluate user chat messages about the CURRENT TRIP and decide the structured action to take.

CRITICAL RULES:
1. Never invent places, coordinates, or itineraries directly.
2. If the user wants to add, remove, replace, move, or change a constraint, select the appropriate tool.
3. If the user asks "What if...", select "simulate_change" with the simulated action and arguments.
4. If the user asks a question about the plan (e.g. "Why this plan?", "How much money left?"), select "explain_itinerary".
5. If the user reference is ambiguous (e.g. "remove the museum" when there are 2 museums in the current stops list), you must ask for clarification instead of guessing.

CURRENT TRIP CONTEXT:
- City: ${context.city}
- Time: ${context.timeWindow.startTime} to ${context.timeWindow.latestArrivalTime} (Arrives destination at ${context.plannedArrivalTime})
- Budget: ${context.budget.currency}${context.budget.total} (Spent: ${context.budget.currency}${context.budget.spent}, Remaining: ${context.budget.currency}${context.budget.remaining})
- Mode: ${context.travelMode}, People: ${context.numberOfPeople}
- Current Visited Stops: ${context.currentStops.map((s) => `#${s.index} ${s.title} (${s.arrivalTime}-${s.departureTime}, ${context.budget.currency}${s.costTotal})`).join('; ')}
- Buffer: ${context.safetyBufferMinutes}m, Unused Capacity: ${context.unusedAvailableMinutes}m`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Include last 2 messages for conversation context
    for (const hist of conversationHistory.slice(-2)) {
      messages.push({
        role: hist.role === 'assistant' ? 'assistant' : 'user',
        content: hist.content,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    const response = await client.chat.completions.create(
      {
        model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        messages,
        tools: COPILOT_TOOL_DEFINITIONS as unknown as Parameters<typeof client.chat.completions.create>[0]['tools'],
        tool_choice: 'auto',
        temperature: 0.1,
      },
      { signal: AbortSignal.timeout(10000) }
    );

    const choice = response.choices[0];
    const toolCall = choice?.message?.tool_calls?.[0];

    if (!toolCall) {
      return null;
    }

    const toolName = toolCall.function.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      args = {};
    }

    const actionMap: Record<string, CopilotActionType> = {
      add_place: 'ADD_PLACE',
      remove_place: 'REMOVE_PLACE',
      replace_place: 'REPLACE_PLACE',
      reorder_place: 'REORDER_PLACE',
      change_budget: 'CHANGE_BUDGET',
      change_time: 'CHANGE_TIME',
      change_travel_mode: 'CHANGE_TRAVEL_MODE',
      change_people: 'CHANGE_NUMBER_OF_PEOPLE',
      change_interests: 'CHANGE_INTERESTS',
      change_start: 'CHANGE_START_LOCATION',
      change_end: 'CHANGE_END_LOCATION',
      simulate_change: 'SIMULATE_CHANGE',
      undo_last_change: 'UNDO_LAST_CHANGE',
      suggest_improvements: 'SUGGEST_IMPROVEMENTS',
      explain_itinerary: 'EXPLAIN_ITINERARY',
    };

    const actionType = actionMap[toolName] || 'INFORMATIONAL_QUESTION';

    return {
      actionType,
      parameters: args,
      isSimulation: actionType === 'SIMULATE_CHANGE',
      isQuestionOnly: actionType === 'EXPLAIN_ITINERARY' || actionType === 'INFORMATIONAL_QUESTION',
      requiresClarification: false,
      reasoning: `Groq tool call: ${toolName}`,
    };
  }
}
