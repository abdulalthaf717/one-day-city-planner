'use client';

import React, { useState } from 'react';
import {
  Compass,
  MapPin,
  Clock,
  Coins,
  CheckCircle2,
  AlertTriangle,
  Play,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CandidateDiscoveryResult } from '@/services/geoapify';
import { CandidateTestReport } from '@/tools/candidateTestRunner';

export function CandidateVerificationCard() {
  const [city, setCity] = useState('Hyderabad');
  const [startPoint, setStartPoint] = useState('VNR VJIET');
  const [endPoint, setEndPoint] = useState('Hyderabad Railway Station');
  const [interests, setInterests] = useState('history, food');
  const [availableMinutes, setAvailableMinutes] = useState(480); // 8 hours
  const [budget, setBudget] = useState(1500);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<CandidateDiscoveryResult | null>(null);
  const [testReport, setTestReport] = useState<CandidateTestReport | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);

  // Preset 1: History + Food
  const loadPreset1 = () => {
    setCity('Hyderabad');
    setStartPoint('VNR VJIET');
    setEndPoint('Hyderabad Railway Station');
    setInterests('history, food');
    setAvailableMinutes(480);
    setBudget(1500);
  };

  // Preset 2: Empty Interests (Balanced Defaults)
  const loadPreset2 = () => {
    setCity('Hyderabad');
    setStartPoint('VNR VJIET');
    setEndPoint('Hyderabad Railway Station');
    setInterests('');
    setAvailableMinutes(480);
    setBudget(2000);
  };

  // Preset 3: 2-Hour Quick Tour
  const loadPreset3 = () => {
    setCity('Hyderabad');
    setStartPoint('VNR VJIET');
    setEndPoint('Hyderabad Railway Station');
    setInterests('history');
    setAvailableMinutes(120);
    setBudget(500);
  };

  // Execute candidate discovery
  const runDiscovery = async () => {
    setLoading(true);
    setError(null);
    setTestReport(null);

    try {
      const parsedInterests = interests
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city,
          start: startPoint,
          end: endPoint,
          interests: parsedInterests,
          availableTripMinutes: availableMinutes,
          budget: { total: budget, currency: 'INR' },
          travelMode: 'drive',
          poolTargetSize: 15,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to discover candidates');
      }

      setDiscoveryResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Run full test suite (A - G)
  const runSuite = async () => {
    setLoading(true);
    setError(null);
    setDiscoveryResult(null);

    try {
      const res = await fetch('/api/candidates/run-tests');
      const data = await res.json();
      setTestReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl mt-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white tracking-wide">
              Milestone 3: Candidate Place Discovery & Verification
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real Geoapify Places v2 API • Zero Mock Coordinates • Category Mapping • Bounding Corridor Filter
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Presets:</span>
          <button
            onClick={loadPreset1}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            History + Food
          </button>
          <button
            onClick={loadPreset2}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            Balanced (No Interests)
          </button>
          <button
            onClick={loadPreset3}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
          >
            2h Window
          </button>
        </div>
      </div>

      {/* Input Parameters Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 py-4 text-xs">
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
            value={endPoint}
            onChange={(e) => setEndPoint(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-medium">Interests (Optional)</label>
          <input
            type="text"
            placeholder="e.g. history, food"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-medium">Available Time (Mins)</label>
          <input
            type="number"
            value={availableMinutes}
            onChange={(e) => setAvailableMinutes(Number(e.target.value))}
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
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2 pb-4">
        <button
          onClick={runDiscovery}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {loading ? 'Querying Geoapify...' : 'Discover Candidates'}
        </button>

        <button
          onClick={runSuite}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Run Test Suite (A – G)
        </button>

        {discoveryResult && (
          <span className="text-xs text-slate-400 ml-auto">
            {discoveryResult.metadata.fromCache ? (
              <span className="text-amber-400 font-mono">⚡ Served from PlacesCache</span>
            ) : (
              <span className="text-emerald-400 font-mono">🌐 Live Geoapify API Call</span>
            )}
          </span>
        )}
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-lg text-xs flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Test Suite Results Display */}
      {testReport && (
        <div className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="font-semibold text-slate-200">
              Candidate Discovery Test Suite Results ({testReport.passedTests}/{testReport.totalTests} Passed)
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
                <div>
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

      {/* Candidate Pool Results */}
      {discoveryResult && (
        <div className="mt-4 space-y-4">
          {/* Metadata Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Raw Found</span>
              <span className="text-base font-bold text-slate-100">
                {discoveryResult.metadata.rawCandidateCount} places
              </span>
            </div>
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Deduplicated</span>
              <span className="text-base font-bold text-slate-100">
                {discoveryResult.metadata.deduplicatedCount} unique
              </span>
            </div>
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Corridor Span</span>
              <span className="text-base font-bold text-slate-100">
                {discoveryResult.metadata.corridor.spanKm.toFixed(1)} km
              </span>
            </div>
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Final Pool</span>
              <span className="text-base font-bold text-emerald-400">
                {discoveryResult.candidates.length} candidates
              </span>
            </div>
          </div>

          {/* Candidate Places Cards */}
          <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
            {discoveryResult.candidates.map((cand, idx) => {
              const isExpanded = expandedPlaceId === cand.id;
              return (
                <div key={cand.id || idx} className="p-3.5 hover:bg-slate-900/60 transition">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <span className="text-xs font-mono font-bold text-slate-500 w-5 text-right mt-0.5">
                        {idx + 1}.
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-slate-100 text-sm">{cand.name}</h4>
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px] font-mono border border-slate-700 capitalize">
                            {cand.category}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                              cand.verificationStatus === 'verified'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {cand.verificationStatus}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{cand.address || `${cand.latitude.toFixed(4)}, ${cand.longitude.toFixed(4)}`}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Score Badge */}
                      <div className="text-right">
                        <div className="text-xs text-slate-400 font-medium">Score</div>
                        <div className="text-sm font-bold text-emerald-400 font-mono">
                          {cand.candidateScore}
                          <span className="text-[10px] text-slate-500">/100</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedPlaceId(isExpanded ? null : cand.id)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Quick Metadata Badges */}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{cand.estimatedVisitDurationMinutes} mins</span>
                      <span className="text-[10px] text-slate-600">({cand.visitDurationSource})</span>
                    </span>

                    <span className="flex items-center gap-1">
                      <Coins className="w-3 h-3 text-slate-500" />
                      {cand.costSource === 'free' ? (
                        <span className="text-emerald-400 font-semibold">Free</span>
                      ) : cand.costSource === 'estimated' ? (
                        <span>~₹{cand.cost.amountPerPerson}/person</span>
                      ) : cand.costSource === 'known' ? (
                        <span className="text-blue-400 font-semibold">₹{cand.cost.amountPerPerson}/person</span>
                      ) : (
                        <span className="text-slate-500">Unknown admission</span>
                      )}
                      <span className="text-[10px] text-slate-600">({cand.costSource})</span>
                    </span>

                    {cand.openingHours ? (
                      <span className="text-emerald-400/90 text-[11px] truncate max-w-xs">
                        Open: {cand.openingHours}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Hours unverified</span>
                    )}

                    {cand.websiteUrl && (
                      <a
                        href={cand.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[11px] underline"
                      >
                        Website <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  {/* Expanded Breakdown */}
                  {isExpanded && cand.scoreBreakdown && (
                    <div className="mt-3 p-3 bg-slate-900 rounded border border-slate-800 text-xs">
                      <div className="font-semibold text-slate-300 mb-2">Score Breakdown & Transparency</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block">Interest Relevance</span>
                          <span className="font-mono text-slate-200">{cand.scoreBreakdown.interestRelevance}/100</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Geographic Corridor</span>
                          <span className="font-mono text-slate-200">{cand.scoreBreakdown.geographicPracticality}/100</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Budget Fit</span>
                          <span className="font-mono text-slate-200">{cand.scoreBreakdown.budgetCompatibility}/100</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Travel Burden</span>
                          <span className="font-mono text-amber-400">{cand.scoreBreakdown.travelBurden}/100</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-400">
                        <span className="text-slate-500">Geoapify Categories: </span>
                        <span className="font-mono">{cand.categories.join(', ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Toggle Raw JSON Drawer */}
          <div className="pt-2">
            <button
              onClick={() => setShowJson(!showJson)}
              className="text-xs text-slate-400 hover:text-slate-200 underline font-mono"
            >
              {showJson ? 'Hide Raw API JSON' : 'Inspect Raw API JSON Response'}
            </button>
            {showJson && (
              <pre className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-300 font-mono overflow-auto max-h-72">
                {JSON.stringify(discoveryResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
