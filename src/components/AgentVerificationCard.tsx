'use client';

import React, { useState } from 'react';
import {
  Bot,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Sparkles,
  Activity,
} from 'lucide-react';
import { AgentTestReport } from '@/tools/agentTestRunner';
import { PlannerState, FinalItinerary, PlanningConfidence, PlanningIterationDiagnostic } from '@/domain';

export function AgentVerificationCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testReport, setTestReport] = useState<AgentTestReport | null>(null);
  const [liveResult, setLiveResult] = useState<{
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
  } | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [activeTab, setActiveTab] = useState<'tests' | 'agent'>('tests');

  // Interactive Form State
  const [city, setCity] = useState('Hyderabad');
  const [startPoint, setStartPoint] = useState('VNR VJIET');
  const [endPoint, setEndPoint] = useState('Hyderabad Railway Station');
  const [startTime, setStartTime] = useState('10:00');
  const [deadlineTime, setDeadlineTime] = useState('20:00');
  const [budget, setBudget] = useState(2000);
  const [travelMode, setTravelMode] = useState<'drive' | 'transit' | 'walk'>('drive');
  const [pax, setPax] = useState(2);
  const [interests, setInterests] = useState('History, Food');

  // Presets
  const loadPresetInitial = () => {
    setCity('Hyderabad');
    setStartPoint('VNR VJIET');
    setEndPoint('Hyderabad Railway Station');
    setStartTime('10:00');
    setDeadlineTime('20:00');
    setBudget(2000);
    setTravelMode('drive');
    setPax(2);
    setInterests('History, Food');
  };

  const loadPresetChangeBudget = () => {
    setBudget(1000); // Trigger surgical budget replanning
  };

  const loadPresetChangeMode = () => {
    setTravelMode('walk'); // Trigger walking matrix recalculation
  };

  const loadPresetChangeEnd = () => {
    setEndPoint('Rajiv Gandhi International Airport, Hyderabad');
  };

  const loadPresetMissingEnd = () => {
    setEndPoint(''); // Tests zero hallucination
  };

  // Run Test Suite (A through J)
  const runSuite = async () => {
    setLoading(true);
    setError(null);
    setActiveTab('tests');

    try {
      const res = await fetch('/api/agent/run-tests');
      const data: AgentTestReport = await res.json();
      setTestReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Run agent planning via /api/plan
  const runAgentPlanning = async () => {
    setLoading(true);
    setError(null);
    setActiveTab('agent');

    try {
      const parsedInterests = interests
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          constraints: {
            city,
            startingPoint: { name: startPoint, coordinates: { lat: 17.5389, lng: 78.3862 }, type: 'custom' },
            endPoint: { name: endPoint, coordinates: { lat: 17.4344, lng: 78.5013 }, type: 'station' },
            time: {
              date: new Date().toISOString().split('T')[0],
              startTime,
              latestArrivalTime: deadlineTime,
            },
            budget: { total: budget, currency: '₹' },
            travelMode,
            numberOfPeople: pax,
            interests: parsedInterests,
            pace: 'moderate',
          },
          previousState: liveResult?.plannerState,
        }),
      });

      const data = await res.json();
      if (!res.ok && !data.explanation) {
        throw new Error(data.error || 'Agent planning request failed');
      }

      setLiveResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl mt-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white tracking-wide">
              Milestone 5: Planner Agent Orchestration & Dynamic Replanning
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Approved Tool Registry • Bounded Agent Loop (≤ 6 Iterations) • Surgical Invalidation • Factual Replanning Explanations
          </p>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Presets:</span>
          <button
            onClick={loadPresetInitial}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            Initial Plan
          </button>
          <button
            onClick={loadPresetChangeBudget}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            Budget ₹1000
          </button>
          <button
            onClick={loadPresetChangeMode}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            Mode: Walk
          </button>
          <button
            onClick={loadPresetChangeEnd}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            End: Airport
          </button>
          <button
            onClick={loadPresetMissingEnd}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-rose-300 rounded border border-rose-800/60 transition"
          >
            Missing End Point
          </button>
        </div>
      </div>

      {/* Inputs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 py-4 text-xs">
        <div>
          <label className="block text-slate-400 mb-1 font-medium">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Start Location</label>
          <input
            type="text"
            value={startPoint}
            onChange={(e) => setStartPoint(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">End Location</label>
          <input
            type="text"
            placeholder="(Required)"
            value={endPoint}
            onChange={(e) => setEndPoint(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Deadline</label>
          <input
            type="time"
            value={deadlineTime}
            onChange={(e) => setDeadlineTime(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Budget (₹ Total)</label>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Travel Mode</label>
          <select
            value={travelMode}
            onChange={(e) => setTravelMode(e.target.value as 'drive' | 'transit' | 'walk')}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="drive">Drive</option>
            <option value="walk">Walk</option>
            <option value="transit">Transit</option>
          </select>
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Party Size</label>
          <input
            type="number"
            min={1}
            max={10}
            value={pax}
            onChange={(e) => setPax(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Action Buttons & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={runSuite}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {loading && activeTab === 'tests' ? 'Running Tests (A – J)...' : 'Run Agent Test Suite (A – J)'}
          </button>

          <button
            onClick={runAgentPlanning}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {loading && activeTab === 'agent' ? 'Agent Planning...' : 'Execute Agent Plan / Replan'}
          </button>
        </div>

        {/* Tab Switcher if data exists */}
        {(testReport || liveResult) && (
          <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
            {testReport && (
              <button
                onClick={() => setActiveTab('tests')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeTab === 'tests' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Agent Tests ({testReport.passedTests}/{testReport.totalTests})
              </button>
            )}
            {liveResult && (
              <button
                onClick={() => setActiveTab('agent')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeTab === 'agent' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Live Agent Diagnostics (v{liveResult.diagnostics.planningVersion})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-lg text-xs flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Tab 1: Test Suite Results Display */}
      {activeTab === 'tests' && testReport && (
        <div className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="font-semibold text-slate-200">
              Agent Test Suite Results ({testReport.passedTests}/{testReport.totalTests} Passed)
            </span>
            <span className="font-mono text-slate-500">{testReport.timestamp}</span>
          </div>

          <div className="divide-y divide-slate-900 mt-2">
            {testReport.results.map((res) => (
              <div key={res.testId} className="py-2.5 flex items-start gap-2.5">
                {res.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-300">[{res.testId}]</span>
                    <span className="text-slate-200 font-medium">{res.name}</span>
                  </div>
                  <p className="text-slate-400 mt-0.5 text-xs">{res.notes}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Live Agent Observability & Diagnostics */}
      {activeTab === 'agent' && liveResult && (
        <div className="mt-4 space-y-4">
          {/* Factual Explanation Box */}
          {liveResult.explanation && (
            <div className="p-4 bg-slate-800/90 border border-emerald-500/40 rounded-lg text-xs">
              <div className="flex items-center gap-2 font-semibold text-emerald-300 mb-1">
                <Sparkles className="w-4 h-4" />
                <span>Agent Trade-Off & Replanning Explanation</span>
              </div>
              <p className="text-slate-200 leading-relaxed">{liveResult.explanation}</p>
            </div>
          )}

          {/* Key Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Agent Status</span>
              <span
                className={`text-sm font-bold ${
                  liveResult.success ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {liveResult.success ? 'SUCCESS' : 'USER_INPUT_REQUIRED'}
              </span>
              <span className="text-[10px] text-slate-500 block">
                Version: v{liveResult.diagnostics.planningVersion}
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Loop Iterations</span>
              <span className="text-sm font-bold text-slate-100 font-mono">
                {liveResult.diagnostics.iterations.length} / 6
              </span>
              <span className="text-[10px] text-slate-500 block">
                {liveResult.diagnostics.totalExecutionTimeMs}ms total
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Surgical Reuse</span>
              <span className="text-sm font-bold text-indigo-400 font-mono">
                {liveResult.diagnostics.reusedComponents.length > 0
                  ? liveResult.diagnostics.reusedComponents.join(', ')
                  : 'None (Fresh Plan)'}
              </span>
              <span className="text-[10px] text-slate-500 block">Preserved without API hits</span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Overall Confidence</span>
              <span className="text-sm font-bold text-emerald-400 capitalize">
                {liveResult.confidence?.overallPlanningConfidence || 'Medium'}
              </span>
              <span className="text-[10px] text-slate-500 block">Grounded in metadata</span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Arrival & Buffer</span>
              <span className="text-sm font-bold text-slate-100 font-mono">
                {liveResult.itinerary?.summary.plannedArrivalTime || 'N/A'}
              </span>
              <span className="text-[10px] text-slate-500 block">
                Buffer: {liveResult.itinerary?.summary.safetyBufferMinutes || 0}m
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Cost</span>
              <span className="text-sm font-bold text-blue-400 font-mono">
                ₹{liveResult.itinerary?.summary.totalCost || 0}
              </span>
              <span className="text-[10px] text-slate-500 block">Budget: ₹{budget}</span>
            </div>
          </div>

          {/* Iteration Diagnostics Trace */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-3">
            <div className="font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Agent Iteration Trace (Observable Bounded Loop)</span>
            </div>

            <div className="space-y-2">
              {liveResult.diagnostics.iterations.map((iter, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-800 text-slate-300">
                      Step {iter.iteration}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold font-mono text-[11px] ${
                            iter.decision === 'FINALIZE'
                              ? 'text-emerald-400'
                              : iter.decision === 'REPLAN'
                              ? 'text-amber-400'
                              : iter.decision === 'ASK_USER'
                              ? 'text-rose-400'
                              : 'text-indigo-400'
                          }`}
                        >
                          {iter.decision}
                        </span>
                        {iter.toolCalled && (
                          <span className="font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                            {iter.toolCalled}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">{iter.reason}</p>
                      {iter.toolResultSummary && (
                        <p className="text-emerald-400/90 font-mono text-[10px] mt-1">
                          ↳ {iter.toolResultSummary}
                        </p>
                      )}
                    </div>
                  </div>

                  {iter.durationMs !== undefined && (
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {iter.durationMs}ms
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Confidence Rationale Card */}
          {liveResult.confidence && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-2">
              <div className="font-semibold text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Source Metadata Confidence Rationale</span>
              </div>
              <p className="text-slate-400 text-[11px]">{liveResult.confidence.rationale}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Route Model</span>
                  <span className="font-mono text-slate-300">{liveResult.confidence.routeModelNote}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Place Data</span>
                  <span className="font-mono text-emerald-400 capitalize">{liveResult.confidence.placeDataConfidence}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Opening Hours</span>
                  <span className="font-mono text-slate-300 capitalize">{liveResult.confidence.openingHoursConfidence}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Cost Certainty</span>
                  <span className="font-mono text-slate-300 capitalize">{liveResult.confidence.costConfidence}</span>
                </div>
              </div>
            </div>
          )}

          {/* Toggle Raw JSON Drawer */}
          <div className="pt-2">
            <button
              onClick={() => setShowJson(!showJson)}
              className="text-xs text-slate-400 hover:text-slate-200 underline font-mono"
            >
              {showJson ? 'Hide Raw Agent State JSON' : 'Inspect Raw PlannerState & Diagnostics JSON'}
            </button>
            {showJson && (
              <pre className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-300 font-mono overflow-auto max-h-72">
                {JSON.stringify(liveResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
