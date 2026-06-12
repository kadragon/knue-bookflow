import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../theme';
import PracticePage from './PracticePage';

const note = {
  id: 5,
  bookId: 1,
  pageNumber: 12,
  content: '오탈자가 있는 문장이다.',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
};

const book = {
  id: 1,
  title: '테스트책',
  author: '테스터',
  publisher: '출판사',
};

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function renderPractice() {
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

describe('PracticePage note editing', () => {
  let putBody: unknown;

  beforeEach(() => {
    putBody = undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        if (url.startsWith('/api/practice/today')) {
          return new Response(JSON.stringify({ note, book }), { status: 200 });
        }
        if (url === '/api/notes/5' && init?.method === 'PUT') {
          putBody = JSON.parse(String(init.body));
          return new Response(
            JSON.stringify({
              note: { ...note, content: '오탈자가 없는 문장이다.' },
            }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openEditor() {
    const editBtn = (await screen.findByRole('button', {
      name: '수정',
    })) as HTMLButtonElement;
    await waitFor(() => {
      expect(editBtn.disabled).toBe(false);
    });
    fireEvent.click(editBtn);
  }

  it('edits the note content and saves via PUT /api/notes/:id', async () => {
    renderPractice();

    await openEditor();

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('오탈자가 있는 문장이다.');

    fireEvent.change(textarea, {
      target: { value: '오탈자가 없는 문장이다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(putBody).toEqual({ content: '오탈자가 없는 문장이다.' });
    });
    // editor closes and the sheet shows the corrected content
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    expect(
      screen.getAllByText(/오탈자가 없는 문장이다\./).length,
    ).toBeGreaterThan(0);
  });

  it('cancel discards the draft without saving', async () => {
    renderPractice();

    await openEditor();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '바뀐 내용' } });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(putBody).toBeUndefined();
    expect(
      screen.getAllByText(/오탈자가 있는 문장이다\./).length,
    ).toBeGreaterThan(0);
  });
});
