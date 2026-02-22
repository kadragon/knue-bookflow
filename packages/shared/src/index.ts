/**
 * Shared Type Definitions for KNUE BookFlow
 * Centralizes API contracts between Backend (Worker) and Frontend (React).
 * Trace: spec_id: SPEC-arch-001, task_id: TASK-048
 */

// =============================================================================
// Core View Models (formerly src/types/api.ts)
// =============================================================================

/**
 * Book due date status
 */
export type DueStatus = 'overdue' | 'due_soon' | 'ok';

/**
 * Book loan state
 */
export type LoanState = 'on_loan' | 'returned';

/**
 * Book reading status
 */
export type ReadStatus = 'unread' | 'finished' | 'abandoned';

/**
 * Note completion state
 */
export type NoteState = 'not_started' | 'in_progress' | 'completed';

/**
 * Book view model for frontend display
 */
export interface BookViewModel {
  id: string;
  dbId: number;
  title: string;
  author: string;
  publisher: string | null;
  coverUrl: string | null;
  description: string | null;
  isbn13: string | null;
  pubDate: string | null;
  chargeDate: string;
  dueDate: string;
  dischargeDate: string | null;
  renewCount: number;
  daysLeft: number;
  dueStatus: DueStatus;
  loanState: LoanState;
  noteCount: number;
  noteState: NoteState;
  readStatus: ReadStatus;
  loanOrdinal?: number;
}

/** Alias for compatibility with legacy Frontend types */
export type BookItem = BookViewModel;

/**
 * Update read status request body
 */
export interface UpdateReadStatusRequest {
  readStatus: ReadStatus;
}

/**
 * Books API response
 */
export interface BooksApiResponse {
  items: BookViewModel[];
}

/** Alias for compatibility */
export type ApiResponse = BooksApiResponse;

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

/**
 * Trigger response
 */
export interface TriggerResponse {
  message: string;
}

/**
 * Note view model for frontend display
 * Trace: spec_id: SPEC-notes-002, task_id: TASK-023
 */
export interface NoteViewModel {
  id: number;
  bookId: number;
  pageNumber: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Alias for compatibility */
export type NoteItem = NoteViewModel;

/**
 * Notes API response
 */
export interface NotesApiResponse {
  notes: NoteViewModel[];
}

/** Alias for compatibility */
export type NotesResponse = NotesApiResponse;

/**
 * Single note API response
 */
export interface NoteApiResponse {
  note: NoteViewModel;
}

/** Alias for compatibility */
export type NoteResponse = NoteApiResponse;

/**
 * Create note request body
 */
export interface CreateNoteRequest {
  page_number: number;
  content: string;
}

/**
 * Update note request body
 */
export interface UpdateNoteRequest {
  page_number?: number;
  content?: string;
}

/**
 * Delete note response
 */
export interface DeleteNoteResponse {
  success: boolean;
}

// =============================================================================
// Book Detail Types
// =============================================================================

export interface BookDetailResponse {
  book: BookViewModel;
  notes: NoteViewModel[];
}

// =============================================================================
// Planned Loans (formerly src/types/api.ts)
// =============================================================================

/**
 * Branch availability info for planned loans
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */
export interface BranchAvailability {
  branchId: number;
  branchName: string;
  volumes: number;
  callNumber?: string | null;
}

/** Alias for compatibility */
export type BranchVolume = BranchAvailability;

/**
 * Availability summary for a planned loan
 * Trace: spec_id: SPEC-loan-plan-002, task_id: TASK-061
 */
export interface PlannedLoanAvailability {
  status: 'available' | 'loaned_out';
  totalItems: number;
  availableItems: number;
  earliestDueDate: string | null;
}

/**
 * Planned loan view model returned by API
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */
export interface PlannedLoanViewModel {
  id: number;
  libraryId: number;
  source: 'new_books' | 'search' | 'request_book';
  title: string;
  author: string;
  publisher: string | null;
  year: string | null;
  isbn: string | null;
  coverUrl: string | null;
  materialType: string | null;
  branchVolumes: BranchAvailability[];
  availability: PlannedLoanAvailability | null;
  createdAt: string;
}

/** Alias for compatibility */
export type PlannedLoanItem = PlannedLoanViewModel;

export interface PlannedLoansResponse {
  items: PlannedLoanViewModel[];
}

export interface CreatePlannedLoanRequest {
  libraryId: number;
  source: 'new_books' | 'search' | 'request_book';
  title: string;
  author: string;
  publisher?: string | null;
  year?: string | null;
  isbn?: string | null;
  coverUrl?: string | null;
  materialType?: string | null;
  branchVolumes?: BranchAvailability[];
}

/** Alias for compatibility */
export type PlannedLoanPayload = CreatePlannedLoanRequest;

// =============================================================================
// Sync (formerly src/handlers/sync-handler.ts)
// =============================================================================

export interface SyncSummary {
  total_charges: number;
  added: number;
  updated: number;
  unchanged: number;
  returned: number;
}

export interface SyncResponse {
  message: string;
  summary: SyncSummary;
}

// =============================================================================
// Catalog / New Books / Search (formerly src/types/library.ts)
// =============================================================================

// Catalog book shape shared by search and new-books
export interface CatalogBookItem {
  id: number;
  title: string;
  author: string;
  publisher: string | null;
  year: string | null;
  coverUrl: string | null;
  isbn: string | null;
  materialType: string | null;
  publication: string;
  branchVolumes: BranchAvailability[];
  availability?: PlannedLoanAvailability | null;
}

// New Books API
export type NewBookItem = CatalogBookItem;

export interface NewBooksResponse {
  items: NewBookItem[];
  meta: {
    count: number;
    totalCount: number;
    offset: number;
    max: number;
    hasMore: boolean;
    days: number;
    fromDate: string;
    toDate: string;
  };
}

// Search API
export type SearchBookItem = CatalogBookItem;

export interface SearchBooksResponse {
  items: SearchBookItem[];
  meta: {
    count: number;
    totalCount: number;
    offset: number;
    max: number;
    query: string;
    isFuzzy: boolean;
  };
}

// =============================================================================
// Aladin Book Info
// =============================================================================

export interface AladinBookInfo {
  isbn: string;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  pubDate: string;
  description: string;
  coverUrl: string;
  tableOfContents?: string;
}

export interface AladinBookResponse {
  book: AladinBookInfo;
}
