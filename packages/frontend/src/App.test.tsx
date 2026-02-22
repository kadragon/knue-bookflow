import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
};

let fetchMock: ReturnType<typeof vi.spyOn>;

function mockBooks(items: BookItem[]) {
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

  it('shows a single manual refresh control', () => {
    renderApp();

    expect(screen.getByRole('button', { name: '갱신' })).toBeDefined();
    expect(screen.queryByTestId('RefreshIcon')).toBeNull();
  });

  it('renders N번째 대여 when loanOrdinal is greater than 1', async () => {
    mockBooks([createBook({ loanOrdinal: 3 })]);
    renderApp();

    expect(await screen.findByText('3번째 대여')).toBeDefined();
  });

  it('does not render N번째 대여 when loanOrdinal is 1', async () => {
    mockBooks([createBook({ loanOrdinal: 1 })]);
    renderApp();

    await screen.findByText('대출 중');
    expect(screen.queryByText('1번째 대여')).toBeNull();
  });
});
