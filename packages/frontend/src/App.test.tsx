import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { BookItem } from './api';
import theme from './theme';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const createBook = (overrides: Partial<BookItem> = {}): BookItem => ({
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
  source: 'library',
  loanOrdinal: 1,
  ...overrides,
});

const renderApp = () => {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return queryClient;
};

let fetchMock: ReturnType<typeof vi.spyOn>;

function mockBooks(
  items: BookItem[],
  identity: Response | Promise<Response> = Response.json({ isAdmin: false }),
) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes('/api/books')) {
      return new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === '/api/me') {
      return identity;
    }

    if (url === '/trigger') {
      return Response.json({ message: 'Workflow started' });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('App Component', () => {
  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
    mockBooks([createBook()]);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('renders without crashing', () => {
    renderApp();

    // Check for the "Bookshelf" title which is in the App component
    expect(screen.getByText('Bookshelf')).toBeDefined();
  });

  it('shows a single manual refresh control once admin status is confirmed', async () => {
    let resolveIdentity: (response: Response) => void = () => {};
    const identity = new Promise<Response>((resolve) => {
      resolveIdentity = resolve;
    });
    mockBooks([createBook()], identity);
    renderApp();

    await screen.findByText('테스트책');
    expect(screen.queryByRole('button', { name: '갱신' })).toBeNull();

    resolveIdentity(Response.json({ isAdmin: true }));
    const button = await screen.findByRole('button', { name: '갱신' });
    expect(screen.queryByTestId('RefreshIcon')).toBeNull();

    fireEvent.click(button);
    await screen.findByText(
      '워크플로우가 시작되었습니다. 완료 후 새로고침하세요.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/trigger',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    ['a member', { isAdmin: false }, 200, 'success'],
    ['an identity error', { error: 'Unauthorized' }, 401, 'error'],
  ])(
    'hides manual refresh for %s and keeps manual registration',
    async (_name, body, status, queryStatus) => {
      mockBooks([createBook()], Response.json(body, { status }));
      const queryClient = renderApp();

      await waitFor(() =>
        expect(queryClient.getQueryState(['me'])?.status).toBe(queryStatus),
      );
      expect(screen.queryByRole('button', { name: '갱신' })).toBeNull();
      expect(
        screen.getAllByRole('button', { name: '직접 등록' }).length,
      ).toBeGreaterThan(0);
    },
  );

  it('renders N번째 대여 when loanOrdinal is greater than 1', async () => {
    mockBooks([createBook({ loanOrdinal: 3 })]);
    renderApp();

    expect(await screen.findByText('3번째 대여')).toBeDefined();
  });

  it('shows a manual book with its registration date and no due countdown', async () => {
    mockBooks([
      createBook({
        source: 'manual',
        chargeDate: '2025-02-01',
        dueDate: '2025-02-01',
        daysLeft: 0,
      }),
    ]);
    renderApp();

    expect(await screen.findByText('등록 2025-02-01')).toBeDefined();
    expect(screen.getAllByText('직접 등록')).toHaveLength(2);
    expect(screen.queryByText(/^반납 /)).toBeNull();
    expect(screen.queryByText('D-0')).toBeNull();
  });

  it('does not render N번째 대여 when loanOrdinal is 1', async () => {
    mockBooks([createBook({ loanOrdinal: 1 })]);
    renderApp();

    await screen.findByText('대출 중');
    expect(screen.queryByText('1번째 대여')).toBeNull();
  });

  const finishBtn = () =>
    screen.getByRole('button', { name: '완독' }) as HTMLButtonElement;

  it('flips read status optimistically without refetching the list', async () => {
    let booksGetCount = 0;
    let resolvePatch: (value: Response) => void = () => {};
    const patchGate = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const method = init?.method ?? 'GET';

        if (url.includes('/read-status') && method === 'PATCH') {
          return patchGate;
        }
        if (url.includes('/api/books')) {
          booksGetCount += 1;
          // A refetch returns the server's stored value (still 'unread'),
          // so any stray refetch would flip the button back to unpressed.
          return new Response(JSON.stringify({ items: [createBook()] }), {
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

    renderApp();

    await screen.findByRole('button', { name: '완독' });
    expect(finishBtn().getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(finishBtn());

    // Optimistic: flips and disables the control before the PATCH resolves.
    await waitFor(() => {
      expect(finishBtn().getAttribute('aria-pressed')).toBe('true');
      expect(finishBtn().disabled).toBe(true);
    });
    expect(booksGetCount).toBe(1);

    // Resolve the slow PATCH and wait for the mutation lifecycle to settle
    // (the control re-enables). A re-added onSettled refetch would have fired
    // by now, bumping the GET count and reverting the optimistic value.
    resolvePatch(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await waitFor(() => expect(finishBtn().disabled).toBe(false));

    expect(booksGetCount).toBe(1);
    expect(finishBtn().getAttribute('aria-pressed')).toBe('true');
  });

  it('rolls back the optimistic read status when the PATCH fails', async () => {
    let failPatch: (value: Response) => void = () => {};
    const patchGate = new Promise<Response>((resolve) => {
      failPatch = resolve;
    });

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const method = init?.method ?? 'GET';

        if (url.includes('/read-status') && method === 'PATCH') {
          return patchGate;
        }
        if (url.includes('/api/books')) {
          return new Response(JSON.stringify({ items: [createBook()] }), {
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

    renderApp();

    await screen.findByRole('button', { name: '완독' });
    expect(finishBtn().getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(finishBtn());

    // Optimistic flip is observed first.
    await waitFor(() =>
      expect(finishBtn().getAttribute('aria-pressed')).toBe('true'),
    );

    // PATCH fails → rollback to the original value + error notification.
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
