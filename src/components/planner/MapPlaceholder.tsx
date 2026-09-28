'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { FinalItinerary } from '@/domain';
import { Map } from 'lucide-react';

const RouteMap = dynamic(() => import('./RouteMap').then((m) => m.RouteMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[360px] rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-xs text-slate-400 space-y-2">
      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <span>Loading OpenStreetMap &amp; Route Layer...</span>
    </div>
  ),
});

interface MapPlaceholderProps {
  itinerary: FinalItinerary | null;
  city: string;
  imageAddedPlaceName?: string;
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string) => void;
}

export const MapPlaceholder: React.FC<MapPlaceholderProps> = ({
  itinerary,
  city,
  imageAddedPlaceName,
  selectedStopId,
  onSelectStop,
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center space-x-2">
          <Map className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight leading-none">
              Interactive Route Map
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Synchronized road transit legs via OpenStreetMap.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          OSM Live
        </span>
      </div>

      {/* Map Component (Compact balanced height ~360px, Section 32) */}
      <RouteMap
        itinerary={itinerary}
        city={city}
        imageAddedPlaceName={imageAddedPlaceName}
        selectedStopId={selectedStopId}
        onSelectStop={onSelectStop}
      />

      {/* Synchronized Stop Navigation Strip */}
      {itinerary && itinerary.stops.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="uppercase tracking-wider text-[11px] text-slate-500">
              Stops in Sequence (Click to Highlight)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {itinerary.stops.map((stop, idx) => {
              const stopKey = stop.place?.id || stop.id;
              const isSelected = selectedStopId === stopKey;
              const isStart = stop.type === 'start' || idx === 0;
              const isEnd = stop.type === 'end' || idx === itinerary.stops.length - 1;
              const isPhotoAdded =
                stop.place?.addedViaImage ||
                (imageAddedPlaceName &&
                  stop.title.toLowerCase().includes(imageAddedPlaceName.toLowerCase()));

              return (
                <button
                  key={stopKey || idx}
                  type="button"
                  onClick={() => onSelectStop && onSelectStop(stopKey)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all border flex items-center space-x-1.5 shadow-2xs ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200'
                      : isStart
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      : isEnd
                      ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                      : isPhotoAdded
                      ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-[10px] font-extrabold">
                    {isStart ? 'S' : isEnd ? 'E' : idx}
                  </span>
                  <span>
                    {stop.title.length > 18 ? stop.title.substring(0, 16) + '...' : stop.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* OpenStreetMap Tile Usage Policy & Attribution */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-1 font-medium">
        <span>
          Map data ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600"
          >
            OpenStreetMap contributors
          </a>
        </span>
        <span className="text-slate-400">Road routes via Geoapify</span>
      </div>
    </div>
  );
};
