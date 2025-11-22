/**
 * KNUE Library Pyxis API Client
 * Handles authentication, charges retrieval, and renewals
 *
 * Trace: spec_id: SPEC-auth-001, SPEC-charges-001, SPEC-renewal-001
 *        task_id: TASK-002, TASK-003, TASK-004
 */

import type {
  Charge,
  ChargesResponse,
  FetchOptions,
  LoginRequest,
  LoginResponse,
  RenewalResponse,
  SessionData,
} from '../types';

const BASE_URL = 'https://lib.knue.ac.kr/pyxis-api';

export class LibraryClient {
  private session: SessionData | null = null;

  /**
   * Authenticate with the library API
   * @param credentials - Login credentials
   * @returns Session data with token and cookies
   */
  async login(credentials: LoginRequest): Promise<SessionData> {
    const response = await this.fetchWithResilience(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
      retries: 1,
    });

    if (!response.ok) {
      throw new LibraryApiError(
        `Login failed with status ${response.status}`,
        response.status,
      );
    }

    const data: LoginResponse = await response.json();

    if (!data.success) {
      throw new LibraryApiError(
        `Login failed: ${data.message}`,
        401,
        data.code,
      );
    }

    // Extract cookies from response headers
    const cookies = this.extractCookies(response.headers);

    this.session = {
      accessToken: data.data.accessToken,
      cookies,
    };

    console.log(`[LibraryClient] Login successful for user: ${data.data.name}`);
    return this.session;
  }

  /**
   * Get list of currently borrowed books
   * @returns Array of charge records
   */
  async getCharges(): Promise<Charge[]> {
    this.ensureAuthenticated();

    const pageSize = 20;
    let offset = 0;
    let allCharges: Charge[] = [];

    while (true) {
      const response = await this.fetchWithResilience(
        `${BASE_URL}/8/api/charges?max=${pageSize}&offset=${offset}`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new LibraryApiError(
          `Failed to fetch charges with status ${response.status}`,
          response.status,
        );
      }

      const data: ChargesResponse = await response.json();

      if (!data.success) {
        throw new LibraryApiError(
          `Failed to fetch charges: ${data.message}`,
          400,
          data.code,
        );
      }

      allCharges = allCharges.concat(data.data.list);

      const total = data.data.totalCount;
      offset += pageSize;

      if (allCharges.length >= total || data.data.list.length === 0) {
        break;
      }
    }

    console.log(
      `[LibraryClient] Retrieved ${allCharges.length} charges (paginated)`,
    );
    return allCharges;
  }

  /**
   * Renew a specific book charge
   * @param chargeId - The ID of the charge to renew
   * @returns Renewal result with updated due date
   */
  async renewCharge(chargeId: number): Promise<RenewalResponse> {
    this.ensureAuthenticated();

    const response = await this.fetchWithResilience(
      `${BASE_URL}/8/api/renew-charges/${chargeId}`,
      {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          circulationMethodCode: 'PYXIS',
        }),
      },
    );

    if (!response.ok) {
      throw new LibraryApiError(
        `Renewal failed with status ${response.status}`,
        response.status,
      );
    }

    const data: RenewalResponse = await response.json();

    if (!data.success) {
      throw new LibraryApiError(
        `Renewal failed: ${data.message}`,
        400,
        data.code,
      );
    }

    console.log(
      `[LibraryClient] Renewed charge ${chargeId}, new due date: ${data.data.dueDate}`,
    );
    return data;
  }

  /**
   * Check if client has an active session
   */
  isAuthenticated(): boolean {
    return this.session !== null;
  }

  /**
   * Clear the current session
   */
  clearSession(): void {
    this.session = null;
  }

  /**
   * Extract cookies from response headers
   */
  private extractCookies(headers: Headers): string {
    const setCookieHeaders = headers.getSetCookie?.() || [];

    if (setCookieHeaders.length === 0) {
      // Fallback for environments that don't support getSetCookie
      const setCookie = headers.get('set-cookie');
      if (setCookie) {
        return setCookie
          .split(',')
          .map((cookie) => {
            const parts = cookie.split(';');
            return parts[0].trim();
          })
          .join('; ');
      }
      return '';
    }

    return setCookieHeaders
      .map((cookie) => {
        const parts = cookie.split(';');
        return parts[0].trim();
      })
      .join('; ');
  }

  /**
   * Get headers with authentication credentials
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.session) {
      throw new LibraryApiError('Not authenticated', 401);
    }

    return {
      Cookie: this.session.cookies,
      'pyxis-auth-token': this.session.accessToken,
    };
  }

  /**
   * Ensure client is authenticated before making requests
   */
  private ensureAuthenticated(): void {
    if (!this.session) {
      throw new LibraryApiError('Not authenticated. Call login() first.', 401);
    }
  }

  /**
   * Fetch with timeout and limited retries for transient failures
   */
  private async fetchWithResilience(
    url: string,
    options: FetchOptions,
  ): Promise<Response> {
    const {
      retries = 2,
      retryBackoffMs = 200,
      timeoutMs = 5000,
      ...rest
    } = options;

    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: rest.method,
          headers: rest.headers,
          body: rest.body,
          signal: controller.signal,
        });

        // Retry on 5xx only if attempts remain
        if (
          response.status >= 500 &&
          response.status < 600 &&
          attempt < retries
        ) {
          await this.delay(retryBackoffMs * 2 ** attempt);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        const isAbort =
          error instanceof DOMException && error.name === 'AbortError';
        if (attempt < retries && (isAbort || error instanceof Error)) {
          await this.delay(retryBackoffMs * 2 ** attempt);
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unknown fetch error');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Custom error class for library API errors
 */
export class LibraryApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public apiCode?: string,
  ) {
    super(message);
    this.name = 'LibraryApiError';
  }
}

/**
 * Create a new library client instance
 */
export function createLibraryClient(): LibraryClient {
  return new LibraryClient();
}
