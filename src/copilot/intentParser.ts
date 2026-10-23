/**
 * Conversational Intent & Context Parser for Trip Copilot Chatbot.
 *
 * Responsibilities:
 * - Classifies user turns across 4 Conversation Modes:
 *   (A) GENERAL_CONVERSATION
 *   (B) CURRENT_PLAN_QUESTION
 *   (C) SIMULATION_AND_RECOMMENDATION
 *   (D) ACTION_EXECUTION
 * - Tracks multi-turn context: pronoun resolution ("it", "that place"),
 *   pending simulation/recommendation proposals ("That sounds good. Let's do it."),
 *   and structured user preferences (preferred/disliked categories, crowds, pace).
 * - Resolves fuzzy stop references ("the museum", "second stop", "last stop")
 *   and detects ambiguity to ask for clarification instead of guessing.
 * - Hybrid architecture: Groq LLM tool-calling + conversational response capture
 *   paired with a deterministic semantic & domain-knowledge engine.
 */

import { GroqService } from '../services/groq/client';
import { COPILOT_TOOL_DEFINITIONS } from './tools';
import {
  ConversationMode,
  CopilotActionType,
  CopilotMessage,
  CopilotToolDecision,
  CopilotTripContext,
  CopilotUserPreferences,
  PendingActionProposal,
} from './types';
import {
  findAttractionProfile,
  findMentionedProfiles,
} from './conversationalResponder';
import { TravelMode } from '../domain';

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function parseNumberToken(token: string): number | undefined {
  const clean = token.toLowerCase().trim();
  if (NUMBER_WORDS[clean] !== undefined) return NUMBER_WORDS[clean];
  const parsed = parseInt(clean, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export class CopilotIntentParser {
  private groqService?: GroqService;

  constructor(groqService?: GroqService) {
    this.groqService = groqService || new GroqService();
  }

  /**
   * Main entry point: Parses user message into a structured tool & mode decision
   */
  async parseUserIntent(
    userMessage: string,
    context: CopilotTripContext,
    conversationHistory: CopilotMessage[] = []
  ): Promise<CopilotToolDecision> {
    const rawTrimmed = userMessage.trim();

    // 1. Run deterministic semantic and multi-turn context analysis
    const ruleBasedDecision = this.parseRuleBased(rawTrimmed, context, conversationHistory);

    // If deterministic semantic parser matched a specific high-confidence pattern, return it directly
    const isEligibleForGroq =
      ruleBasedDecision.reasoning === 'Open-ended conversational or informational message.' ||
      ruleBasedDecision.reasoning === 'Open-ended recommendation request.';

    if (!isEligibleForGroq) {
      return ruleBasedDecision;
    }

    // 2. For open-ended / unclassified phrasings, query Groq LLM if configured
    if (process.env.GROQ_API_KEY) {
      try {
        const groqDecision = await this.queryGroqForIntent(
          rawTrimmed,
          context,
          conversationHistory,
          ruleBasedDecision
        );
        if (groqDecision) {
          if (ruleBasedDecision.isSimulation) {
            groqDecision.isSimulation = true;
            groqDecision.conversationMode = 'SIMULATION_AND_RECOMMENDATION';
          }
          return groqDecision;
        }
      } catch (err) {
        console.warn(
          '[CopilotIntentParser] Groq parsing failed, falling back to deterministic engine:',
          (err as Error).message
        );
      }
    }

    // 3. Fallback to deterministic semantic engine
    return ruleBasedDecision;
  }

  /**
   * Deterministic multi-turn semantic parser
   */
  public parseRuleBased(
    text: string,
    context: CopilotTripContext,
    conversationHistory: CopilotMessage[] = []
  ): CopilotToolDecision {
    const lower = text.toLowerCase().trim();

    // Extract multi-turn memory from context & conversation history
    const lastDiscussedPlace = this.extractLastDiscussedPlace(conversationHistory, context);
    const pendingProposal = this.extractPendingProposal(conversationHistory, context);

    // -------------------------------------------------------------
    // Check 1: Confirmation / Apply Last Simulation or Recommendation
    // e.g. "Apply that", "That sounds good. Let's do it.", "Yes, let's do it"
    // -------------------------------------------------------------
    const isApplyConfirmation =
      /^(apply that|apply it|apply the change|apply change|yes please|confirm|make that change|go ahead|do it|let's do it|lets do it|that sounds good|sounds good|yes,?\s*let'?s do (?:it|that)|that sounds good[.,!]?\s*let'?s do (?:it|that))\b/i.test(
        lower
      ) ||
      lower === 'yes' ||
      lower === 'apply';

    if (isApplyConfirmation) {
      if (pendingProposal) {
        return {
          actionType: pendingProposal.actionType,
          conversationMode: 'ACTION_EXECUTION',
          parameters: pendingProposal.parameters,
          isSimulation: false,
          isQuestionOnly: false,
          requiresClarification: false,
          reasoning: `User confirmed applying previously simulated or recommended action (${pendingProposal.description}).`,
        };
      }
      if (lastDiscussedPlace) {
        return {
          actionType: 'ADD_PLACE',
          conversationMode: 'ACTION_EXECUTION',
          parameters: { placeName: lastDiscussedPlace, forceInclude: true },
          isSimulation: false,
          isQuestionOnly: false,
          requiresClarification: false,
          discussedPlace: lastDiscussedPlace,
          reasoning: `User confirmed adding previously discussed attraction "${lastDiscussedPlace}".`,
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
        conversationMode: 'ACTION_EXECUTION',
        parameters: {},
        isSimulation: false,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: 'User requested reverting the last itinerary state change.',
      };
    }

    // -------------------------------------------------------------
    // Check 3: Infeasible Multi-Stop Time-Window Requests
    // e.g. "I want to visit eight places, but I only have three hours"
    // -------------------------------------------------------------
    const cramMatch = lower.match(
      /(?:visit|see|fit|do|include)\s+(\w+)\s+(?:places|attractions|stops|sights).*?(?:only\s+have\s+|in\s+)(\w+)\s+hours?/i
    );
    if (cramMatch) {
      const requestedStops = parseNumberToken(cramMatch[1]);
      const requestedHours = parseNumberToken(cramMatch[2]);
      if (
        requestedStops !== undefined &&
        requestedHours !== undefined &&
        requestedStops >= 5 &&
        requestedStops * 50 > requestedHours * 60
      ) {
        return {
          actionType: 'INFEASIBLE_REQUEST',
          conversationMode: 'ACTION_EXECUTION',
          parameters: {
            requestedStops,
            requestedHours,
          },
          isSimulation: false,
          isQuestionOnly: false,
          requiresClarification: false,
          infeasibleReason: `Visiting ${requestedStops} places within ${requestedHours} hours (${requestedHours * 60} minutes) is physically infeasible once minimum visit durations (45–90m per stop), urban road transit (15–30m per leg), and safety buffers are accounted for.`,
          reasoning: `Detected infeasible multi-stop request: ${requestedStops} stops in ${requestedHours} hours.`,
        };
      }
    }

    // -------------------------------------------------------------
    // Check 4: Simulation Prefix Detection ("What if...", "Suppose...", "Would walking be better?")
    // -------------------------------------------------------------
    const isSimulation =
      /^(what if|how about if|could we|could i|can we try|suppose we|suppose i|simulate|what happens if)\b/i.test(
        lower
      ) ||
      /^would\s+(?:walking|driving|taking transit|cycling)\s+be\s+better/i.test(lower);

    // -------------------------------------------------------------
    // Check 5: Pacing / Fatigue Reduction ("Can we make the trip less tiring?", "Make it more relaxed")
    // -------------------------------------------------------------
    if (
      /(make (?:the trip|it|the day|the schedule|this plan) (?:less tiring|less rushed|more relaxed|easier|lighter)|too tiring|too packed|too rushed|pace more relaxed)/i.test(
        lower
      )
    ) {
      return {
        actionType: 'MAKE_LESS_TIRING',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: { targetPace: 'relaxed' },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        preferenceUpdate: {
          pacePreference: 'relaxed',
          notes: [text],
        },
        pendingProposal: isSimulation
          ? {
              actionType: 'MAKE_LESS_TIRING',
              parameters: { targetPace: 'relaxed' },
              description: 'Make the schedule less tiring by trimming one stop and relaxing the pace',
            }
          : undefined,
        reasoning: 'User requested making the trip less tiring / more relaxed.',
      };
    }

    // -------------------------------------------------------------
    // Check 6: Mid-Conversation Preference Change / Dislike of Active Category
    // e.g. "Actually, I don't really care about museums", "I don't want museums"
    // -------------------------------------------------------------
    if (
      /(don'?t (?:really )?(?:care about|like|want|enjoy) museums|not interested in museums|no museums|skip the museums|tired of museums)/i.test(
        lower
      )
    ) {
      const museumStop = context.currentStops.find(
        (s) =>
          s.title.toLowerCase().includes('museum') ||
          (s.category && s.category.toLowerCase().includes('museum'))
      );
      return {
        actionType: 'UPDATE_PREFERENCES',
        conversationMode: 'GENERAL_CONVERSATION',
        parameters: {
          dislikedCategories: ['museum'],
          adjustActivePlan: false,
        },
        isSimulation: false,
        isQuestionOnly: true,
        requiresClarification: false,
        preferenceUpdate: {
          dislikedCategories: ['museum'],
          notes: [text],
        },
        pendingProposal: museumStop
          ? {
              actionType: 'REMOVE_PLACE',
              parameters: { placeName: museumStop.title, stopIndex: museumStop.index },
              description: `Remove "${museumStop.title}" from the itinerary`,
            }
          : undefined,
        reasoning: 'User expressed a preference against museums mid-conversation.',
      };
    }

    // -------------------------------------------------------------
    // Check 7: Explicit Change Interests (e.g. "Forget food, I want history and architecture")
    // Preserves Test 09 compatibility
    // -------------------------------------------------------------
    if (
      lower.includes('interests') ||
      lower.includes('want history') ||
      lower.includes('forget food') ||
      lower.includes('more nature')
    ) {
      const newInterests: string[] = [];
      if (lower.includes('history') || lower.includes('historical')) newInterests.push('History');
      if (lower.includes('nature') || lower.includes('park')) newInterests.push('Nature');
      if (lower.includes('architecture') || lower.includes('architectural'))
        newInterests.push('Architecture');
      if (lower.includes('culture') || lower.includes('cultural')) newInterests.push('Culture');
      if (lower.includes('food') && !lower.includes('forget food') && !lower.includes('no food'))
        newInterests.push('Food');

      if (newInterests.length > 0) {
        return {
          actionType: 'CHANGE_INTERESTS',
          conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
          parameters: { interests: newInterests, mode: 'replace' },
          isSimulation,
          isQuestionOnly: false,
          requiresClarification: false,
          preferenceUpdate: {
            preferredCategories: newInterests,
            notes: [text],
          },
          reasoning: `Update user interests to [${newInterests.join(', ')}].`,
        };
      }
    }

    // -------------------------------------------------------------
    // Check 8: Conversational User Preference Statements (Mode A)
    // e.g. "I prefer historical places", "I also dislike crowded places", "I like historical places, but I don't enjoy crowded attractions"
    // -------------------------------------------------------------
    const isPreferenceStatement =
      /(?:\b(?:i\s+like|i\s+really\s+like|i\s+love|i\s+enjoy|i\s+prefer|i(?:'d| would)\s+(?:also\s+)?prefer|i\s+also\s+prefer|i(?:'m| am)\s+interested\s+in|i\s+dislike|i\s+also\s+dislike|i\s+hate|i\s+don'?t\s+like|i\s+don'?t\s+enjoy|i\s+don'?t\s+(?:really\s+)?care\s+about|i\s+avoid|i(?:'d| would)\s+rather\s+avoid)\b|prefer\s+a\s+relaxed|enjoy\s+crowded|like\s+historical)/i.test(
        lower
      ) &&
      !lower.startsWith('remove ') &&
      !lower.startsWith('replace ') &&
      !lower.startsWith('swap ') &&
      !lower.startsWith('add ');

    if (isPreferenceStatement) {
      const prefUpdate: Partial<CopilotUserPreferences> = {
        preferredCategories: [],
        dislikedCategories: [],
        notes: [text],
      };

      // Split into clauses to associate sentiments (positive vs negative) to specific preference facets
      const clauses = lower.split(/[,.;]|\b(?:but|however|and then)\b/);
      for (const clause of clauses) {
        const cTrim = clause.trim();
        if (!cTrim) continue;
        const isDislikeClause = /\b(?:don'?t|dislike|hate|avoid|not|never|no)\b/i.test(cTrim);

        if (cTrim.includes('crowded') || cTrim.includes('crowds') || cTrim.includes('busy')) {
          if (isDislikeClause || cTrim.includes("don't enjoy") || cTrim.includes('dislike')) {
            prefUpdate.crowdPreference = 'low';
            if (!prefUpdate.dislikedCategories!.includes('crowded')) {
              prefUpdate.dislikedCategories!.push('crowded');
            }
          }
        }

        if (cTrim.includes('historic') || cTrim.includes('history') || cTrim.includes('heritage')) {
          if (isDislikeClause && !cTrim.includes('not history')) {
            if (!prefUpdate.dislikedCategories!.includes('History')) {
              prefUpdate.dislikedCategories!.push('History');
            }
          } else {
            if (!prefUpdate.preferredCategories!.includes('History')) {
              prefUpdate.preferredCategories!.push('History');
            }
          }
        }

        if (cTrim.includes('architecture') || cTrim.includes('architectural') || cTrim.includes('monument')) {
          if (isDislikeClause) {
            if (!prefUpdate.dislikedCategories!.includes('Architecture')) {
              prefUpdate.dislikedCategories!.push('Architecture');
            }
          } else {
            if (!prefUpdate.preferredCategories!.includes('Architecture')) {
              prefUpdate.preferredCategories!.push('Architecture');
            }
          }
        }

        if (cTrim.includes('nature') || cTrim.includes('garden') || cTrim.includes('park') || cTrim.includes('outdoor')) {
          if (isDislikeClause) {
            if (!prefUpdate.dislikedCategories!.includes('Nature')) {
              prefUpdate.dislikedCategories!.push('Nature');
            }
          } else {
            if (!prefUpdate.preferredCategories!.includes('Nature')) {
              prefUpdate.preferredCategories!.push('Nature');
            }
          }
        }

        if (cTrim.includes('museum')) {
          if (isDislikeClause) {
            if (!prefUpdate.dislikedCategories!.includes('museum')) {
              prefUpdate.dislikedCategories!.push('museum');
            }
          } else {
            if (!prefUpdate.preferredCategories!.includes('museum')) {
              prefUpdate.preferredCategories!.push('museum');
            }
          }
        }

        if (cTrim.includes('quiet') || cTrim.includes('peaceful') || cTrim.includes('calm')) {
          prefUpdate.crowdPreference = 'low';
        }

        if (cTrim.includes('relaxed') || cTrim.includes('slow pace') || cTrim.includes('unhurried') || cTrim.includes('leisurely')) {
          prefUpdate.pacePreference = 'relaxed';
        }
      }

      return {
        actionType: 'UPDATE_PREFERENCES',
        conversationMode: 'GENERAL_CONVERSATION',
        parameters: { preferenceUpdate: prefUpdate },
        isSimulation: false,
        isQuestionOnly: true,
        requiresClarification: false,
        preferenceUpdate: prefUpdate,
        reasoning: 'User shared travel preferences in natural conversation.',
      };
    }

    // -------------------------------------------------------------
    // Check 9: Greetings & Small Talk (Mode A)
    // -------------------------------------------------------------
    if (
      /^(hello|hi|hey|good morning|good afternoon|good evening|greetings|hi there|hello there)\b/i.test(
        lower
      ) ||
      /^(thanks|thank you|appreciate it)\b/i.test(lower)
    ) {
      return {
        actionType: 'GENERAL_CONVERSATION',
        conversationMode: 'GENERAL_CONVERSATION',
        parameters: { question: text },
        isSimulation: false,
        isQuestionOnly: true,
        requiresClarification: false,
        reasoning: 'Greeting or conversational opener — no tool execution needed.',
      };
    }

    // -------------------------------------------------------------
    // Check 10: Comparison Between Two Places (Mode A)
    // e.g. "Would you recommend Charminar or Salar Jung Museum?"
    // -------------------------------------------------------------
    const mentionedProfiles = findMentionedProfiles(text);
    if (
      mentionedProfiles.length >= 2 &&
      (lower.includes(' or ') ||
        lower.includes(' vs ') ||
        lower.includes('versus') ||
        lower.includes('compare') ||
        lower.includes('between') ||
        lower.includes('recommend')) &&
      !lower.startsWith('replace ') &&
      !lower.startsWith('swap ')
    ) {
      return {
        actionType: 'GENERAL_CONVERSATION',
        conversationMode: 'GENERAL_CONVERSATION',
        parameters: {
          question: text,
          comparedPlaces: mentionedProfiles.map((p) => p.canonicalName),
        },
        isSimulation: false,
        isQuestionOnly: true,
        requiresClarification: false,
        discussedPlace: mentionedProfiles[0].canonicalName,
        reasoning: `User asked for a comparison between ${mentionedProfiles.map((p) => p.canonicalName).join(' and ')}.`,
      };
    }

    // -------------------------------------------------------------
    // Check 11: Suggestions & Context-Aware Recommendations (Mode C)
    // e.g. "Suggest improvements", "Based on that, what would you recommend for the remaining time?"
    // -------------------------------------------------------------
    if (
      /(suggest improvements|any suggestions|how can i improve|improve this plan|make it better|suggest something|what could make this trip better|what would you recommend|recommend for the remaining time|what do you recommend|any recommendations)\b/i.test(
        lower
      ) &&
      mentionedProfiles.length < 2
    ) {
      const isGeneralRecommendation =
        /(?:what would you recommend|what do you recommend|any recommendations|what should i visit|where should i go)\b/i.test(
          lower
        );

      return {
        actionType: 'SUGGEST_IMPROVEMENTS',
        conversationMode: 'SIMULATION_AND_RECOMMENDATION',
        parameters: { question: text },
        isSimulation: false,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: isGeneralRecommendation
          ? 'Open-ended recommendation request.'
          : 'User requested proactive or preference-aware itinerary recommendations.',
      };
    }

    // -------------------------------------------------------------
    // Check 12: General City / Attraction Knowledge Questions (Mode A)
    // e.g. "What's special about Golconda Fort?", "What is the best way to explore Hyderabad in one day?"
    // -------------------------------------------------------------
    const singleProfile = findAttractionProfile(text);
    const isAttractionInquiry =
      singleProfile &&
      (/^(what's|what is|tell me about|why is|how is|is)\b/i.test(lower) ||
        lower.includes('special about') ||
        lower.includes('known for') ||
        lower.includes('famous for') ||
        lower.includes('history of') ||
        lower.includes('worth visiting')) &&
      !lower.includes('why did you choose') &&
      !lower.includes('why was');

    if (isAttractionInquiry && singleProfile) {
      return {
        actionType: 'GENERAL_CONVERSATION',
        conversationMode: 'GENERAL_CONVERSATION',
        parameters: {
          question: text,
          placeName: singleProfile.canonicalName,
        },
        isSimulation: false,
        isQuestionOnly: true,
        requiresClarification: false,
        discussedPlace: singleProfile.canonicalName,
        pendingProposal: {
          actionType: 'ADD_PLACE',
          parameters: { placeName: singleProfile.canonicalName, forceInclude: true },
          description: `Add "${singleProfile.canonicalName}" to the itinerary`,
        },
        reasoning: `General attraction inquiry about "${singleProfile.canonicalName}".`,
      };
    }

    if (
      lower.includes('best way to explore') ||
      lower.includes('explore hyderabad') ||
      lower.includes('one day in') ||
      lower.includes('what makes hyderabad')
    ) {
      return {
        actionType: 'GENERAL_CONVERSATION',
        conversationMode: 'GENERAL_CONVERSATION',
        parameters: { question: text },
        isSimulation: false,
        isQuestionOnly: true,
        requiresClarification: false,
        reasoning: 'General destination exploration question.',
      };
    }

    // -------------------------------------------------------------
    // Check 13: Read-Only Current-Plan & Evaluative Questions (Mode B & C)
    // e.g. "How much money is left?", "Why did you choose this plan?", "Should we add Charminar?"
    // -------------------------------------------------------------
    const isExplicitAddCommand =
      /^(?:can we|can i|could we|could i|let's|lets|please)?\s*(?:add|include)\s+/i.test(lower) &&
      !lower.startsWith('should we') &&
      !lower.startsWith('should i') &&
      !lower.startsWith('what if');

    const isExplicitLessTiringCommand =
      lower.includes('less tiring') || lower.includes('more relaxed');

    const isQuestion =
      /^(why|how much|how many|what is|what's|which|can i fit|do we have time|is there|are there|tell me about|should we|should i)\b/i.test(
        lower
      ) ||
      (lower.includes('?') && !isExplicitAddCommand && !isExplicitLessTiringCommand) ||
      lower.includes('how much money') ||
      lower.includes('free time') ||
      lower.includes('travel time') ||
      lower.includes('longest');

    if (isQuestion && !isSimulation && !isExplicitAddCommand) {
      const isEvaluative = /^(should we|should i|would it be good)/i.test(lower);
      return {
        actionType: 'INFORMATIONAL_QUESTION',
        conversationMode: isEvaluative ? 'SIMULATION_AND_RECOMMENDATION' : 'CURRENT_PLAN_QUESTION',
        parameters: { question: text },
        isSimulation: false,
        isQuestionOnly: true,
        requiresClarification: false,
        discussedPlace: singleProfile?.canonicalName,
        pendingProposal:
          isEvaluative && singleProfile
            ? {
                actionType: 'ADD_PLACE',
                parameters: { placeName: singleProfile.canonicalName, forceInclude: true },
                description: `Add "${singleProfile.canonicalName}" to the itinerary`,
              }
            : undefined,
        reasoning: isEvaluative
          ? 'User asked an evaluative trade-off question about modifying the trip.'
          : 'User asked a read-only question regarding current trip state.',
      };
    }

    // -------------------------------------------------------------
    // Check 14: Replace Stop
    // -------------------------------------------------------------
    const replaceMatch = lower.match(/(?:replace|swap)\s+(?:the\s+)?(.+?)\s+with\s+(.+)/i);
    if (replaceMatch) {
      const oldTarget = replaceMatch[1].trim();
      const newTarget = replaceMatch[2].replace(/[.?!]$/, '').trim();

      const resolvedOld = this.resolveStopReference(oldTarget, context);
      if (resolvedOld.ambiguous) {
        return {
          actionType: 'CLARIFICATION_NEEDED',
          conversationMode: 'ACTION_EXECUTION',
          parameters: {},
          isSimulation,
          isQuestionOnly: false,
          requiresClarification: true,
          clarificationQuestion: resolvedOld.clarificationQuestion,
          reasoning: 'Multiple stops match the requested replacement target.',
        };
      }

      const isPureCriteria =
        /^(something free|a free place|free|something cheaper|something historical|a historical place|a museum|another museum)$/i.test(
          newTarget.trim()
        );
      const isFree = newTarget.includes('free');
      const isHistory = newTarget.includes('history') || newTarget.includes('historical');
      const isMuseum = newTarget.includes('museum') && isPureCriteria;

      const params = {
        oldPlaceName: resolvedOld.stopTitle || oldTarget,
        oldStopIndex: resolvedOld.stopIndex,
        newPlaceName: !isPureCriteria ? newTarget : undefined,
        criteria: {
          isFree: isFree || undefined,
          interest: isHistory ? 'History' : undefined,
          category: isMuseum ? 'museum' : undefined,
        },
      };

      return {
        actionType: 'REPLACE_PLACE',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: params,
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        pendingProposal: isSimulation
          ? {
              actionType: 'REPLACE_PLACE',
              parameters: params,
              description: `Replace "${resolvedOld.stopTitle || oldTarget}" with "${newTarget}"`,
            }
          : undefined,
        reasoning: `Replace stop "${resolvedOld.stopTitle || oldTarget}" with "${newTarget}".`,
      };
    }

    // -------------------------------------------------------------
    // Check 15: Remove Stop
    // -------------------------------------------------------------
    const removeMatch = lower.match(
      /(?:remove|drop|delete|skip|exclude|take out|don't want to visit|dont want to visit|i don't want to go to|i dont want to go to|do not want to visit)\s+(?:the\s+)?(.+)/i
    );
    if (removeMatch) {
      let targetStr = removeMatch[1].replace(/[.?!]$/, '').trim();
      if (/^(it|that|that place|that stop|this stop)$/i.test(targetStr) && lastDiscussedPlace) {
        targetStr = lastDiscussedPlace;
      }

      const resolved = this.resolveStopReference(targetStr, context);

      if (resolved.ambiguous) {
        return {
          actionType: 'CLARIFICATION_NEEDED',
          conversationMode: 'ACTION_EXECUTION',
          parameters: {},
          isSimulation,
          isQuestionOnly: false,
          requiresClarification: true,
          clarificationQuestion: resolved.clarificationQuestion,
          reasoning: 'Multiple stops match the requested removal target.',
        };
      }

      const params = {
        placeName: resolved.stopTitle || targetStr,
        stopIndex: resolved.stopIndex,
      };

      return {
        actionType: 'REMOVE_PLACE',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: params,
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        pendingProposal: isSimulation
          ? {
              actionType: 'REMOVE_PLACE',
              parameters: params,
              description: `Remove "${resolved.stopTitle || targetStr}"`,
            }
          : undefined,
        reasoning: `Remove stop "${resolved.stopTitle || targetStr}" from itinerary.`,
      };
    }

    // -------------------------------------------------------------
    // Check 16: Reorder / Move Stop
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
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
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
    // Check 17: Add Place (with Pronoun Resolution for "it", "that place")
    // -------------------------------------------------------------
    const addMatch = lower.match(
      /(?:add|include|visit|put|insert|can we add|can i add|could we add|let's add|lets add)\s+(?:the\s+)?(.+)/i
    );
    if (addMatch) {
      let placeStr = addMatch[1]
        .replace(/[.?!]$/, '')
        .replace(/\b(to the trip|to the itinerary|to my day|in the plan|to my plan|please)\b/gi, '')
        .trim();

      let usedPronoun = false;
      if (/^(it|that|that one|that place|this place|there)$/i.test(placeStr)) {
        if (lastDiscussedPlace) {
          placeStr = lastDiscussedPlace;
          usedPronoun = true;
        } else if (pendingProposal && typeof pendingProposal.parameters?.placeName === 'string') {
          placeStr = pendingProposal.parameters.placeName;
          usedPronoun = true;
        }
      }

      // Check if place is already in current itinerary
      const alreadyPresent = context.currentStops.find(
        (s) =>
          s.title.toLowerCase().includes(placeStr.toLowerCase()) ||
          placeStr.toLowerCase().includes(s.title.toLowerCase())
      );

      if (alreadyPresent) {
        return {
          actionType: 'INFORMATIONAL_QUESTION',
          conversationMode: 'CURRENT_PLAN_QUESTION',
          parameters: {
            reply: `"${alreadyPresent.title}" is already in your itinerary (Stop #${alreadyPresent.index}, ${alreadyPresent.arrivalTime}–${alreadyPresent.departureTime}).`,
          },
          isSimulation: false,
          isQuestionOnly: true,
          requiresClarification: false,
          reasoning: 'Place is already included in current plan.',
        };
      }

      return {
        actionType: 'ADD_PLACE',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: {
          placeName: placeStr,
          forceInclude: true,
        },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        discussedPlace: placeStr,
        pendingProposal: isSimulation
          ? {
              actionType: 'ADD_PLACE',
              parameters: { placeName: placeStr, forceInclude: true },
              description: `Add "${placeStr}" to the itinerary`,
            }
          : undefined,
        reasoning: usedPronoun
          ? `Pronoun resolved to "${placeStr}": Add attraction "${placeStr}" to trip itinerary.`
          : `Add attraction "${placeStr}" to trip itinerary.`,
      };
    }

    // -------------------------------------------------------------
    // Check 18: Change Budget
    // -------------------------------------------------------------
    const budgetMatch =
      lower.match(
        /(?:budget|money|cost|spend|limit)\s+(?:is|to|of)?\s*(?:only\s*)?(?:₹|rs\.?|inr|\$)?\s*(\d+)/i
      ) ||
      lower.match(/(?:budget|money|cost|spend|limit).*?(?:₹|rs\.?|inr|\$)\s*(\d+)/i) ||
      lower.match(
        /(?:reduce|increase|change|set)\s+(?:the\s+)?budget\s+to\s*(?:₹|rs\.?|inr|\$)?\s*(\d+)/i
      );

    if (budgetMatch) {
      const budgetAmount = parseInt(budgetMatch[1], 10);
      return {
        actionType: 'CHANGE_BUDGET',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: { total: budgetAmount },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        pendingProposal: isSimulation
          ? {
              actionType: 'CHANGE_BUDGET',
              parameters: { total: budgetAmount },
              description: `Change total budget to ₹${budgetAmount}`,
            }
          : undefined,
        reasoning: `Update total trip budget to ₹${budgetAmount}.`,
      };
    }

    if (
      lower.includes('make it cheaper') ||
      lower.includes('make the trip cheaper') ||
      lower.includes('reduce budget') ||
      lower.includes('cut down the cost') ||
      lower.includes('lower the cost')
    ) {
      const currentBudget = context.budget.total;
      const spent = context.budget.spent;
      // If current spend is already well below 70% of budget, tighten budget below current spend so cost drops too
      const reducedBudget =
        spent > 200 && spent < currentBudget * 0.7
          ? Math.max(200, spent - 200)
          : Math.max(500, Math.round((currentBudget * 0.7) / 100) * 100);
      return {
        actionType: 'CHANGE_BUDGET',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: { total: reducedBudget, trimExpensiveStop: true },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        preferenceUpdate: { budgetSensitivity: 'high' },
        pendingProposal: isSimulation
          ? {
              actionType: 'CHANGE_BUDGET',
              parameters: { total: reducedBudget, trimExpensiveStop: true },
              description: `Reduce budget to ₹${reducedBudget} to make the trip cheaper`,
            }
          : undefined,
        reasoning: `Reduce budget from ₹${currentBudget} to ₹${reducedBudget} to make itinerary cheaper.`,
      };
    }

    // -------------------------------------------------------------
    // Check 19: Change Travel Mode
    // -------------------------------------------------------------
    const modeMatch =
      lower.match(
        /(?:walk|walking|drive|driving|transit|bicycle|cycle|bike|car|metro|bus)\s+(?:instead|mode|be better)/i
      ) ||
      lower.match(
        /(?:switch|change)\s+(?:travel\s+)?mode\s+to\s+(walk|drive|transit|bicycle)/i
      ) ||
      lower.match(/^(?:walk|drive|take transit|cycle)\b/i);

    if (
      modeMatch ||
      lower.includes('walk') ||
      lower.includes('transit') ||
      lower.includes('drive') ||
      lower.includes('bicycle')
    ) {
      let targetMode: TravelMode = 'drive';
      if (lower.includes('walk')) targetMode = 'walk';
      else if (lower.includes('transit') || lower.includes('metro') || lower.includes('bus'))
        targetMode = 'transit';
      else if (lower.includes('bicycle') || lower.includes('cycle') || lower.includes('bike'))
        targetMode = 'bicycle';
      else if (lower.includes('drive') || lower.includes('car')) targetMode = 'drive';

      if (targetMode !== context.travelMode || isSimulation) {
        return {
          actionType: 'CHANGE_TRAVEL_MODE',
          conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
          parameters: { travelMode: targetMode },
          isSimulation,
          isQuestionOnly: false,
          requiresClarification: false,
          pendingProposal: isSimulation
            ? {
                actionType: 'CHANGE_TRAVEL_MODE',
                parameters: { travelMode: targetMode },
                description: `Switch travel mode to ${targetMode}`,
              }
            : undefined,
          reasoning: `Switch travel mode from "${context.travelMode}" to "${targetMode}".`,
        };
      }
    }

    // -------------------------------------------------------------
    // Check 20: Change Time (Start / End)
    // -------------------------------------------------------------
    const timeMatch = lower.match(
      /(?:start|leave|depart)\s+(?:at|by)\s*(\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?)/i
    );
    if (timeMatch) {
      const parsedTime = this.normalizeTimeToHHMM(timeMatch[1]);
      return {
        actionType: 'CHANGE_START_TIME',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
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
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: { latestArrivalTime: parsedTime },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update latest arrival deadline to ${parsedTime}.`,
      };
    }

    // -------------------------------------------------------------
    // Check 21: Change People Count
    // -------------------------------------------------------------
    const peopleMatch =
      lower.match(/(\d+)\s*(?:of us|people|pax|travelers|friends|persons)/i) ||
      lower.match(/(?:there are|we are)\s+(\d+)/i);

    if (peopleMatch) {
      const count = parseInt(peopleMatch[1], 10);
      return {
        actionType: 'CHANGE_NUMBER_OF_PEOPLE',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: { numberOfPeople: count },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update traveler count to ${count}.`,
      };
    }

    // -------------------------------------------------------------
    // Check 22: Change Start / End Location
    // -------------------------------------------------------------
    const startLocMatch = lower.match(
      /(?:start from|depart from|leave from|starting point is)\s+([a-z0-9\s,.-]+)/i
    );
    if (startLocMatch && !timeMatch) {
      const orig = startLocMatch[1].replace(/\binstead\b/gi, '').trim();
      return {
        actionType: 'CHANGE_START_LOCATION',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: { locationName: orig, type: 'start' },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update trip starting point to "${orig}".`,
      };
    }

    const endLocMatch = lower.match(
      /(?:end at|destination is|actually end at|arrive at)\s+([a-z0-9\s,.-]+)/i
    );
    if (endLocMatch && !reachMatch) {
      const dest = endLocMatch[1].replace(/\binstead\b/gi, '').trim();
      return {
        actionType: 'CHANGE_END_LOCATION',
        conversationMode: isSimulation ? 'SIMULATION_AND_RECOMMENDATION' : 'ACTION_EXECUTION',
        parameters: { locationName: dest, type: 'end' },
        isSimulation,
        isQuestionOnly: false,
        requiresClarification: false,
        reasoning: `Update trip destination point to "${dest}".`,
      };
    }

    // Default: treat as open-ended conversational or informational question
    return {
      actionType: 'INFORMATIONAL_QUESTION',
      conversationMode: 'CURRENT_PLAN_QUESTION',
      parameters: { question: text },
      isSimulation: false,
      isQuestionOnly: true,
      requiresClarification: false,
      reasoning: 'Open-ended conversational or informational message.',
    };
  }

  /**
   * Extracts the most recently discussed attraction from context or conversation history
   */
  public extractLastDiscussedPlace(
    conversationHistory: CopilotMessage[],
    context: CopilotTripContext
  ): string | undefined {
    if (context.lastDiscussedPlace) {
      return context.lastDiscussedPlace;
    }

    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg.discussedPlace) {
        return msg.discussedPlace;
      }
      const profile = findAttractionProfile(msg.content);
      if (profile) {
        return profile.canonicalName;
      }
    }

    return undefined;
  }

  /**
   * Extracts the most recent pending action proposal from context or conversation history
   */
  public extractPendingProposal(
    conversationHistory: CopilotMessage[],
    context: CopilotTripContext
  ): PendingActionProposal | undefined {
    if (context.pendingProposal) {
      return context.pendingProposal;
    }

    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg.pendingProposal) {
        return msg.pendingProposal;
      }
      if (msg.role === 'assistant' && msg.actionExecuted) {
        if (msg.actionParameters && Object.keys(msg.actionParameters).length > 0) {
          return {
            actionType: msg.actionExecuted,
            parameters: msg.actionParameters,
            description: `Execute ${msg.actionExecuted}`,
          };
        }
        // Check preceding user message if assistant message only stored actionExecuted (e.g. Test 20 fixture)
        const prevUser = i > 0 ? conversationHistory[i - 1] : undefined;
        let inferredParams: Record<string, unknown> = {};
        if (prevUser && prevUser.role === 'user') {
          const prevLower = prevUser.content.toLowerCase();
          if (msg.actionExecuted === 'CHANGE_TRAVEL_MODE') {
            if (prevLower.includes('walk')) inferredParams = { travelMode: 'walk' };
            else if (prevLower.includes('transit')) inferredParams = { travelMode: 'transit' };
            else if (prevLower.includes('bicycle') || prevLower.includes('cycle'))
              inferredParams = { travelMode: 'bicycle' };
            else if (prevLower.includes('drive')) inferredParams = { travelMode: 'drive' };
          } else if (msg.actionExecuted === 'CHANGE_BUDGET') {
            const m = prevLower.match(/(\d+)/);
            if (m) inferredParams = { total: parseInt(m[1], 10) };
          } else if (msg.actionExecuted === 'ADD_PLACE') {
            const prof = findAttractionProfile(prevUser.content);
            if (prof) inferredParams = { placeName: prof.canonicalName, forceInclude: true };
          }
        }
        return {
          actionType: msg.actionExecuted,
          parameters: inferredParams,
          description: `Execute ${msg.actionExecuted}`,
        };
      }
    }

    return undefined;
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
    if (
      refLower.includes('first') ||
      refLower === '1' ||
      refLower === 'stop 1' ||
      refLower === 'place 1'
    ) {
      return { stopTitle: stops[0].title, stopIndex: 1, ambiguous: false };
    }
    if (
      refLower.includes('second') ||
      refLower === '2' ||
      refLower === 'stop 2' ||
      refLower === 'place 2'
    ) {
      if (stops.length >= 2) return { stopTitle: stops[1].title, stopIndex: 2, ambiguous: false };
    }
    if (
      refLower.includes('third') ||
      refLower === '3' ||
      refLower === 'stop 3' ||
      refLower === 'place 3'
    ) {
      if (stops.length >= 3) return { stopTitle: stops[2].title, stopIndex: 3, ambiguous: false };
    }
    if (refLower.includes('last') || refLower.includes('final stop')) {
      const lastStop = stops[stops.length - 1];
      return { stopTitle: lastStop.title, stopIndex: stops.length, ambiguous: false };
    }

    // 2. Exact or substring match
    const exactMatches = stops.filter((s) => s.title.toLowerCase().includes(refLower));
    if (exactMatches.length === 1) {
      return {
        stopTitle: exactMatches[0].title,
        stopIndex: exactMatches[0].index,
        ambiguous: false,
      };
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
    const partialMatches = stops.filter((s) =>
      words.some((w) => s.title.toLowerCase().includes(w))
    );
    if (partialMatches.length === 1) {
      return {
        stopTitle: partialMatches[0].title,
        stopIndex: partialMatches[0].index,
        ambiguous: false,
      };
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
    if (!isAM && !isPM && hour >= 1 && hour <= 7) hour += 12;

    return `${hour.toString().padStart(2, '0')}:00`;
  }

  /**
   * Groq LLM conversational & tool-calling parser with multi-turn context (up to 8 turns)
   */
  private async queryGroqForIntent(
    userMessage: string,
    context: CopilotTripContext,
    conversationHistory: CopilotMessage[],
    ruleBasedDecision?: CopilotToolDecision
  ): Promise<CopilotToolDecision | null> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) return null;

    const Groq = (await import('groq-sdk')).default;
    const client = new Groq({ apiKey, timeout: 10000 });

    const lastPlace = this.extractLastDiscussedPlace(conversationHistory, context);
    const pending = this.extractPendingProposal(conversationHistory, context);
    const prefs = context.userPreferences;

    const systemPrompt = `You are the Trip Copilot — an intelligent, conversational AI travel assistant for a One-Day City Planner.
You help travelers understand, discuss, simulate, and modify their active day trip in ${context.city}.

CONVERSATIONAL VOICE & RULES:
1. Speak naturally, thoughtfully, and directly like an expert local travel advisor. Avoid robotic openings ("Sure!", "Certainly!", "As an AI").
2. The user's latest message determines what your response must address. General questions deserve direct, helpful answers, not unrelated itinerary summaries.
3. If no itinerary has been generated yet, clearly acknowledge that planning is underway; never answer as if a completed or optimized route already exists.
4. Expressing a preference (e.g. "I prefer history", "I don't enjoy crowded attractions") is preference sharing, NOT authorization to mutate the active itinerary. Acknowledge preferences and suggest options; never describe unexecuted changes as completed actions.
5. Recommendations should be specific and relevant to earlier expressed preferences, trip constraints, and conversation history. Explain why recommendations fit.
6. Never fabricate coordinates, prices, opening hours, or crowd levels. Unknown metrics must not be presented as verified facts.
7. Distinguish between FOUR modes:
   - Mode A (General Conversation): Greetings, attraction details, comparisons, or user preference sharing -> Answer naturally in text WITHOUT calling itinerary mutation tools.
   - Mode B (Current-Plan Questions): Questions about cost, timing, buffers, or why a stop was selected -> Use "explain_itinerary" or answer grounded strictly in the CURRENT TRIP CONTEXT.
   - Mode C (Simulation & Recommendations): Hypothetical "What if..." questions -> Call "simulate_change"; improvement requests -> Call "suggest_improvements".
   - Mode D (Action Execution): Explicit commands to add, remove, replace, reorder, make less tiring, or change constraints -> Call the corresponding structured tool.
8. Resolve pronouns ("it", "that place") using Last Discussed Place (${lastPlace || 'none'}).
9. Do not repeatedly end responses with an unnecessary request to apply changes.

CURRENT TRIP CONTEXT:
- City: ${context.city} (${context.startPoint.name} -> ${context.endPoint.name})
- Status: ${context.hasItinerary ? 'Itinerary is planned and active.' : 'No itinerary has been planned or generated yet (planning phase).'}
- Planning Window Capacity: ${context.planningWindowMinutes} minutes (${context.timeWindow.startTime} to ${context.timeWindow.latestArrivalTime})
${context.hasItinerary ? `- Planned Arrival: ${context.plannedArrivalTime}
- Current Visited Stops: ${context.currentStops.map((s) => `#${s.index} ${s.title} (${s.arrivalTime}-${s.departureTime}, ${context.budget.currency}${s.costTotal})`).join('; ')}
- Safety Buffer: ${context.safetyBufferMinutes}m, Unused Available Time: ${context.unusedAvailableMinutes}m` : '- Current Stops: None yet planned.'}
- Budget: ${context.budget.currency}${context.budget.total} (Spent: ${context.budget.currency}${context.budget.spent}, Remaining: ${context.budget.currency}${context.budget.remaining})
- Travel Mode: ${context.travelMode}, Travelers: ${context.numberOfPeople}
- User Preferences: Preferred=[${prefs?.preferredCategories?.join(', ') || context.interests.join(', ')}], Disliked=[${prefs?.dislikedCategories?.join(', ') || 'none'}], Crowd=[${prefs?.crowdPreference || 'any'}], Pace=[${prefs?.pacePreference || 'moderate'}]
- Last Discussed Place: ${lastPlace || 'none'}
- Pending Proposal: ${pending ? `${pending.actionType} (${JSON.stringify(pending.parameters)})` : 'none'}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Include up to 8 recent messages for full multi-turn context retention
    for (const hist of conversationHistory.slice(-8)) {
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
        tools: COPILOT_TOOL_DEFINITIONS as unknown as Parameters<
          typeof client.chat.completions.create
        >[0]['tools'],
        tool_choice: 'auto',
        temperature: 0.2,
      },
      { signal: AbortSignal.timeout(10000) }
    );

    const choice = response.choices[0];
    const toolCall = choice?.message?.tool_calls?.[0];

    // If Groq answered conversationally without calling a tool, preserve its conversational reply!
    if (!toolCall) {
      const content = choice?.message?.content?.trim();
      if (content) {
        // Strip any <think>...</think> reasoning tags if present from Qwen
        const cleanedContent = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (cleanedContent) {
          const isSimOrRec =
            (ruleBasedDecision && ruleBasedDecision.conversationMode === 'SIMULATION_AND_RECOMMENDATION') ||
            /recommend|suggest|what if/i.test(userMessage);
          const isGeneral =
            !context.hasItinerary ||
            (ruleBasedDecision && ruleBasedDecision.conversationMode === 'GENERAL_CONVERSATION');

          const resolvedMode: ConversationMode = isSimOrRec
            ? 'SIMULATION_AND_RECOMMENDATION'
            : isGeneral
              ? 'GENERAL_CONVERSATION'
              : 'CURRENT_PLAN_QUESTION';

          return {
            actionType: isGeneral ? 'GENERAL_CONVERSATION' : 'INFORMATIONAL_QUESTION',
            conversationMode: resolvedMode,
            parameters: { question: userMessage },
            isSimulation: isSimOrRec && Boolean(ruleBasedDecision?.isSimulation),
            isQuestionOnly: true,
            requiresClarification: false,
            conversationalReply: cleanedContent,
            reasoning: 'Groq direct conversational response (no tool call required).',
          };
        }
      }
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
      make_less_tiring: 'MAKE_LESS_TIRING',
      update_preferences: 'UPDATE_PREFERENCES',
    };

    let actionType = actionMap[toolName] || 'INFORMATIONAL_QUESTION';
    let isSimulation = actionType === 'SIMULATE_CHANGE';

    // Unwrap simulate_change tool call into underlying actionType + isSimulation=true
    if (actionType === 'SIMULATE_CHANGE' && typeof args.actionType === 'string') {
      actionType = args.actionType as CopilotActionType;
      args = (args.parameters as Record<string, unknown>) || {};
      isSimulation = true;
    }

    const isQuestionOnly =
      actionType === 'EXPLAIN_ITINERARY' || actionType === 'INFORMATIONAL_QUESTION';

    return {
      actionType,
      conversationMode: isSimulation
        ? 'SIMULATION_AND_RECOMMENDATION'
        : isQuestionOnly
          ? 'CURRENT_PLAN_QUESTION'
          : actionType === 'UPDATE_PREFERENCES'
            ? 'GENERAL_CONVERSATION'
            : 'ACTION_EXECUTION',
      parameters: args,
      isSimulation,
      isQuestionOnly,
      requiresClarification: false,
      preferenceUpdate: actionType === 'UPDATE_PREFERENCES' ? (args as Partial<CopilotUserPreferences>) : undefined,
      reasoning: `Groq tool call: ${toolName}`,
    };
  }
}
