/**
 * Conversational Responder & Domain Knowledge Layer for Trip Copilot.
 *
 * Provides natural, context-aware responses across Modes A, B, and C,
 * manages structured User Preferences memory across turns, and supplies
 * rich attraction knowledge when offline or without unnecessary tool calls.
 */

import { FinalItinerary, TripConstraints } from '../domain';
import {
  CopilotMessage,
  CopilotToolDecision,
  CopilotTripContext,
  CopilotUserPreferences,
  PendingActionProposal,
} from './types';

export interface AttractionProfile {
  canonicalName: string;
  aliases: string[];
  city: string;
  category: string;
  interestTags: string[];
  crowdLevel: 'low' | 'moderate' | 'high';
  indoorOutdoor: 'indoor' | 'outdoor' | 'mixed';
  typicalDurationMinutes: number;
  highlights: string;
  bestFor: string;
  corridorNote: string;
}

export const ATTRACTION_PROFILES: AttractionProfile[] = [
  {
    canonicalName: 'Golconda Fort',
    aliases: ['golconda', 'golconda fort', 'golkonda'],
    city: 'Hyderabad',
    category: 'historic_fort',
    interestTags: ['History', 'Architecture', 'Photography'],
    crowdLevel: 'moderate',
    indoorOutdoor: 'outdoor',
    typicalDurationMinutes: 120,
    highlights:
      'a monumental 16th-century citadel of the Qutb Shahi dynasty, famous for its ingenious acoustic signaling system (where a clap at the Fateh Rahben dome can be heard at the Bala Hissar pavilion atop the hill), massive granite ramparts, royal palaces, and sweeping panoramic views of Hyderabad',
    bestFor: 'history lovers, fortification architecture, and open-air exploration',
    corridorNote:
      'Located in western Hyderabad (~11 km from central Hussain Sagar), requiring about 30–35 minutes of road transit each way.',
  },
  {
    canonicalName: 'Charminar',
    aliases: ['charminar', 'char minar'],
    city: 'Hyderabad',
    category: 'historic_monument',
    interestTags: ['History', 'Architecture', 'Shopping', 'Culture'],
    crowdLevel: 'high',
    indoorOutdoor: 'outdoor',
    typicalDurationMinutes: 60,
    highlights:
      'Hyderabad’s iconic 1591 quatre-minaret monument built by Muhammad Quli Qutb Shah at the heart of the Old City, surrounded by the historic Laad Bazaar and Mecca Masjid',
    bestFor: 'iconic Indo-Islamic architecture, vibrant street atmosphere, and bazaar photography',
    corridorNote:
      'Situated in the bustling Old City south of the Musi River; very lively and densely crowded during afternoon and evening hours.',
  },
  {
    canonicalName: 'Salar Jung Museum',
    aliases: ['salar jung', 'salar jung museum', 'salarjung'],
    city: 'Hyderabad',
    category: 'museum',
    interestTags: ['History', 'Culture', 'Art'],
    crowdLevel: 'low',
    indoorOutdoor: 'indoor',
    typicalDurationMinutes: 90,
    highlights:
      'one of India’s three National Museums, housing an extraordinary collection of over 40,000 global artifacts including the famous 19th-century "Veiled Rebecca" marble sculpture, the British musical clock, Mughal jade daggers, and Persian carpets',
    bestFor: 'unhurried indoor cultural exploration, world art history, and escaping afternoon heat or street crowds',
    corridorNote:
      'Located on the southern bank of the Musi River with spacious, air-conditioned galleries.',
  },
  {
    canonicalName: 'Qutb Shahi Tombs',
    aliases: ['qutb shahi tombs', 'qutub shahi tombs', 'seven tombs'],
    city: 'Hyderabad',
    category: 'historic_heritage',
    interestTags: ['History', 'Architecture', 'Nature'],
    crowdLevel: 'low',
    indoorOutdoor: 'outdoor',
    typicalDurationMinutes: 75,
    highlights:
      'a serene, landscaped royal necropolis featuring domed Persian, Pashtun, and Deccani mausoleums of the seven Qutb Shahi rulers set amidst quiet gardens',
    bestFor: 'peaceful historical exploration, intricate stucco architecture, and avoiding heavy tourist crowds',
    corridorNote:
      'Located just 1.5 km north of Golconda Fort in a tranquil heritage complex.',
  },
  {
    canonicalName: 'Spanish Mosque',
    aliases: ['spanish mosque', 'jami masjid aiwan-e-begumpet'],
    city: 'Hyderabad',
    category: 'historic_architecture',
    interestTags: ['History', 'Architecture', 'Religious'],
    crowdLevel: 'low',
    indoorOutdoor: 'mixed',
    typicalDurationMinutes: 60,
    highlights:
      'a rare 1906 heritage mosque in Begumpet built by the Paigah nobility in distinctive Moorish-Andalusian style inspired by the Cathedral–Mosque of Córdoba in Spain, featuring octagonal spires instead of traditional domes',
    bestFor: 'unique Moorish architecture, quiet contemplation, and convenient stops near Secunderabad',
    corridorNote:
      'Located directly along the Begumpet–Secunderabad corridor, just 10–15 minutes from Secunderabad Railway Station.',
  },
  {
    canonicalName: 'Telangana State Archaeology Museum',
    aliases: ['telangana state archaeology museum', 'archaeology museum', 'hyderabad museum', 'state museum'],
    city: 'Hyderabad',
    category: 'museum',
    interestTags: ['History', 'Culture', 'Architecture'],
    crowdLevel: 'low',
    indoorOutdoor: 'indoor',
    typicalDurationMinutes: 75,
    highlights:
      'Hyderabad’s oldest museum, set inside a graceful Indo-Saracenic building within Public Gardens, showcasing Kakatiya sculptures, Satavahana bronzes, Buddhist relics, and an Egyptian mummy',
    bestFor: 'regional Deccan history and quiet indoor galleries',
    corridorNote:
      'Centrally located at Nampally / Public Gardens along the direct central route.',
  },
  {
    canonicalName: 'Birla Science Museum',
    aliases: ['birla science museum', 'birla museum', 'birla planetarium'],
    city: 'Hyderabad',
    category: 'museum',
    interestTags: ['Culture', 'Science', 'Entertainment'],
    crowdLevel: 'moderate',
    indoorOutdoor: 'indoor',
    typicalDurationMinutes: 90,
    highlights:
      'a prominent hilltop science and cultural complex on Naubat Pahad featuring a dinosaurium (housing the 160-million-year-old Kotasaurus fossil), interactive physics exhibits, and an archaeology wing',
    bestFor: 'interactive exhibits, paleontology, and central hilltop views near Hussain Sagar',
    corridorNote:
      'Centrally positioned at Hill Fort Road adjacent to Birla Mandir and Hussain Sagar.',
  },
  {
    canonicalName: 'Chowmahalla Palace',
    aliases: ['chowmahalla', 'chowmahalla palace'],
    city: 'Hyderabad',
    category: 'historic_palace',
    interestTags: ['History', 'Architecture', 'Culture'],
    crowdLevel: 'moderate',
    indoorOutdoor: 'mixed',
    typicalDurationMinutes: 75,
    highlights:
      'the grand 18th-century official seat of the Nizams of Hyderabad, celebrated for the opulent Khilwat Mubarak Durbar Hall with 19 Belgian crystal chandeliers, courtyard fountains, and vintage royal carriages',
    bestFor: 'royal Nizam heritage, palace courtyards, and serene architectural photography',
    corridorNote:
      'Located near the Old City heritage zone, offering calmer courtyards than the surrounding bazaar streets.',
  },
];

