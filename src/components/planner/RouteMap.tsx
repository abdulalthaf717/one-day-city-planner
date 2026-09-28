'use client';

import React, { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { FinalItinerary, ItineraryStop } from '@/domain';
import 'leaflet/dist/leaflet.css';

interface RouteMapProps {
  itinerary: FinalItinerary | null;
  city?: string;
  imageAddedPlaceName?: string;
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string) => void;
}

export const RouteMap: React.FC<RouteMapProps> = ({
  itinerary,
  city = 'Hyderabad',
  imageAddedPlaceName,
  selectedStopId,
  onSelectStop,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current) return;
      const L = (await import('leaflet')).default;

      if (!isMounted) return;

      // Clean up previous map instance if re-rendering
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current.clear();

      // Default city coordinates fallback (Hyderabad center)
      const defaultCenter: [number, number] = [17.385, 78.4867];
      const initialZoom = 12;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView(defaultCenter, initialZoom);

      mapInstanceRef.current = map;

      // Free OpenStreetMap Raster Tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      if (!itinerary || !itinerary.stops || itinerary.stops.length === 0) {
        return;
      }

      const stops = itinerary.stops;
      const latLngs: Array<[number, number]> = [];

      stops.forEach((stop: ItineraryStop, index: number) => {
        const coords = stop.place?.coordinates;
        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
          return;
        }

        const point: [number, number] = [coords.lat, coords.lng];
        latLngs.push(point);

        const isStart = stop.type === 'start' || index === 0;
        const isEnd = stop.type === 'end' || index === stops.length - 1;
        const isPhotoAdded =
          stop.place?.addedViaImage ||
          (imageAddedPlaceName && stop.title.toLowerCase().includes(imageAddedPlaceName.toLowerCase()));

        // Numbered custom markers
        let markerHtml = '';
        if (isStart) {
          markerHtml = `
            <div style="background-color: #059669; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; border: 2.5px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);">
              S
            </div>
          `;
        } else if (isEnd) {
          markerHtml = `
            <div style="background-color: #e11d48; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; border: 2.5px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);">
              E
            </div>
          `;
        } else if (isPhotoAdded) {
          markerHtml = `
            <div style="position: relative; background-color: #7c3aed; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; border: 3px solid #f3e8ff; box-shadow: 0 4px 10px rgba(124,58,237,0.5);">
              📸
            </div>
          `;
        } else {
          markerHtml = `
            <div style="background-color: #4f46e5; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; border: 2px solid white; box-shadow: 0 3px 5px rgba(0,0,0,0.3);">
              ${index}
            </div>
          `;
        }

        const icon = L.divIcon({
          html: markerHtml,
          className: 'custom-route-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -18],
        });

        const popupContent = `
          <div style="font-family: sans-serif; min-width: 190px; padding: 4px;">
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; color: ${
              isStart ? '#059669' : isEnd ? '#e11d48' : isPhotoAdded ? '#7c3aed' : '#4f46e5'
            };">
              ${isStart ? 'Departure (Start)' : isEnd ? 'Final Destination (End)' : isPhotoAdded ? 'Discovered from Photo' : `Stop #${index}`}
            </div>
            <h4 style="margin: 0 0 6px; font-size: 14px; font-weight: bold; color: #0f172a; line-height: 1.3;">${stop.title}</h4>
            <div style="font-size: 12px; color: #475569; line-height: 1.4;">
              <div>⏰ ${stop.arrivalTime} – ${stop.departureTime} (${stop.durationMinutes} min)</div>
              <div>💰 ${stop.cost.total > 0 ? `₹${stop.cost.total}` : 'Free Admission'}</div>
            </div>
          </div>
        `;

        const stopKey = stop.place?.id || stop.id;
        const marker = L.marker(point, { icon }).addTo(map).bindPopup(popupContent);
        
        marker.on('click', () => {
          if (onSelectStop) {
            onSelectStop(stopKey);
          }
        });

        markersRef.current.set(stopKey, marker);
      });

      // Draw polyline connecting stops in chronological order
      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: '#4f46e5',
          weight: 4,
          opacity: 0.85,
          dashArray: '6, 6',
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);

        // Fit map bounds to encompass all itinerary points
        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [itinerary, city, imageAddedPlaceName, onSelectStop]);

  // Pan and open popup when selectedStopId changes (Section 31)
  useEffect(() => {
    if (!selectedStopId || !markersRef.current.has(selectedStopId) || !mapInstanceRef.current) return;
    const marker = markersRef.current.get(selectedStopId);
    if (marker) {
      marker.openPopup();
      mapInstanceRef.current.panTo(marker.getLatLng(), { animate: true });
    }
  }, [selectedStopId]);

  return (
    <div className="relative w-full h-[360px] rounded-xl overflow-hidden border border-slate-200 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full z-10" />
      {!itinerary && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-2xs p-4 text-center">
          <p className="text-sm font-bold text-slate-800">Road Network Route Map</p>
          <p className="text-xs text-slate-500 max-w-xs mt-1">
            Generate an itinerary to display your sequence pins, road transit lines, and stop locations for {city}.
          </p>
        </div>
      )}
    </div>
  );
};
