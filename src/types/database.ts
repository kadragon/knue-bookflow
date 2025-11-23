/**
 * D1 Database model type definitions
 * Trace: spec_id: SPEC-storage-001, task_id: TASK-008
 */

export interface BookRecord {
  id?: number;
  charge_id: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  cover_url: string | null;
  description: string | null;
  charge_date: string;
  due_date: string;
  renew_count: number;
  is_read?: number;
  created_at?: string;
  updated_at?: string;
}

export interface RenewalLog {
  id?: number;
  charge_id: string;
  action:
    | 'renewal_attempt'
    | 'renewal_success'
    | 'renewal_failure'
    | 'workflow_error';
  status: 'success' | 'failure';
  message: string;
  created_at?: string;
}

/**
 * Note record for book annotations
 * Trace: spec_id: SPEC-notes-002, task_id: TASK-023
 */
export interface NoteRecord {
  id?: number;
  book_id: number;
  page_number: number;
  content: string;
  created_at?: string;
  updated_at?: string;
}
