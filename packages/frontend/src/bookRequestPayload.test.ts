import { describe, expect, it } from 'vitest';
import type { ExternalSearchResultItem } from './api';
import { buildFromAladinItem } from './bookRequestPayload';

const item: ExternalSearchResultItem = {
  isbn13: '9788966262472',
  isbn: '8966262473',
  title: '클린 코드',
  author: '로버트 마틴',
  publisher: '인사이트',
  pubDate: '2013-12-24',
  coverUrl: 'https://image.aladin.co.kr/1.jpg',
  aladinLink: 'https://www.aladin.co.kr/shop/1',
  description: 'desc',
};

describe('buildFromAladinItem', () => {
  it('maps an Aladin result to a create payload (drops description)', () => {
    expect(buildFromAladinItem(item)).toEqual({
      isbn13: '9788966262472',
      isbn: '8966262473',
      title: '클린 코드',
      author: '로버트 마틴',
      publisher: '인사이트',
      pubDate: '2013-12-24',
      coverUrl: 'https://image.aladin.co.kr/1.jpg',
      aladinLink: 'https://www.aladin.co.kr/shop/1',
    });
  });

  it('converts null optional fields to undefined', () => {
    const sparse: ExternalSearchResultItem = {
      ...item,
      isbn: null,
      author: null,
      publisher: null,
      pubDate: null,
      coverUrl: null,
      aladinLink: null,
    };

    const payload = buildFromAladinItem(sparse);

    expect(payload.isbn13).toBe('9788966262472');
    expect(payload.title).toBe('클린 코드');
    expect(payload.isbn).toBeUndefined();
    expect(payload.author).toBeUndefined();
    expect(payload.publisher).toBeUndefined();
    expect(payload.pubDate).toBeUndefined();
    expect(payload.coverUrl).toBeUndefined();
    expect(payload.aladinLink).toBeUndefined();
  });
});
