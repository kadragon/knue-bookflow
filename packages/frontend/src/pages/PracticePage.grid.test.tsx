import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../theme';
import PracticePage from './PracticePage';

// 👩‍👩‍👦 is a single ZWJ grapheme cluster that Array.from() would split into 5 cells
const note = {
  id: 5,
  bookId: 1,
  pageNumber: null,
  content: '가나👩‍👩‍👦',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

const book = {
  id: 1,
  title: '테스트책',
  author: '테스터',
  publisher: '출판사',
};

function renderPractice(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <PracticePage />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** Switch the guide toggle to 격자 and return the grid container element. */
async function showGrid(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: '격자' }));
  const cell = await screen.findByText('가');
  const grid = cell.parentElement;
  if (!grid) throw new Error('grid container not found');
  return grid;
}

describe('PracticePage grid sheet', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ note, book }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('packs rows to the top with alignContent: start', async () => {
    renderPractice();
    const grid = await showGrid();

    await waitFor(() => {
      expect(getComputedStyle(grid).display).toBe('grid');
    });
    expect(getComputedStyle(grid).alignContent).toBe('start');
  });

  it('keeps a ZWJ emoji cluster in a single cell', async () => {
    renderPractice();
    await showGrid();

    expect(screen.getAllByText('👩‍👩‍👦')).toHaveLength(1);
  });
});
