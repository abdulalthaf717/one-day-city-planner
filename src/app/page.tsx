'use client';

import React, { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TripForm } from '@/components/planner/TripForm';
import { ItineraryTimeline } from '@/components/planner/ItineraryTimeline';
import { ItinerarySummary } from '@/components/planner/ItinerarySummary';
import { MapPlaceholder } from '@/components/planner/MapPlaceholder';
import { MultimodalUpload } from '@/components/planner/MultimodalUpload';
import { ChangeAlert, PlanImpactDiff } from '@/components/planner/ChangeAlert';
import {
  CandidatePlace,
  ConstraintChange,
  FinalItinerary,
  ItineraryStop,
  PlannerState,
  TripConstraints,
  ValidationResult,
} from '@/domain';
import { detectConstraintChanges } from '@/state/changeDetector';
import { toUserFacingError, UserFacingError } from '@/utils/userErrors';
import { AlertCircle, Compass, Sparkles } from 'lucide-react';

const INITIAL_CONSTRAINTS: TripConstraints = {
  city: 'Hyderabad',
  startingPoint: {
    name: 'VNR VJIET, Bachupally',
    coordinates: { lat: 17.5389, lng: 78.3862 },
    type: 'custom',
  },
  endPoint: {
    name: 'Secunderabad Railway Station',
    coordinates: { lat: 17.4344, lng: 78.5013 },
    type: 'station',
  },
  time: {
    date: new Date().toISOString().split('T')[0],
    startTime: '09:30',
    latestArrivalTime: '19:00',
  },
  budget: {
    total: 2500,
    currency: '₹',
  },
  travelMode: 'drive',
  numberOfPeople: 2,
  interests: ['History', 'Nature'],
  pace: 'moderate',
};