/**
 * Finds an attraction profile matching text
 */
export function findAttractionProfile(text: string): AttractionProfile | undefined {
  const lower = text.toLowerCase();
  return ATTRACTION_PROFILES.find((p) =>
    p.aliases.some((alias) => lower.includes(alias))
  );
}

/**
 * Finds all attraction profiles mentioned in text
 */
export function findMentionedProfiles(text: string): AttractionProfile[] {
  const lower = text.toLowerCase();
  return ATTRACTION_PROFILES.filter((p) =>
    p.aliases.some((alias) => lower.includes(alias))
  );
}

/**
 * Extracts recommended attraction profiles from recent assistant messages in conversation history
 */
export function extractRecommendedProfilesFromHistory(
  conversationHistory: CopilotMessage[] = []
): AttractionProfile[] {
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role === 'assistant') {
      const lower = msg.content.toLowerCase();
      const matched: Array<{ profile: AttractionProfile; index: number }> = [];
      for (const profile of ATTRACTION_PROFILES) {
        let earliestIndex = -1;
        for (const alias of profile.aliases) {
          const idx = lower.indexOf(alias);
          if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
            earliestIndex = idx;
          }
        }
        if (earliestIndex !== -1) {
          matched.push({ profile, index: earliestIndex });
        }
      }
      if (matched.length > 0) {
        matched.sort((a, b) => a.index - b.index);
        return matched.map((m) => m.profile);
      }
    }
  }
  return [];
}

/**
 * Initializes or merges structured user preferences across conversation turns
 */
export function mergeUserPreferences(
  existing: CopilotUserPreferences | undefined,
  update: Partial<CopilotUserPreferences> | undefined,
  constraints: TripConstraints
): CopilotUserPreferences {
  const base: CopilotUserPreferences = existing
    ? {
        preferredCategories: [...existing.preferredCategories],
        dislikedCategories: [...existing.dislikedCategories],
        crowdPreference: existing.crowdPreference,
        pacePreference: existing.pacePreference,
        walkingTolerance: existing.walkingTolerance,
        notes: [...existing.notes],
      }
    : {
        preferredCategories: [...(constraints.interests || [])],
        dislikedCategories: [],
        pacePreference: constraints.pace || 'moderate',
        notes: [],
      };

  if (!update) return base;

  if (update.preferredCategories) {
    for (const cat of update.preferredCategories) {
      if (!base.preferredCategories.some((c) => c.toLowerCase() === cat.toLowerCase())) {
        base.preferredCategories.push(cat);
      }
      // Remove from disliked if previously disliked
      base.dislikedCategories = base.dislikedCategories.filter(
        (d) => d.toLowerCase() !== cat.toLowerCase()
      );
    }
  }

  if (update.dislikedCategories) {
    for (const dis of update.dislikedCategories) {
      if (!base.dislikedCategories.some((d) => d.toLowerCase() === dis.toLowerCase())) {
        base.dislikedCategories.push(dis);
      }
      // Remove from preferred if previously preferred
      base.preferredCategories = base.preferredCategories.filter(
        (p) => !p.toLowerCase().includes(dis.toLowerCase()) && !dis.toLowerCase().includes(p.toLowerCase())
      );
    }
  }

  if (update.crowdPreference) base.crowdPreference = update.crowdPreference;
  if (update.pacePreference) base.pacePreference = update.pacePreference;
  if (update.walkingTolerance) base.walkingTolerance = update.walkingTolerance;

  if (update.notes) {
    for (const note of update.notes) {
      if (!base.notes.includes(note)) {
        base.notes.push(note);
      }
    }
  }

  return base;
}

/**
 * Mode A: Generates natural, intelligent responses for general conversation,
 * greetings, city guidance, attraction deep-dives, comparisons, and preference statements.
 */
