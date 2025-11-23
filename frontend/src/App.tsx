import {
  CheckCircle as CheckCircleIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Note as NoteIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  defaultFilters,
  type Filters as FilterState,
  filterBooks,
  type StatFilter,
} from './filterBooks';

// Trace: spec_id: SPEC-frontend-001, SPEC-notes-002, task_id: TASK-019, TASK-023, TASK-029

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

const STATUS_COLOR: Record<DueStatus, 'error' | 'warning' | 'success'> = {
  overdue: 'error',
  due_soon: 'warning',
  ok: 'success',
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

function FilterBar({
  filters,
  onChange,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}) {
  return (
    <Box sx={{ mb: 3, mt: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Box sx={{ flexGrow: 1 }}>
          <TextField
            fullWidth
            label="검색"
            placeholder="제목, 저자, ISBN"
            value={filters.search}
            onChange={(e) =>
              onChange({ ...filters, search: e.currentTarget.value })
            }
            variant="outlined"
            size="small"
          />
        </Box>
        <Box sx={{ minWidth: 200 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="loan-state-label">대출 상태</InputLabel>
            <Select
              labelId="loan-state-label"
              value={filters.loanState}
              label="대출 상태"
              onChange={(e) =>
                onChange({
                  ...filters,
                  loanState: e.target.value as FilterState['loanState'],
                })
              }
            >
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="on_loan">대출 중</MenuItem>
              <MenuItem value="returned">반납됨</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Stack>
    </Box>
  );
}

function BookCard({
  book,
  onNoteClick,
  onReadStatusChange,
}: {
  book: BookItem;
  onNoteClick: (book: BookItem) => void;
  onReadStatusChange: (book: BookItem, isRead: boolean) => void;
}) {
  return (
    <Card
      variant="outlined"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Box
        sx={{
          position: 'relative',
          pt: 2,
          px: 2,
          display: 'flex',
          justifyContent: 'center',
          bgcolor: 'background.paper',
        }}
      >
        {book.coverUrl ? (
          <CardMedia
            component="img"
            image={book.coverUrl}
            alt={book.title}
            sx={{
              width: 110,
              height: 150,
              borderRadius: 1,
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box
            sx={{
              width: 110,
              height: 150,
              borderRadius: 1,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              No Cover
            </Typography>
          </Box>
        )}
      </Box>
      <CardContent
        sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        <Typography
          variant="h6"
          component="h3"
          sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}
        >
          {book.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {book.author}
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 1 }}
        >
          <Chip
            label={DUE_STATUS_LABEL[book.dueStatus]}
            color={STATUS_COLOR[book.dueStatus]}
            size="small"
            variant="filled"
          />
          {book.renewCount > 0 && (
            <Chip
              label={`연장 ${book.renewCount}회`}
              color="primary"
              size="small"
              variant="outlined"
            />
          )}
          <Chip
            label={`D${book.daysLeft >= 0 ? '-' : '+'}${Math.abs(book.daysLeft)}`}
            size="small"
            variant="outlined"
          />
        </Stack>

        <Stack spacing={0.5} sx={{ mt: 'auto' }}>
          <Typography variant="caption" color="text.secondary" display="block">
            대출 {formatDate(book.chargeDate)}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            반납 {formatDate(book.dueDate)}
          </Typography>
        </Stack>

        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 1.5,
            }}
          >
            <Typography variant="subtitle2" fontWeight="bold">
              노트 {book.noteCount}개
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => onNoteClick(book)}
              startIcon={<NoteIcon />}
              color="secondary"
            >
              {book.noteCount > 0 ? '보기' : '작성'}
            </Button>
          </Box>
          <Button
            fullWidth
            variant={book.isRead ? 'contained' : 'outlined'}
            size="small"
            onClick={() => onReadStatusChange(book, !book.isRead)}
            startIcon={
              book.isRead ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />
            }
            color={book.isRead ? 'success' : 'inherit'}
          >
            {book.isRead ? '완독' : '완독 표시'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
      <Typography>
        책장이 비어 있어요. 새로 대출된 책이 여기에 나타납니다.
      </Typography>
    </Box>
  );
}

// Confirm Dialog Component
interface ConfirmDialogProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>확인</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          취소
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" autoFocus>
          삭제
        </Button>
      </DialogActions>
    </Dialog>
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
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [formData, setFormData] = useState({ pageNumber: '', content: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

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
      setDeleteConfirmId(null);
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
    setDeleteConfirmId(noteId);
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirmId !== null) {
      deleteMutation.mutate(deleteConfirmId);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null);
  };

  // Scroll to top when editing a note
  useEffect(() => {
    if (editingNote) {
      dialogContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [editingNote]);

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

  const renderEntrySection = () => (
    <Box sx={{ mb: 3 }}>
      {isFormOpen ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="페이지"
                type="number"
                value={formData.pageNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    pageNumber: e.target.value,
                  })
                }
                required
                size="small"
                inputProps={{ min: 1 }}
              />
              <TextField
                fullWidth
                label="내용"
                multiline
                rows={4}
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                required
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button onClick={handleCancel} color="inherit">
                  취소
                </Button>
                <Button type="submit" variant="contained" disabled={isSaving}>
                  {isSaving ? '저장 중...' : editingNote ? '수정' : '추가'}
                </Button>
              </Box>
            </Stack>
          </form>
        </Paper>
      ) : (
        <Button
          fullWidth
          variant="outlined"
          onClick={() => setIsFormOpen(true)}
          sx={{ borderStyle: 'dashed', py: 2 }}
        >
          + 노트 추가
        </Button>
      )}
    </Box>
  );

  const renderNotesSection = () => {
    if (notes.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
          <Typography>아직 작성된 노트가 없습니다.</Typography>
        </Box>
      );
    }

    return (
      <Stack spacing={2}>
        {notes.map((note) => (
          <Paper key={note.id} variant="outlined" sx={{ p: 2 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 1,
              }}
            >
              <Chip
                label={`p. ${note.pageNumber}`}
                size="small"
                color="primary"
              />
              <Box>
                <IconButton size="small" onClick={() => handleEdit(note)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteClick(note.id)}
                  color="error"
                  disabled={deleteMutation.isPending}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-wrap',
                pl: 1,
                borderLeft: 3,
                borderColor: 'primary.main',
              }}
            >
              {note.content}
            </Typography>
          </Paper>
        ))}
      </Stack>
    );
  };

  return (
    <>
      <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {book.title}
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers ref={dialogContentRef}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error instanceof Error ? error.message : '오류가 발생했습니다.'}
            </Alert>
          )}

          {renderEntrySection()}

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            renderNotesSection()
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmId !== null}
        message="이 노트를 삭제하시겠습니까?"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </>
  );
}

