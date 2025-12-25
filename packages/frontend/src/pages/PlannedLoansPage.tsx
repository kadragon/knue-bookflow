import {
  BookmarkAdd as BookmarkAddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deletePlannedLoan,
  getPlannedLoans,
  type PlannedLoanItem,
} from '../api';
import { BookDetailModal } from '../components/BookDetailModal';
import { FeedbackSnackbar } from '../components/FeedbackSnackbar';
import { Header } from '../components/Header';
import { PAGE_CONTAINER_PADDING_BOTTOM } from '../constants';
import { summarizeBranches } from '../plannedLoanPayload';

// Trace: spec_id: SPEC-loan-plan-001, SPEC-loan-plan-002
//        task_id: TASK-043, TASK-061

interface PlannedLoanCardProps {
  item: PlannedLoanItem;
  onRemove: (id: number) => void;
  onImageClick: (isbn: string) => void;
}

function PlannedLoanCard({
  item,
  onRemove,
  onImageClick,
}: PlannedLoanCardProps) {
  const branchSummary = summarizeBranches(item.branchVolumes);

  /**
   * Format due date for display
   * Backend returns YYYY-MM-DD format, so we trust it directly
   * Only parse if it contains time component (defensive fallback)
   */
  const formatDueDate = (date: string | null): string | null => {
    if (!date) return null;
    // If already in YYYY-MM-DD format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // Otherwise extract date part (defensive fallback)
    return date.split('T')[0] || date.split(' ')[0] || date;
  };

  const renderAvailability = () => {
    const availability = item.availability;
    if (!availability) {
      return (
        <Chip
          label="대출 가능 여부 확인 불가"
          size="small"
          variant="outlined"
          sx={{ mt: 0.5 }}
        />
      );
    }

    if (availability.status === 'available') {
      return (
        <Chip
          label={`대출 가능 (${availability.availableItems}/${availability.totalItems}권)`}
          size="small"
          color="success"
          sx={{ mt: 0.5 }}
        />
      );
    }

    const due = formatDueDate(availability.earliestDueDate);
    const label = due ? `대출 중 · 반납예정 ${due}` : '대출 중';

    return <Chip label={label} size="small" color="warning" sx={{ mt: 0.5 }} />;
  };

  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'row',
        gap: 2,
        alignItems: 'center',
        p: 2,
        height: '100%',
      }}
    >
      <Box
        sx={{
          width: 120,
          height: 160,
          borderRadius: 1,
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          cursor: item.isbn ? 'pointer' : 'default',
          transition: 'transform 0.2s',
          '&:hover': item.isbn
            ? {
                transform: 'scale(1.05)',
              }
            : {},
        }}
        onClick={() => {
          if (item.isbn) {
            onImageClick(item.isbn);
          }
        }}
      >
        {item.coverUrl ? (
          <CardMedia
            component="img"
            image={item.coverUrl}
            alt={item.title}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <BookmarkAddIcon sx={{ color: 'text.disabled', fontSize: 32 }} />
        )}
      </Box>

      <CardContent sx={{ flex: 1, p: 0, '&:last-child': { pb: 0 } }}>
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700 }}>
          {item.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {item.author}
        </Typography>
        {item.publisher && (
          <Typography variant="caption" color="text.secondary">
            {item.publisher}
            {item.year ? ` · ${item.year}` : ''}
          </Typography>
        )}
        {item.isbn && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            ISBN: {item.isbn}
          </Typography>
        )}
        {(() => {
          const callNumbersDisplay = item.branchVolumes
            .filter((b) => b.callNumber)
            .map((b) => b.callNumber)
            .join(', ');
          return callNumbersDisplay ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.5 }}
            >
              청구기호: {callNumbersDisplay}
            </Typography>
          ) : null;
        })()}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5 }}
        >
          {branchSummary}
        </Typography>
        <Box sx={{ mt: 0.5 }}>{renderAvailability()}</Box>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: 'block', mt: 0.5 }}
        >
          추가일: {item.createdAt.split('T')[0] || ''}
        </Typography>
      </CardContent>

      <IconButton aria-label="삭제" onClick={() => onRemove(item.id)}>
        <DeleteIcon />
      </IconButton>
    </Card>
  );
}

export default function PlannedLoansPage() {
  const _navigate = useNavigate();
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({ open: false, message: '', severity: 'success' });
  const [selectedIsbn, setSelectedIsbn] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['planned-loans'],
    queryFn: getPlannedLoans,
    staleTime: 1000 * 60 * 5,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePlannedLoan,
    onSuccess: (res, _id) => {
      if (res.success) {
        setSnackbar({
          open: true,
          message: '대출 예정에서 제거했습니다.',
          severity: 'success',
        });
      } else {
        setSnackbar({
          open: true,
          message: '이미 목록에 없습니다.',
          severity: 'info',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['planned-loans'] });
    },
    onError: () => {
      setSnackbar({
        open: true,
        message: '삭제 중 오류가 발생했습니다.',
        severity: 'error',
      });
    },
  });

  const handleRemove = (id: number) => deleteMutation.mutate(id);

  const items = data?.items ?? [];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Header title="대출 예정" />

      <Container maxWidth="lg" sx={{ pb: PAGE_CONTAINER_PADDING_BOTTOM }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            대출 예정 목록을 불러오지 못했습니다.
          </Alert>
        )}

        {!isLoading && items.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            <BookmarkAddIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              대출 예정인 책이 없습니다.
            </Typography>
            <Typography variant="body2">
              신착 도서나 검색 결과에서 + 버튼을 눌러 목록을 채워보세요.
            </Typography>
          </Box>
        )}

        {!isLoading && items.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              gap: 2,
              mt: 2,
            }}
          >
            {items.map((item) => (
              <PlannedLoanCard
                key={item.id}
                item={item}
                onRemove={handleRemove}
                onImageClick={setSelectedIsbn}
              />
            ))}
          </Box>
        )}
      </Container>

      <FeedbackSnackbar
        feedback={snackbar}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />

      <BookDetailModal
        isbn={selectedIsbn}
        onClose={() => setSelectedIsbn(null)}
      />
    </Box>
  );
}
