'use client';

import React from 'react';
import {
  ArrowRight,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  Clock,
  Wallet,
  Sparkles,
  Info,
} from 'lucide-react';
import { ConstraintChange } from '@/domain';

export interface PlanImpactDiff {
  addedStops: string[];
  removedStops: string[];
  reorderedStops?: string[];
  costChange?: { from: number; to: number };
  arrivalTimeChange?: { from: string; to: string };
  reasonSummary?: string;
}

interface ChangeAlertProps {
  changes: ConstraintChange[];
  explanation?: string;
  planDiff?: PlanImpactDiff | null;
}

export const ChangeAlert: React.FC<ChangeAlertProps> = ({
  changes,
  explanation,
  planDiff,
}) => {
  if (changes.length === 0 && !explanation && !planDiff) return null;

  return (
    <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
      {/* Top Banner */}
      <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
        <div className="flex items-center space-x-2 text-amber-950 font-bold text-sm">
          <RefreshCw className="w-4 h-4 text-amber-600" />
          <span>Dynamic Replanning &amp; Constraint Impact</span>
        </div>
        <span className="text-[11px] font-bold text-amber-900 bg-amber-100/90 px-2.5 py-0.5 rounded-full border border-amber-300">
          Surgical Re-Optimization
        </span>
      </div>

      {/* 1. What Changed in Constraints */}
      {changes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-amber-950 uppercase tracking-wider">
            What Changed in Your Constraints?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {changes.map((c, i) => (
              <div
                key={i}
                className="text-xs text-amber-950 bg-white border border-amber-200 rounded-xl p-2.5 flex items-center justify-between shadow-2xs"
              >
                <div>
                  <span className="font-bold text-slate-800">{c.label}: </span>
                  <span className="line-through text-slate-400 mr-1.5 font-medium">
                    {String(c.oldValue)}
                  </span>
                  <ArrowRight className="w-3 h-3 text-amber-600 inline mr-1.5" />
                  <span className="font-extrabold text-indigo-700">
                    {String(c.newValue)}
                  </span>
                </div>
                <span className="text-[10px] text-amber-800 font-medium italic">
                  {c.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Structured Plan Differences (Added, Removed, Times, Cost) */}
      {planDiff && (
        <div className="space-y-2 border-t border-amber-200/60 pt-3">
          <p className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center">
            <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
            Impact on Your Itinerary:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {/* Added Stops */}
            {planDiff.addedStops.length > 0 && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 shadow-2xs">
                <span className="font-bold flex items-center text-[11px] mb-1 text-emerald-800">
                  <PlusCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Added Stops:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] font-medium text-emerald-900">
                  {planDiff.addedStops.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Removed Stops */}
            {planDiff.removedStops.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 shadow-2xs">
                <span className="font-bold flex items-center text-[11px] mb-1 text-rose-800">
                  <MinusCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                  Removed Stops (Pruned):
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] font-medium text-rose-900">
                  {planDiff.removedStops.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metrics Changes (Cost & Time) */}
            {(planDiff.costChange || planDiff.arrivalTimeChange) && (
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 shadow-2xs">
                <span className="font-bold flex items-center text-[11px] mb-1 text-indigo-800">
                  <Info className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                  Schedule &amp; Cost Shifts:
                </span>
                <div className="space-y-1 text-[11px] font-medium">
                  {planDiff.costChange && (
                    <div className="flex items-center space-x-1">
                      <Wallet className="w-3 h-3 text-indigo-600" />
                      <span>
                        Cost: ₹{planDiff.costChange.from} → <strong>₹{planDiff.costChange.to}</strong>
                      </span>
                    </div>
                  )}
                  {planDiff.arrivalTimeChange && (
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>
                        Arrival: {planDiff.arrivalTimeChange.from} → <strong>{planDiff.arrivalTimeChange.to}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Planner Agent Factual Explanation */}
      {explanation && (
        <div className="bg-white border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-1 shadow-2xs">
          <p className="font-bold text-amber-950 flex items-center">
            <Info className="w-3.5 h-3.5 mr-1 text-amber-600" />
            Planner Explanation:
          </p>
          <p className="text-slate-700 leading-relaxed font-medium">{explanation}</p>
        </div>
      )}
    </div>
  );
};
