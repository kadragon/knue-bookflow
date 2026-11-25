/**
 * Pure cache-patch helpers for optimistic read-status updates.
 *
 * The read-status mutation flips a single book between unread/finished/abandoned.
 * Instead of refetching the whole list after every change, we patch the cached
 * react-query data in place so the UI reflects the change instantly.
 */
import type {
  ApiResponse,
  BookDetailResponse,
  BookItem,
  ReadStatus,
} from './api';

/**
 * Apply a read-status change to one book. A manual book mirrors the server:
 * finishing or abandoning it takes it off loan, marking it unread puts it back.
 */
function withReadStatus(book: BookItem, readStatus: ReadStatus): BookItem {
  if (book.source !== 'manual') {
    return { ...book, readStatus };
  }
  return {
    ...book,
    readStatus,
    loanState: readStatus === 'unread' ? 'on_loan' : 'returned',
  };
}

export function patchBooksReadStatus(
  data: ApiResponse | undefined,
  dbId: number,
  readStatus: ReadStatus,
): ApiResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    items: data.items.map((item) =>
      item.dbId === dbId ? withReadStatus(item, readStatus) : item,
    ),
  };
}

export function patchBookDetailReadStatus(
  data: BookDetailResponse | undefined,
  readStatus: ReadStatus,
): BookDetailResponse | undefined {
  if (!data) return data;
  return { ...data, book: withReadStatus(data.book, readStatus) };
}
