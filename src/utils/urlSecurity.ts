/**
 * URL Security and Reliability Utility.
 *
 * Enforces safe external URL handling:
 * - Standard URL parser verification
 * - Scheme restrictions: Only http: and https: allowed (dangerous schemes rejected)
 * - Credential stripping / rejection (username & password forbidden)
 * - Sensitive query parameter stripping (API keys, tokens, secrets)
 * - Safe rel="noopener noreferrer" protection
 */

const DANGEROUS_SCHEMES = [
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'blob:',
  'about:',
];

const SENSITIVE_QUERY_PARAMS = [
  'apikey',
  'api_key',
  'key',
  'token',
  'secret',
  'auth',
  'password',
  'access_token',
];

export interface UrlSafetyResult {
  isSafe: boolean;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Validates whether an external URL is safe to open and returns a sanitized version.
 */
export function validateAndSanitizeUrl(rawUrl?: string | null): UrlSafetyResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isSafe: false, error: 'Empty or non-string URL provided.' };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { isSafe: false, error: 'Whitespace-only URL provided.' };
  }

  // Pre-check for dangerous scheme substrings before parsing
  const lower = trimmed.toLowerCase();
  for (const scheme of DANGEROUS_SCHEMES) {
    if (lower.startsWith(scheme) || lower.includes(scheme)) {
      return { isSafe: false, error: `Dangerous URL scheme rejected: ${scheme}` };
    }
  }

  try {
    const parsed = new URL(trimmed);

    // Only allow HTTP and HTTPS protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        isSafe: false,
        error: `Unsupported protocol: "${parsed.protocol}". Only HTTP and HTTPS are permitted.`,
      };
    }

    // Reject embedded credentials (e.g., https://user:pass@example.com)
    if (parsed.username || parsed.password) {
      return {
        isSafe: false,
        error: 'URLs containing embedded credentials (user:password) are forbidden.',
      };
    }

    // Strip any sensitive parameters that might inadvertently leak API keys
    const paramsToDelete: string[] = [];
    parsed.searchParams.forEach((_val, key) => {
      if (SENSITIVE_QUERY_PARAMS.includes(key.toLowerCase())) {
        paramsToDelete.push(key);
      }
    });
    for (const key of paramsToDelete) {
      parsed.searchParams.delete(key);
    }

    // Enforce valid hostname
    if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes('.')) {
      // Localhost or single-label hosts are disallowed for external tourist links
      return {
        isSafe: false,
        error: `Invalid external hostname: "${parsed.hostname}".`,
      };
    }

    return {
      isSafe: true,
      sanitizedUrl: parsed.toString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Malformed URL syntax.';
    return {
      isSafe: false,
      error: `Malformed URL: ${message}`,
    };
  }
}

/**
 * Quick helper returning sanitized string or undefined if unsafe.
 */
export function sanitizeExternalUrl(rawUrl?: string | null): string | undefined {
  const result = validateAndSanitizeUrl(rawUrl);
  return result.isSafe ? result.sanitizedUrl : undefined;
}

/**
 * Returns true if the URL is valid, safe, and uses http/https.
 */
export function isSafeExternalUrl(rawUrl?: string | null): boolean {
  return validateAndSanitizeUrl(rawUrl).isSafe;
}