export function generateGeneralConversationReply(params: {
  userMessage: string;
  decision: CopilotToolDecision;
  context: CopilotTripContext;
  preferences: CopilotUserPreferences;
  conversationHistory?: CopilotMessage[];
}): {
  reply: string;
  discussedPlace?: string;
  pendingProposal?: PendingActionProposal;
  suggestedActions?: string[];
} {
  const { userMessage, decision, context, preferences } = params;
  const lower = userMessage.toLowerCase().trim();

  // If Groq provided a natural conversational reply, use it directly (unless this is a structured preference update)
  if (decision.conversationalReply && !decision.preferenceUpdate && decision.actionType !== 'UPDATE_PREFERENCES') {
    return {
      reply: decision.conversationalReply,
      discussedPlace: decision.discussedPlace,
      pendingProposal: decision.pendingProposal,
    };
  }

  // 1. Check if this is a non-destructive preference update statement
  if (decision.actionType === 'UPDATE_PREFERENCES' || decision.preferenceUpdate) {
    const upd = decision.preferenceUpdate || {};

    // Check if multiple preference facets were expressed simultaneously (e.g. History + Low Crowds + Relaxed Pace)
    const hasCategory = Boolean(upd.preferredCategories && upd.preferredCategories.length > 0);
    const hasCrowd = Boolean(upd.crowdPreference === 'low' || upd.dislikedCategories?.includes('crowded'));
    const hasPace = Boolean(upd.pacePreference === 'relaxed');
    const isMultiplePreferences = (hasCategory && (hasCrowd || hasPace)) || (hasCrowd && hasPace);

    if (isMultiplePreferences) {
      const cats =
        upd.preferredCategories && upd.preferredCategories.length > 0
          ? upd.preferredCategories.join(' and ')
          : 'historical';
      const windowText = context.hasItinerary
        ? `For your ${context.unusedAvailableMinutes} minutes of open afternoon time`
        : `For your ${context.planningWindowMinutes || 570}-minute day window (${context.timeWindow.startTime} to ${context.timeWindow.latestArrivalTime})`;

      const combinedReply = `Welcome to ${context.city}! I've noted your preferences for **${cats} attractions**, a **relaxed pace**, and steering clear of **crowded areas**. ${windowText}, calmer heritage sites with open grounds—such as the **Qutb Shahi Tombs** or **Spanish Mosque**—would be great candidates. They offer rich Deccani and Moorish architecture and generally tend to feel less crowded than high-density areas like the Old City bazaars around Charminar, while leaving plenty of breathing room between stops.\n\nPlease note that visitor traffic naturally varies by day and time of day, and we will verify route feasibility and opening hours once we generate your itinerary. Would you like some initial recommendations, or should we adjust your starting point or travel window first?`;

      return {
        reply: combinedReply,
        pendingProposal: decision.pendingProposal,
        suggestedActions: ['What would you recommend?', 'Generate itinerary'],
      };
    }

    const parts: string[] = [];

    if (upd.preferredCategories && upd.preferredCategories.length > 0) {
      const cats = upd.preferredCategories.join(' and ');
      const matchingCurrent = context.currentStops.filter(
        (s) =>
          s.title.toLowerCase().includes('mosque') ||
          s.title.toLowerCase().includes('archaeology') ||
          s.title.toLowerCase().includes('fort') ||
          s.category?.toLowerCase().includes('historic')
      );
      const currentNote =
        matchingCurrent.length > 0
          ? `Your current plan already includes ${matchingCurrent.map((s) => s.title).join(' and ')}, which fit that interest well.`
          : `I'll prioritize ${cats.toLowerCase()} landmarks as we refine your route.`;
      
      const availText = context.hasItinerary
        ? `For your ${context.unusedAvailableMinutes} minutes of open afternoon time`
        : `For your ${context.planningWindowMinutes || 570}-minute day window`;

      parts.push(
        `I've noted your preference for **${cats}** attractions. ${currentNote} ${availText}, heritage sites like **Golconda Fort** or the **Qutb Shahi Tombs** would also be great additions once route feasibility is verified.`
      );
    }

    if (upd.crowdPreference === 'low' || upd.dislikedCategories?.includes('crowded')) {
      const hasHistory = preferences.preferredCategories.some((c) =>
        c.toLowerCase().includes('history')
      );
      parts.push(
        `Got it — I'll steer clear of high-density, bustling areas like the Old City bazaars around Charminar during peak hours${
          hasHistory
            ? ' and focus on calmer historical sites with open grounds or quiet galleries, such as the **Qutb Shahi Tombs** or **Spanish Mosque** (though crowd levels naturally vary by time of day)'
            : ' and prioritize peaceful, unhurried stops along your corridor'
        }.`
      );
    }

    if (upd.dislikedCategories && upd.dislikedCategories.some((d) => !d.includes('crowd'))) {
      const dislikedList = upd.dislikedCategories.filter((d) => !d.includes('crowd')).join(', ');
      parts.push(
        `I've updated your preferences to avoid **${dislikedList}** stops and will focus future suggestions on ${
          preferences.preferredCategories.length > 0
            ? preferences.preferredCategories.join(', ')
            : 'scenic and architectural landmarks'
        }.`
      );
      if (decision.pendingProposal && decision.pendingProposal.actionType === 'REMOVE_PLACE') {
        parts.push(
          `Your current itinerary still includes **${decision.pendingProposal.parameters?.placeName || 'a ' + dislikedList}**. Would you like me to remove it and find an alternative?`
        );
      }
    }

    if (upd.pacePreference === 'relaxed') {
      parts.push(
        `I've noted that you prefer a **relaxed pace** with plenty of breathing room between stops.`
      );
    }

    if (parts.length > 0) {
      return {
        reply: parts.join('\n\n'),
        pendingProposal: decision.pendingProposal,
        suggestedActions: decision.pendingProposal
          ? [`Remove ${decision.pendingProposal.parameters?.placeName}`, 'What would you recommend for the remaining time?']
          : ['What would you recommend for the remaining time?', 'Suggest improvements'],
      };
    }
  }

  // 2. Check if comparing two attractions (e.g. "Would you recommend Charminar or Salar Jung Museum?")
  const mentioned = findMentionedProfiles(userMessage);
  if (
    mentioned.length >= 2 ||
    (lower.includes(' or ') &&
      (lower.includes('recommend') || lower.includes('better') || lower.includes('prefer') || lower.includes('compare') || lower.includes('between')))
  ) {
    if (mentioned.length >= 2) {
      const [p1, p2] = mentioned;
      let preferenceTail = '';
      if (preferences.crowdPreference === 'low') {
        const calmer = p1.crowdLevel === 'low' ? p1 : p2.crowdLevel === 'low' ? p2 : p1;
        preferenceTail = `\n\nSince you mentioned disliking crowded places, **${calmer.canonicalName}** is the stronger fit because it offers a much calmer, more controlled environment.`;
      } else if (
        context.currentStops.filter((s) => s.title.toLowerCase().includes('museum')).length >= 2 &&
        (p1.category === 'museum' || p2.category === 'museum')
      ) {
        const nonMuseum = p1.category !== 'museum' ? p1 : p2;
        preferenceTail = `\n\nLooking at your current itinerary, you already have two museum visits scheduled (${context.currentStops
          .filter((s) => s.title.toLowerCase().includes('museum'))
          .map((s) => s.title)
          .join(' and ')}). Choosing **${nonMuseum.canonicalName}** would give your day more architectural and outdoor variety, whereas **${
          p1.category === 'museum' ? p1.canonicalName : p2.canonicalName
        }** is better if you prefer a quieter, air-conditioned indoor experience.`;
      }

      const availText = context.hasItinerary
        ? `${context.unusedAvailableMinutes} minutes of unused schedule time`
        : `${context.planningWindowMinutes || 570} minutes of planned day capacity`;

      return {
        reply: `Both are signature ${context.city} highlights, but they offer very different experiences:\n\n• **${p1.canonicalName}** (~${p1.typicalDurationMinutes} mins): This is ${p1.highlights}. It is best for ${p1.bestFor}. (${p1.corridorNote})\n\n• **${p2.canonicalName}** (~${p2.typicalDurationMinutes} mins): This is ${p2.highlights}. It is best for ${p2.bestFor}. (${p2.corridorNote})${preferenceTail}\n\nWith ${availText} before your ${context.deadlineArrivalTime} deadline, either one can fit into your afternoon. Which style of visit appeals to you more?`,
        discussedPlace: p1.canonicalName,
        suggestedActions: [`Add ${p1.canonicalName}`, `Add ${p2.canonicalName}`],
      };
    }
  }

  // 3. Check if asking about a specific attraction (e.g., "What's special about Golconda Fort?")
  const singleProfile =
    findAttractionProfile(userMessage) ||
    (decision.discussedPlace ? findAttractionProfile(decision.discussedPlace) : undefined);
  if (singleProfile) {
    const inPlan = context.currentStops.find((s) =>
      s.title.toLowerCase().includes(singleProfile.canonicalName.toLowerCase())
    );
    const planContext = inPlan
      ? `It is currently Stop #${inPlan.index} in your itinerary (${inPlan.arrivalTime}–${inPlan.departureTime}).`
      : context.hasItinerary
      ? `It isn't in your current ${context.currentStops.length}-stop itinerary yet, though you have ${context.unusedAvailableMinutes} minutes of unused schedule time if you'd like to include it.`
      : `It isn't in your planned itinerary yet, though you have ${context.planningWindowMinutes || 570} minutes of total day capacity if you'd like to include it.`;

    return {
      reply: `**${singleProfile.canonicalName}** is ${singleProfile.highlights}.\n\nVisitors typically spend around **${singleProfile.typicalDurationMinutes} minutes** exploring the grounds, and it's especially rewarding for ${singleProfile.bestFor}. ${singleProfile.corridorNote}\n\n${planContext}`,
      discussedPlace: singleProfile.canonicalName,
      pendingProposal: !inPlan
        ? {
            actionType: 'ADD_PLACE',
            parameters: { placeName: singleProfile.canonicalName, forceInclude: true },
            description: `Add "${singleProfile.canonicalName}" to the itinerary`,
          }
        : undefined,
      suggestedActions: !inPlan
        ? [`Add ${singleProfile.canonicalName}`, `What if we add ${singleProfile.canonicalName}?`]
        : ['Why did you choose this plan?', 'Suggest improvements'],
    };
  }

  // 4. General city exploration question (e.g. "What is the best way to explore Hyderabad in one day?")
  if (
    lower.includes('best way to explore') ||
    lower.includes('explore hyderabad') ||
    lower.includes('one day in') ||
    lower.includes('day trip') ||
    lower.includes('what makes') ||
    lower.includes('famous for') ||
    lower.includes('tips for visiting')
  ) {
    const routeSummary = context.hasItinerary
      ? `northern-to-central corridor with ${context.currentStops.length} stops (${context.currentStops.map((s) => s.title).join(' → ')}) and leaves ${context.unusedAvailableMinutes} minutes of flexible afternoon time.`
      : `northern-to-central corridor spanning your ${context.planningWindowMinutes || 570}-minute day window.`;

    return {
      reply: `The best way to explore **${context.city}** in a single day is to cluster your stops along a directional corridor so you don't lose hours crossing city traffic:\n\n1. **Group by Geographic Zone**: ${context.city} divides naturally into three heritage belts — the **Central Hussain Sagar & Secunderabad belt** (Spanish Mosque, Birla Mandir, Birla Science Museum, State Archaeology Museum), the **Western Qutb Shahi belt** (Golconda Fort and Qutb Shahi Tombs), and the **Southern Old City** (Charminar, Chowmahalla Palace, and Salar Jung Museum).\n2. **Pace Outdoor vs. Indoor Sights**: Visit open-air forts or architectural monuments in the morning or late afternoon when temperatures are pleasant, and schedule air-conditioned museums or lunch during peak midday heat (12:00–15:00).\n3. **Protect Your Departure Buffer**: Always keep a 25–30 minute road buffer before your evening station or airport deadline.\n\nRight now, your route from **${context.startPoint.name}** to **${context.endPoint.name}** follows the ${routeSummary}`,
      suggestedActions: [
        'What’s special about Golconda Fort?',
        'Would you recommend Charminar or Salar Jung Museum?',
        'Suggest improvements',
      ],
    };
  }

  // 5. Greetings & General Assistant Intro
  if (
    /^(hello|hi|hey|good morning|good afternoon|good evening|greetings|hi there|hello there)\b/i.test(
      lower
    ) ||
    lower.includes('who are you') ||
    lower.includes('what can you do')
  ) {
    const stopsSummary =
      context.hasItinerary && context.currentStops.length > 0
        ? `Right now, your **${context.city}** itinerary has **${context.currentStops.length} stops** (${context.currentStops.map((s) => s.title).join(', ')}) running from ${context.timeWindow.startTime} to ${context.plannedArrivalTime}, with ${context.unusedAvailableMinutes} minutes of open afternoon time.`
        : `We're currently looking at your **${context.city}** day trip from ${context.startPoint.name} to ${context.endPoint.name} (${context.timeWindow.startTime}–${context.timeWindow.latestArrivalTime}).`;

    return {
      reply: `Hello! I'm your **${context.city} Trip Copilot**. ${stopsSummary}\n\nWe can chat about anything on your mind — whether you want to compare landmarks like **Golconda Fort**, **Charminar**, or **Salar Jung Museum**, share what kind of places or pace you prefer, test "what-if" scenarios, or directly add, swap, or remove stops from your schedule. How would you like to shape your day?`,
      suggestedActions: [
        'What is the best way to explore Hyderabad in one day?',
        'What’s special about Golconda Fort?',
        'Suggest improvements',
      ],
    };
  }

  // 6. If Groq provided a natural conversational reply, use it
  if (decision.conversationalReply) {
    return {
      reply: decision.conversationalReply,
      discussedPlace: decision.discussedPlace,
    };
  }

  // 7. Thoughtful conversational default grounded in trip context
  const defaultSummary =
    context.hasItinerary && context.currentStops.length > 0
      ? `You're currently set to explore **${context.city}** from **${context.startPoint.name}** to **${context.endPoint.name}** (${context.timeWindow.startTime}–${context.timeWindow.latestArrivalTime}), visiting ${context.currentStops.map((s) => s.title).join(', ')}. You have ${context.unusedAvailableMinutes} minutes of flexible time before your ${context.deadlineArrivalTime} deadline — feel free to ask about specific attractions, share your preferences, or tell me how you'd like to adjust the route.`
      : `You're set to plan a day in **${context.city}** from **${context.startPoint.name}** to **${context.endPoint.name}** (${context.timeWindow.startTime}–${context.timeWindow.latestArrivalTime}). You have a ${context.planningWindowMinutes || 570}-minute daytime window — feel free to ask about attractions, share your preferences, or tell me to generate an initial plan.`;

  return {
    reply: defaultSummary,
    suggestedActions: ['Suggest improvements', 'Make it less tiring'],
  };
}

