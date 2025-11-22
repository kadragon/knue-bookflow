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
  title: string;
  author: string;
  publisher: string | null;
  coverUrl: string | null;
  description: string | null;
  chargeDate: string;
  dueDate: string;
  renewCount: number;
  daysLeft: number;
  dueStatus: DueStatus;
  loanState: LoanState;
  noteCount: number;
  noteState: NoteState;
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
