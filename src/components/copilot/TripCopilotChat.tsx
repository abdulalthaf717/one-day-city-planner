'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  RotateCcw,
  Bot,
  User,
  ArrowRight,
  Clock,
  ShieldCheck,
  Compass,
  Ticket,
  ExternalLink,
} from 'lucide-react';
import {
  CopilotDiff,
  CopilotHistoryItem,
  CopilotMessage,
  CopilotUserPreferences,
  PendingActionProposal,
} from '@/copilot/types';
import { FinalItinerary, PlannerState, TripConstraints } from '@/domain';

export interface TripCopilotChatProps {
  constraints: TripConstraints;
  itinerary: FinalItinerary | null;
  plannerState: PlannerState | null;
  onApplyChanges: (
    newConstraints: TripConstraints,
    newItinerary: FinalItinerary,
    newPlannerState?: PlannerState,
    diff?: CopilotDiff
  ) => void;
  onConstraintsChange?: (newConstraints: TripConstraints) => void;
}

const PRE_PLAN_QUICK_ACTIONS = [
  { label: '⚡ Generate My Itinerary', prompt: 'Generate my itinerary based on my preferences' },
  { label: '🏛 Plan a relaxed historical day', prompt: 'Plan a relaxed historical day in Hyderabad, avoiding crowded places' },
  { label: 'What’s special about Golconda Fort?', prompt: 'What’s special about Golconda Fort?' },
  { label: 'Charminar vs Salar Jung?', prompt: 'Would you recommend Charminar or Salar Jung Museum?' },
  { label: 'What would you recommend?', prompt: 'What would you recommend?' },
];

const POST_PLAN_QUICK_ACTIONS = [
  { label: 'Suggest improvements', prompt: 'Suggest improvements for my day' },
  { label: 'Make it less tiring', prompt: 'Can we make the trip less tiring?' },
  { label: 'What if I walk?', prompt: 'What if I walk instead of drive?' },
  { label: 'What’s special about Golconda Fort?', prompt: 'What’s special about Golconda Fort?' },
  { label: 'Charminar vs Salar Jung?', prompt: 'Would you recommend Charminar or Salar Jung Museum?' },
];

