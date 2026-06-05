/**
 * External Search Handler (Aladin keyword search)
 * Surfaces books the KNUE library does NOT hold, so the user can request them.
 * Intended to be called by the frontend only when GET /api/search returns 0 hits.
 */

import type { AladinKeywordSearchResult } from '../services';
import { createAladinClient } from '../services';
import type { AladinSearchItem, Env, ExternalSearchResultItem } from '../types';
import { parsePaginationParams } from '../utils';

type KeywordSearchFn = (
  query: string,
  max: number,
  offset: number,
) => Promise<AladinKeywordSearchResult>;

function toResultItem(item: AladinSearchItem): ExternalSearchResultItem {
  return {
    isbn13: item.isbn13,
    isbn: item.isbn || null,
    title: item.title,
    author: item.author || null,
    publisher: item.publisher || null,
    pubDate: item.pubDate || null,
    coverUrl: item.cover || null,
    aladinLink: item.link || null,
    description: item.description || null,
  };
}

/**
 * Handle GET /api/external-search
 * Query params: query (required), max (default 10, 1-50), offset (default 0)
 */
export async function handleExternalSearch(
  env: Env,
  request: Request,
  searchByKeyword: KeywordSearchFn = (query, max, offset) =>
    createAladinClient(env.ALADIN_API_KEY).searchByKeyword(query, max, offset),
): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');

  if (!query || query.trim() === '') {
    return new Response(
      JSON.stringify({
        code: 'INVALID_REQUEST',
        message: 'Query parameter is required',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const pagination = parsePaginationParams(url.searchParams, {
    max: {
      default: 10,
      min: 1,
      max: 50,
      errorMessage: 'Invalid max parameter (1-50)',
    },
    offset: {
      default: 0,
      min: 0,
      errorMessage: 'Invalid offset parameter (>= 0)',
    },
  });

  if ('response' in pagination) {
    return pagination.response;
  }

  const { max = 10, offset = 0 } = pagination.values;
  const trimmed = query.trim();

  try {
    const { items, totalResults } = await searchByKeyword(trimmed, max, offset);
    // A request needs an isbn13 to be recordable; drop items without one.
    const results = items.filter((i) => i.isbn13).map(toResultItem);

    return new Response(
      JSON.stringify({
        items: results,
        meta: {
          count: results.length,
          totalResults,
          offset,
          max,
          query: trimmed,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      },
    );
  } catch (error) {
    console.error('[ExternalSearch] Aladin search failed', error);
    return new Response(
      JSON.stringify({
        code: 'UPSTREAM_ERROR',
        message: 'Aladin API unavailable',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
