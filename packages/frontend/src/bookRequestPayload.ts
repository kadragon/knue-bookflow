/**
 * Aladin payload builders.
 * Convert an Aladin external-search result into a book-request or a manual
 * book registration payload.
 */

import type {
  CreateBookRequestPayload,
  CreateManualBookPayload,
  ExternalSearchResultItem,
} from './api';

export function buildFromAladinItem(
  item: ExternalSearchResultItem,
): CreateBookRequestPayload {
  return {
    isbn13: item.isbn13,
    isbn: item.isbn ?? undefined,
    title: item.title,
    author: item.author ?? undefined,
    publisher: item.publisher ?? undefined,
    pubDate: item.pubDate ?? undefined,
    coverUrl: item.coverUrl ?? undefined,
    aladinLink: item.aladinLink ?? undefined,
  };
}

export function buildManualBookFromAladinItem(
  item: ExternalSearchResultItem,
): CreateManualBookPayload {
  return {
    isbn13: item.isbn13 || null,
    isbn: item.isbn,
    title: item.title,
    author: item.author,
    publisher: item.publisher,
    pubDate: item.pubDate,
    coverUrl: item.coverUrl,
    description: item.description,
  };
}
