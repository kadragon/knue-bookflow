import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import {
  type ApiResponse,
  getBooks,
  type SyncResponse,
  syncBooks,
  triggerWorkflow,
} from './api';

// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019

type DueStatus = 'overdue' | 'due_soon' | 'ok';

type LoanState = 'on_loan' | 'returned';

interface BookItem {
  id: string;
  title: string;
  author: string;
  publisher: string | null;
  coverUrl: string | null;
  description: string | null;
  chargeDate: string;
  dueDate: string;
  renewCount: number;
  daysLeft: number;
  dueStatus: DueStatus;
  loanState: LoanState;
  noteCount: number;
  noteState: 'not_started';
}

const DUE_STATUS_LABEL: Record<DueStatus, string> = {
  overdue: '연체',
  due_soon: '반납 임박',
  ok: '대출 중',
};

const STATUS_BG: Record<DueStatus, string> = {
  overdue: 'badge-red',
  due_soon: 'badge-amber',
  ok: 'badge-green',
};

// Format date string to YYYY-MM-DD
function formatDate(dateStr: string): string {
  return dateStr.split(' ')[0];
}

function useBooks() {
  return useQuery<ApiResponse>({
    queryKey: ['books'],
    queryFn: getBooks,
  });
}

interface FilterState {
  search: string;
  author: string;
  dueStatus: 'all' | DueStatus;
  loanState: 'all' | LoanState;
  minRenew: number;
}

const defaultFilters: FilterState = {
  search: '',
  author: 'all',
  dueStatus: 'all',
  loanState: 'all',
  minRenew: 0,
};