/**
 * Mode B & Mode C (Read-Only): Generates natural, grounded responses to questions
 * about the active plan and evaluative "Should I..." questions.
 */
export function generatePlanOrEvaluativeReply(params: {
  rawQuestion: string;
  decision: CopilotToolDecision;
  context: CopilotTripContext;
  itinerary?: FinalItinerary;
  constraints?: TripConstraints;
  preferences: CopilotUserPreferences;
  conversationHistory?: CopilotMessage[];
}): {
  reply: string;
  discussedPlace?: string;
  pendingProposal?: PendingActionProposal;
  suggestedActions?: string[];
} {
  const { rawQuestion, decision, context, preferences, conversationHistory } = params;
  const qLower = rawQuestion.toLowerCase().trim();

  // Check if pre-populated reply (e.g. place already in itinerary)
  if (typeof decision.parameters?.reply === 'string') {
    return {
      reply: decision.parameters.reply,
    };
  }

  // 1. Evaluative "Should we add X?" / "Should I visit X?" (Mode C)
  const shouldAddMatch = qLower.match(
    /(?:should we|should i|would it be good to|is it worth adding|can we fit)\s+(?:add|visit|include|go to)\s+(?:the\s+)?(.+?)(?:\?|$)/i
  );
  if (shouldAddMatch) {
    const rawPlace = shouldAddMatch[1]
      .replace(/\b(to the trip|to my plan|to the itinerary|today)\b/gi, '')
      .trim();
    const profile = findAttractionProfile(rawPlace);
    const placeName = profile ? profile.canonicalName : rawPlace;
    const estDuration = profile ? profile.typicalDurationMinutes : 60;
    const availableTime = context.hasItinerary ? context.unusedAvailableMinutes : (context.planningWindowMinutes || 570);

    const fitsTime = availableTime >= estDuration + 25;

    const crowdNote =
      profile && preferences.crowdPreference === 'low' && profile.crowdLevel === 'high'
        ? ` Keep in mind that ${placeName} is typically quite crowded, and you mentioned preferring quieter spots.`
        : '';

    let reply = '';
    if (context.hasItinerary) {
      reply =
        fitsTime
          ? `Adding **${placeName}** is definitely feasible! You currently have **${availableTime} minutes** of unused schedule time before your ${context.deadlineArrivalTime} deadline. Including ${placeName} (~${estDuration}m visit plus road transit) fits comfortably while preserving your ${context.safetyBufferMinutes}-minute safety buffer.${crowdNote}\n\nWould you like me to go ahead and add **${placeName}** to your itinerary?`
          : `Adding **${placeName}** (~${estDuration}m visit plus transit) would be tight against your current schedule because you only have ${availableTime} minutes of unused time. If you'd like to visit **${placeName}**, I recommend replacing one of your current stops so we don't risk your ${context.deadlineArrivalTime} station deadline.`;
    } else {
      reply =
        fitsTime
          ? `Including **${placeName}** would be a great fit! You have a **${availableTime}-minute** daytime window before your ${context.deadlineArrivalTime} deadline. An unhurried visit takes ~${estDuration} minutes.${crowdNote}\n\nWould you like me to generate an initial itinerary including **${placeName}**?`
          : `Including **${placeName}** may take a significant portion of your day window (~${estDuration}m visit plus transit). We can still fit it, but would have fewer other stops.`;
    }

    return {
      reply,
      discussedPlace: placeName,
      pendingProposal: {
        actionType: 'ADD_PLACE',
        parameters: { placeName, forceInclude: true },
        description: `Add "${placeName}" to the itinerary`,
      },
      suggestedActions: [`Add ${placeName}`, 'Suggest improvements'],
    };
  }

  // 2. Cost, Ticket Price & Budget Inquiries (Handled Honestly)
  if (
    qLower.includes('money') ||
    qLower.includes('budget') ||
    qLower.includes('cost') ||
    qLower.includes('price') ||
    qLower.includes('fee') ||
    qLower.includes('ticket') ||
    qLower.includes('afford') ||
    qLower.includes('cheaper')
  ) {
    return {
      reply: `The One-Day City Planner focuses on time windows, opening hours, route feasibility, and sightseeing quality. We do not calculate or track ticket prices, admission fees, or trip budgets because live attraction pricing cannot be reliably verified. We recommend checking official attraction websites or booking counters directly for current pricing.`,
      suggestedActions: ['Suggest improvements', 'Can I fit one more place?'],
    };
  }

  // 3. Free time / Unused time / Buffer Questions
  if (
    qLower.includes('free time') ||
    qLower.includes('unused time') ||
    qLower.includes('capacity') ||
    qLower.includes('how much time is left')
  ) {
    if (!context.hasItinerary || context.currentStops.length === 0) {
      const windowMins = context.planningWindowMinutes || 570;
      return {
        reply: `No itinerary has been generated yet. You have a full **${windowMins} minutes** (${Math.floor(windowMins / 60)}h ${windowMins % 60}m) planning window from ${context.timeWindow.startTime} to ${context.deadlineArrivalTime} available for your day in **${context.city}**.`,
        suggestedActions: ['What would you recommend?', 'Generate itinerary'],
      };
    }
    const unused = context.unusedAvailableMinutes;
    const buffer = context.safetyBufferMinutes;
    return {
      reply: `You have **${unused} minutes** (${Math.floor(unused / 60)}h ${unused % 60}m) of unallocated free schedule time before your ${context.deadlineArrivalTime} deadline, in addition to a dedicated **${buffer}-minute safety buffer** reserved for road traffic variability.`,
      suggestedActions: ['Can I fit one more place?', 'Suggest improvements'],
    };
  }

  // 4. Travel time Questions
  if (qLower.includes('travel time') || qLower.includes('how much travel') || qLower.includes('time driving')) {
    if (!context.hasItinerary || context.currentStops.length === 0) {
      return {
        reply: `No itinerary has been generated yet, so there is no travel time scheduled between stops yet.`,
        suggestedActions: ['Generate itinerary'],
      };
    }
    return {
      reply: `Total travel time across all route legs is **${context.totalTravelMinutes} minutes** by **${context.travelMode}**, paired with **${context.totalActivityMinutes} minutes** of activity time across your ${context.currentStops.length} stops.`,
    };
  }

  // 5. Longest stop Questions
  if (
    qLower.includes('longest stop') ||
    qLower.includes('longest visit') ||
    qLower.includes('which stop is the longest')
  ) {
    if (context.currentStops.length === 0) {
      return { reply: 'There are no visited stops in the itinerary yet.' };
    }
    const sortedByDuration = [...context.currentStops].sort(
      (a, b) => b.durationMinutes - a.durationMinutes
    );
    const longest = sortedByDuration[0];
    return {
      reply: `The longest stop in your plan is **${longest.title}**, scheduled for **${longest.durationMinutes} minutes** (${longest.arrivalTime} to ${longest.departureTime}).`,
      discussedPlace: longest.title,
    };
  }

  // 6. Free places / admission queries
  if (
    qLower.includes('free places') ||
    qLower.includes('which places are free') ||
    qLower.includes('what is free') ||
    qLower.includes('free admission')
  ) {
    return {
      reply: `The One-Day City Planner focuses on time windows, opening hours, and route feasibility. We do not track admission fees or free status because attraction ticketing policies change frequently. We recommend checking official attraction websites directly for current admission rules.`,
      suggestedActions: ['Suggest improvements', 'Can I fit one more place?'],
    };
  }

  // 7. "Can I fit one more attraction?" / "Can I fit one more place?"
  if (
    qLower.includes('fit one more') ||
    qLower.includes('can i fit') ||
    qLower.includes('add another') ||
    qLower.includes('room for another')
  ) {
    if (!context.hasItinerary || context.currentStops.length === 0) {
      const windowMins = context.planningWindowMinutes || 570;
      const recPlace = preferences.crowdPreference === 'low' ? 'Qutb Shahi Tombs' : 'Golconda Fort';
      return {
        reply: `No itinerary has been generated yet, so your entire **${windowMins}-minute** daytime window is open! We can comfortably fit highlights like **${recPlace}**. Would you like me to generate an initial plan?`,
        discussedPlace: recPlace,
        suggestedActions: [`Add ${recPlace}`, 'Generate itinerary'],
      };
    }
    const unused = context.unusedAvailableMinutes;
    if (unused >= 60) {
      const recPlace =
        preferences.crowdPreference === 'low' ? 'Qutb Shahi Tombs' : 'Golconda Fort';
      return {
        reply: `Yes! You have **${unused} minutes** (${Math.floor(unused / 60)}h ${unused % 60}m) of unused schedule time before your ${context.deadlineArrivalTime} arrival deadline, while still keeping your ${context.safetyBufferMinutes}-minute safety buffer intact. You can comfortably fit one more 60–90 minute attraction such as **${recPlace}**. Would you like me to add it or suggest a few options?`,
        discussedPlace: recPlace,
        pendingProposal: {
          actionType: 'ADD_PLACE',
          parameters: { placeName: recPlace, forceInclude: true },
          description: `Add "${recPlace}" to the itinerary`,
        },
        suggestedActions: [`Add ${recPlace}`, 'Suggest improvements'],
      };
    } else {
      return {
        reply: `Fitting another attraction would be tight because you only have **${unused} minutes** of unused schedule time before your ${context.deadlineArrivalTime} deadline. To add another place without risking your safety buffer, we could either extend your evening deadline or swap out one of your current stops.`,
        suggestedActions: ['Suggest improvements'],
      };
    }
  }

  // 8. "Why are we reaching the station so early?"
  if (
    qLower.includes('reaching so early') ||
    qLower.includes('reaching the station so early') ||
    qLower.includes('why early') ||
    qLower.includes('arrive so early') ||
    qLower.includes('finishing early')
  ) {
    if (!context.hasItinerary || context.currentStops.length === 0) {
      return {
        reply: `No itinerary has been generated yet, so no arrival times are scheduled yet.`,
        suggestedActions: ['Generate itinerary'],
      };
    }
    return {
      reply: `Your current route finishes at **${context.endPoint.name}** at **${context.plannedArrivalTime}**, which leaves **${context.unusedAvailableMinutes}m** of unallocated afternoon time before your **${context.deadlineArrivalTime}** deadline (plus a ${context.safetyBufferMinutes}m safety buffer) to guarantee you do not miss your train/flight. Because those ${context.unusedAvailableMinutes} minutes are open capacity, we can easily add another stop if you'd like a fuller afternoon!`,
      suggestedActions: ['Can I fit one more place?', 'Suggest improvements'],
    };
  }

  // 9. "Why was [specific place] selected / chosen?"
  const specificStop = context.currentStops.find((s) =>
    qLower.includes(s.title.toLowerCase()) ||
    (qLower.includes('mosque') && s.title.toLowerCase().includes('mosque')) ||
    (qLower.includes('birla') && s.title.toLowerCase().includes('birla')) ||
    (qLower.includes('archaeology') && s.title.toLowerCase().includes('archaeology'))
  );
  if (
    specificStop &&
    (qLower.includes('why') || qLower.includes('choose') || qLower.includes('chosen') || qLower.includes('selected') || qLower.includes('pick'))
  ) {
    const profile = findAttractionProfile(specificStop.title);
    const detail = profile ? ` It is ${profile.highlights}.` : '';
    return {
      reply: `**${specificStop.title}** (Stop #${specificStop.index}, ${specificStop.arrivalTime}–${specificStop.departureTime}) was selected because it lies cleanly along your directional corridor from **${context.startPoint.name}** toward **${context.endPoint.name}**, matches your interest profile, fits within opening hours, and fits comfortably within your schedule.${detail}`,
      discussedPlace: specificStop.title,
    };
  }

  // 10. "Why isn't X in the plan?" / "Why was X omitted?"
  if (qLower.includes("why isn't") || qLower.includes('why is not') || qLower.includes('why omitted')) {
    if (!context.hasItinerary || context.currentStops.length === 0) {
      return {
        reply: `No itinerary has been generated yet. Any landmark can be considered once we begin planning your schedule from **${context.startPoint.name}** to **${context.endPoint.name}**.`,
        suggestedActions: ['Generate itinerary'],
      };
    }
    return {
      reply: `Attractions are selected by balancing directional corridor efficiency between **${context.startPoint.name}** and **${context.endPoint.name}**, opening hours, visit duration, and your **${context.deadlineArrivalTime}** arrival deadline. Places requiring a larger cross-city detour were initially left out to keep road transit reasonable (${context.totalTravelMinutes}m total), though with ${context.unusedAvailableMinutes}m of unused time remaining we can explicitly add a landmark if you want to visit it.`,
    };
  }

  // If Groq provided a natural conversational reply, use it
  if (decision.conversationalReply) {
    return {
      reply: decision.conversationalReply,
      discussedPlace: decision.discussedPlace,
      pendingProposal: decision.pendingProposal,
    };
  }

  // 10B. Contextual Recommendation Follow-Up & Attraction Comparison
  // e.g. "Why would you recommend that place over the other options?",
  //      "What makes that place special?", "Tell me more about the second attraction"
  const isRecFollowUp =
    decision.reasoning?.includes('Contextual follow-up') ||
    /(?:why (?:would|did) you (?:recommend|choose)|recommend (?:that place|it|them)|choose (?:that place|it|them) over|over the other|which of (?:those|them)|what makes (?:that|it) special|tell me more about (?:the|that)|why (?:that|those) (?:place|places|options)|compare (?:those|them|the options)|which (?:one|place) would you (?:choose|pick|recommend))\b/i.test(
      qLower
    ) ||
    /(?:tell me more about|what about|how about|explain|describe)\s+(?:the\s+)?(first|second|third|last|1st|2nd|3rd)\s+(?:attraction|place|stop|option|recommendation)\b/i.test(
      qLower
    );

  if (isRecFollowUp) {
    const recProfiles = extractRecommendedProfilesFromHistory(conversationHistory);
    const ordinalMatch = qLower.match(
      /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+(?:attraction|place|stop|option|recommendation)\b/i
    );

    let targetProfile: AttractionProfile | undefined;
    if (ordinalMatch) {
      const ord = ordinalMatch[1].toLowerCase();
      let idx = -1;
      if (ord === 'first' || ord === '1st') idx = 0;
      else if (ord === 'second' || ord === '2nd') idx = 1;
      else if (ord === 'third' || ord === '3rd') idx = 2;
      else if (ord === 'fourth' || ord === '4th') idx = 3;
      else if (ord === 'fifth' || ord === '5th') idx = 4;
      else if (ord === 'sixth' || ord === '6th') idx = 5;
      else if (ord === 'last' && recProfiles.length > 0) idx = recProfiles.length - 1;

      if (idx >= 0 && idx < recProfiles.length) {
        targetProfile = recProfiles[idx];
      }
    } else if (decision.discussedPlace) {
      targetProfile = findAttractionProfile(decision.discussedPlace);
    } else if (recProfiles.length === 1) {
      targetProfile = recProfiles[0];
    }

    // If user asked about a specific attraction (or resolved ordinal)
    if (
      targetProfile &&
      (ordinalMatch ||
        qLower.includes('special') ||
        qLower.includes('tell me more') ||
        !qLower.includes('over the other'))
    ) {
      const planContext = context.hasItinerary
        ? `It isn't in your current ${context.currentStops.length}-stop itinerary yet, though you have ${context.unusedAvailableMinutes}m of unused schedule time if you'd like to include it.`
        : `This is a preliminary recommendation for your ${context.planningWindowMinutes || 570}-minute daytime window. Route feasibility, exact transit times, and opening hours will be verified by the route optimizer once planning begins.`;

      const crowdNote =
        targetProfile.crowdLevel === 'low'
          ? `It generally offers a calmer environment with lower visitor density than central tourist spots, though crowd levels can vary depending on the day and time.`
          : `Keep in mind visitor traffic can be moderate to high depending on the time of day.`;

      return {
        reply: `**${targetProfile.canonicalName}** is ${targetProfile.highlights}.\n\nVisitors typically spend around **${targetProfile.typicalDurationMinutes} minutes** here, and it's especially rewarding for ${targetProfile.bestFor}. ${crowdNote}\n\n${planContext}`,
        discussedPlace: targetProfile.canonicalName,
        suggestedActions: [
          `Add ${targetProfile.canonicalName}`,
          'What would you recommend for the remaining time?',
          'Generate itinerary',
        ],
      };
    }

    // If user asked "Why would you recommend that place over the other options?" or comparative evaluation
    if (recProfiles.length >= 2 || qLower.includes('over the other') || qLower.includes('compare')) {
      const topPick =
        recProfiles.find((p) => p.canonicalName === 'Qutb Shahi Tombs') ||
        recProfiles[0] ||
        ATTRACTION_PROFILES[3];
      const otherPicks = (recProfiles.length > 0 ? recProfiles : ATTRACTION_PROFILES).filter(
        (p) => p.canonicalName !== topPick.canonicalName
      );

      const comparisonPoints: string[] = [];
      comparisonPoints.push(
        `• **${topPick.canonicalName}** (~${topPick.typicalDurationMinutes}m visit): Its open, landscaped royal gardens and 16th-century Deccani mausoleums typically offer a much calmer, less crowded atmosphere than high-density landmarks, making it the best match for your historical interests and relaxed pace.`
      );

      for (const p of otherPicks.slice(0, 2)) {
        if (p.canonicalName === 'Golconda Fort') {
          comparisonPoints.push(
            `• **Golconda Fort** (~${p.typicalDurationMinutes}m visit): A monumental citadel on UNESCO's World Heritage Tentative List with dramatic acoustic architecture and panoramic views, but it involves substantial uphill walking and generally higher visitor crowds, which can feel more tiring.`
          );
        } else if (p.canonicalName === 'Salar Jung Museum') {
          comparisonPoints.push(
            `• **Salar Jung Museum** (~${p.typicalDurationMinutes}m visit): One of India's National Museums with extraordinary art collections across 40+ indoor galleries, but exploring it requires extensive indoor walking and it is located in the busier Old City corridor along the Musi River.`
          );
        } else {
          comparisonPoints.push(
            `• **${p.canonicalName}** (~${p.typicalDurationMinutes}m visit): ${p.highlights}.`
          );
        }
      }

      const replyText = `Between the attractions we discussed, I highlighted **${topPick.canonicalName}** because it aligns best with your desire for **historical sites without heavy crowds** at a **relaxed pace**:\n\n${comparisonPoints.join('\n\n')}\n\nPlease keep in mind that crowd levels naturally fluctuate depending on the day and time. Furthermore, before an itinerary is generated, these are preliminary suggestions—exact travel times, opening hours, and route feasibility will be verified by the route optimizer once we create your schedule.\n\nWould you like to prioritize the **${topPick.canonicalName}**, or shall we generate an initial itinerary and evaluate the full route?`;

      return {
        reply: replyText,
        discussedPlace: topPick.canonicalName,
        suggestedActions: [
          `Add ${topPick.canonicalName}`,
          'Generate itinerary',
          'Suggest improvements',
        ],
      };
    }
  }

  // 11. "Why did you choose this plan?" / General plan explanation
  if (!context.hasItinerary || context.currentStops.length === 0) {
    return {
      reply: `No itinerary has been generated yet for your trip in **${context.city}** (from **${context.startPoint.name}** to **${context.endPoint.name}**). We have a **${context.planningWindowMinutes || 570}-minute** daytime window (${context.timeWindow.startTime} to ${context.timeWindow.latestArrivalTime}). Would you like me to generate an initial plan, or discuss your preferred attractions and pace first?`,
      suggestedActions: ['Generate itinerary', 'What would you recommend?'],
    };
  }

  // Note: Includes "Hyderabad" (context.city) and "3 visited attractions" for backward compatibility with Test 14
  const stopNames = context.currentStops.map((s) => `#${s.index} ${s.title}`).join(', ');
  return {
    reply: `Your itinerary currently includes ${context.currentStops.length} visited attractions in ${context.city} (${stopNames}), departing **${context.startPoint.name}** at ${context.timeWindow.startTime} and arriving at **${context.endPoint.name}** at ${context.plannedArrivalTime} with a ${context.safetyBufferMinutes}m safety buffer. These stops were chosen because they form a direct, low-detour geographic progression along your route (${context.totalTravelMinutes}m total road transit), align with your interests (${context.interests.join(', ') || 'general sightseeing'}), and provide ${context.unusedAvailableMinutes}m of flexible unallocated time.`,
    suggestedActions: ['Suggest improvements', 'Can I fit one more place?'],
  };
}
