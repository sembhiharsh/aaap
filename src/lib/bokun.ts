/**
 * bokun.ts — Shared Bókun API client for EasyRide
 *
 * WHY this file exists:
 *   Both /api/bokun/availability and /api/bokun/booking previously duplicated
 *   the same credential-reading and Authorization header logic. Centralizing it
 *   here means a single place to change if Bókun rotates their auth scheme.
 *
 * Secrets are read exclusively from environment variables, which are sourced
 * from Cloud Secret Manager at runtime via Firebase App Hosting (apphosting.yaml).
 * They are NEVER hardcoded here.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BokunClientConfig {
  /** Bókun Access Key — injected from Cloud Secret Manager */
  accessKey: string;
  /** Bókun Secret Key — injected from Cloud Secret Manager */
  secretKey: string;
  /** Base URL for the Bókun REST API */
  apiBaseUrl: string;
}

export interface BokunRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * [IMPORTANT: REFACTOR] Loads Bókun credentials from environment variables.
 *
 * WHY: Previously each route file read process.env independently, making it
 * easy to miss a missing variable in one place. A single loader throws early
 * with a clear message, so misconfiguration is caught at request time, not
 * buried in a downstream 401.
 */
export function loadBokunConfig(): BokunClientConfig {
  const accessKey = process.env.BOKUN_ACCESS_KEY;
  const secretKey = process.env.BOKUN_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error(
      'Bókun credentials are not configured. ' +
      'Ensure BOKUN_ACCESS_KEY and BOKUN_SECRET_KEY are set in Cloud Secret Manager ' +
      'and referenced in apphosting.yaml.'
    );
  }

  return {
    accessKey,
    secretKey,
    // [IMPORTANT: REFACTOR] Fallback to production URL so the app is safe even
    // if the env var is accidentally omitted in a new deployment.
    apiBaseUrl: process.env.BOKUN_API_BASE_URL ?? 'https://api.bokun.io',
  };
}

// ---------------------------------------------------------------------------
// Auth header builder
// ---------------------------------------------------------------------------

/**
 * [IMPORTANT: REFACTOR] Builds the Authorization header for Bókun API calls.
 *
 * WHY Basic auth (not HMAC here):
 *   The production Bókun REST v1 API accepts HTTP Basic Authentication using
 *   accessKey:secretKey. The HMAC-SHA1 scheme is only used by the legacy v0
 *   endpoints (used in the dev scripts). Keeping them separate avoids
 *   accidentally mixing auth schemes in production routes.
 */
export function buildBokunAuthHeader(config: BokunClientConfig): string {
  const credentials = `${config.accessKey}:${config.secretKey}`;
  const base64Credentials = Buffer.from(credentials).toString('base64');
  return `Basic ${base64Credentials}`;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

/**
 * [IMPORTANT: REFACTOR] Central HTTP fetch wrapper for all Bókun API calls.
 *
 * WHY a wrapper:
 *   - Attaches auth headers consistently on every request
 *   - Disables Next.js caching (cache: 'no-store') so availability data is
 *     always live — stale cache would show incorrect seat availability to customers
 *   - Throws a typed error with the HTTP status code so callers can respond
 *     with the correct HTTP status rather than a generic 500
 */
export async function fetchFromBokun(
  path: string,
  config: BokunClientConfig,
  options: BokunRequestOptions = {}
): Promise<unknown> {
  const { method = 'GET', body } = options;
  const url = `${config.apiBaseUrl}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: buildBokunAuthHeader(config),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    // WHY no-store: Availability slots change in real time. Next.js would
    // otherwise cache GET responses and serve stale data to customers.
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(`Bókun API responded with ${response.status}: ${errorBody}`);
    (error as NodeJS.ErrnoException).code = String(response.status);
    throw error;
  }

  return response.json();
}
