import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookItem } from '../api';
import theme from '../theme';
import BookDetailPage from './BookDetailPage';

const makeBook = (overrides: Partial<BookItem> = {}): BookItem => ({
  id: 'charge-1',
  dbId: 1,
  title: '테스트책',
  author: '테스터',
  publisher: null,
  coverUrl: null,
  description: null,
  isbn13: null,
  pubDate: null,
  chargeDate: '2025-02-01',
  dueDate: '2099-02-10',
  dischargeDate: null,
  renewCount: 0,
  daysLeft: 5,
  dueStatus: 'ok',
  loanState: 'on_loan',
  noteCount: 0,
  noteState: 'not_started',
  readStatus: 'unread',
  loanOrdinal: 1,
  ...overrides,
});

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={['/books/1']}>
          <Routes>
            <Route path="/books/:id" element={<BookDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

const finishBtn = () =>
  screen.getByRole('button', { name: '완독' }) as HTMLButtonElement;

let fetchMock: ReturnType<typeof vi.spyOn>;

describe('BookDetailPage optimistic read-status', () => {
  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  function mockDetail(patchGate: Promise<Response>) {
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/read-status') && method === 'PATCH') {
          return patchGate;
        }
        if (/\/api\/books\/1$/.test(url)) {
          return new Response(JSON.stringify({ book: makeBook(), notes: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );
  }

  it('flips optimistically and keeps the value on success', async () => {
    let resolvePatch: (value: Response) => void = () => {};
    const patchGate = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    mockDetail(patchGate);

    renderDetail();

    await screen.findByRole('button', { name: '완독' });
    expect(finishBtn().getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(finishBtn());

    await waitFor(() => {
      expect(finishBtn().getAttribute('aria-pressed')).toBe('true');
      expect(finishBtn().disabled).toBe(true);
    });

    resolvePatch(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await waitFor(() => expect(finishBtn().disabled).toBe(false));
    expect(finishBtn().getAttribute('aria-pressed')).toBe('true');
  });

  it('rolls back the detail cache when the PATCH fails', async () => {
    let failPatch: (value: Response) => void = () => {};
    const patchGate = new Promise<Response>((resolve) => {
      failPatch = resolve;
    });
    mockDetail(patchGate);

    renderDetail();

    await screen.findByRole('button', { name: '완독' });
    fireEvent.click(finishBtn());

    await waitFor(() =>
      expect(finishBtn().getAttribute('aria-pressed')).toBe('true'),
    );

    failPatch(
      new Response(JSON.stringify({ error: 'fail' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await waitFor(() =>
      expect(finishBtn().getAttribute('aria-pressed')).toBe('false'),
    );
    expect(
      await screen.findByText('독서 상태 변경에 실패했습니다.'),
    ).toBeDefined();
  });
});
