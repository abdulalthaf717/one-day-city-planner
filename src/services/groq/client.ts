/**
 * Groq LLM service implementation using the official groq-sdk.
 *
 * Security: This client must only be initialized and invoked on the server side.
 * Free-Tier Rule: Must use confirmed free-tier models (default: qwen/qwen3.8-27b).
 * Strict Rule: Never expose GROQ_API_KEY to client-side code.
 */

import Groq from 'groq-sdk';
import {
  IGroqService,
  LandmarkImageAnalysis,
  PlannerDecision,
  PlannerDecisionContext,
  ReplanningExplanationRequest,
  SemanticPreferenceAnalysis,
} from './types';
import { TripConstraints } from '@/domain';

export class GroqService implements IGroqService {
  private client: Groq | null = null;
  private readonly modelName: string;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    this.modelName = process.env.GROQ_MODEL?.trim() || 'qwen/qwen3.8-27b';

    if (apiKey) {
      this.client = new Groq({ apiKey, timeout: 10000 });
    }
  }

  private ensureClient(): Groq {
    if (!this.client) {
      throw new Error(
        'GROQ_API_KEY environment variable is not configured. Please add it to .env.local to enable Groq LLM capabilities.'
      );
    }
    return this.client;
  }

  /**
   * Generates a structured tool selection or finalization decision
   */
  async getPlannerDecision(context: PlannerDecisionContext): Promise<PlannerDecision> {
    const groq = this.ensureClient();

    const systemPrompt = `You are the travel planner agent orchestrator.
Evaluate the current trip planning state and decide the next action.
You must return ONLY a JSON object matching this schema:
{
  "decision": "CALL_TOOL" | "FINALIZE" | "ASK_USER" | "REPLAN",
  "tool": "resolve_locations" | "discover_candidates" | "calculate_route_matrix" | "optimize_itinerary" | "validate_itinerary",
  "arguments": {},
  "reason": "Clear explanation grounded strictly in the current planning state."
}

Rules:
1. If locations are unresolved, call "resolve_locations".
2. If candidate places are missing, call "discover_candidates".
3. If route matrix is missing, call "calculate_route_matrix".
4. If itinerary is missing, call "optimize_itinerary".
5. If validation is missing, call "validate_itinerary".
6. If validator confirmed hard constraints, return "FINALIZE".
7. Never invent tools or arguments outside the approved list.`;

    const userPrompt = `Planning State:
- City: ${context.constraints.city}
- Mode: ${context.constraints.travelMode}
- Has Resolved Start: ${context.state.hasResolvedStart}
- Has Resolved End: ${context.state.hasResolvedEnd}
- Candidate Count: ${context.state.candidateCount}
- Has Route Matrix: ${context.state.hasRouteMatrix}
- Has Itinerary: ${context.state.hasItinerary}
- Validation Status: ${context.state.validationStatus || 'Pending'}
- Iteration: ${context.iteration}
${context.lastToolResultSummary ? `- Last Result: ${context.lastToolResultSummary}` : ''}`;

    try {
      const completion = await groq.chat.completions.create(
        {
          model: this.modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
        },
        { signal: AbortSignal.timeout(10000) }
      );

      const text = completion.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(text);

      return {
        decision: parsed.decision || 'CALL_TOOL',
        tool: parsed.tool,
        arguments: parsed.arguments || {},
        reason: parsed.reason || 'Decision reached from planning state.',
      };
    } catch (err: unknown) {
      // Graceful fallback logic based on deterministic state
      const isRateLimit = err instanceof Error && err.message.includes('429');
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message.toLowerCase().includes('timeout'));
      const reasonPrefix = isTimeout
        ? '[Timeout Fallback (10s)] '
        : isRateLimit
        ? '[Rate Limit Fallback] '
        : '[Parsing Fallback] ';

      if (!context.state.hasResolvedStart || !context.state.hasResolvedEnd) {
        return {
          decision: 'CALL_TOOL',
          tool: 'resolve_locations',
          reason: reasonPrefix + 'Start or end coordinates are not yet resolved.',
        };
      }
      if (context.state.candidateCount === 0) {
        return {
          decision: 'CALL_TOOL',
          tool: 'discover_candidates',
          reason: reasonPrefix + 'Candidate places have not yet been retrieved.',
        };
      }
      if (!context.state.hasRouteMatrix) {
        return {
          decision: 'CALL_TOOL',
          tool: 'calculate_route_matrix',
          reason: reasonPrefix + 'Route matrix is required for travel timing.',
        };
      }
      if (!context.state.hasItinerary) {
        return {
          decision: 'CALL_TOOL',
          tool: 'optimize_itinerary',
          reason: reasonPrefix + 'Executing deterministic optimizer.',
        };
      }
      if (!context.state.validationStatus) {
        return {
          decision: 'CALL_TOOL',
          tool: 'validate_itinerary',
          reason: reasonPrefix + 'Evaluating hard constraint checks.',
        };
      }
      return {
        decision: 'FINALIZE',
        reason: reasonPrefix + 'Validated itinerary finalized.',
      };
    }
  }

  /**
   * Translates freeform user preferences and tags into categorized recommendation targets
   */
  async interpretPreferences(
    rawText: string,
    currentConstraints: TripConstraints
  ): Promise<SemanticPreferenceAnalysis> {
    const groq = this.ensureClient();

    const prompt = `You are the semantic interpreter for an agentic travel planner.
User city: ${currentConstraints.city}
Existing tags: ${currentConstraints.interests.join(', ') || 'None provided'}
Available hours: ${currentConstraints.time.startTime} to ${currentConstraints.time.latestArrivalTime}
Budget: ${currentConstraints.budget.currency} ${currentConstraints.budget.total} for ${currentConstraints.numberOfPeople} people.
User freeform input: "${rawText}"

Extract:
1. Specific inferred interests.
2. Geoapify place categories to search (e.g., "tourism.sights", "catering.restaurant", "entertainment.culture", "heritage", "commercial.shopping").
3. Recommended pace: "relaxed", "moderate", or "packed".
4. Brief reasoning.

Respond ONLY with valid JSON in this structure:
{
  "inferredInterests": ["history", "local_food"],
  "recommendedCategories": ["tourism.sights", "catering.restaurant"],
  "suggestedPace": "moderate",
  "reasoning": "User asked for historical sights and local food within moderate daytime hours."
}`;

    try {
      const completion = await groq.chat.completions.create(
        {
          model: this.modelName,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        },
        { signal: AbortSignal.timeout(10000) }
      );

      const text = completion.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(text);

      return {
        inferredInterests: Array.isArray(parsed.inferredInterests) ? parsed.inferredInterests : [],
        recommendedCategories: Array.isArray(parsed.recommendedCategories)
          ? parsed.recommendedCategories
          : ['tourism.sights'],
        suggestedPace: parsed.suggestedPace || 'moderate',
        reasoning: parsed.reasoning || 'Standard pace based on user constraints.',
      };
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message.toLowerCase().includes('timeout'));
      return {
        inferredInterests: currentConstraints.interests,
        recommendedCategories: ['tourism.sights', 'catering.restaurant'],
        suggestedPace: 'moderate',
        reasoning: isTimeout
          ? 'Fallback semantic parsing due to model request timeout (10s).'
          : 'Fallback semantic parsing due to model JSON formatting.',
      };
    }
  }

  /**
   * Multimodal vision analysis for tourist photo/landmark verification
   */
  async analyzeLandmarkImage(
    imageBase64: string,
    mimeType: string,
    cityContext?: string
  ): Promise<LandmarkImageAnalysis> {
    const groq = this.ensureClient();

    const prompt = `Analyze this image for an agentic travel planning system${cityContext ? ` in or near ${cityContext}` : ''}.
Categorize the image into one of these types:
1. "tourist_place": Tourist attraction, landmark, historical monument, museum, park, religious site, or building.
2. "food": A dish, meal, or beverage (e.g. biryani, dosa). Note: Do NOT invent a restaurant name if only food is shown.
3. "event_poster": An announcement or poster for an event, festival, concert, or exhibition. Extract visible event details.
4. "tourism_map": A tourist map, brochure, or city guide diagram showing one or multiple points of interest. Extract place names.
5. "unrecognized": An arbitrary, non-travel, or unidentifiable image.

CRITICAL ACCURACY & INTEGRITY RULES:
- Never treat uncertain recognition as definitive fact.
- If uncertain, set confidence to "low", confidenceScore <= 0.5, and list possible alternatives.
- Do NOT expose internal chain-of-thought; provide only a concise user-facing visual evidence summary.
- Provide a clean search query to verify against Geoapify Places API.

Return ONLY a valid JSON object matching this schema:
{
  "identifiedType": "tourist_place" | "food" | "event_poster" | "tourism_map" | "unrecognized",
  "identifiedName": "Name of landmark, dish, or event",
  "city": "${cityContext || ''}",
  "description": "Short user-facing summary (1-2 sentences)",
  "categorySuggestion": "historic | museum | attraction | restaurant | park | other",
  "confidence": "high | medium | low",
  "confidenceScore": 0.85,
  "reasoningSummary": "Visible architectural or photographic evidence",
  "searchQueryForVerification": "Clean search query for Geoapify Places API",
  "isAmbiguous": false,
  "possibleAlternatives": ["Alternative 1", "Alternative 2"],
  "eventDetails": {
    "eventName": "Optional event name",
    "date": "Optional date",
    "time": "Optional time",
    "venue": "Optional venue",
    "category": "Optional category"
  },
  "mapExtractedPlaces": ["Optional list of place names if tourism_map"]
}`;

    try {
      const completion = await groq.chat.completions.create(
        {
          model: this.modelName,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
        },
        { signal: AbortSignal.timeout(10000) }
      );

      const text = completion.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(text);

      const confidence = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'medium';

      const confidenceScore = typeof parsed.confidenceScore === 'number'
        ? Math.max(0, Math.min(1, parsed.confidenceScore))
        : (confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.65 : 0.35);

      return {
        identifiedType: parsed.identifiedType || 'tourist_place',
        identifiedName: parsed.identifiedName || parsed.name || 'Unverified Location',
        city: parsed.city || cityContext,
        description: parsed.description || 'Image analyzed for travel recommendations.',
        categorySuggestion: parsed.categorySuggestion || 'attraction',
        confidence,
        confidenceScore,
        reasoning: parsed.reasoningSummary || parsed.reasoning || 'Visual evidence identified from image.',
        searchQueryForVerification: parsed.searchQueryForVerification || parsed.identifiedName || 'tourist attraction',
        isAmbiguous: Boolean(parsed.isAmbiguous),
        possibleAlternatives: Array.isArray(parsed.possibleAlternatives) ? parsed.possibleAlternatives : [],
        eventDetails: parsed.eventDetails,
        mapExtractedPlaces: Array.isArray(parsed.mapExtractedPlaces) ? parsed.mapExtractedPlaces : undefined,
      };
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message.toLowerCase().includes('timeout'));
      return {
        identifiedType: 'unrecognized',
        identifiedName: 'Unverified Location',
        city: cityContext,
        description: isTimeout
          ? 'Image processing timed out after 10s.'
          : 'Image processing completed with inconclusive identification.',
        categorySuggestion: 'attraction',
        confidence: 'low',
        confidenceScore: 0.25,
        reasoning: isTimeout
          ? 'Vision API request timed out after 10s.'
          : 'Image processing completed with inconclusive identification.',
        searchQueryForVerification: cityContext ? `${cityContext} attractions` : 'tourist attraction',
        isAmbiguous: true,
        possibleAlternatives: [],
      };
    }
  }

  /**
   * Natural language trade-off explanation when constraints change and trigger replanning.
   * Strictly grounded in structured before/after facts. Never invents causal claims.
   */
  async explainReplanning(request: ReplanningExplanationRequest): Promise<string> {
    const groq = this.ensureClient();

    const changeDescriptions = request.changedConstraints
      .map((c) => `- ${c.label}: changed from "${String(c.oldValue)}" to "${String(c.newValue)}" (${c.description})`)
      .join('\n');

    const prompt = `You are the travel planning assistant explaining an itinerary recalculation to the user.
The user modified the following constraints:
${changeDescriptions}

Previous plan summary:
${request.previousPlanBrief}

New optimized plan summary:
${request.newPlanBrief}

Briefly and concisely explain:
1. Why the itinerary was modified.
2. What trade-offs were made (e.g., places swapped, routes adjusted, or visit times changed).
Keep your response friendly, clear, and under 3-4 sentences. Do NOT invent fake URLs or fake metrics.`;

    try {
      const completion = await groq.chat.completions.create(
        {
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content:
                'You are a precise, friendly travel assistant. Ground all explanations strictly in the provided constraints and numbers. Do not invent traffic claims or external facts.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 250,
        },
        { signal: AbortSignal.timeout(10000) }
      );

      return completion.choices[0]?.message?.content?.trim() || 'Itinerary updated according to revised constraints.';
    } catch (err: unknown) {
      // Fail gracefully: caller will fall back to deterministic factual diff
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429')) {
        console.warn('[GroqService] Quota/Rate limit reached (HTTP 429). Using deterministic explanation.');
      } else if (
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError' || msg.toLowerCase().includes('timeout'))
      ) {
        console.warn('[GroqService] Request timed out after 10s. Using deterministic explanation.');
      }
      throw err;
    }
  }
}
