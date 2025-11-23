import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import {
  type ApiResponse,
  createNote,
  deleteNote,
  getBooks,
  getNotes,
  type NoteItem,
  type SyncResponse,
  syncBooks,
  triggerWorkflow,
  updateNote,
  updateReadStatus,
} from './api';
import { filterBooks } from './filterBooks';
import { shouldShowPlannedLabel } from './noteCta';

// Trace: spec_id: SPEC-frontend-001, SPEC-notes-002, task_id: TASK-019, TASK-023

type DueStatus = 'overdue' | 'due_soon' | 'ok';

type LoanState = 'on_loan' | 'returned';

interface BookItem {
  id: string;
  dbId: number;
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
  noteState: 'not_started' | 'in_progress' | 'completed';
  isRead: boolean;
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
  loanState: 'all' | LoanState;
}

const defaultFilters: FilterState = {
  search: '',
  loanState: 'all',
};

function FilterBar({
  filters,
  onChange,
}: {
  filters: FilterState;
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

function BookCard({
  book,
  onNoteClick,
  onReadStatusToggle,
}: {
  book: BookItem;
  onNoteClick: (book: BookItem) => void;
  onReadStatusToggle: (book: BookItem) => void;
}) {
  return (
    <article className={clsx('card card-vertical', book.isRead && 'card-read')}>
      <div className="cover-frame">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="cover" />
        ) : (
          <div className="cover placeholder">
            <span className="placeholder-text">No Cover</span>
          </div>
        )}
        {book.isRead && (
          <div className="read-overlay">
            <span>완독</span>
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
      <div className="card-actions">
        <div className="note-cta">
          <div>
            <span className="note-count">노트 {book.noteCount}개</span>
            {shouldShowPlannedLabel(book.noteCount) && (
              <span className="note-state">(작성 예정)</span>
            )}
          </div>
          <button
            className="note-button"
            type="button"
            onClick={() => onNoteClick(book)}
          >
            {book.noteCount > 0 ? '노트 보기' : '노트 남기기'}
          </button>
        </div>
        <button
          type="button"
          className={clsx('read-button', book.isRead ? 'is-read' : '')}
          onClick={() => onReadStatusToggle(book)}
        >
          {book.isRead ? '완독 취소' : '완독 표시'}
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

// Confirm Dialog Component
interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="confirm-backdrop"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-message"
      tabIndex={-1}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Inner dialog container needs to stop event propagation */}
      <div
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <p id="confirm-message" className="confirm-message">
          {message}
        </p>
        <div className="confirm-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="btn-primary btn-danger"
            onClick={onConfirm}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// Note Modal Component
interface NoteModalProps {
  book: BookItem;
  onClose: () => void;
  onNotesChanged: () => void;
}

function NoteModal({ book, onClose, onNotesChanged }: NoteModalProps) {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [formData, setFormData] = useState({ pageNumber: '', content: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Fetch notes using react-query
  const {
    data: notesData,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ['notes', book.dbId],
    queryFn: () => getNotes(book.dbId),
  });

  const notes = notesData?.notes || [];

  // Create note mutation
  const createMutation = useMutation({
    mutationFn: (data: { page_number: number; content: string }) =>
      createNote(book.dbId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', book.dbId] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
      onNotesChanged();
      setFormData({ pageNumber: '', content: '' });
      setIsFormOpen(false);
    },
  });

  // Update note mutation
  const updateMutation = useMutation({
    mutationFn: ({
      noteId,
      data,
    }: {
      noteId: number;
      data: { page_number: number; content: string };
    }) => updateNote(noteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', book.dbId] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
      onNotesChanged();
      setFormData({ pageNumber: '', content: '' });
      setIsFormOpen(false);
      setEditingNote(null);
    },
  });

  // Delete note mutation
  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => deleteNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', book.dbId] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
      onNotesChanged();
      setDeleteConfirm(null);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const error =
    fetchError ||
    createMutation.error ||
    updateMutation.error ||
    deleteMutation.error;

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.pageNumber || !formData.content.trim()) return;

    const data = {
      page_number: parseInt(formData.pageNumber, 10),
      content: formData.content.trim(),
    };

    if (editingNote) {
      updateMutation.mutate({ noteId: editingNote.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Handle delete confirmation
  const handleDeleteClick = (noteId: number) => {
    setDeleteConfirm(noteId);
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm !== null) {
      deleteMutation.mutate(deleteConfirm);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  // Handle edit
  const handleEdit = (note: NoteItem) => {
    setEditingNote(note);
    setFormData({
      pageNumber: String(note.pageNumber),
      content: note.content,
    });
    setIsFormOpen(true);
  };

  // Cancel form
  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingNote(null);
    setFormData({ pageNumber: '', content: '' });
  };

  // Close modal on backdrop click or Escape key
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const renderEntrySection = () => (
    <div className="note-entry" key="entry">
      {isFormOpen ? (
        <form className="note-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pageNumber">페이지</label>
            <input
              id="pageNumber"
              type="number"
              className="input"
              min={1}
              value={formData.pageNumber}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  pageNumber: e.target.value,
                })
              }
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="content">내용</label>
            <textarea
              id="content"
              className="input textarea"
              rows={4}
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              required
            />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCancel}
            >
              취소
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? '저장 중...' : editingNote ? '수정' : '추가'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn-add-note"
          onClick={() => setIsFormOpen(true)}
        >
          + 노트 추가
        </button>
      )}
    </div>
  );

  const renderNotesSection = () => {
    if (notes.length === 0) {
      return (
        <div className="notes-empty" key="empty">
          <p>아직 작성된 노트가 없습니다.</p>
        </div>
      );
    }

    return (
      <div className="notes-list" key="list">
        {notes.map((note) => (
          <div key={note.id} className="note-item">
            <div className="note-header">
              <span className="note-page">p. {note.pageNumber}</span>
              <div className="note-actions">
                <button
                  type="button"
                  className="note-action-btn"
                  onClick={() => handleEdit(note)}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="note-action-btn note-action-delete"
                  onClick={() => handleDeleteClick(note.id)}
                  disabled={deleteMutation.isPending}
                >
                  삭제
                </button>
              </div>
            </div>
            <blockquote className="note-content">{note.content}</blockquote>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: Modal backdrop with click-to-close is a common UI pattern */}
      <div
        className="modal-backdrop"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">{book.title}</h2>
            <button type="button" className="modal-close" onClick={onClose}>
              &times;
            </button>
          </div>

          <div className="modal-content">
            {error && (
              <div className="modal-error">
                {error instanceof Error
                  ? error.message
                  : '오류가 발생했습니다.'}
              </div>
            )}

            {renderEntrySection()}

            {isLoading ? (
              <p className="muted">노트를 불러오는 중...</p>
            ) : (
              renderNotesSection()
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm !== null && (
        <ConfirmDialog
          message="이 노트를 삭제하시겠습니까?"
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </>
  );
}

function ShelfStats({ books }: { books: BookItem[] }) {
  const totals = useMemo(() => {
    const stats = { overdue: 0, dueSoon: 0, ok: 0 } as const;
    const mutable = { ...stats };
    for (const book of books) {
      if (book.dueStatus === 'due_soon') {
        mutable.dueSoon += 1;
      } else {
        mutable[book.dueStatus] += 1;
      }
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
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);

  const handleNoteClick = (book: BookItem) => {
    setSelectedBook(book);
  };

  const handleCloseModal = () => {
    setSelectedBook(null);
  };

  const handleNotesChanged = () => {
    queryClient.invalidateQueries({ queryKey: ['books'] });
  };

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

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    return filterBooks(data.items, filters);
  }, [data, filters]);

  const readStatusMutation = useMutation({
    mutationFn: ({ bookId, isRead }: { bookId: number; isRead: boolean }) =>
      updateReadStatus(bookId, isRead),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
    onError: () => {
      setNotification({
        type: 'error',
        message: '완독 상태 변경에 실패했습니다.',
      });
    },
  });

  const handleReadStatusToggle = (book: BookItem) => {
    readStatusMutation.mutate({
      bookId: book.dbId,
      isRead: !book.isRead,
    });
  };

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

        <FilterBar filters={filters} onChange={setFilters} />

        {isLoading && <p className="muted">불러오는 중...</p>}
        {isError && <p className="muted">목록을 불러오지 못했습니다.</p>}

        {data && <ShelfStats books={data.items} />}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid">
            {filtered.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onNoteClick={handleNoteClick}
                onReadStatusToggle={handleReadStatusToggle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Note Modal */}
      {selectedBook && (
        <NoteModal
          book={selectedBook}
          onClose={handleCloseModal}
          onNotesChanged={handleNotesChanged}
        />
      )}
    </div>
  );
}
