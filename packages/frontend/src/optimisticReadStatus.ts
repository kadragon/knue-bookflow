/**
 * Pure cache-patch helpers for optimistic read-status updates.
 *
 * The read-status mutation flips a single book between unread/finished/abandoned.
 * Instead of refetching the whole list after every change, we patch the cached
 * react-query data in place so the UI reflects the change instantly.
 */
import type { ApiResponse, BookDetailResponse, ReadStatus } from './api';

export function patchBooksReadStatus(
  data: ApiResponse | undefined,
  dbId: number,
  readStatus: ReadStatus,
): ApiResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    items: data.items.map((item) =>
      item.dbId === dbId ? { ...item, readStatus } : item,
    ),
  };
}

export function patchBookDetailReadStatus(
  data: BookDetailResponse | undefined,
  readStatus: ReadStatus,
): BookDetailResponse | undefined {
  if (!data) return data;
  return { ...data, book: { ...data.book, readStatus } };
}
