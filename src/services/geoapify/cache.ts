/**
 * In-Memory Server-Side Route Cache.
 *
 * Quota Protection:
 * Prevents redundant Geoapify routing and route-matrix calls during trip planning.
 * Keyed by coordinates (5 decimal precision ~1 meter), travel mode, and routing options.
 * Zero-cost in-memory cache with TTL.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class RouteCache {
  private static instance: RouteCache;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly defaultTtlMs = 30 * 60 * 1000; // 30 minutes
  private readonly maxEntries = 500;
  private hits = 0;
  private misses = 0;

  private constructor() {}

  public static getInstance(): RouteCache {
    if (!RouteCache.instance) {
      RouteCache.instance = new RouteCache();
    }
    return RouteCache.instance;
  }

  /**
   * Generates a stable key for a point-to-point route
   */
  public makeRouteKey(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: string,
    model: string = 'default'
  ): string {
    const fLat = fromLat.toFixed(5);
    const fLng = fromLng.toFixed(5);
    const tLat = toLat.toFixed(5);
    const tLng = toLng.toFixed(5);
    return `route:${mode}:${model}:${fLat},${fLng}->${tLat},${tLng}`;
  }

  /**
   * Generates a stable key for a route matrix request
   */
  public makeMatrixKey(
    locations: Array<{ lat: number; lng: number }>,
    mode: string,
    model: string = 'default'
  ): string {
    const coordsStr = locations
      .map((l) => `${l.lat.toFixed(5)},${l.lng.toFixed(5)}`)
      .join(';');
    return `matrix:${mode}:${model}:${coordsStr}`;
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest 20% of entries
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxEntries * 0.2));
      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtlMs),
    });
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  public getStats(): { size: number; hits: number; misses: number; hitRatio: string } {
    const total = this.hits + this.misses;
    const ratio = total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : '0%';
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: ratio,
    };
  }
}

export class PlacesCache {
  private static instance: PlacesCache;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly defaultTtlMs = 30 * 60 * 1000; // 30 minutes
  private readonly maxEntries = 200;
  private hits = 0;
  private misses = 0;

  private constructor() {}

  public static getInstance(): PlacesCache {
    if (!PlacesCache.instance) {
      PlacesCache.instance = new PlacesCache();
    }
    return PlacesCache.instance;
  }

  public makePlacesKey(params: {
    city: string;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    categories: string[];
    availableMinutes?: number;
    budget?: number;
  }): string {
    const c = params.city.toLowerCase().trim();
    const sLat = typeof params.startLat === 'number' ? params.startLat.toFixed(3) : '0';
    const sLng = typeof params.startLng === 'number' ? params.startLng.toFixed(3) : '0';
    const eLat = typeof params.endLat === 'number' ? params.endLat.toFixed(3) : '0';
    const eLng = typeof params.endLng === 'number' ? params.endLng.toFixed(3) : '0';
    const s = `${sLat},${sLng}`;
    const e = `${eLat},${eLng}`;
    const cats = [...params.categories].sort().join(',');
    const mins = params.availableMinutes || 'all';
    const bud = params.budget || 'any';
    return `places:${c}:${s}->${e}:[${cats}]:t=${mins}:b=${bud}`;
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxEntries) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxEntries * 0.2));
      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtlMs),
    });
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  public getStats(): { size: number; hits: number; misses: number; hitRatio: string } {
    const total = this.hits + this.misses;
    const ratio = total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : '0%';
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: ratio,
    };
  }
}