export default function PlannerDashboard() {
  const [constraints, setConstraints] = useState<TripConstraints>(INITIAL_CONSTRAINTS);
  const [committedConstraints, setCommittedConstraints] = useState<TripConstraints | null>(null);
  const [itinerary, setItinerary] = useState<FinalItinerary | null>(null);
  const [plannerState, setPlannerState] = useState<PlannerState | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [replanningExplanation, setReplanningExplanation] = useState<string | null>(null);
  const [planDiff, setPlanDiff] = useState<PlanImpactDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userFacingError, setUserFacingError] = useState<UserFacingError | null>(null);
  const [imageAddedPlaceName, setImageAddedPlaceName] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  // Detect which constraints changed since the last generated itinerary
  const detectedChanges: ConstraintChange[] = useMemo(() => {
    if (!committedConstraints) return [];
    return detectConstraintChanges(committedConstraints, constraints);
  }, [committedConstraints, constraints]);

  const handlePlanOrReplan = async () => {
    setIsLoading(true);
    setUserFacingError(null);

    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          constraints,
          previousState: plannerState,
          previousPlan: itinerary,
          changes: detectedChanges,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();

      // Compute structured plan impact differences
      if (itinerary && data.itinerary) {
        const oldStopTitles = itinerary.stops
          .filter((s: ItineraryStop) => s.type !== 'start' && s.type !== 'end')
          .map((s: ItineraryStop) => s.title);
        const newStopTitles = data.itinerary.stops
          .filter((s: ItineraryStop) => s.type !== 'start' && s.type !== 'end')
          .map((s: ItineraryStop) => s.title);

        const added = newStopTitles.filter((t: string) => !oldStopTitles.includes(t));
        const removed = oldStopTitles.filter((t: string) => !newStopTitles.includes(t));

        setPlanDiff({
          addedStops: added,
          removedStops: removed,
          costChange:
            itinerary.summary.totalCost !== data.itinerary.summary.totalCost
              ? { from: itinerary.summary.totalCost, to: data.itinerary.summary.totalCost }
              : undefined,
          arrivalTimeChange:
            itinerary.summary.plannedArrivalTime !== data.itinerary.summary.plannedArrivalTime
              ? {
                  from: itinerary.summary.plannedArrivalTime,
                  to: data.itinerary.summary.plannedArrivalTime,
                }
              : undefined,
        });
      }

      setItinerary(data.itinerary);
      setValidation(data.validation);
      setReplanningExplanation(data.replanningExplanation || null);
      if (data.state) {
        setPlannerState(data.state);
      }
      setCommittedConstraints({ ...constraints });
    } catch (err: unknown) {
      setUserFacingError(toUserFacingError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceAddedFromImage = async (place: CandidatePlace, forceInclude: boolean) => {
    setIsLoading(true);
    setUserFacingError(null);

    try {
      const res = await fetch('/api/vision/add-to-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidatePlace: place,
          constraints,
          previousState: plannerState,
          forceInclude,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to add place: ${res.status}`);
      }

      const data = await res.json();
      if (!data.itinerary) {
        throw new Error(data.error || 'Failed to re-optimize itinerary with new place.');
      }

      // Track structured additions
      if (itinerary && data.itinerary) {
        setPlanDiff({
          addedStops: [place.name],
          removedStops: [],
          costChange: { from: itinerary.summary.totalCost, to: data.itinerary.summary.totalCost },
          arrivalTimeChange: {
            from: itinerary.summary.plannedArrivalTime,
            to: data.itinerary.summary.plannedArrivalTime,
          },
        });
      }

      setItinerary(data.itinerary);
      setValidation(data.validation);
      setReplanningExplanation(
        data.replanningExplanation || `Integrated "${place.name}" into your optimized route.`
      );
      if (data.state) {
        setPlannerState(data.state);
      }
      setImageAddedPlaceName(place.name);
      setCommittedConstraints({ ...constraints });
    } catch (err: unknown) {
      setUserFacingError(toUserFacingError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Demo Scenarios Handlers (Requirements 20 & 21)
  const handleLoadDemoScenario = () => {
    setConstraints({
      city: 'Hyderabad',
      startingPoint: {
        name: 'VNR VJIET, Bachupally',
        coordinates: { lat: 17.5389, lng: 78.3862 },
        type: 'custom',
      },
      endPoint: {
        name: 'Secunderabad Railway Station',
        coordinates: { lat: 17.4344, lng: 78.5013 },
        type: 'station',
      },
      time: {
        date: new Date().toISOString().split('T')[0],
        startTime: '09:30',
        latestArrivalTime: '18:30',
      },
      budget: {
        total: 2000,
        currency: '₹',
      },
      travelMode: 'drive',
      numberOfPeople: 2,
      interests: ['History', 'Nature'],
      pace: 'moderate',
    });
  };

  const handleReduceBudgetDemo = () => {
    setConstraints((prev) => ({
      ...prev,
      budget: { ...prev.budget, total: 1000 },
    }));
  };

  const handleSwitchModeDemo = () => {
    setConstraints((prev) => ({
      ...prev,
      travelMode: 'walk',
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* User-Facing Error Alert if present */}
        {userFacingError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3 text-sm shadow-2xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-slate-900">{userFacingError.title}</p>
              <p className="text-xs text-rose-700">{userFacingError.message}</p>
              {userFacingError.actionHint && (
                <p className="text-xs text-rose-800 font-medium pt-0.5">
                  💡 {userFacingError.actionHint}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Change alert when replanning occurred */}
        <ChangeAlert
          changes={detectedChanges}
          explanation={replanningExplanation || undefined}
          planDiff={planDiff}
        />

        {/* Main Grid: Form on left (5 cols), Results on right (7 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Constraints & Multimodal (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <TripForm
              constraints={constraints}
              onChange={setConstraints}
              onSubmit={handlePlanOrReplan}
              isLoading={isLoading}
              hasExistingPlan={Boolean(itinerary)}
              detectedChanges={detectedChanges}
              onLoadDemo={handleLoadDemoScenario}
              onReduceBudgetDemo={handleReduceBudgetDemo}
              onSwitchModeDemo={handleSwitchModeDemo}
            />

            <MultimodalUpload
              city={constraints.city}
              itinerary={itinerary}
              constraints={constraints}
              onPlaceAdded={handlePlaceAddedFromImage}
            />
          </div>

          {/* Right Column: Itinerary, Map & Summary (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {itinerary ? (
              <>
                {/* 1. Summary Cards (KPIs, Unused Time, Category Distribution) */}
                <ItinerarySummary
                  itinerary={itinerary}
                  validation={validation}
                  constraints={constraints}
                />

                {/* 2. Interactive Route Map (Compact, supporting timeline per Section 32) */}
                <MapPlaceholder
                  itinerary={itinerary}
                  city={constraints.city}
                  imageAddedPlaceName={imageAddedPlaceName || undefined}
                  selectedStopId={selectedStopId}
                  onSelectStop={setSelectedStopId}
                />

                {/* 3. Chronological Timeline */}
                <ItineraryTimeline
                  itinerary={itinerary}
                  constraints={constraints}
                  selectedStopId={selectedStopId}
                  onSelectStop={setSelectedStopId}
                />
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
                  <Compass className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-900">
                    Ready to Plan Your Day
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Enter your trip details on the left, or click{' '}
                    <strong className="text-slate-800">&quot;⚡ Hyderabad Scenario&quot;</strong> to
                    automatically create a realistic, road-routed one-day itinerary.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleLoadDemoScenario}
                    className="inline-flex items-center text-xs font-semibold px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Load Demo Hyderabad Scenario
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
