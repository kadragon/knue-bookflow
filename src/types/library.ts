/**
 * KNUE Library Pyxis API type definitions
 * Trace: spec_id: SPEC-auth-001, SPEC-charges-001, SPEC-renewal-001
 *        task_id: TASK-008
 */

// HTTP utility types for resilient fetch operations
export type HttpMethod = 'GET' | 'POST';

export interface FetchOptions {
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
}

// Authentication types
export interface LoginRequest {
  loginId: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  code: string;
  message: string;
  data: {
    accessToken: string;
    id: string;
    name: string;
  };
}

export interface SessionData {
  accessToken: string;
  cookies: string;
}

export interface Charge {
  id: number;
  renewCnt: number;
  chargeDate: string;
  dueDate: string;
  volume: {
    id: number;
    barcode: string;
    shelfLocCode: string;
    callNo: string;
    bib: {
      id: number;
      title: string;
      author: string;
      isbn: string;
    };
  };
}

export interface ChargesResponse {
  success: boolean;
  code: string;
  message: string;
  data: {
    list: Charge[];
    totalCount: number;
  };
}

export interface RenewalRequest {
  circulationMethodCode: string;
}

export interface RenewalResponse {
  success: boolean;
  code: string;
  message: string;
  data: {
    id: number;
    renewCnt: number;
    dueDate: string;
  };
}
