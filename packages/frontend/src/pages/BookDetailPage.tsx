/**
 * Book Detail Page
 * Shows book information and reading notes in a two-column layout
 *
 * Trace: spec_id: SPEC-book-detail-001, task_id: TASK-030,TASK-031
 */

import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  type BookItem,
  createNote,
  deleteNote,
  getBook,
  type NoteItem,
  type ReadStatus,
  updateNote,
  updateReadStatus,
} from '../api';
import { Header } from '../components/Header';
import { ReadStatusButtonGroup } from '../components/ReadStatusButtonGroup';
import { PAGE_CONTAINER_PADDING_BOTTOM } from '../constants';
import {
  formatDdayLabel,
  getLoanStatusChip,
  shouldShowDdayChip,
} from '../loanStatusPresentation';
import { NOTES_LIST_SX } from './bookDetailLayout';

function formatDate(dateStr: string): string {
  return dateStr.split(' ')[0];
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

// Book Info Panel (Left Side)
function BookInfoPanel({
  book,
  onReadStatusChange,
  isUpdating,
}: {
  book: BookItem;
  onReadStatusChange: (readStatus: ReadStatus) => void;
  isUpdating: boolean;
}) {
  const statusChip = getLoanStatusChip(book.loanState, book.dueStatus);

  return (
    <Paper variant="outlined" sx={{ p: 3, height: '100%' }}>
      <Stack spacing={3}>
        {/* Cover Image */}
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          {book.coverUrl ? (
            <Box
              component="img"
              src={book.coverUrl}
              alt={book.title}
              sx={{
                width: '100%',
                maxWidth: 200,
                borderRadius: 1,
                boxShadow: 2,
              }}
            />
          ) : (
            <Box
              sx={{
                width: 200,
                height: 280,
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

        {/* Title and Author */}
        <Box>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            {book.title}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {book.author}
          </Typography>
        </Box>

        <Divider />

        {/* Book Details */}
        <Stack spacing={2}>
          {book.publisher && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                출판사
              </Typography>
              <Typography variant="body2">{book.publisher}</Typography>
            </Box>
          )}

          {book.pubDate && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                출판일
              </Typography>
              <Typography variant="body2">{book.pubDate}</Typography>
            </Box>
          )}

          <Box>
            <Typography variant="caption" color="text.secondary">
              대출 상태
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Chip
                label={statusChip.label}
                color={statusChip.color}
                size="small"
              />
              {book.renewCount > 0 && (
                <Chip
                  label={`연장 ${book.renewCount}회`}
                  color="primary"
                  size="small"
                  variant="outlined"
                />
              )}
              {shouldShowDdayChip(book.loanState) && (
                <Chip
                  label={formatDdayLabel(book.daysLeft)}
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">
              대출일
            </Typography>
            <Typography variant="body2">
              {formatDate(book.chargeDate)}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">
              반납 예정일
            </Typography>
            <Typography variant="body2">{formatDate(book.dueDate)}</Typography>
          </Box>
        </Stack>

        <Divider />

        {/* Description */}
        {book.description && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              책 소개
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mt: 0.5,
                maxHeight: 200,
                overflow: 'auto',
                lineHeight: 1.6,
              }}
            >
              {book.description}
            </Typography>
          </Box>
        )}

        {/* Completion Toggle */}
        <ReadStatusButtonGroup
          readStatus={book.readStatus}
          onReadStatusChange={onReadStatusChange}
          size="large"
          disabled={isUpdating}
        />
      </Stack>
    </Paper>
  );
}

// Notes Panel (Right Side)
function NotesPanel({
  bookId,
  notes,
  onNotesChanged,
}: {
  bookId: number;
  notes: NoteItem[];
  onNotesChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [formData, setFormData] = useState({ pageNumber: '', content: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Shared query invalidation logic
  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['book', bookId] });
    queryClient.invalidateQueries({ queryKey: ['books'] });
    onNotesChanged();
  };

  // Create note mutation
  const createMutation = useMutation({
    mutationFn: (data: { page_number: number; content: string }) =>
      createNote(bookId, data),
    onSuccess: () => {
      invalidateQueries();
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
      invalidateQueries();
      setFormData({ pageNumber: '', content: '' });
      setIsFormOpen(false);
      setEditingNote(null);
    },
  });

  // Delete note mutation
  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => deleteNote(noteId),
    onSuccess: () => {
      invalidateQueries();
      setDeleteConfirmId(null);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const error =
    createMutation.error || updateMutation.error || deleteMutation.error;

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

  const handleEdit = (note: NoteItem) => {
    setEditingNote(note);
    setFormData({
      pageNumber: String(note.pageNumber),
      content: note.content,
    });
    setIsFormOpen(true);
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingNote(null);
    setFormData({ pageNumber: '', content: '' });
  };

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

  return (
    <Paper variant="outlined" sx={{ p: 3, height: '100%' }}>
      <Stack spacing={3}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="h6" fontWeight="bold">
            독서 노트 ({notes.length})
          </Typography>
        </Box>

        {error && (
          <Alert severity="error">
            {error instanceof Error ? error.message : '오류가 발생했습니다.'}
          </Alert>
        )}

        {/* Add Note Form */}
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
                    setFormData({ ...formData, pageNumber: e.target.value })
                  }
                  required
                  size="small"
                  slotProps={{ htmlInput: { min: 1 } }}
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
                <Box
                  sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}
                >
                  <Button onClick={handleCancel} color="inherit">
                    취소
                  </Button>
                  <Button type="submit" variant="contained" disabled={isSaving}>
                    {isSaving ? '저장 중…' : editingNote ? '수정' : '추가'}
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

        {/* Notes List */}
        {notes.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <Typography>아직 작성된 노트가 없습니다.</Typography>
          </Box>
        ) : (
          <Stack spacing={2} sx={NOTES_LIST_SX}>
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
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(note)}
                      aria-label="노트 수정"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(note.id)}
                      color="error"
                      disabled={deleteMutation.isPending}
                      aria-label="노트 삭제"
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
        )}
      </Stack>

      <ConfirmDialog
        open={deleteConfirmId !== null}
        message="이 노트를 삭제하시겠습니까?"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </Paper>
  );
}

