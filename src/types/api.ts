/**
 * API response type definitions
 * Types for HTTP handlers and frontend view models
 * Trace: spec_id: SPEC-frontend-001, SPEC-notes-001, task_id: TASK-008
 */

/**
 * Book due date status
 */
export type DueStatus = 'overdue' | 'due_soon' | 'ok';

/**
 * Book loan state
 */
export type LoanState = 'on_loan' | 'returned';

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
  isRead: boolean;
}

/**
 * Update read status request body
 */
export interface UpdateReadStatusRequest {
  isRead: boolean;
}

/**
 * Books API response
 */
export interface BooksApiResponse {
  items: BookViewModel[];
}

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

/**
 * Notes API response
 */
export interface NotesApiResponse {
  notes: NoteViewModel[];
}

/**
 * Single note API response
 */
export interface NoteApiResponse {
  note: NoteViewModel;
}

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

/**
 * Branch availability info for planned loans
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */
export interface BranchAvailability {
  branchId: number;
  branchName: string;
  volumes: number;
}

/**
 * Planned loan view model returned by API
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */
export interface PlannedLoanViewModel {
  id: number;
  libraryId: number;
  source: 'new_books' | 'search';
  title: string;
  author: string;
  publisher: string | null;
  year: string | null;
  isbn: string | null;
  coverUrl: string | null;
  materialType: string | null;
  branchVolumes: BranchAvailability[];
  createdAt: string;
}

export interface PlannedLoansResponse {
  items: PlannedLoanViewModel[];
}

export interface CreatePlannedLoanRequest {
  libraryId: number;
  source: 'new_books' | 'search';
  title: string;
  author: string;
  publisher?: string | null;
  year?: string | null;
  isbn?: string | null;
  coverUrl?: string | null;
  materialType?: string | null;
  branchVolumes?: BranchAvailability[];
}
