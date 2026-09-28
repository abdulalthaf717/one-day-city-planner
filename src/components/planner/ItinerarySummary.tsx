'use client';

import React from 'react';
import {
  Wallet,
  Clock,
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';
import { FinalItinerary, TripConstraints, ValidationResult } from '@/domain';

interface ItinerarySummaryProps {
  itinerary: FinalItinerary;
  validation: ValidationResult | null;
  constraints?: TripConstraints;
}

function formatMinutes(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function timeToMinutes(t: string): number {
  if (!t || !t.includes(':')) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export const ItinerarySummary: React.FC<ItinerarySummaryProps> = ({
  itinerary,
  validation,
  constraints,
}) => {
  const { summary } = itinerary;
  const currency = summary.currency || '₹';
  const totalBudget = constraints?.budget.total || summary.totalCost;
  const totalSpend = summary.totalCost;
  const remainingBudget = Math.max(0, totalBudget - totalSpend);

  // Time calculations
  const travelMins = summary.totalTravelTimeMinutes || 0;
  const activityMins = summary.totalActivityTimeMinutes || 0;
  
  // Calculate distinct Safety Buffer vs Unused Time
  const plannedArrivalMin = timeToMinutes(summary.plannedArrivalTime);
  const deadlineMin = timeToMinutes(summary.deadlineArrivalTime);
  const rawGap = Math.max(0, deadlineMin - plannedArrivalMin);

  // Safety buffer is the deliberate allocated margin (e.g. 15-60m based on travel)
  const modeMult = constraints?.travelMode === 'drive' ? 1.25 : 1.0;
  const safetyBufferMins = Math.min(60, Math.max(15, Math.round(travelMins * 0.15 * modeMult)));
  // Unused time is the remaining slack between planned arrival + safety buffer and deadline
  const unusedSlackMins = Math.max(0, rawGap - safetyBufferMins);

  // Cost categories breakdown
  let knownSpend = 0;
  let estimatedSpend = 0;
  let freeCount = 0;
  let unknownCount = 0;

  // Category distribution tracking (Requirements 33 & 34)
  const categoryCounts: Record<string, { count: number; icon: string }> = {};

  const getCategoryMeta = (cat?: string, isMeal?: boolean): { label: string; icon: string } => {
    if (isMeal || cat?.toLowerCase().includes('catering') || cat?.toLowerCase().includes('restaurant') || cat === 'dining') {
      return { label: 'Food', icon: '🍽' };
    }
    if (cat?.toLowerCase().includes('castle') || cat?.toLowerCase().includes('historic') || cat?.toLowerCase().includes('heritage') || cat === 'history') {
      return { label: 'History', icon: '🏛' };
    }
    if (cat?.toLowerCase().includes('museum')) {
      return { label: 'Museum', icon: '🏛' };
    }
    if (cat?.toLowerCase().includes('park') || cat?.toLowerCase().includes('nature') || cat?.toLowerCase().includes('leisure')) {
      return { label: 'Nature', icon: '🌳' };
    }
    if (cat?.toLowerCase().includes('shopping') || cat?.toLowerCase().includes('commercial')) {
      return { label: 'Shopping', icon: '🛍' };
    }
    if (cat?.toLowerCase().includes('religion') || cat?.toLowerCase().includes('place_of_worship')) {
      return { label: 'Religious', icon: '🕌' };
    }
    return { label: 'Sightseeing', icon: '📍' };
  };

  itinerary.stops.forEach((stop) => {
    if (stop.type === 'start' || stop.type === 'end') return;

    const costVal = stop.cost?.total || 0;
    const costSource = stop.place?.costSource || (costVal > 0 ? 'estimated' : 'free');

    if (costSource === 'known') {
      knownSpend += costVal;
    } else if (costSource === 'free' || stop.place?.cost?.isFree) {
      freeCount++;
    } else if (costSource === 'unknown' || (costVal === 0 && !stop.place?.cost?.isFree)) {
      unknownCount++;
    } else {
      estimatedSpend += costVal;
    }

    const meta = getCategoryMeta(stop.place?.category, stop.type === 'meal');
    if (!categoryCounts[meta.label]) {
      categoryCounts[meta.label] = { count: 1, icon: meta.icon };
    } else {
      categoryCounts[meta.label].count++;
    }
  });

  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      {/* Header & Validation Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Trip Summary &amp; Schedule
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Realistic road-network timing, category balance, and transparent cost metrics.
          </p>
        </div>

        {validation && (
          <div>
            {validation.isValid ? (
              <span className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Validated Feasible
              </span>
            ) : (
              <span className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                Adjustments Made
              </span>
            )}
          </div>
        )}
      </div>

      {/* Section 35 & 36: Clean Summary Cards (Small Label, Large Value, Short Explanation) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. BUDGET */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Budget</span>
            <Wallet className="w-3 h-3 text-slate-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight my-0.5">
            {currency}{totalSpend}
          </p>
          <p className="text-[11px] font-medium text-emerald-700">
            {currency}{remainingBudget} remaining
          </p>
        </div>

        {/* 2. ACTIVITY TIME */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Activity Time</span>
            <Activity className="w-3 h-3 text-slate-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight my-0.5">
            {formatMinutes(activityMins)}
          </p>
          <p className="text-[11px] font-medium text-slate-600">
            Across {summary.placeCount} stop{summary.placeCount > 1 ? 's' : ''}
          </p>
        </div>

        {/* 3. TRAVEL TIME */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Travel Time</span>
            <Clock className="w-3 h-3 text-slate-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight my-0.5">
            {formatMinutes(travelMins)}
          </p>
          <p className="text-[11px] font-medium text-slate-600 capitalize">
            {constraints?.travelMode || 'drive'} road routing
          </p>
        </div>

        {/* 4. SAFETY BUFFER */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Safety Buffer</span>
            <Shield className="w-3 h-3 text-slate-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight my-0.5">
            {formatMinutes(safetyBufferMins)}
          </p>
          <p className="text-[11px] font-medium text-indigo-700">
            Delay &amp; traffic buffer
          </p>
        </div>

        {/* 5. UNUSED TIME (Separate from Safety Buffer per Requirement 36) */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Unused Time</span>
            <Calendar className="w-3 h-3 text-slate-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight my-0.5">
            {formatMinutes(unusedSlackMins)}
          </p>
          <p className="text-[11px] font-medium text-slate-600">
            Early arrival margin
          </p>
        </div>

        {/* 6. DESTINATION ARRIVAL */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Arrival</span>
            <Clock className="w-3 h-3 text-slate-400" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight my-0.5">
            {summary.plannedArrivalTime}
          </p>
          <p className="text-[11px] font-medium text-slate-600">
            Deadline: {summary.deadlineArrivalTime}
          </p>
        </div>
      </div>

      {/* Section 33 & 34: Category Distribution Visual Strip */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span className="flex items-center uppercase tracking-wider text-[11px]">
            <Layers className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
            Activity Balance of Your Day
          </span>
          <span className="text-[11px] text-slate-400 font-normal">
            Total {summary.placeCount} destinations
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sortedCategories.map(([label, { count, icon }]) => (
            <div
              key={label}
              className="inline-flex items-center px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 shadow-2xs"
            >
              <span className="mr-1.5">{icon}</span>
              <span>{label}</span>
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                ×{count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Transparent Cost Accounting Table */}
      <div className="rounded-xl border border-slate-200/80 p-4 bg-slate-50/50 space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center">
            <Wallet className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
            Cost Accounting &amp; Verification Breakdown
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">
            Budget: {currency}{totalBudget}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">
              Known Entry Fees
            </span>
            <span className="font-bold text-slate-900 text-sm">{currency}{knownSpend}</span>
          </div>

          <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">
              Estimated Expenses
            </span>
            <span className="font-bold text-slate-900 text-sm">{currency}{estimatedSpend}</span>
          </div>

          <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">
              Free Public Sights
            </span>
            <span className="font-bold text-emerald-700 text-sm">{freeCount} stops</span>
          </div>

          <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">
              Unconfirmed Sights
            </span>
            <span className="font-bold text-slate-700 text-sm">
              {unknownCount > 0 ? `${unknownCount} (pay at counter)` : 'None'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
