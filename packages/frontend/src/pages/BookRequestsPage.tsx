import {
  Delete as DeleteIcon,
  LibraryAdd as LibraryAddIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  CircularProgress,
  Container,
  IconButton,
  Link,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type BookRequestsResponse,
  type BookRequestViewModel,
  deleteBookRequest,
  getBookRequests,
} from '../api';
import { FeedbackSnackbar } from '../components/FeedbackSnackbar';
import { Header } from '../components/Header';
import { PAGE_CONTAINER_PADDING_BOTTOM } from '../constants';

// TODO: confirm the exact KNUE 희망도서 신청 (acquisition request) URL with the
// maintainer. Until then, link to the library site so the user can submit there.
const KNUE_WISHLIST_URL = 'https://lib.knue.ac.kr';

interface BookRequestCardProps {
  item: BookRequestViewModel;
  onRemove: (id: number) => void;
}

function BookRequestCard({ item, onRemove }: BookRequestCardProps) {
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
          width: 100,
          height: 140,
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
          <LibraryAddIcon sx={{ color: 'text.disabled', fontSize: 32 }} />
        )}
      </Box>

      <CardContent sx={{ flex: 1, p: 0, '&:last-child': { pb: 0 } }}>
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700 }}>
          {item.title}
        </Typography>
        {item.author && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {item.author}
          </Typography>
        )}
        {item.publisher && (
          <Typography variant="caption" color="text.secondary">
            {item.publisher}
            {item.pubDate ? ` · ${item.pubDate}` : ''}
          </Typography>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          ISBN: {item.isbn13}
        </Typography>
        {item.aladinLink && (
          <Link
            href={item.aladinLink}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 0.5,
            }}
          >
            알라딘에서 보기 <OpenInNewIcon sx={{ fontSize: 14 }} />
          </Link>
        )}
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: 'block', mt: 0.5 }}
        >
          추가일: {item.createdAt ? item.createdAt.substring(0, 10) : ''}
        </Typography>
      </CardContent>

      <IconButton aria-label="삭제" onClick={() => onRemove(item.id)}>
        <DeleteIcon />
      </IconButton>
    </Card>
  );
}

export default function BookRequestsPage() {
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({ open: false, message: '', severity: 'success' });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['book-requests'],
    queryFn: getBookRequests,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBookRequest,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['book-requests'] });
      const previous = queryClient.getQueryData<BookRequestsResponse>([
        'book-requests',
      ]);
      queryClient.setQueryData<BookRequestsResponse>(
        ['book-requests'],
        (old) =>
          old
            ? { ...old, items: old.items.filter((item) => item.id !== id) }
            : old,
      );
      return { previous };
    },
    onSuccess: (res) => {
      setSnackbar({
        open: true,
        message: res.success
          ? '신청 목록에서 제거했습니다.'
          : '이미 목록에 없습니다.',
        severity: res.success ? 'success' : 'info',
      });
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['book-requests'], context.previous);
      }
      setSnackbar({
        open: true,
        message: '삭제 중 오류가 발생했습니다.',
        severity: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['book-requests'] });
    },
  });

  const handleRemove = (id: number) => deleteMutation.mutate(id);

  const items = data?.items ?? [];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Header title="신청 목록" />

      <Container maxWidth="lg" sx={{ pb: PAGE_CONTAINER_PADDING_BOTTOM }}>
        <Box sx={{ mt: 3, mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            href={KNUE_WISHLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<OpenInNewIcon />}
          >
            도서관 희망도서 신청 바로가기
          </Button>
        </Box>

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            신청 목록을 불러오지 못했습니다.
          </Alert>
        )}

        {!isLoading && items.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            <LibraryAddIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              신청한 책이 없습니다.
            </Typography>
            <Typography variant="body2">
              검색 결과가 없을 때 표시되는 알라딘 도서에서 신청해보세요.
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
              <BookRequestCard
                key={item.id}
                item={item}
                onRemove={handleRemove}
              />
            ))}
          </Box>
        )}
      </Container>

      <FeedbackSnackbar
        feedback={snackbar}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
