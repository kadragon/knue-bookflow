/**
 * KNUE Library Pyxis API Client
 * Handles authentication, charges retrieval, and renewals
 *
 * Trace: spec_id: SPEC-auth-001, SPEC-charges-001, SPEC-renewal-001
 *        task_id: TASK-002, TASK-003, TASK-004
 */

import {
  LoginRequest,
  LoginResponse,
  SessionData,
  ChargesResponse,
  Charge,
  RenewalResponse,
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
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      throw new LibraryApiError(
        `Login failed with status ${response.status}`,
        response.status
      );
    }

    const data: LoginResponse = await response.json();

    if (!data.success) {
      throw new LibraryApiError(
        `Login failed: ${data.message}`,
        401,
        data.code
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

    const response = await fetch(`${BASE_URL}/8/api/charges?max=20&offset=0`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new LibraryApiError(
        `Failed to fetch charges with status ${response.status}`,
        response.status
      );
    }

    const data: ChargesResponse = await response.json();

    if (!data.success) {
      throw new LibraryApiError(
        `Failed to fetch charges: ${data.message}`,
        400,
        data.code
      );
    }

    console.log(`[LibraryClient] Retrieved ${data.data.list.length} charges`);
    return data.data.list;
  }

  /**
   * Renew a specific book charge
   * @param chargeId - The ID of the charge to renew
   * @returns Renewal result with updated due date
   */
  async renewCharge(chargeId: number): Promise<RenewalResponse> {
    this.ensureAuthenticated();

    const response = await fetch(`${BASE_URL}/8/api/renew-charges/${chargeId}`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        circulationMethodCode: 'PYXIS',
      }),
    });

    if (!response.ok) {
      throw new LibraryApiError(
        `Renewal failed with status ${response.status}`,
        response.status
      );
    }

    const data: RenewalResponse = await response.json();

    if (!data.success) {
      throw new LibraryApiError(
        `Renewal failed: ${data.message}`,
        400,
        data.code
      );
    }

    console.log(`[LibraryClient] Renewed charge ${chargeId}, new due date: ${data.data.dueDate}`);
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
        return setCookie.split(',').map(cookie => {
          const parts = cookie.split(';');
          return parts[0].trim();
        }).join('; ');
      }
      return '';
    }

    return setCookieHeaders.map(cookie => {
      const parts = cookie.split(';');
      return parts[0].trim();
    }).join('; ');
  }

  /**
   * Get headers with authentication credentials
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.session) {
      throw new LibraryApiError('Not authenticated', 401);
    }

    return {
      'Cookie': this.session.cookies,
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
}

/**
 * Custom error class for library API errors
 */
export class LibraryApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public apiCode?: string
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