// Main Page Component
export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bookId = parseInt(id || '0', 10);

  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => getBook(bookId),
    enabled: bookId > 0,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const readStatusMutation = useMutation({
    mutationFn: (readStatus: ReadStatus) =>
      updateReadStatus(bookId, readStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
    onError: () => {
      setNotification({
        type: 'error',
        message: '독서 상태 변경에 실패했습니다.',
      });
    },
  });

  const handleReadStatusChange = (readStatus: ReadStatus) => {
    readStatusMutation.mutate(readStatus);
  };

  const handleNotesChanged = () => {
    // Notes are automatically refreshed via query invalidation
  };

  // Clear notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  if (!bookId) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">잘못된 책 ID입니다.</Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Header
        title="Book Detail"
        leading={
          <IconButton
            onClick={() => navigate('/')}
            color="inherit"
            aria-label="내 책장으로 돌아가기"
          >
            <ArrowBackIcon />
          </IconButton>
        }
      />

      <Container maxWidth="lg" sx={{ pb: PAGE_CONTAINER_PADDING_BOTTOM }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 4 }}>
            책 정보를 불러오지 못했습니다.
          </Alert>
        )}

        {data && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' },
              gap: 3,
              mt: 3,
            }}
          >
            <BookInfoPanel
              book={data.book}
              onReadStatusChange={handleReadStatusChange}
              isUpdating={readStatusMutation.isPending}
            />
            <NotesPanel
              bookId={bookId}
              notes={data.notes}
              onNotesChanged={handleNotesChanged}
            />
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
    </Box>
  );
}
