/**
 * Deterministic Opening Hours Parser & Evaluation Engine.
 *
 * Parses OpenStreetMap / Geoapify opening hours formats (e.g. "10:00-17:00", "Mo-Su 09:00-18:00", "24/7").
 * Never relies on an LLM for schedule arithmetic.
 * Distinguishes verified open windows from unverified/unavailable records without false confidence.
 */

import { OpeningStatus } from '@/domain';

export interface OpeningWindow {
  openMinutes: number;
  closeMinutes: number;
  openTimeStr: string;
  closeTimeStr: string;
  days?: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
}

export interface OpeningEvaluation {
  status: OpeningStatus;
  isFeasible: boolean;
  effectiveArrivalMinutes: number;
  effectiveDepartureMinutes: number;
  waitMinutes: number;
  reason?: string;
}

export const DAY_MAP: Record<string, number> = {
  su: 0,
  sun: 0,
  sunday: 0,
  mo: 1,
  mon: 1,
  monday: 1,
  tu: 2,
  tue: 2,
  tuesday: 2,
  we: 3,
  wed: 3,
  wednesday: 3,
  th: 4,
  thu: 4,
  thursday: 4,
  fr: 5,
  fri: 5,
  friday: 5,
  sa: 6,
  sat: 6,
  saturday: 6,
};

/**
 * Parses a time string "HH:mm" into minutes since midnight.
 */
export function timeStringToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Converts minutes since midnight back into "HH:mm".
 */
export function minutesToTimeString(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Deterministically parses common OSM opening_hours strings into OpeningWindow records.
 */
export function parseOpeningHours(rawHours?: string): OpeningWindow[] | null {
  if (!rawHours || typeof rawHours !== 'string') {
    return null;
  }

  const cleaned = rawHours.trim().toLowerCase();

  // 1. "24/7" or "always open"
  if (cleaned === '24/7' || cleaned.includes('24/7') || cleaned === 'open 24 hours') {
    return [
      {
        openMinutes: 0,
        closeMinutes: 1440,
        openTimeStr: '00:00',
        closeTimeStr: '24:00',
      },
    ];
  }

  // 2. Regular expression for time range: HH:mm-HH:mm or HH:mm - HH:mm
  // Supports optional days prefix (e.g. "mo-su 10:00-17:00", "09:00-18:00")
  const timeRangeRegex = /(\d{1,2}):(\d{2})\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})/g;
  const windows: OpeningWindow[] = [];

  let match: RegExpExecArray | null;
  while ((match = timeRangeRegex.exec(cleaned)) !== null) {
    const openH = parseInt(match[1], 10);
    const openM = parseInt(match[2], 10);
    const closeH = parseInt(match[3], 10);
    const closeM = parseInt(match[4], 10);

    if (
      !isNaN(openH) &&
      !isNaN(openM) &&
      !isNaN(closeH) &&
      !isNaN(closeM) &&
      openH >= 0 &&
      openH <= 24 &&
      closeH >= 0 &&
      closeH <= 24
    ) {
      const openMinutes = openH * 60 + openM;
      // If close is 00:00 or less than open, assume midnight (1440 mins)
      let closeMinutes = closeH * 60 + closeM;
      if (closeMinutes === 0 && openMinutes > 0) {
        closeMinutes = 1440;
      }

      if (closeMinutes > openMinutes) {
        windows.push({
          openMinutes,
          closeMinutes,
          openTimeStr: `${openH.toString().padStart(2, '0')}:${openM.toString().padStart(2, '0')}`,
          closeTimeStr: `${closeH.toString().padStart(2, '0')}:${closeM.toString().padStart(2, '0')}`,
        });
      }
    }
  }

  return windows.length > 0 ? windows : null;
}

/**
 * Evaluates whether a proposed visit (arrival + duration) fits inside the place's opening hours.
 *
 * Feasibility Rules:
 * 1. If opening hours are missing or unparseable:
 *    Returns status: 'unverified', isFeasible: true (never assumes closed).
 * 2. If arrival is within [open, close] and (arrival + duration <= close):
 *    Returns status: 'verified_open', isFeasible: true.
 * 3. If arrival is slightly early (<= maxWaitMinutes, default 30m):
 *    Adjusts effective arrival to open time, returns status: 'waited_for_opening', isFeasible: true.
 * 4. If arrival + duration > close OR arrived after close:
 *    Returns status: 'closed', isFeasible: false.
 */
export function evaluateOpeningHours(
  rawHours: string | undefined,
  arrivalMinutes: number,
  durationMinutes: number,
  maxWaitMinutes: number = 30
): OpeningEvaluation {
  const windows = parseOpeningHours(rawHours);

  // Missing or unparseable: do not block, mark uncertainty
  if (!windows || windows.length === 0) {
    return {
      status: 'unverified',
      isFeasible: true,
      effectiveArrivalMinutes: arrivalMinutes,
      effectiveDepartureMinutes: arrivalMinutes + durationMinutes,
      waitMinutes: 0,
    };
  }

  // Find best fitting window
  for (const window of windows) {
    const { openMinutes, closeMinutes } = window;

    // Normal visit within window
    if (arrivalMinutes >= openMinutes && arrivalMinutes + durationMinutes <= closeMinutes) {
      return {
        status: 'verified_open',
        isFeasible: true,
        effectiveArrivalMinutes: arrivalMinutes,
        effectiveDepartureMinutes: arrivalMinutes + durationMinutes,
        waitMinutes: 0,
      };
    }

    // Arrived early, check if waiting is feasible
    if (arrivalMinutes < openMinutes) {
      const wait = openMinutes - arrivalMinutes;
      if (wait <= maxWaitMinutes && openMinutes + durationMinutes <= closeMinutes) {
        return {
          status: 'waited_for_opening',
          isFeasible: true,
          effectiveArrivalMinutes: openMinutes,
          effectiveDepartureMinutes: openMinutes + durationMinutes,
          waitMinutes: wait,
        };
      }
    }
  }

  // If no window accommodated the visit
  const primaryWindow = windows[0];
  return {
    status: 'closed',
    isFeasible: false,
    effectiveArrivalMinutes: arrivalMinutes,
    effectiveDepartureMinutes: arrivalMinutes + durationMinutes,
    waitMinutes: 0,
    reason: `Place is closed during planned visit window (Open: ${primaryWindow.openTimeStr}–${primaryWindow.closeTimeStr}, Planned: ${minutesToTimeString(arrivalMinutes)}–${minutesToTimeString(arrivalMinutes + durationMinutes)}).`,
  };
}
