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
