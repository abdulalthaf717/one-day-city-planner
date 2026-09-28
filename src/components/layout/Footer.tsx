import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-gray-200 bg-white py-6 mt-12 text-xs text-gray-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Course Capstone Project • Strict Free-Tier Architecture</span>
        </div>
        <div className="flex items-center space-x-4">
          <span>Powered by Groq (qwen/qwen3.8-27b) &amp; Geoapify APIs</span>
          <span>OpenStreetMap &amp; Leaflet</span>
        </div>
      </div>
    </footer>
  );
};
