'use client';

import React from 'react';
import {
  Clock,
  Navigation,
  ExternalLink,
  ShieldCheck,
  HelpCircle,
  Calendar,
  Users,
  Wallet,
  Camera,
  Car,
  Footprints,
  Bike,
  Bus,
} from 'lucide-react';
import { FinalItinerary, ItineraryStop, TripConstraints } from '@/domain';

interface ItineraryTimelineProps {
  itinerary: FinalItinerary;
  constraints?: TripConstraints;
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string) => void;
}

export const ItineraryTimeline: React.FC<ItineraryTimelineProps> = ({
  itinerary,
  constraints,
  selectedStopId,
  onSelectStop,
}) => {
  const modeIcon = () => {
    switch (constraints?.travelMode) {
      case 'walk':
        return <Footprints className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />;
      case 'bicycle':
        return <Bike className="w-3.5 h-3.5 inline mr-1 text-blue-600" />;
      case 'transit':
        return <Bus className="w-3.5 h-3.5 inline mr-1 text-purple-600" />;
      default:
        return <Car className="w-3.5 h-3.5 inline mr-1 text-indigo-600" />;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      {/* Header with trip context */}
      <div className="border-b border-slate-100 pb-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Itinerary Timeline
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Click any stop to highlight its position and route on the map.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 self-start sm:self-center">
            {itinerary.stops.length} Stops • {itinerary.city}
          </span>
        </div>

        {/* Quick Parameters Strip */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 font-medium">
          <span className="flex items-center">
            <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
            {constraints?.time.date || new Date().toISOString().split('T')[0]} ({constraints?.time.startTime || '09:30'} – {itinerary.summary.deadlineArrivalTime})
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center">
            <Users className="w-3.5 h-3.5 mr-1 text-slate-400" />
            {constraints?.numberOfPeople || 2} traveler{(constraints?.numberOfPeople || 2) > 1 ? 's' : ''}
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center">
            <Wallet className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Budget: {itinerary.summary.currency}{constraints?.budget.total || itinerary.summary.totalCost}
          </span>
          <span className="text-slate-300">•</span>
          <span className="capitalize flex items-center font-semibold text-slate-800">
            {modeIcon()}
            {constraints?.travelMode || 'drive'}
          </span>
        </div>
      </div>

      {/* Timeline Items */}
      <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
        {itinerary.stops.map((stop, idx) => (
          <TimelineItem
            key={stop.id || idx}
            stop={stop}
            stopIndex={idx}
            totalStops={itinerary.stops.length}
            isSelected={selectedStopId === (stop.place?.id || stop.id)}
            onSelect={() => onSelectStop && onSelectStop(stop.place?.id || stop.id)}
          />
        ))}
      </div>
    </div>
  );
};

interface TimelineItemProps {
  stop: ItineraryStop;
  stopIndex: number;
  totalStops: number;
  isSelected: boolean;
  onSelect: () => void;
}

const TimelineItem: React.FC<TimelineItemProps> = ({
  stop,
  stopIndex,
  totalStops,
  isSelected,
  onSelect,
}) => {
  const isStart = stop.type === 'start' || stopIndex === 0;
  const isEnd = stop.type === 'end' || stopIndex === totalStops - 1;
  const isPhotoAdded = Boolean(stop.place?.addedViaImage);

  // Stop sequence label
  const sequenceBadge = isStart
    ? 'START'
    : isEnd
    ? 'END'
    : `STOP ${stopIndex}`;

  // Category Icon & Label mapping (Requirement 30)
  const getCategoryDisplay = () => {
    if (isStart) return { label: 'Trip Departure', icon: '📍' };
    if (isEnd) return { label: 'Final Destination', icon: '🏁' };
    if (stop.type === 'meal') return { label: 'Dining & Food', icon: '🍽' };

    const cat = stop.place?.category?.toLowerCase() || '';
    if (cat.includes('catering') || cat.includes('restaurant') || cat === 'dining') {
      return { label: 'Dining & Food', icon: '🍽' };
    }
    if (cat.includes('castle') || cat.includes('historic') || cat.includes('heritage') || cat === 'history') {
      return { label: 'Historical Landmark', icon: '🏛' };
    }
    if (cat.includes('museum')) {
      return { label: 'Museum & Culture', icon: '🏛' };
    }
    if (cat.includes('park') || cat.includes('nature') || cat.includes('leisure')) {
      return { label: 'Nature & Park', icon: '🌳' };
    }
    if (cat.includes('shopping') || cat.includes('commercial')) {
      return { label: 'Shopping & Crafts', icon: '🛍' };
    }
    if (cat.includes('religion') || cat.includes('worship')) {
      return { label: 'Religious Monument', icon: '🕌' };
    }
    if (cat.includes('photo') || isPhotoAdded) {
      return { label: 'Scenic Landmark', icon: '📷' };
    }
    return { label: 'Tourist Attraction', icon: '📍' };
  };

  const categoryDisplay = getCategoryDisplay();

  // Directions Link
  const coords = stop.place?.coordinates;
  const googleMapsUrl = coords
    ? `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.title)}`;

  return (
    <div
      onClick={onSelect}
      className={`relative group cursor-pointer transition-all ${
        isSelected ? 'scale-[1.01]' : ''
      }`}
    >
      {/* Travel leg badge from previous stop */}
      {stop.travelFromPrevious && (
        <div className="mb-3 inline-flex items-center space-x-1.5 text-xs text-slate-700 bg-slate-100/90 border border-slate-200 rounded-full px-3 py-1 font-medium shadow-2xs">
          <Navigation className="w-3 h-3 text-indigo-600 rotate-45" />
          <span>
            ↗ <strong>{stop.travelFromPrevious.durationMinutes} min</strong> drive (
            {(stop.travelFromPrevious.distanceMeters / 1000).toFixed(1)} km)
          </span>
        </div>
      )}

      {/* Timeline Node Dot */}
      <div
        className={`absolute -left-[30px] top-4 w-6 h-6 rounded-full border-2 border-white shadow flex items-center justify-center text-xs font-bold ${
          isStart
            ? 'bg-emerald-600 text-white ring-2 ring-emerald-200'
            : isEnd
            ? 'bg-rose-600 text-white ring-2 ring-rose-200'
            : isPhotoAdded
            ? 'bg-purple-600 text-white ring-2 ring-purple-200'
            : isSelected
            ? 'bg-indigo-700 text-white ring-4 ring-indigo-200'
            : 'bg-indigo-600 text-white'
        }`}
      >
        {isStart ? 'S' : isEnd ? 'E' : stopIndex}
      </div>

      {/* Stop Card (Section 29 Design) */}
      <div
        className={`rounded-xl p-4.5 space-y-3 transition-all border ${
          isSelected
            ? 'bg-indigo-50/50 border-indigo-400 shadow-sm'
            : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
        }`}
      >
        {/* Top Header: Stop Number & Timing */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                isStart
                  ? 'bg-emerald-100 text-emerald-800'
                  : isEnd
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {sequenceBadge}
              </span>
              <span className="text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                {stop.arrivalTime}{stop.arrivalTime !== stop.departureTime ? ` – ${stop.departureTime}` : ''}
              </span>
              {isPhotoAdded && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200 flex items-center">
                  <Camera className="w-2.5 h-2.5 mr-1" />
                  Photo Added
                </span>
              )}
              {stop.place?.placeType === 'PRIMARY_TOURIST' && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                  Primary Sight
                </span>
              )}
              {stop.place?.placeType === 'SECONDARY_ATTRACTION' && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
                  Attraction
                </span>
              )}
              {stop.place?.placeType === 'SUPPORT_FOOD' && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  Dining
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-slate-900 mt-1.5 leading-snug">
              {stop.title}
            </h3>
            {stop.place?.address && (
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{stop.place.address}</p>
            )}
          </div>

          {/* Category Badge (Icon + Text per Section 30) */}
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200/80">
              <span className="mr-1.5">{categoryDisplay.icon}</span>
              <span>{categoryDisplay.label}</span>
            </span>

            {stop.verificationStatus === 'verified' ? (
              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                <HelpCircle className="w-3 h-3 mr-1 text-slate-400" />
                Estimated
              </span>
            )}
          </div>
        </div>

        {/* Metrics Strip: Duration, Cost, Hours */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-700 pt-2 border-t border-slate-100 font-medium">
          {stop.durationMinutes > 0 && (
            <div className="flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Duration: <strong className="text-slate-900">{stop.durationMinutes} min</strong>
              </span>
            </div>
          )}

          <div>
            <span>
              Cost:{' '}
              {stop.cost.total > 0 ? (
                <strong className="text-slate-900">₹{stop.cost.total}</strong>
              ) : stop.place?.cost?.isFree ? (
                <strong className="text-emerald-700">Free admission</strong>
              ) : (
                <span className="text-amber-700">Unconfirmed (at counter)</span>
              )}
              {stop.cost.perPerson > 0 ? ` (₹${stop.cost.perPerson}/pax)` : ''}
            </span>
          </div>

          {stop.place?.openingHours && (
            <div className="text-slate-600">
              <span>
                Hours: <strong className="text-slate-800">{stop.place.openingHours}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Actions Row */}
        <div className="flex items-center space-x-2 pt-1">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 transition-colors"
          >
            <Navigation className="w-3 h-3 mr-1.5" />
            Directions
          </a>

          {(stop.place?.actionLinks?.websiteUrl || stop.place?.websiteUrl) && (
            <a
              href={stop.place.actionLinks?.websiteUrl || stop.place.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors"
            >
              <ExternalLink className="w-3 h-3 mr-1.5" />
              Website
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
