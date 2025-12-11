// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019

interface BookItem {
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
  dueStatus: 'overdue' | 'due_soon' | 'ok';
  loanState: 'on_loan' | 'returned';
  noteCount: number;
  noteState: 'not_started' | 'in_progress' | 'completed';
  isRead: boolean;
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

// Trace: spec_id: SPEC-book-detail-001, task_id: TASK-030
export interface BookDetailResponse {
  book: BookItem;
  notes: NoteItem[];
}

export const getBook = async (bookId: number): Promise<BookDetailResponse> => {
  const res = await fetch(`/api/books/${bookId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to load book');
  }
  return res.json();
};

export type { BookItem };

export const updateReadStatus = async (
  bookId: number,
  isRead: boolean,
): Promise<{ success: boolean }> => {
  const res = await fetch(`/api/books/${bookId}/read-status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ isRead }),
  });

  if (!res.ok) {
    throw new Error('Failed to update read status');
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
  returned: number;
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

// Notes API
// Trace: spec_id: SPEC-notes-002, task_id: TASK-023

export interface NoteItem {
  id: number;
  bookId: number;
  pageNumber: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotesResponse {
  notes: NoteItem[];
}

export interface NoteResponse {
  note: NoteItem;
}

export const getNotes = async (bookId: number): Promise<NotesResponse> => {
  const res = await fetch(`/api/books/${bookId}/notes`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to load notes');
  }
  return res.json();
};

export const createNote = async (
  bookId: number,
  data: { page_number: number; content: string },
): Promise<NoteResponse> => {
  const res = await fetch(`/api/books/${bookId}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to create note');
  }
  return res.json();
};

export const updateNote = async (
  noteId: number,
  data: { page_number?: number; content?: string },
): Promise<NoteResponse> => {
  const res = await fetch(`/api/notes/${noteId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to update note');
  }
  return res.json();
};

export const deleteNote = async (
  noteId: number,
): Promise<{ success: boolean }> => {
  const res = await fetch(`/api/notes/${noteId}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to delete note');
  }
  return res.json();
};

// New Books API (신착 도서)
export interface NewBookItem {
  id: number;
  title: string;
  author: string;
  publisher: string | null;
  year: string | null;
  coverUrl: string | null;
  isbn: string | null;
  materialType: string | null;
  publication: string;
  branchVolumes: BranchVolume[];
}

export interface NewBooksResponse {
  items: NewBookItem[];
  meta: {
    count: number;
    days: number;
    fromDate: string;
    toDate: string;
  };
}

export const getNewBooks = async (
  days: number = 90,
  max: number = 50,
): Promise<NewBooksResponse> => {
  const res = await fetch(`/api/new-books?days=${days}&max=${max}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to load new books');
  }
  return res.json();
};

// Library Search API
export interface BranchVolume {
  branchId: number;
  branchName: string;
  volumes: number;
}

export interface SearchBookItem {
  id: number;
  title: string;
  author: string;
  publisher: string | null;
  year: string | null;
  coverUrl: string | null;
  isbn: string | null;
  materialType: string | null;
  publication: string;
  branchVolumes: BranchVolume[];
}

// Planned Loan API
export interface PlannedLoanPayload {
  libraryId: number;
  source: 'new_books' | 'search';
  title: string;
  author: string;
  publisher: string | null;
  year: string | null;
  isbn: string | null;
  coverUrl: string | null;
  materialType: string | null;
  branchVolumes: BranchVolume[];
}

export interface PlannedLoanItem extends PlannedLoanPayload {
  id: number;
  createdAt: string;
}

export interface PlannedLoansResponse {
  items: PlannedLoanItem[];
}

async function handleApiError(
  response: Response,
  defaultMessage: string,
): Promise<void> {
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || defaultMessage);
  }
}

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

export const searchBooks = async (
  query: string,
  max: number = 20,
  offset: number = 0,
): Promise<SearchBooksResponse> => {
  const params = new URLSearchParams({
    query,
    max: max.toString(),
    offset: offset.toString(),
  });
  const res = await fetch(`/api/search?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to search books');
  }
  return res.json();
};

export const getPlannedLoans = async (): Promise<PlannedLoansResponse> => {
  const res = await fetch('/api/planned-loans', {
    headers: { Accept: 'application/json' },
  });
  await handleApiError(res, 'Failed to load planned loans');
  return res.json();
};

export const createPlannedLoan = async (
  payload: PlannedLoanPayload,
): Promise<{ item: PlannedLoanItem }> => {
  const res = await fetch('/api/planned-loans', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  await handleApiError(res, 'Failed to save planned loan');

  return res.json();
};

export const deletePlannedLoan = async (
  id: number,
): Promise<{ success: boolean }> => {
  const res = await fetch(`/api/planned-loans/${id}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });

  await handleApiError(res, 'Failed to delete planned loan');

  return res.json();
};
