/**
 * Aladin Open API type definitions
 * Trace: spec_id: SPEC-bookinfo-001, task_id: TASK-008
 */

import type { Charge } from './library';

export interface AladinItemLookupResponse {
  version: string;
  title: string;
  link: string;
  pubDate: string;
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  query: string;
  item: AladinItem[];
}

export interface AladinItem {
  title: string;
  link: string;
  author: string;
  pubDate: string;
  description: string;
  isbn: string;
  isbn13: string;
  itemId: number;
  priceSales: number;
  priceStandard: number;
  stockStatus: string;
  cover: string;
  categoryId: number;
  categoryName: string;
  publisher: string;
}

export interface BookInfo {
  isbn: string;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  pubDate: string;
  description: string;
  coverUrl: string;
}

/**
 * Combined charge and book info for enrichment results
 */
export interface ChargeWithBookInfo {
  charge: Charge;
  bookInfo: BookInfo | null;
}
