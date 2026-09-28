import React from 'react';
import { Compass, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none">
              One-Day City Planner
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Agentic Travel Assistant • 6-Week Capstone
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            100% Free-Tier Architecture
          </div>
          <span className="hidden sm:inline-block text-gray-400">|</span>
          <span className="hidden sm:inline-block text-gray-500">
            Geoapify &amp; Groq Qwen 27B
          </span>
        </div>
      </div>
    </header>
  );
};
