import {
  BookmarkAdd as BookmarkAddIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Container,
  InputAdornment,
  Pagination,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SearchBookItem } from '../api';
import { searchBooks } from '../api';
import { BookDetailModal } from '../components/BookDetailModal';
import { FeedbackSnackbar } from '../components/FeedbackSnackbar';
import { Header } from '../components/Header';
import { PAGE_CONTAINER_PADDING_BOTTOM } from '../constants';
import { usePlannedLoanMutation } from '../hooks/usePlannedLoanMutation';
import { buildFromSearch } from '../plannedLoanPayload';

// Trace: spec_id: SPEC-search-001, SPEC-loan-plan-001, task_id: TASK-042, TASK-043

const MAX_RESULTS_PER_PAGE = 20;

function SearchBookCard({
  book,
  onPlan,
  isSaving,
  onImageClick,
}: {
  book: SearchBookItem;
  onPlan: (book: SearchBookItem) => void;
  isSaving: boolean;
  onImageClick: (isbn: string) => void;
}) {
  const branchInfo =
    book.branchVolumes.length > 0
      ? book.branchVolumes
          .filter((bv) => bv.branchName && bv.volumes !== undefined)
          .map((bv) => `${bv.branchName} (${bv.volumes})`)
          .join(', ') || '소장 정보 없음'
      : '소장 정보 없음';

  const callNumbersDisplay = [
    ...new Set(
      book.branchVolumes
        .filter((bv) => bv.callNumber)
        .map((bv) => bv.callNumber as string),
    ),
  ].join(', ');

  /**
   * Format due date for display
   */
  const formatDueDate = (date: string | null): string | null => {
    if (!date) return null;
    // If already in YYYY-MM-DD format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // Otherwise extract date part
    return date.split('T')[0] || date.split(' ')[0] || date;
  };

  const renderAvailability = () => {
    const availability = book.availability;
    if (!availability) {
      return null;
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
    <Card variant="outlined" sx={{ display: 'flex', minHeight: 180 }}>
      <Box
        sx={{
          width: 120,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          p: 2,
          cursor: book.isbn ? 'pointer' : 'default',
        }}
        onClick={() => {
          if (book.isbn) {
            onImageClick(book.isbn);
          }
        }}
      >
        {book.coverUrl ? (
          <CardMedia
            component="img"
            image={book.coverUrl}
            alt={book.title}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: 1,
              transition: 'transform 0.2s',
              '&:hover': book.isbn
                ? {
                    transform: 'scale(1.05)',
                  }
                : {},
            }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              borderRadius: 1,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="caption" color="text.secondary" align="center">
              No Cover
            </Typography>
          </Box>
        )}
      </Box>
      <CardContent
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}
      >
        <Typography
          variant="h6"
          component="h3"
          sx={{ fontSize: '1rem', fontWeight: 600 }}
        >
          {book.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {book.author}
        </Typography>
        {book.publisher && (
          <Typography variant="caption" color="text.secondary">
            {book.publisher}
            {book.year && ` · ${book.year}`}
          </Typography>
        )}
        {book.isbn && (
          <Typography variant="caption" color="text.secondary" display="block">
            ISBN: {book.isbn}
          </Typography>
        )}
        {callNumbersDisplay && (
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 0.5 }}
          >
            청구기호: {callNumbersDisplay}
          </Typography>
        )}
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 0.5 }}
        >
          {book.materialType && (
            <Chip label={book.materialType} size="small" variant="outlined" />
          )}
          <Chip
            label={branchInfo}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Stack>

        <Box sx={{ mt: 0.5 }}>{renderAvailability()}</Box>

        <Button
          variant="outlined"
          startIcon={<BookmarkAddIcon />}
          onClick={() => onPlan(book)}
          disabled={isSaving}
          sx={{ alignSelf: 'flex-start', mt: 1 }}
        >
          대출 예정
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Validates and sanitizes page parameter from URL
 * Returns 1 for invalid values (NaN, zero, negative)
 */
