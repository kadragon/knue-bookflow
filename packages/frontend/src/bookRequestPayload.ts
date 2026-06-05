/**
 * Book request payload builder.
 * Converts an Aladin external-search result into a create-request payload.
 */

import type { CreateBookRequestPayload, ExternalSearchResultItem } from './api';

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
