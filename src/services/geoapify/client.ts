/**
 * Base Geoapify HTTP Client.
 *
 * API Security & Quota Protection:
 * - Uses GEOAPIFY_API_KEY strictly server-side.
 * - Never logs or prints the API key in terminal logs, error messages, or API responses.
 * - Redacts any apiKey query parameters from error traces.
 * - Detects 429 or quota limit errors and provides user-friendly error messages.
 */

export class GeoapifyClient {
  protected readonly apiKey: string;
  protected readonly baseUrl: string = 'https://api.geoapify.com';

  constructor() {
    this.apiKey = process.env.GEOAPIFY_API_KEY?.trim() || '';
  }

  protected ensureApiKey(): string {
    if (!this.apiKey) {
      throw new Error(
        'GEOAPIFY_API_KEY environment variable is not configured. Please add it to .env.local to enable live geocoding and road routing.'
      );
    }
    return this.apiKey;
  }

  /**
   * Redacts apiKey from URL string or error message to guarantee key security
   */
  protected sanitizeUrl(urlStr: string): string {
    return urlStr.replace(/([?&]apiKey=)[^&]+/gi, '$1[REDACTED]');
  }

  /**
   * Safe diagnostic logger that never prints API keys
   */
  protected logDiagnostic(info: {
    operation: string;
    endpoint: string;
    elapsedMs: number;
    status: number | string;
    cellCount?: number;
    fromCache?: boolean;
  }): void {
    if (process.env.NODE_ENV !== 'production') {
      const cleanEndpoint = this.sanitizeUrl(info.endpoint);
      console.log(
        `[Geoapify Tool] ${info.operation} -> ${cleanEndpoint} [Status: ${info.status}, ${info.elapsedMs}ms${
          info.cellCount ? `, Cells: ${info.cellCount}` : ''
        }${info.fromCache ? ', CACHED' : ''}]`
      );
    }
  }

  /**
   * Safe fetch wrapper with error decoding, request timeout, and quota rate-limit handling
   */
  protected async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const startTime = Date.now();
    const sanitizedUrl = this.sanitizeUrl(url);

    let res: Response;
    try {
      const timeoutSignal = AbortSignal.timeout(10000);
      const signal = options?.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
      res = await fetch(url, { ...options, signal });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      throw new Error(`Geoapify connection failed: ${this.sanitizeUrl(msg)}`);
    }

    const elapsed = Date.now() - startTime;
    this.logDiagnostic({
      operation: options?.method || 'GET',
      endpoint: sanitizedUrl,
      elapsedMs: elapsed,
      status: res.status,
    });

    if (res.status === 429) {
      throw new Error(
        'Location/routing service quota or rate limit reached. Please try again later.'
      );
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      const sanitizedError = this.sanitizeUrl(errorText || res.statusText);

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          'Geoapify API key is invalid or unauthorized. Please verify GEOAPIFY_API_KEY in .env.local.'
        );
      }

      if (sanitizedError.toLowerCase().includes('quota') || sanitizedError.toLowerCase().includes('rate limit')) {
        throw new Error(
          'Location/routing service quota or rate limit reached. Please try again later.'
        );
      }

      throw new Error(`Geoapify API request failed (${res.status}): ${sanitizedError}`);
    }

    return res.json() as Promise<T>;
  }
}
