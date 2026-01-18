// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019
import type {
  AladinBookInfo,
  AladinBookResponse,
  ApiResponse,
  BookDetailResponse,
  BookItem,
  BranchVolume,
  CatalogBookItem,
  DueStatus,
  LoanState,
  NewBookItem,
  NewBooksResponse,
  NoteItem,
  NoteResponse,
  NotesResponse,
  PlannedLoanItem,
  PlannedLoanPayload,
  PlannedLoansResponse,
  ReadStatus,
  SearchBookItem,
  SearchBooksResponse,
  SyncResponse,
} from '@knue-bookflow/shared';

export type {
  AladinBookInfo,
  AladinBookResponse,
  ApiResponse,
  BookDetailResponse,
  BookItem,
  BranchVolume,
  CatalogBookItem,
  DueStatus,
  LoanState,
  NewBookItem,
  NewBooksResponse,
  NoteItem,
  NoteResponse,
  NotesResponse,
  PlannedLoanItem,
  PlannedLoanPayload,
  PlannedLoansResponse,
  ReadStatus,
  SearchBookItem,
  SearchBooksResponse,
  SyncResponse,
};

export const getBooks = async (): Promise<ApiResponse> => {
  const res = await fetch('/api/books', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to load books');
  }
  return res.json();
};

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

export const updateReadStatus = async (
  bookId: number,
  readStatus: ReadStatus,
): Promise<{ success: boolean }> => {
  const res = await fetch(`/api/books/${bookId}/read-status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ readStatus }),
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

export const getNewBooks = async (
  days: number = 30,
  max: number = 50,
  offset: number = 0,
): Promise<NewBooksResponse> => {
  const res = await fetch(
    `/api/new-books?days=${days}&max=${max}&offset=${offset}`,
    {
      headers: { Accept: 'application/json' },
    },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to load new books');
  }
  return res.json();
};

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

export const getBookByIsbn = async (
  isbn: string,
): Promise<AladinBookResponse> => {
  const res = await fetch(`/api/aladin/isbn/${encodeURIComponent(isbn)}`, {
    headers: { Accept: 'application/json' },
  });

  await handleApiError(res, 'Failed to fetch book information');

  return res.json();
};
