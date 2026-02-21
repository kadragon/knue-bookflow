/**
 * PlannedLoansPage availability rendering tests
 *
 * Trace: spec_id: SPEC-loan-plan-002, task_id: TASK-061
 */

import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../theme';
import PlannedLoansPage from './PlannedLoansPage';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('PlannedLoansPage availability badges (TEST-loan-plan-009)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders availability states for planned loans', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 1,
            libraryId: 200,
            source: 'new_books',
            title: 'Available Book',
            author: 'Author A',
            publisher: 'Pub',
            year: '2024',
            isbn: '978...',
            coverUrl: null,
            materialType: null,
            branchVolumes: [],
            createdAt: '2025-02-01T00:00:00.000Z',
            availability: {
              status: 'available',
              totalItems: 3,
              availableItems: 2,
              earliestDueDate: null,
            },
          },
          {
            id: 2,
            libraryId: 300,
            source: 'search',
            title: 'Loaned Book',
            author: 'Author B',
            publisher: null,
            year: '2023',
            isbn: null,
            coverUrl: null,
            materialType: null,
            branchVolumes: [],
            createdAt: '2025-01-15T00:00:00.000Z',
            availability: {
              status: 'loaned_out',
              totalItems: 1,
              availableItems: 0,
              earliestDueDate: '2025-12-20',
            },
          },
          {
            id: 3,
            libraryId: 400,
            source: 'search',
            title: 'Unknown',
            author: 'Author C',
            publisher: null,
            year: '2022',
            isbn: null,
            coverUrl: null,
            materialType: null,
            branchVolumes: [],
            createdAt: '2025-01-10T00:00:00.000Z',
            availability: null,
          },
        ],
      }),
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <MemoryRouter>
            <PlannedLoansPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('대출 가능 (2/3권)')).toBeTruthy();
    expect(screen.getByText('대출 중 · 반납예정 2025-12-20')).toBeTruthy();
    expect(screen.getByText('대출 가능 여부 확인 불가')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Available Book 상세 보기' }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Loaned Book 상세 보기' })
        .getAttribute('disabled'),
    ).not.toBeNull();
    expect(screen.getAllByRole('button', { name: '삭제' })).toHaveLength(3);
  });
});