function FilterBar({
  filters,
  authors,
  onChange,
}: {
  filters: FilterState;
  authors: string[];
  onChange: (next: FilterState) => void;
}) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label className="label" htmlFor="search">
          검색
        </label>
        <input
          id="search"
          className="input"
          placeholder="제목, 저자, ISBN"
          value={filters.search}
          onChange={(e) =>
            onChange({ ...filters, search: e.currentTarget.value })
          }
        />
      </div>
      <div className="filter-group">
        <label className="label" htmlFor="author">
          저자
        </label>
        <select
          id="author"
          className="input"
          value={filters.author}
          onChange={(e) => onChange({ ...filters, author: e.target.value })}
        >
          <option value="all">전체</option>
          {authors.map((author) => (
            <option key={author} value={author}>
              {author}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group filter-group-wide">
        <fieldset className="segmented" aria-label="반납 상태 필터">
          <legend className="label">반납 상태</legend>
          {(['all', 'overdue', 'due_soon', 'ok'] as const).map((status) => (
            <button
              type="button"
              key={status}
              className={clsx(
                'chip',
                filters.dueStatus === status && 'chip-active',
              )}
              onClick={() => onChange({ ...filters, dueStatus: status })}
            >
              {status === 'all' ? '전체' : DUE_STATUS_LABEL[status]}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="filter-group">
        <label className="label" htmlFor="minRenew">
          최소 연장 횟수
        </label>
        <input
          id="minRenew"
          type="number"
          className="input"
          min={0}
          max={10}
          value={filters.minRenew}
          onChange={(e) =>
            onChange({ ...filters, minRenew: Number(e.currentTarget.value) })
          }
        />
      </div>
      <div className="filter-group">
        <label className="label" htmlFor="loanState">
          대출 상태
        </label>
        <select
          id="loanState"
          className="input"
          value={filters.loanState}
          onChange={(e) =>
            onChange({
              ...filters,
              loanState: e.target.value as FilterState['loanState'],
            })
          }
        >
          <option value="all">전체</option>
          <option value="on_loan">대출 중</option>
          <option value="returned">반납됨</option>
        </select>
      </div>
    </div>
  );
}

function BookCard({ book }: { book: BookItem }) {
  return (
    <article className="card card-vertical">
      <div className="cover-frame">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="cover" />
        ) : (
          <div className="cover placeholder">
            <span className="placeholder-text">No Cover</span>
          </div>
        )}
      </div>
      <h3 className="card-title">{book.title}</h3>
      <p className="card-author">{book.author}</p>
      <div className="badge-row">
        <span className={clsx('badge badge-inline', STATUS_BG[book.dueStatus])}>
          {DUE_STATUS_LABEL[book.dueStatus]}
        </span>
        {book.renewCount > 0 && (
          <span className="badge badge-inline badge-renew">
            연장 {book.renewCount}회
          </span>
        )}
        <span className="badge badge-inline badge-days">
          D{book.daysLeft >= 0 ? '-' : '+'}
          {Math.abs(book.daysLeft)}
        </span>
      </div>
      <div className="date-info">
        <span>대출 {formatDate(book.chargeDate)}</span>
        <span>반납 {formatDate(book.dueDate)}</span>
      </div>
      <div className="note-cta">
        <div>
          <span className="note-count">노트 {book.noteCount}개</span>
          <span className="note-state">(작성 예정)</span>
        </div>
        <button className="note-button" type="button">
          노트 남기기
        </button>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <p>책장이 비어 있어요. 새로 대출된 책이 여기에 나타납니다.</p>
    </div>
  );
}

function ShelfStats({ books }: { books: BookItem[] }) {
  const totals = useMemo(() => {
    const stats = { overdue: 0, dueSoon: 0, ok: 0 } as const;
    const mutable = { ...stats };
    for (const book of books) {
      mutable[book.dueStatus] += 1;
    }
    return mutable;
  }, [books]);

  return (
    <div className="stats">
      <div>
        <span className="stat-label">총 도서</span>
        <span className="stat-value">{books.length}</span>
      </div>
      <div>
        <span className="stat-label">연체</span>
        <span className="stat-value">{totals.overdue}</span>
      </div>
      <div>
        <span className="stat-label">임박</span>
        <span className="stat-value">{totals.dueSoon}</span>
      </div>
      <div>
        <span className="stat-label">여유</span>
        <span className="stat-value">{totals.ok}</span>
      </div>
    </div>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useBooks();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const triggerMutation = useMutation({
    mutationFn: triggerWorkflow,
    onSuccess: () => {
      setNotification({
        type: 'success',
        message: '워크플로우가 시작되었습니다. 완료 후 새로고침하세요.',
      });
    },
    onError: () => {
      setNotification({
        type: 'error',
        message: '워크플로우 실행에 실패했습니다.',
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: syncBooks,
    onSuccess: (result: SyncResponse) => {
      const { added, updated, unchanged } = result.summary;
      setNotification({
        type: 'success',
        message: `동기화 완료: ${added}개 추가, ${updated}개 업데이트, ${unchanged}개 변경없음`,
      });
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
    onError: (error: Error) => {
      setNotification({
        type: 'error',
        message: error.message || '동기화에 실패했습니다.',
      });
    },
  });

  // Clear notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const authors = useMemo(() => {
    const set = new Set<string>();
    data?.items.forEach((b) => {
      set.add(b.author);
    });
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    const searchLower = filters.search.toLowerCase();

    return data.items.filter((book) => {
      if (
        searchLower &&
        !book.title.toLowerCase().includes(searchLower) &&
        !book.author.toLowerCase().includes(searchLower) &&
        !book.id.toLowerCase().includes(searchLower)
      ) {
        return false;
      }

      if (filters.author !== 'all' && book.author !== filters.author)
        return false;
      if (filters.dueStatus !== 'all' && book.dueStatus !== filters.dueStatus)
        return false;
      if (filters.loanState !== 'all' && book.loanState !== filters.loanState)
        return false;
      if (book.renewCount < filters.minRenew) return false;

      return true;
    });
  }, [data, filters]);

  return (
    <div className="page">
      <div className="glass">
        <header className="header">
          <div>
            <p className="eyebrow">KNUE BookFlow</p>
            <h1>Bookshelf</h1>
            <p className="lede">
              대출 중인 책을 한눈에 보고, 반납 일정을 놓치지 마세요. Zero
              Trust로 보호된 전용 책장입니다.
            </p>
          </div>
          <div className="header-actions">
            <div className="header-buttons">
              <button
                type="button"
                className="sync-button"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? '동기화 중...' : '동기화'}
              </button>
              <button
                type="button"
                className="trigger-button"
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending}
              >
                {triggerMutation.isPending ? '실행 중...' : '갱신 실행'}
              </button>
              <button
                type="button"
                className="refresh-button"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                새로고침
              </button>
            </div>
            {notification && (
              <span
                className={
                  notification.type === 'success'
                    ? 'trigger-success'
                    : 'trigger-error'
                }
              >
                {notification.message}
              </span>
            )}
          </div>
        </header>

        <FilterBar filters={filters} authors={authors} onChange={setFilters} />

        {isLoading && <p className="muted">불러오는 중...</p>}
        {isError && <p className="muted">목록을 불러오지 못했습니다.</p>}

        {data && <ShelfStats books={data.items} />}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid">
            {filtered.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