function validatePageParam(pageStr: string | null): number {
  const parsedPage = parseInt(pageStr || '1', 10);
  return !Number.isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;
}

export default function SearchBooksPage() {
  const _navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryParam = searchParams.get('q') || '';
  const pageParam = validatePageParam(searchParams.get('page'));
  const [searchInput, setSearchInput] = useState(queryParam);
  const [selectedIsbn, setSelectedIsbn] = useState<string | null>(null);

  // Sync input when URL changes (e.g. back button)
  useEffect(() => {
    setSearchInput(queryParam);
  }, [queryParam]);

  const offset = (pageParam - 1) * MAX_RESULTS_PER_PAGE;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', queryParam, offset],
    queryFn: () => searchBooks(queryParam, MAX_RESULTS_PER_PAGE, offset),
    enabled: !!queryParam.trim(),
    placeholderData: (previousData, previousQuery) => {
      const previousQueryParam = previousQuery?.queryKey[1];
      // 새 검색어인 경우 placeholderData를 사용하지 않아 isLoading 상태가 되도록 함
      if (queryParam !== previousQueryParam) {
        return undefined;
      }
      // 페이지네이션인 경우 이전 데이터를 유지
      return previousData;
    },
  });

  const {
    mutate: planMutate,
    isPending: isPlanPending,
    feedback,
    closeFeedback,
  } = usePlannedLoanMutation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim(), page: '1' });
    }
  };

  const handlePageChange = (
    _event: React.ChangeEvent<unknown>,
    page: number,
  ) => {
    setSearchParams({ q: queryParam, page: page.toString() });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePlan = (book: SearchBookItem) => {
    planMutate(buildFromSearch(book));
  };

  const totalPages = data?.meta.totalCount
    ? Math.ceil(data.meta.totalCount / MAX_RESULTS_PER_PAGE)
    : 0;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Header title="도서 검색" />

      <Container maxWidth="lg" sx={{ pb: PAGE_CONTAINER_PADDING_BOTTOM }}>
        <Box component="form" onSubmit={handleSearch} sx={{ mb: 4, mt: 3 }}>
          <TextField
            fullWidth
            autoFocus
            label="검색"
            placeholder="제목, 저자, ISBN 등으로 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            variant="outlined"
            size="medium"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Button
                    variant="contained"
                    type="submit"
                    disabled={!searchInput.trim()}
                    sx={{ minWidth: 80 }}
                  >
                    검색
                  </Button>
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {queryParam === '' && (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            <SearchIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              도서관 자료를 검색하세요
            </Typography>
            <Typography variant="body2">
              제목, 저자, ISBN 등으로 검색할 수 있습니다
            </Typography>
          </Box>
        )}

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 4 }}>
            검색 중 오류가 발생했습니다.
          </Alert>
        )}

        {data && (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary">
                &quot;{queryParam}&quot; 검색 결과: 총 {data.meta.totalCount}건
                {data.meta.isFuzzy && ' (일부 검색어 포함)'}
              </Typography>
            </Box>

            {data.items.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                <Typography>검색 결과가 없습니다.</Typography>
              </Box>
            ) : (
              <>
                <Stack spacing={2} sx={{ mb: 4 }}>
                  {data.items.map((book) => (
                    <SearchBookCard
                      key={book.id}
                      book={book}
                      onPlan={handlePlan}
                      isSaving={isPlanPending}
                      onImageClick={setSelectedIsbn}
                    />
                  ))}
                </Stack>

                {totalPages > 1 && (
                  <Box
                    sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}
                  >
                    <Pagination
                      count={totalPages}
                      page={pageParam}
                      onChange={handlePageChange}
                      color="primary"
                      size="large"
                      showFirstButton
                      showLastButton
                    />
                  </Box>
                )}
              </>
            )}
          </>
        )}
      </Container>

      <FeedbackSnackbar feedback={feedback} onClose={closeFeedback} />

      <BookDetailModal
        isbn={selectedIsbn}
        onClose={() => setSelectedIsbn(null)}
      />
    </Box>
  );
}
