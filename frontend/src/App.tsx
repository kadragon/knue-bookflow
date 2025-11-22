import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';

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

interface ApiResponse {
  items: BookItem[];
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

function useBooks() {
  return useQuery<ApiResponse>(['books'], async () => {
    const res = await fetch('/api/books', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error('Failed to load books');
    }
    return res.json();
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
      <div className="filter-group">
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
    <article className="card">
      <div className="cover-frame">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="cover" />
        ) : (
          <div className="cover placeholder">
            <span className="placeholder-text">No Cover</span>
          </div>
        )}
        <span className={clsx('badge', STATUS_BG[book.dueStatus])}>
          {DUE_STATUS_LABEL[book.dueStatus]}
        </span>
      </div>
      <div className="card-body">
        <div className="title-row">
          <h3>{book.title}</h3>
          <span className="renew">연장 {book.renewCount}회</span>
        </div>
        <p className="muted">{book.author}</p>
        {book.publisher && <p className="muted">{book.publisher}</p>}
        <div className="meta">
          <span>대출일 {book.chargeDate}</span>
          <span>반납 예정 {book.dueDate}</span>
          <span className="days">
            D{book.daysLeft >= 0 ? '-' : '+'}
            {Math.abs(book.daysLeft)}
          </span>
        </div>
        {book.description && <p className="description">{book.description}</p>}
        <div className="note-cta">
          <div>
            <span className="note-count">노트 {book.noteCount}개</span>
            <span className="note-state">(작성 예정)</span>
          </div>
          <button className="note-button" type="button">
            노트 남기기
          </button>
        </div>
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
    const overdue = books.filter((b) => b.dueStatus === 'overdue').length;
    const dueSoon = books.filter((b) => b.dueStatus === 'due_soon').length;
    const ok = books.filter((b) => b.dueStatus === 'ok').length;
    return { overdue, dueSoon, ok };
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
  const { data, isLoading, isError } = useBooks();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const authors = useMemo(() => {
    const set = new Set<string>();
    data?.items.forEach((b) => {
      set.add(b.author);
    });
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((book) => {
      if (
        filters.search &&
        !(
          book.title.toLowerCase().includes(filters.search.toLowerCase()) ||
          book.author.toLowerCase().includes(filters.search.toLowerCase()) ||
          book.id.toLowerCase().includes(filters.search.toLowerCase())
        )
      ) {
        return false;
      }

      if (filters.author !== 'all' && book.author !== filters.author) {
        return false;
      }

      if (filters.dueStatus !== 'all' && book.dueStatus !== filters.dueStatus) {
        return false;
      }

      if (filters.loanState !== 'all' && book.loanState !== filters.loanState) {
        return false;
      }

      if (book.renewCount < filters.minRenew) {
        return false;
      }

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
