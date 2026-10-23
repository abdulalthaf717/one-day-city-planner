/**
 * Controlled Copilot Tool Registry & Tool Specifications.
 *
 * Provides structured schemas for Groq LLM tool calling and runtime parameter validation.
 * Enforces zero fabrication and bounded actions.
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const COPILOT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_trip',
      description: 'Get high-level summary of current trip constraints (city, budget, travel mode, time window).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_itinerary',
      description: 'Get detailed current itinerary stops, arrival/departure times, costs, and safety buffers.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_places',
      description: 'Search for verified candidate attractions in the city matching categories or user criteria.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keyword or attraction name to search' },
          category: { type: 'string', description: 'Category such as "museum", "historic", "park", "food"' },
          freeOnly: { type: 'boolean', description: 'Whether to restrict to free attractions' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_place_details',
      description: 'Get factual details, opening hours, admission cost, and coordinates for a specific place.',
      parameters: {
        type: 'object',
        properties: {
          placeName: { type: 'string', description: 'Name of the place' },
        },
        required: ['placeName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_place',
      description: 'Add a new real attraction to the trip itinerary and re-optimize the schedule.',
      parameters: {
        type: 'object',
        properties: {
          placeName: { type: 'string', description: 'Exact or common name of the place to add' },
          forceInclude: { type: 'boolean', description: 'Whether to require inclusion even if tight' },
          preferredPosition: { type: 'number', description: 'Optional desired stop sequence number (1-based)' },
        },
        required: ['placeName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_place',
      description: 'Remove an existing visited stop from the itinerary and re-optimize the remaining route.',
      parameters: {
        type: 'object',
        properties: {
          placeName: { type: 'string', description: 'Name of the stop to remove' },
          stopIndex: { type: 'number', description: '1-based index of the stop to remove' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_place',
      description: 'Replace an existing visited stop with another attraction or category alternative.',
      parameters: {
        type: 'object',
        properties: {
          oldPlaceName: { type: 'string', description: 'Name of the current stop to remove' },
          oldStopIndex: { type: 'number', description: '1-based index of the stop to replace' },
          newPlaceName: { type: 'string', description: 'Name of the specific replacement attraction' },
          criteria: {
            type: 'object',
            properties: {
              category: { type: 'string', description: 'Desired category (e.g. "museum", "park")' },
              isFree: { type: 'boolean', description: 'Must have zero admission cost' },
              interest: { type: 'string', description: 'Target interest tag' },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reorder_place',
      description: 'Move an attraction to a different position in the visit sequence.',
      parameters: {
        type: 'object',
        properties: {
          placeName: { type: 'string', description: 'Name of the place to move' },
          targetPosition: { type: 'number', description: 'Target 1-based stop position' },
        },
        required: ['placeName', 'targetPosition'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_budget',
      description: 'Modify the total trip budget limit and re-optimize / validate schedule.',
      parameters: {
        type: 'object',
        properties: {
          total: { type: 'number', description: 'New total budget amount' },
          currency: { type: 'string', description: 'Currency symbol (default: current currency)' },
        },
        required: ['total'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_time',
      description: 'Adjust the trip start time or required latest arrival deadline.',
      parameters: {
        type: 'object',
        properties: {
          startTime: { type: 'string', description: 'New departure time in HH:mm format' },
          latestArrivalTime: { type: 'string', description: 'New arrival deadline in HH:mm format' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_travel_mode',
      description: 'Switch travel mode between drive, transit, walk, or bicycle and re-compute routes.',
      parameters: {
        type: 'object',
        properties: {
          travelMode: {
            type: 'string',
            enum: ['drive', 'transit', 'walk', 'bicycle'],
            description: 'New travel mode',
          },
        },
        required: ['travelMode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_people',
      description: 'Update the number of travelers to recalibrate group admission costs.',
      parameters: {
        type: 'object',
        properties: {
          numberOfPeople: { type: 'number', description: 'New traveler count (minimum 1)' },
        },
        required: ['numberOfPeople'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_interests',
      description: 'Update user interest tags to re-score candidate attractions.',
      parameters: {
        type: 'object',
        properties: {
          interests: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of interest tags (e.g. ["History", "Architecture"])',
          },
          mode: {
            type: 'string',
            enum: ['replace', 'add', 'remove'],
            description: 'Whether to replace all, add, or remove tags',
          },
        },
        required: ['interests'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_start',
      description: 'Change the starting point of the day and re-route.',
      parameters: {
        type: 'object',
        properties: {
          locationName: { type: 'string', description: 'New starting address or landmark name' },
        },
        required: ['locationName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_end',
      description: 'Change the final destination/end point of the day and re-route.',
      parameters: {
        type: 'object',
        properties: {
          locationName: { type: 'string', description: 'New destination address or landmark name' },
        },
        required: ['locationName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'simulate_change',
      description: 'Non-destructively simulate a "what-if" scenario without modifying the real trip.',
      parameters: {
        type: 'object',
        properties: {
          actionType: {
            type: 'string',
            description: 'Action to simulate (e.g. "CHANGE_TRAVEL_MODE", "CHANGE_BUDGET", "ADD_PLACE")',
          },
          parameters: {
            type: 'object',
            description: 'Parameters matching the simulated action',
          },
        },
        required: ['actionType', 'parameters'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replan_trip',
      description: 'Trigger a complete re-optimization and validation of the current trip constraints.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_trip',
      description: 'Re-run all 14 hard constraint checks against the current itinerary.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'undo_last_change',
      description: 'Revert the most recent change and restore the previous valid itinerary version.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_improvements',
      description: 'Analyze current itinerary and generate recommendations for unused time, savings, or variety.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_itinerary',
      description: 'Answer questions or explain why specific places were chosen, omitted, or ordered in the plan.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'What to explain (e.g. "budget", "travel_time", "why_omitted")' },
          question: { type: 'string', description: 'The user question' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'make_less_tiring',
      description: 'Make the trip less tiring or more relaxed by reducing the number of stops or trimming the most demanding stop.',
      parameters: {
        type: 'object',
        properties: {
          targetPace: {
            type: 'string',
            enum: ['relaxed', 'moderate'],
            description: 'Desired schedule pace',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_preferences',
      description: 'Record or update user travel preferences (preferred categories, disliked categories, crowd tolerance, pace) and optionally adjust the trip if a disliked category is currently in the itinerary.',
      parameters: {
        type: 'object',
        properties: {
          preferredCategories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Categories or interests the user likes (e.g. ["History", "Heritage"])',
          },
          dislikedCategories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Categories the user dislikes or wants to avoid (e.g. ["museum", "crowded"])',
          },
          crowdPreference: {
            type: 'string',
            enum: ['low', 'moderate', 'any'],
          },
          pacePreference: {
            type: 'string',
            enum: ['relaxed', 'moderate', 'packed'],
          },
          adjustActivePlan: {
            type: 'boolean',
            description: 'True if the user wants to remove or replace currently scheduled stops that match a newly disliked category',
          },
        },
      },
    },
  },
];

