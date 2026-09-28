import React, { useState } from 'react';
import {
  Compass,
  ArrowRightLeft,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ToolTestResponse {
  success: boolean;
  reason?: string;
  message?: string;
  city?: string;
  travelMode?: string;
  trafficModelSemantic?: string;
  startLocation?: { formattedAddress: string; latitude: number; longitude: number };
  endLocation?: { formattedAddress: string; latitude: number; longitude: number };
  directRoute?: { distanceMeters: number; durationMinutes: number; durationSeconds: number };
  directionalComparison?: {
    startToEnd: { durationMinutes: number; distanceMeters: number };
    endToStart: { durationMinutes: number; distanceMeters: number };
    differenceMinutes: number;
    isIdenticalDuration: boolean;
  };
  diagnostics?: { totalElapsedMs: number; cached: boolean };
}

export const ToolVerificationCard: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [city, setCity] = useState('Hyderabad');
  const [start, setStart] = useState('VNR VJIET');
  const [end, setEnd] = useState('Secunderabad Railway Station');
  const [travelMode, setTravelMode] = useState('drive');
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<ToolTestResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const runTest = async (testConfig?: { city: string; start: string; end: string; travelMode: string }) => {
    setIsRunning(true);
    setErrorText(null);
    setTestResult(null);

    const payload = testConfig || { city, start, end, travelMode };

    try {
      const res = await fetch('/api/tools/route-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : 'Tool test request failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-blue-200 overflow-hidden">
      <div
        className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Tool Layer Verification: Geocoding &amp; Directional Route Matrix
            </h3>
            <p className="text-xs text-gray-500">
              Live testing suite for start/end geocoding, directional routing ($A \rightarrow B \neq B \rightarrow A$), and quota bounds.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            Milestone 2 Tools
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {isOpen && (
        <div className="p-6 space-y-5">
          {/* Quick preset buttons */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
              Run Milestone Preset Test Cases:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setCity('Hyderabad');
                  setStart('VNR VJIET');
                  setEnd('Hyderabad Railway Station');
                  setTravelMode('drive');
                  runTest({
                    city: 'Hyderabad',
                    start: 'VNR VJIET',
                    end: 'Hyderabad Railway Station',
                    travelMode: 'drive',
                  });
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-700 border border-gray-200 transition-colors"
              >
                TEST A: Normal Drive (Hyderabad)
              </button>

              <button
                type="button"
                onClick={() => {
                  setCity('Hyderabad');
                  setStart('Charminar');
                  setEnd('Begum Bazar');
                  setTravelMode('drive');
                  runTest({
                    city: 'Hyderabad',
                    start: 'Charminar',
                    end: 'Begum Bazar',
                    travelMode: 'drive',
                  });
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-700 border border-gray-200 transition-colors"
              >
                TEST B: Directional Matrix (Charminar ↔ Begum Bazar)
              </button>

              <button
                type="button"
                onClick={() => {
                  setCity('Hyderabad');
                  setStart('VNR VJIET');
                  setEnd('Hyderabad Railway Station');
                  setTravelMode('walk');
                  runTest({
                    city: 'Hyderabad',
                    start: 'VNR VJIET',
                    end: 'Hyderabad Railway Station',
                    travelMode: 'walk',
                  });
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-700 border border-gray-200 transition-colors"
              >
                TEST C: Walking Mode
              </button>

              <button
                type="button"
                onClick={() => {
                  setCity('Hyderabad');
                  setStart('xyz987qwer_nonexistent_place_12345');
                  setEnd('Hyderabad Railway Station');
                  setTravelMode('drive');
                  runTest({
                    city: 'Hyderabad',
                    start: 'xyz987qwer_nonexistent_place_12345',
                    end: 'Hyderabad Railway Station',
                    travelMode: 'drive',
                  });
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-rose-50 hover:text-rose-700 text-gray-700 border border-gray-200 transition-colors"
              >
                TEST D: Invalid Location
              </button>

              <button
                type="button"
                onClick={() => {
                  setCity('Hyderabad');
                  setStart('VNR VJIET');
                  setEnd('Secunderabad');
                  setTravelMode('submarine');
                  runTest({
                    city: 'Hyderabad',
                    start: 'VNR VJIET',
                    end: 'Secunderabad',
                    travelMode: 'submarine',
                  });
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-amber-50 hover:text-amber-700 text-gray-700 border border-gray-200 transition-colors"
              >
                TEST E: Unsupported Mode
              </button>
            </div>
          </div>

          {/* Custom Test Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">Start Point</label>
              <input
                type="text"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">End Point</label>
              <input
                type="text"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase">Travel Mode</label>
              <select
                value={travelMode}
                onChange={(e) => setTravelMode(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="drive">Drive</option>
                <option value="walk">Walk</option>
                <option value="bicycle">Bicycle</option>
                <option value="transit">Transit</option>
                <option value="submarine">Invalid (Test E)</option>
              </select>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => runTest()}
              disabled={isRunning}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 shadow-sm"
            >
              {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Execute Live Tool Test</span>
            </button>
          </div>

          {/* Test Output Panel */}
          {errorText && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Execution Error</p>
                <p className="mt-0.5">{errorText}</p>
              </div>
            </div>
          )}

          {testResult && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 flex items-center">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mr-1.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 mr-1.5" />
                  )}
                  Status: {testResult.success ? 'Success' : `Failed (${String(testResult.reason)})`}
                </span>
                {testResult.diagnostics && (
                  <span className="text-[11px] text-gray-500">
                    Elapsed: {testResult.diagnostics.totalElapsedMs}ms
                    {testResult.diagnostics.cached ? ' (From Cache)' : ''}
                  </span>
                )}
              </div>

              {/* Directional Comparison Box */}
              {testResult.directionalComparison && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center space-x-2 font-semibold text-gray-800">
                    <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                    <span>Directional Travel Assessment ($A \rightarrow B$ vs $B \rightarrow A$)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-gray-700">
                    <div className="p-2.5 rounded-lg bg-white border border-gray-200">
                      <span className="font-medium text-gray-500 block">Start &rarr; End</span>
                      <span className="font-bold text-gray-900">
                        {testResult.directionalComparison.startToEnd.durationMinutes} min
                        {' '}({(testResult.directionalComparison.startToEnd.distanceMeters / 1000).toFixed(1)} km)
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-gray-200">
                      <span className="font-medium text-gray-500 block">End &rarr; Start</span>
                      <span className="font-bold text-gray-900">
                        {testResult.directionalComparison.endToStart.durationMinutes} min
                        {' '}({(testResult.directionalComparison.endToStart.distanceMeters / 1000).toFixed(1)} km)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 italic">
                    Traffic Model: {testResult.trafficModelSemantic || 'road-network estimate'}
                  </p>
                </div>
              )}

              {/* JSON preview */}
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-800 font-medium select-none">
                  View Full Structured Response Payload
                </summary>
                <pre className="mt-2 p-3 rounded-xl bg-gray-900 text-gray-100 overflow-x-auto text-[11px] max-h-64">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