function ShelfStats({
  books,
  activeStat,
  onSelect,
}: {
  books: BookItem[];
  activeStat: StatFilter;
  onSelect: (stat: StatFilter) => void;
}) {
  const stats = useMemo(() => {
    let onLoan = 0;
    let incomplete = 0;
    let completed = 0;

    for (const book of books) {
      if (book.loanState === 'on_loan') {
        onLoan += 1;
      }
      if (!book.isRead) {
        incomplete += 1;
      } else {
        completed += 1;
      }
    }

    return { onLoan, incomplete, completed, total: books.length };
  }, [books]);

  const cards = useMemo(
    () => [
      {
        key: 'on_loan' as StatFilter,
        label: '대여중',
        value: stats.onLoan,
        color: 'primary.main',
      },
      {
        key: 'incomplete' as StatFilter,
        label: '미완료',
        value: stats.incomplete,
        color: 'warning.main',
      },
      {
        key: 'completed' as StatFilter,
        label: '완료',
        value: stats.completed,
        color: 'success.main',
      },
      { key: 'none' as StatFilter, label: '총', value: stats.total },
    ],
    [stats],
  );

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    stat: StatFilter,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(stat);
    }
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' },
        gap: 2,
        mb: 4,
      }}
    >
      {cards.map((card) => {
        const isActive = activeStat === card.key;
        return (
          <Paper
            key={card.key}
            variant="outlined"
            tabIndex={0}
            sx={{
              p: 2,
              textAlign: 'center',
              borderColor: isActive ? 'primary.main' : 'divider',
              boxShadow: isActive ? 2 : 0,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: 'primary.light',
                backgroundColor: 'action.hover',
              },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 2,
              },
            }}
            onClick={() => onSelect(card.key)}
            onKeyDown={(e) => handleKeyDown(e, card.key)}
            role="button"
            aria-pressed={isActive}
          >
            <Typography variant="caption" color="text.secondary">
              {card.label}
            </Typography>
            <Typography
              variant="h5"
              fontWeight="bold"
              color={card.color ?? 'text.primary'}
            >
              {card.value}
            </Typography>
          </Paper>
        );
      })}
    </Box>
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

  const handleStatSelect = (stat: StatFilter) => {
    setFilters((prev) => {
      if (stat === 'none') {
        // The '총' (Total) card resets both stat and loanState filters.
        return { ...prev, stat: 'none', loanState: 'all' };
      }

      // Toggle the stat filter. If it's the same, turn it off.
      const nextStat = prev.stat === stat ? 'none' : stat;

      return { ...prev, stat: nextStat };
    });
  };

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

  const handleReadStatusChange = (book: BookItem, isRead: boolean) => {
    readStatusMutation.mutate({ bookId: book.dbId, isRead });
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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Container maxWidth="lg">
          <Toolbar
            disableGutters
            sx={{ justifyContent: 'space-between', py: 2 }}
          >
            <Box>
              <Typography
                variant="overline"
                color="secondary"
                sx={{ letterSpacing: 2, fontWeight: 600 }}
              >
                KNUE BookFlow
              </Typography>
              <Typography
                variant="h4"
                component="h1"
                fontWeight="bold"
                sx={{ mt: -1 }}
              >
                Bookshelf
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<SyncIcon />}
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                color="inherit"
              >
                동기화
              </Button>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending}
                color="primary"
              >
                갱신 실행
              </Button>
              <IconButton
                onClick={() => refetch()}
                disabled={isLoading}
                color="inherit"
              >
                <RefreshIcon />
              </IconButton>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="lg" sx={{ pb: 8 }}>
        <FilterBar filters={filters} onChange={setFilters} />

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 4 }}>
            목록을 불러오지 못했습니다.
          </Alert>
        )}

        {data && (
          <ShelfStats
            books={data.items}
            activeStat={filters.stat}
            onSelect={handleStatSelect}
          />
        )}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: '1fr 1fr',
                md: '1fr 1fr 1fr',
                lg: '1fr 1fr 1fr 1fr',
              },
              gap: 3,
            }}
          >
            {filtered.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onNoteClick={handleNoteClick}
                onReadStatusChange={handleReadStatusChange}
              />
            ))}
          </Box>
        )}
      </Container>

      <Snackbar
        open={!!notification}
        autoHideDuration={5000}
        onClose={() => setNotification(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setNotification(null)}
          severity={notification?.type}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {notification?.message}
        </Alert>
      </Snackbar>

      {selectedBook && (
        <NoteModal
          book={selectedBook}
          onClose={handleCloseModal}
          onNotesChanged={handleNotesChanged}
        />
      )}
    </Box>
  );
}
