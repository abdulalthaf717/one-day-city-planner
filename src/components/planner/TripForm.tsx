'use client';

import React, { useMemo } from 'react';
import {
  Car,
  Footprints,
  Bike,
  Bus,
  Users,
  Clock,
  Wallet,
  MapPin,
  RefreshCw,
  AlertCircle,
  Compass,
  ArrowRight,
} from 'lucide-react';
import { ConstraintChange, TravelMode, TripConstraints } from '@/domain';

interface TripFormProps {
  constraints: TripConstraints;
  onChange: (updated: TripConstraints) => void;
  onSubmit: () => void;
  isLoading: boolean;
  hasExistingPlan: boolean;
  detectedChanges: ConstraintChange[];
  onLoadDemo?: () => void;
  onReduceBudgetDemo?: () => void;
  onSwitchModeDemo?: () => void;
}

const PREFERENCE_OPTIONS: Array<{ label: string; icon: string }> = [
  { label: 'History', icon: '🏛' },
  { label: 'Nature', icon: '🌳' },
  { label: 'Food', icon: '🍽' },
  { label: 'Shopping', icon: '🛍' },
  { label: 'Architecture', icon: '🏰' },
  { label: 'Photography', icon: '📷' },
  { label: 'Religious', icon: '🕌' },
  { label: 'Entertainment', icon: '🎭' },
  { label: 'Family', icon: '👨‍👩‍👧' },
];

