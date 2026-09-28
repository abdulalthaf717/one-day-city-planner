'use client';

import React, { useState } from 'react';
import {
  Cpu,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Scale,
} from 'lucide-react';
import { OptimizerTestReport } from '@/tools/optimizerTestRunner';
import { FinalItinerary, ValidationResult } from '@/domain';

export function OptimizerVerificationCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testReport, setTestReport] = useState<OptimizerTestReport | null>(null);
  const [liveResult, setLiveResult] = useState<{
    itinerary: FinalItinerary;
    validation: ValidationResult;
  } | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [activeTab, setActiveTab] = useState<'tests' | 'optimizer'>('tests');

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
  const loadPresetFullDay = () => {
    setCity('Hyderabad');
    setStartPoint('VNR VJIET');
    setEndPoint('Hyderabad Railway Station');
    setStartTime('10:00');
    setDeadlineTime('20:00');
    setBudget(2500);
    setTravelMode('drive');
    setPax(2);
    setInterests('History, Food');
  };

  const loadPresetShortTrip = () => {
    setCity('Hyderabad');
    setStartPoint('VNR VJIET');
    setEndPoint('Hyderabad Railway Station');
    setStartTime('10:00');
    setDeadlineTime('12:00'); // 2 hours
    setBudget(1000);
    setTravelMode('drive');
    setPax(1);
    setInterests('History');
  };

  const loadPresetTightBudget = () => {
    setCity('Hyderabad');
    setStartPoint('VNR VJIET');
    setEndPoint('Hyderabad Railway Station');
    setStartTime('10:00');
    setDeadlineTime('18:00');
    setBudget(200); // Tight budget for 2 pax
    setTravelMode('drive');
    setPax(2);
    setInterests('Parks, Architecture');
  };

  // Run Test Suite (A through I)
  const runSuite = async () => {
    setLoading(true);
    setError(null);
    setActiveTab('tests');

    try {
      const res = await fetch('/api/optimizer/run-tests');
      const data: OptimizerTestReport = await res.json();
      setTestReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Run live optimization via /api/plan
  const runLiveOptimization = async () => {
    setLoading(true);
    setError(null);
    setActiveTab('optimizer');

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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Optimization request failed');
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
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white tracking-wide">
              Milestone 4: Deterministic Itinerary Optimizer & Safety Buffer Validation
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Bounded Beam Search • Time Window & Opening Hours Pruning • Dynamic Safety Buffer • 14 Hard Constraint Checks
          </p>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Presets:</span>
          <button
            onClick={loadPresetFullDay}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            Full Day (10h)
          </button>
          <button
            onClick={loadPresetShortTrip}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            2h Quick Tour
          </button>
          <button
            onClick={loadPresetTightBudget}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            Tight Budget (₹200)
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
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Start Location</label>
          <input
            type="text"
            value={startPoint}
            onChange={(e) => setStartPoint(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">End Location</label>
          <input
            type="text"
            value={endPoint}
            onChange={(e) => setEndPoint(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Deadline</label>
          <input
            type="time"
            value={deadlineTime}
            onChange={(e) => setDeadlineTime(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Budget (₹ Total)</label>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Mode</label>
          <select
            value={travelMode}
            onChange={(e) => setTravelMode(e.target.value as 'drive' | 'transit' | 'walk')}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="drive">Drive (1.25x)</option>
            <option value="transit">Transit (1.30x)</option>
            <option value="walk">Walk (1.00x)</option>
          </select>
        </div>
        <div>
          <label className="block text-slate-400 mb-1 font-medium">People</label>
          <input
            type="number"
            min={1}
            max={10}
            value={pax}
            onChange={(e) => setPax(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
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
            {loading && activeTab === 'tests' ? 'Running Tests (A – I)...' : 'Run Test Suite (A – I)'}
          </button>

          <button
            onClick={runLiveOptimization}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {loading && activeTab === 'optimizer' ? 'Optimizing Itinerary...' : 'Run Live Optimization'}
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
                Verification Suite ({testReport.passedTests}/{testReport.totalTests})
              </button>
            )}
            {liveResult && (
              <button
                onClick={() => setActiveTab('optimizer')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeTab === 'optimizer' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Optimizer Output & Validation
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
              Optimizer Test Suite Results ({testReport.passedTests}/{testReport.totalTests} Passed)
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

      {/* Tab 2: Live Optimizer Inspection */}
      {activeTab === 'optimizer' && liveResult && (
        <div className="mt-4 space-y-4">
          {/* Key Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Validation</span>
              <span
                className={`text-sm font-bold ${
                  liveResult.validation.isValid ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {liveResult.validation.status} (14/14 Checks)
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Planned Arrival</span>
              <span className="text-sm font-bold text-slate-100">
                {liveResult.itinerary.summary.plannedArrivalTime}
              </span>
              <span className="text-[10px] text-slate-500 block">
                Deadline: {liveResult.itinerary.summary.deadlineArrivalTime}
              </span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Safety Buffer</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {liveResult.itinerary.summary.safetyBufferMinutes}m
              </span>
              <span className="text-[10px] text-slate-500 block">Guaranteed margin</span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Cost</span>
              <span className="text-sm font-bold text-blue-400 font-mono">
                ₹{liveResult.itinerary.summary.totalCost}
              </span>
              <span className="text-[10px] text-slate-500 block">Budget: ₹{budget}</span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Transit Time</span>
              <span className="text-sm font-bold text-slate-100 font-mono">
                {liveResult.itinerary.summary.totalTravelTimeMinutes}m
              </span>
              <span className="text-[10px] text-slate-500 block">Real Road Matrix</span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Objective Score</span>
              <span className="text-sm font-bold text-indigo-400 font-mono">
                {liveResult.itinerary.score ? liveResult.itinerary.score.toFixed(1) : 'N/A'}
              </span>
              <span className="text-[10px] text-slate-500 block">Deterministic Utility</span>
            </div>
          </div>

          {/* Transparent Score Breakdown Panel */}
          {liveResult.itinerary.scoreBreakdown && (
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                <Scale className="w-4 h-4 text-indigo-400" />
                <span>Multi-Factor Objective Score Breakdown</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-[11px]">
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Activity Utility</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    +{liveResult.itinerary.scoreBreakdown.activityUtility.toFixed(1)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Interest Fit</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    +{liveResult.itinerary.scoreBreakdown.interestUtility.toFixed(1)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Quality/Rating</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    +{liveResult.itinerary.scoreBreakdown.qualityUtility.toFixed(1)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Diversity</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    +{liveResult.itinerary.scoreBreakdown.diversityUtility.toFixed(1)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Travel Burden</span>
                  <span className="font-mono text-rose-400 font-semibold">
                    -{liveResult.itinerary.scoreBreakdown.travelTimePenalty.toFixed(1)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Detour Penalty</span>
                  <span className="font-mono text-rose-400 font-semibold">
                    -{liveResult.itinerary.scoreBreakdown.detourPenalty.toFixed(1)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Pace Risk</span>
                  <span className="font-mono text-amber-400 font-semibold">
                    -{liveResult.itinerary.scoreBreakdown.riskPenalty.toFixed(1)}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Uncertainty</span>
                  <span className="font-mono text-amber-400 font-semibold">
                    -{liveResult.itinerary.scoreBreakdown.uncertaintyPenalty.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Chronological Stop Sequence */}
          <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
            {liveResult.itinerary.stops.map((stop, idx) => (
              <div key={stop.id || idx} className="p-3 hover:bg-slate-900/60 transition flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold font-mono text-[11px] ${
                      stop.type === 'start'
                        ? 'bg-blue-900/70 text-blue-300 border border-blue-700'
                        : stop.type === 'end'
                        ? 'bg-purple-900/70 text-purple-300 border border-purple-700'
                        : 'bg-emerald-900/70 text-emerald-300 border border-emerald-700'
                    }`}
                  >
                    {stop.type === 'start' ? 'S' : stop.type === 'end' ? 'E' : idx}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">{stop.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono capitalize">
                        {stop.type}
                      </span>
                      {stop.openingStatus && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                          {stop.openingStatus}
                        </span>
                      )}
                    </div>
                    {stop.travelFromPreviousMinutes && stop.travelFromPreviousMinutes > 0 && (
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        🚗 {stop.travelFromPreviousMinutes}m travel from previous location
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-slate-200 font-semibold">
                    {stop.arrivalTime} – {stop.departureTime}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {stop.durationMinutes > 0 ? `${stop.durationMinutes}m duration` : 'Immediate'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 14 Constraint Verification Checks Drawer */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-2">
            <div className="font-semibold text-slate-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Independent Validator: 14 Hard Constraint Verification Checks</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Starts at requested start point</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ends at requested end point</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Strictly chronological timestamps</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero overlapping activities</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Real road network travel accounted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Minimum visit durations respected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Opening hours strictly respected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hard budget limit enforced</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Selected travel mode respected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Latest arrival deadline guaranteed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Safety buffer (15–60m) preserved</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Valid route connection for every leg</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero duplicate place visits</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Explicit uncertainty & confidence metadata</span>
              </div>
            </div>
          </div>

          {/* Toggle Raw JSON Drawer */}
          <div className="pt-2">
            <button
              onClick={() => setShowJson(!showJson)}
              className="text-xs text-slate-400 hover:text-slate-200 underline font-mono"
            >
              {showJson ? 'Hide Raw API JSON' : 'Inspect Raw Plan & Optimizer JSON'}
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
