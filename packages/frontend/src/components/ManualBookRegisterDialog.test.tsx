import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../theme';
import { ManualBookRegisterDialog } from './ManualBookRegisterDialog';

const aladinItem = {
  isbn13: '9788966262472',
  isbn: '8966262473',
  title: '클린 코드',
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.spyOn>;

function renderDialog(onRegistered = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <ManualBookRegisterDialog
          open
          onClose={vi.fn()}
          onRegistered={onRegistered}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { onRegistered, invalidate };
}

function submitSearch(query: string) {
  fireEvent.change(screen.getByLabelText('알라딘 검색'), {
    target: { value: query },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
}

async function searchAndRegister() {
  submitSearch('클린 코드');
  await screen.findByText('클린 코드');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
}

describe('ManualBookRegisterDialog', () => {
  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('retries a failed search when the same trimmed query is submitted', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Unavailable' }, 502));
    fetchMock.mockResolvedValueOnce(
      json({
        items: [aladinItem],
        meta: { count: 1, totalResults: 1, offset: 0, max: 10 },
      }),
    );

    renderDialog();
    submitSearch('클린 코드');
    await screen.findByText(/알라딘 검색에 실패했어요/);
    submitSearch(' 클린 코드 ');

    await screen.findByText('클린 코드');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
  });

  it('uses total results to page through sparse results and resets for a new query', async () => {
    const searches: [string | null, string | null][] = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const params = new URL(urlOf(input), 'http://x').searchParams;
      const query = params.get('query');
      const offset = Number(params.get('offset'));
      searches.push([query, params.get('offset')]);
      const items =
        offset === 10
          ? []
          : [{ ...aladinItem, title: `${query} 결과 ${offset}` }];
      return json({
        items,
        meta: {
          count: items.length,
          totalResults: query === '코드' ? 21 : 1,
          offset,
          max: 10,
          query,
        },
      });
    });

    const getPageButton = (name: string) =>
      screen.getByRole<HTMLButtonElement>('button', { name });

    renderDialog();
    submitSearch('코드');
    await screen.findByText('코드 결과 0');
    expect(getPageButton('이전 페이지').disabled).toBe(true);
    fireEvent.click(getPageButton('다음 페이지'));
    await screen.findByText('이 페이지에 표시할 도서가 없어요.');
    fireEvent.click(getPageButton('다음 페이지'));
    await screen.findByText('코드 결과 20');
    expect(getPageButton('다음 페이지').disabled).toBe(true);
    fireEvent.click(getPageButton('이전 페이지'));
    await screen.findByText('이 페이지에 표시할 도서가 없어요.');
    submitSearch('새 검색');
    await screen.findByText('새 검색 결과 0');
    expect(screen.queryByRole('button', { name: '다음 페이지' })).toBeNull();
    expect(searches).toEqual([
      ['코드', '0'],
      ['코드', '10'],
      ['코드', '20'],
      ['코드', '10'],
      ['새 검색', '0'],
    ]);
  });

  it('stops at the Aladin search limit when there are more matches', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const params = new URL(urlOf(input), 'http://x').searchParams;
      const offset = Number(params.get('offset'));
      return json({
        items: [{ ...aladinItem, title: `Result at ${offset}` }],
        meta: { count: 1, totalResults: 208, offset, max: 10 },
      });
    });

    renderDialog();
    submitSearch('코드');
    for (let offset = 0; offset < 190; offset += 10) {
      await screen.findByText(`Result at ${offset}`);
      fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    }

    await screen.findByText('Result at 190');
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: '다음 페이지' })
        .disabled,
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it('searches Aladin and registers the selected book', async () => {
    const posted: unknown[] = [];
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        if (url.startsWith('/api/external-search')) {
          expect(new URL(url, 'http://x').searchParams.get('query')).toBe(
            '클린 코드',
          );
          return json({
            items: [aladinItem],
            meta: {
              count: 1,
              totalResults: 1,
              offset: 0,
              max: 10,
              query: '클린 코드',
            },
          });
        }
        if (url === '/api/books/manual' && init?.method === 'POST') {
          posted.push(JSON.parse(String(init.body)));
          return json(
            { item: { dbId: 9, title: '클린 코드', source: 'manual' } },
            201,
          );
        }
        return json({ error: 'Not found' }, 404);
      },
    );

    const { onRegistered, invalidate } = renderDialog();
    await searchAndRegister();

    await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1));
    expect(onRegistered.mock.calls[0][0]).toMatchObject({ dbId: 9 });
    expect(posted).toEqual([
      {
        isbn13: '9788966262472',
        isbn: '8966262473',
        title: '클린 코드',
        author: '로버트 마틴',
        publisher: '인사이트',
        pubDate: '2013-12-24',
        coverUrl: null,
        description: 'desc',
      },
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
  });

  it('explains a duplicate registration instead of closing', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.startsWith('/api/external-search')) {
        return json({
          items: [aladinItem],
          meta: { count: 1, totalResults: 1, offset: 0, max: 10, query: 'x' },
        });
      }
      return json(
        { code: 'DUPLICATE_MANUAL_BOOK', message: '이미 등록한 도서입니다.' },
        409,
      );
    });

    const { onRegistered } = renderDialog();
    await searchAndRegister();

    expect(
      await screen.findByText('이미 책장에 등록한 도서입니다.'),
    ).toBeDefined();
    expect(onRegistered).not.toHaveBeenCalled();
  });
});