export function TripCopilotChat({
  constraints,
  itinerary,
  plannerState,
  onApplyChanges,
  onConstraintsChange,
}: TripCopilotChatProps) {
  const quickActions = itinerary ? POST_PLAN_QUICK_ACTIONS : PRE_PLAN_QUICK_ACTIONS;
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am your **Trip Copilot** — your conversational AI travel assistant. You can ask me about attractions (e.g. *"What’s special about Golconda Fort?"* or *"Charminar vs Salar Jung Museum"*), share your preferences (*"I prefer historical places and dislike crowds"*), test *"What if..."* scenarios, or directly ask me to plan and generate your itinerary (e.g. *"Plan a relaxed historical day"*).',
      timestamp: 'Just now',
      conversationMode: 'GENERAL_CONVERSATION',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyStack, setHistoryStack] = useState<CopilotHistoryItem[]>([]);
  const [userPreferences, setUserPreferences] = useState<CopilotUserPreferences | undefined>(
    undefined
  );
  const [pendingProposal, setPendingProposal] = useState<PendingActionProposal | undefined>(
    undefined
  );
  const [lastDiscussedPlace, setLastDiscussedPlace] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    const userMessage: CopilotMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          constraints,
          itinerary,
          plannerState,
          history: historyStack,
          conversationHistory: messages,
          userPreferences,
          pendingProposal,
          lastDiscussedPlace,
        }),
      });

      if (!response.ok) {
        throw new Error(`Copilot service returned status ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: CopilotMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'Request completed.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        conversationMode: data.conversationMode,
        actionExecuted: data.actionExecuted,
        isSimulation: data.isSimulation,
        diff: data.diff,
        suggestedActions: data.suggestedActions,
        infeasibleNotice: data.infeasibleNotice,
        pendingProposal: data.pendingProposal,
        discussedPlace: data.lastDiscussedPlace,
        actionLinks: data.actionLinks,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (Array.isArray(data.updatedHistory)) {
        setHistoryStack(data.updatedHistory);
      }
      if (data.updatedPreferences) {
        setUserPreferences(data.updatedPreferences);
      }
      setPendingProposal(data.pendingProposal);
      if (data.lastDiscussedPlace) {
        setLastDiscussedPlace(data.lastDiscussedPlace);
      }

      // If constraints were updated (e.g. preferences updated), propagate to parent form
      if (data.updatedConstraints && onConstraintsChange) {
        onConstraintsChange(data.updatedConstraints);
      }

      // If changes were committed to real state (not simulation and not rejected), apply them to parent dashboard
      if (data.success && !data.isSimulation && data.updatedItinerary && data.updatedConstraints) {
        onApplyChanges(
          data.updatedConstraints,
          data.updatedItinerary,
          data.updatedPlannerState,
          data.diff
        );
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Communication error';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Sorry, I could not complete that request: ${errorMsg}. Your current itinerary is unchanged.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleUndoClick = () => {
    handleSendMessage('Undo that');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[520px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold tracking-tight text-white">Trip Copilot</h3>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Conversational AI
              </span>
            </div>
            <p className="text-[11px] text-slate-300">Context-aware travel advisor & deterministic replanning</p>
          </div>
        </div>

        {historyStack.length > 0 && (
          <button
            type="button"
            onClick={handleUndoClick}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors border border-white/10 shadow-2xs"
            title="Undo last change"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-300" />
            <span>Undo ({historyStack.length})</span>
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}
          >
            <div
              className={`flex items-start space-x-2 max-w-[88%] ${
                msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200 text-indigo-700 shadow-2xs'
                }`}
              >
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              </div>

              <div
                className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-800 shadow-2xs'
                }`}
              >
                {/* Mode / Action / Simulation Badge */}
                {msg.actionExecuted && msg.role === 'assistant' && (
                  <div className="mb-2 flex items-center space-x-1.5">
                    {msg.isSimulation ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="w-3 h-3 mr-1" />
                        Simulation Mode (Non-destructive)
                      </span>
                    ) : msg.conversationMode === 'GENERAL_CONVERSATION' ||
                      msg.conversationMode === 'CURRENT_PLAN_QUESTION' ||
                      msg.actionExecuted === 'SUGGEST_IMPROVEMENTS' ||
                      msg.actionExecuted === 'CLARIFICATION_NEEDED' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        <Sparkles className="w-3 h-3 mr-1 text-indigo-500" />
                        {msg.conversationMode === 'GENERAL_CONVERSATION'
                          ? 'Travel Advisor'
                          : msg.actionExecuted === 'SUGGEST_IMPROVEMENTS'
                            ? 'Tailored Recommendations'
                            : 'Trip Analysis'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Action Executed & Validated
                      </span>
                    )}
                  </div>
                )}

                {/* Message Body */}
                <div className="whitespace-pre-wrap">
                  {(() => {
                    const content = msg.content;
                    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
                    const parts: React.ReactNode[] = [];
                    let lastIndex = 0;
                    let match: RegExpExecArray | null;

                    while ((match = linkRegex.exec(content)) !== null) {
                      if (match.index > lastIndex) {
                        parts.push(content.substring(lastIndex, match.index));
                      }
                      const label = match[1];
                      const url = match[2];
                      parts.push(
                        <a
                          key={match.index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 underline font-semibold inline-flex items-center"
                        >
                          {label}
                          <ExternalLink className="w-2.5 h-2.5 ml-0.5 inline opacity-70" />
                        </a>
                      );
                      lastIndex = match.index + match[0].length;
                    }
                    if (lastIndex < content.length) {
                      parts.push(content.substring(lastIndex));
                    }
                    return parts.length > 0 ? parts : content;
                  })()}
                </div>

                {/* External Action Links (Official Booking / Website) */}
                {msg.actionLinks && (msg.actionLinks.bookingUrl || msg.actionLinks.websiteUrl) && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-2">
                    {msg.actionLinks.bookingUrl && (
                      <a
                        href={msg.actionLinks.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                      >
                        <Ticket className="w-3.5 h-3.5 mr-1.5" />
                        {msg.actionLinks.bookingLabel || 'Book Official Tickets'}
                      </a>
                    )}
                    {msg.actionLinks.websiteUrl && (
                      <a
                        href={msg.actionLinks.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 mr-1.5 text-slate-400" />
                        {msg.actionLinks.websiteLabel || 'Website'}
                      </a>
                    )}
                  </div>
                )}

                {/* Structured Change Diff Card */}
                {msg.diff && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] space-y-1.5 bg-slate-50/80 -mx-1 px-2.5 py-2 rounded-xl">
                    <p className="font-semibold text-slate-700 flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      <span>Plan Changes</span>
                    </p>

                    {msg.diff.addedStops.length > 0 && (
                      <div className="text-emerald-700 font-medium">
                        + Added: {msg.diff.addedStops.join(', ')}
                      </div>
                    )}
                    {msg.diff.removedStops.length > 0 && (
                      <div className="text-rose-700 font-medium">
                        - Removed: {msg.diff.removedStops.join(', ')}
                      </div>
                    )}
                    {msg.diff.arrivalTimeChange && (
                      <div className="text-slate-600 flex items-center space-x-1">
                        <span>Arrival:</span>
                        <span>{msg.diff.arrivalTimeChange.from}</span>
                        <ArrowRight className="w-3 h-3 inline text-slate-400" />
                        <span className="font-bold text-slate-800">
                          {msg.diff.arrivalTimeChange.to}
                        </span>
                      </div>
                    )}
                    {msg.diff.safetyBufferChange && (
                      <div className="text-slate-600 flex items-center space-x-1">
                        <span>Buffer:</span>
                        <span>{msg.diff.safetyBufferChange.from}m</span>
                        <ArrowRight className="w-3 h-3 inline text-slate-400" />
                        <span className="font-bold text-slate-800">
                          {msg.diff.safetyBufferChange.to}m
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Follow-up Chips */}
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pt-1">
                    {msg.suggestedActions.map((action, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSendMessage(action)}
                        className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-semibold border border-indigo-200 transition-colors shadow-2xs"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <span className="text-[9px] text-slate-400 px-8">{msg.timestamp}</span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-xs text-slate-500 py-1 px-2">
            <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center animate-spin">
              <Compass className="w-3 h-3" />
            </div>
            <span className="font-medium animate-pulse">Copilot evaluating action & re-optimizing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips Footer */}
      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center space-x-1.5 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] font-medium text-slate-400 shrink-0">Quick:</span>
        {quickActions.map((qa, idx) => (
          <button
            key={idx}
            type="button"
            disabled={isLoading}
            onClick={() => handleSendMessage(qa.prompt)}
            className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200 transition-colors shrink-0 shadow-2xs disabled:opacity-50"
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-slate-200 flex items-center space-x-2 shrink-0">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="Ask a question or command (e.g. 'Add Charminar', 'Make it cheaper')..."
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={isLoading || !inputValue.trim()}
          className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
