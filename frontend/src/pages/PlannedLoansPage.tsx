import {
  BookmarkAdd as BookmarkAddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  CircularProgress,
  Container,
  IconButton,
  Stack,
  Toolbar,
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
import { FeedbackSnackbar } from '../components/FeedbackSnackbar';
import { summarizeBranches } from '../plannedLoanPayload';

// Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043

function PlannedLoanCard({
  item,
  onRemove,
}: {
  item: PlannedLoanItem;
  onRemove: (id: number) => void;
}) {
  const branchSummary = summarizeBranches(item.branchVolumes);

  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'row',
        gap: 2,
        alignItems: 'center',
        p: 2,
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 110,
          borderRadius: 1,
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
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
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5 }}
        >
          {branchSummary}
        </Typography>
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({ open: false, message: '', severity: 'success' });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['planned-loans'],
    queryFn: getPlannedLoans,
    staleTime: 1000 * 60 * 5,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePlannedLoan,
    onSuccess: (res, id) => {
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
                대출 예정
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => navigate('/search')}>
                도서 검색
              </Button>
              <Button variant="contained" onClick={() => navigate('/')}>
                내 책장
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="lg" sx={{ pb: 8 }}>
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
          <Stack spacing={2} sx={{ mt: 2 }}>
            {items.map((item) => (
              <PlannedLoanCard
                key={item.id}
                item={item}
                onRemove={handleRemove}
              />
            ))}
          </Stack>
        )}
      </Container>

      <FeedbackSnackbar
        feedback={snackbar}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