export const TripForm: React.FC<TripFormProps> = ({
  constraints,
  onChange,
  onSubmit,
  isLoading,
  hasExistingPlan,
  detectedChanges,
  onLoadDemo,
  onReduceBudgetDemo,
  onSwitchModeDemo,
}) => {
  // Pre-flight client-side validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!constraints.city.trim()) {
      errors.push('City name is required.');
    }
    if (!constraints.startingPoint.name.trim()) {
      errors.push('Starting point location is required.');
    }
    if (!constraints.endPoint.name.trim()) {
      errors.push('Destination end point is required.');
    }
    if (constraints.time.startTime >= constraints.time.latestArrivalTime) {
      errors.push('Latest arrival time must be after the trip start time.');
    }
    if (constraints.budget.total <= 0) {
      errors.push('Trip budget must be greater than zero.');
    }
    if (constraints.numberOfPeople < 1) {
      errors.push('Number of people must be at least 1.');
    }
    const validModes = ['drive', 'walk', 'bicycle', 'transit'];
    if (!validModes.includes(constraints.travelMode)) {
      errors.push('Please select a valid travel mode.');
    }

    return errors;
  }, [constraints]);

  const isValid = validationErrors.length === 0;

  const toggleInterest = (interest: string) => {
    const exists = constraints.interests.includes(interest);
    const updated = exists
      ? constraints.interests.filter((i) => i !== interest)
      : [...constraints.interests, interest];
    onChange({ ...constraints, interests: updated });
  };

  const setTravelMode = (mode: TravelMode) => {
    onChange({ ...constraints, travelMode: mode });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      {/* Brand Header & Tagline */}
      <div className="border-b border-slate-100 pb-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Compass className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              One-Day City Planner
            </h2>
          </div>
          {hasExistingPlan && detectedChanges.length > 0 && (
            <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
              <RefreshCw className="w-3 h-3 mr-1" />
              {detectedChanges.length} modified
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 font-medium">
          Plan your day around time, budget, mobility and interests.
        </p>
      </div>

      {/* Demo Scenario Shortcuts Bar */}
      {onLoadDemo && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
            <span className="uppercase tracking-wider">Quick Demo Scenarios</span>
            <span className="text-slate-400 font-normal">Click to pre-fill</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onLoadDemo}
              className="text-xs px-2.5 py-1 rounded-lg font-medium bg-white hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 transition-colors shadow-2xs"
            >
              ⚡ Hyderabad Scenario
            </button>
            {hasExistingPlan && onReduceBudgetDemo && (
              <button
                type="button"
                onClick={onReduceBudgetDemo}
                className="text-xs px-2.5 py-1 rounded-lg font-medium bg-white hover:bg-amber-50 hover:text-amber-700 text-slate-700 border border-slate-200 transition-colors shadow-2xs"
              >
                💰 Cut Budget to ₹1,000
              </button>
            )}
            {hasExistingPlan && onSwitchModeDemo && (
              <button
                type="button"
                onClick={onSwitchModeDemo}
                className="text-xs px-2.5 py-1 rounded-lg font-medium bg-white hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 border border-slate-200 transition-colors shadow-2xs"
              >
                🚶 Switch to Walking
              </button>
            )}
          </div>
        </div>
      )}

      {/* SECTION 1: WHERE */}
      <div className="space-y-3">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <MapPin className="w-3.5 h-3.5 text-indigo-600" />
          <span>Where</span>
        </div>

        <div className="space-y-2.5">
          {/* City */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              City <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={constraints.city}
              onChange={(e) => onChange({ ...constraints, city: e.target.value })}
              placeholder="e.g. Hyderabad"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 bg-white placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-2xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Start Location */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Starting Point <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={constraints.startingPoint.name}
                onChange={(e) =>
                  onChange({
                    ...constraints,
                    startingPoint: { ...constraints.startingPoint, name: e.target.value },
                  })
                }
                placeholder="e.g. VNR VJIET, Bachupally"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 bg-white placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-2xs"
              />
            </div>

            {/* End Location */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Destination End Point <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={constraints.endPoint.name}
                onChange={(e) =>
                  onChange({
                    ...constraints,
                    endPoint: { ...constraints.endPoint, name: e.target.value },
                  })
                }
                placeholder="e.g. Secunderabad Railway Station"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 bg-white placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-2xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: WHEN */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5 text-indigo-600" />
          <span>When</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Start Time <span className="text-rose-500">*</span>
            </label>
            <input
              type="time"
              style={{ colorScheme: 'light' }}
              value={constraints.time.startTime}
              onChange={(e) =>
                onChange({
                  ...constraints,
                  time: { ...constraints.time, startTime: e.target.value },
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Latest Arrival <span className="text-rose-500">*</span>
            </label>
            <input
              type="time"
              style={{ colorScheme: 'light' }}
              value={constraints.time.latestArrivalTime}
              onChange={(e) =>
                onChange({
                  ...constraints,
                  time: { ...constraints.time, latestArrivalTime: e.target.value },
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: TRIP */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Wallet className="w-3.5 h-3.5 text-indigo-600" />
          <span>Trip Details</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Budget */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Total Budget <span className="text-rose-500">*</span>
            </label>
            <div className="flex rounded-lg shadow-2xs">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-100 text-slate-700 font-semibold text-xs">
                {constraints.budget.currency}
              </span>
              <input
                type="number"
                min="100"
                step="100"
                value={constraints.budget.total}
                onChange={(e) =>
                  onChange({
                    ...constraints,
                    budget: {
                      ...constraints.budget,
                      total: Math.max(0, parseInt(e.target.value, 10) || 0),
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-r-lg border border-slate-300 text-sm font-medium text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
              />
            </div>
          </div>

          {/* Travelers */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Number of People <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-2xs focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-600">
              <Users className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="number"
                min="1"
                max="20"
                value={constraints.numberOfPeople}
                onChange={(e) =>
                  onChange({
                    ...constraints,
                    numberOfPeople: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
                className="w-full text-sm font-medium text-slate-900 bg-transparent focus:outline-none"
              />
              <span className="text-xs text-slate-400 font-medium">pax</span>
            </div>
          </div>
        </div>

        {/* Travel Mode Toggle */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Travel Mode <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'drive', label: 'Drive', icon: Car },
              { id: 'walk', label: 'Walk', icon: Footprints },
              { id: 'bicycle', label: 'Bike', icon: Bike },
              { id: 'transit', label: 'Transit', icon: Bus },
            ].map(({ id, label, icon: Icon }) => {
              const active = constraints.travelMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTravelMode(id as TravelMode)}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-semibold transition-all border ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4 mb-1" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 4: OPTIONAL INTERESTS */}
      <div className="space-y-2 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            Interests <span className="text-slate-400 font-normal normal-case">(Optional)</span>
          </label>
          <span className="text-[11px] text-slate-400 italic">
            Leave unselected for balanced sights
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PREFERENCE_OPTIONS.map(({ label, icon }) => {
            const isSelected = constraints.interests.includes(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleInterest(label)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all border flex items-center space-x-1 ${
                  isSelected
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-800 font-semibold shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline Pre-Flight Validation Errors */}
      {!isValid && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Please check your inputs:</p>
            <ul className="list-disc list-inside space-y-0.5 text-rose-700">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Primary Action Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading || !isValid}
          className={`w-full py-3 px-5 rounded-xl font-bold text-sm text-white shadow-md flex items-center justify-center space-x-2 transition-all ${
            isLoading || !isValid
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              : hasExistingPlan && detectedChanges.length > 0
              ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200 active:scale-[0.99]'
              : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 active:scale-[0.99]'
          }`}
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Optimizing Itinerary...</span>
            </>
          ) : hasExistingPlan && detectedChanges.length > 0 ? (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>RE-PLAN ITINERARY</span>
            </>
          ) : (
            <>
              <span>PLAN MY DAY</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
