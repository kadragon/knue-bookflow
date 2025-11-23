// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019

interface BookItem {
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
  dueStatus: 'overdue' | 'due_soon' | 'ok';
  loanState: 'on_loan' | 'returned';
  noteCount: number;
  noteState: 'not_started';
}

export interface ApiResponse {
  items: BookItem[];
}

export const getBooks = async (): Promise<ApiResponse> => {
  const res = await fetch('/api/books', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to load books');
  }
  return res.json();
};

export const triggerWorkflow = async (): Promise<{ message: string }> => {
  const res = await fetch('/trigger', {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to trigger workflow');
  }
  return res.json();
};

// Library-DB sync
// Trace: spec_id: SPEC-sync-001, task_id: TASK-021

export interface SyncSummary {
  total_charges: number;
  added: number;
  updated: number;
  unchanged: number;
}

export interface SyncResponse {
  message: string;
  summary: SyncSummary;
}

export const syncBooks = async (): Promise<SyncResponse> => {
  const res = await fetch('/api/books/sync', {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to sync books');
  }

  return res.json();
};
