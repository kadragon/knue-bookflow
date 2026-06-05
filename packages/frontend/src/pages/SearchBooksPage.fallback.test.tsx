import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../theme';
import SearchBooksPage from './SearchBooksPage';

function renderPage(query: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <MemoryRouter
          initialEntries={[`/search?q=${encodeURIComponent(query)}`]}
        >
          <SearchBooksPage />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const aladinItem = {
  isbn13: '9788966262472',
  isbn: '8966262473',
  title: '클린 코드(알라딘)',
  author: '로버트 마틴',
  publisher: '인사이트',
  pubDate: '2013-12-24',
  coverUrl: null,
  aladinLink: 'https://www.aladin.co.kr/shop/1',
  description: 'desc',
};

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function emptyKnue(): Response {
  return new Response(
    JSON.stringify({
      items: [],
      meta: {
        count: 0,
        totalCount: 0,
        offset: 0,
        max: 20,
        query: 'x',
        isFuzzy: false,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

let fetchMock: ReturnType<typeof vi.spyOn>;

describe('SearchBooksPage Aladin fallback', () => {
  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('shows Aladin results and records a request when KNUE has none', async () => {
    let externalCalled = 0;
    let postCalled = 0;

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/api/external-search')) {
          externalCalled += 1;
          return new Response(
            JSON.stringify({
              items: [aladinItem],
              meta: {
                count: 1,
                totalResults: 1,
                offset: 0,
                max: 10,
                query: 'x',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/api/book-requests') && method === 'POST') {
          postCalled += 1;
          return new Response(
            JSON.stringify({
              item: { id: 1, ...aladinItem, createdAt: '2026-06-05' },
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/api/search')) {
          return emptyKnue();
        }
        return new Response(JSON.stringify({ error: 'nf' }), { status: 404 });
      },
    );

    renderPage('클린코드');

    expect(
      await screen.findByText('학교 도서관에 없는 책이에요.'),
    ).toBeDefined();
    const requestButton = await screen.findByRole('button', { name: '신청' });
    await waitFor(() => expect(externalCalled).toBe(1));
    expect(screen.getByText('클린 코드(알라딘)')).toBeDefined();

    fireEvent.click(requestButton);
    await waitFor(() => expect(postCalled).toBe(1));
  });

  it('does not query Aladin when KNUE has results', async () => {
    let externalCalled = 0;
    const knueItem = {
      id: 1,
      title: '있는책',
      author: '저자',
      publisher: null,
      year: null,
      coverUrl: null,
      isbn: '1',
      materialType: null,
      publication: '',
      branchVolumes: [],
      availability: null,
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/api/external-search')) {
        externalCalled += 1;
        return new Response(JSON.stringify({ items: [], meta: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/search')) {
        return new Response(
          JSON.stringify({
            items: [knueItem],
            meta: {
              count: 1,
              totalCount: 1,
              offset: 0,
              max: 20,
              query: 'x',
              isFuzzy: false,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ error: 'nf' }), { status: 404 });
    });

    renderPage('있는책');

    expect(await screen.findByText('있는책')).toBeDefined();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '대출 예정' })).toBeDefined(),
    );
    expect(externalCalled).toBe(0);
  });

  it('shows an error when the Aladin fallback request fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/api/external-search')) {
        return new Response(
          JSON.stringify({ error: 'Aladin API unavailable' }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      if (url.includes('/api/search')) {
        return emptyKnue();
      }
      return new Response(JSON.stringify({ error: 'nf' }), { status: 404 });
    });

    renderPage('클린코드');

    expect(
      await screen.findByText(
        '알라딘 검색에 실패했어요. 잠시 후 다시 시도해 주세요.',
      ),
    ).toBeDefined();
  });
});
