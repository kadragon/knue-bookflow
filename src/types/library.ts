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
  barcode: string;
  biblio: {
    id: number;
    titleStatement: string;
    isbn: string;
    thumbnail: string | null;
  };
  branch: {
    id: number;
    name: string;
    alias: string;
    libraryCode: string;
    sortOrder: number;
  };
  callNo: string;
  chargeDate: string;
  dueDate: string;
  overdueDays: number;
  renewCnt: number;
  holdCnt: number;
  isMediaCharge: boolean;
  supplementNote: string | null;
  isRenewed: boolean;
  isRenewable: boolean;
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

export interface ChargeHistory {
  id: number;
  barcode: string;
  biblio: {
    id: number;
    titleStatement: string;
    isbn: string;
    thumbnail: string | null;
  };
  chargeDate: string;
  dueDate: string;
  dischargeDate: string;
  renewCnt?: number;
  chargeType: {
    id: number;
    name: string;
  };
  dischargeType: {
    id: number;
    name: string;
    code: string;
  };
  supplementNote: string | null;
}

export interface ChargeHistoriesResponse {
  success: boolean;
  code: string;
  message: string;
  data: {
    list: ChargeHistory[];
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

// New Books (신착 도서) API types
export interface NewBookBiblioType {
  id: number;
  name: string;
  materialType: string;
  biblioSchema: string;
}

export interface NewBookBranchVolume {
  branchId: number;
  branchName: string;
  volumes: number;
}

export interface NewBook {
  id: number;
  biblioType: NewBookBiblioType;
  thumbnailUrl: string | null;
  isbn: string | null;
  issn: string | null;
  titleStatement: string;
  author: string;
  publication: string;
  etcContent: string | null;
  branchVolumes: NewBookBranchVolume[];
  dateReceived: string | null;
}

export interface NewBooksResponse {
  success: boolean;
  code: string;
  message: string;
  data: {
    isFuzzy: boolean;
    totalCount: number;
    offset: number;
    max: number;
    list: NewBook[];
  };
}

// Library Search API types
export interface SearchBook {
  id: number;
  biblioType: NewBookBiblioType;
  thumbnailUrl: string | null;
  isbn: string | null;
  issn: string | null;
  titleStatement: string;
  author: string;
  publication: string;
  etcContent: string | null;
  branchVolumes: NewBookBranchVolume[];
  dateReceived: string | null;
}

export interface SearchBooksResponse {
  success: boolean;
  code: string;
  message: string;
  data: {
    isFuzzy: boolean;
    totalCount: number;
    offset: number;
    max: number;
    list: SearchBook[];
  };
}
