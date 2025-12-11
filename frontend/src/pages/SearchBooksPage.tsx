import { Search as SearchIcon } from '@mui/icons-material';
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
  InputAdornment,
  Pagination,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SearchBookItem } from '../api';
import { searchBooks } from '../api';

const MAX_RESULTS_PER_PAGE = 20;

function SearchBookCard({ book }: { book: SearchBookItem }) {
  const branchInfo =
    book.branchVolumes.length > 0
      ? book.branchVolumes
          .map((bv) => `${bv.branchName} (${bv.volumes})`)
          .join(', ')
      : '소장 정보 없음';

  return (
    <Card variant="outlined" sx={{ display: 'flex', height: 180 }}>
      <Box
        sx={{
          width: 120,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          p: 2,
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
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}
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
          <Typography variant="caption" color="text.secondary">
            ISBN: {book.isbn}
          </Typography>
        )}
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 'auto' }}
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryParam = searchParams.get('q') || '';
  const pageParam = validatePageParam(searchParams.get('page'));
  const [searchInput, setSearchInput] = useState(queryParam);

  // Sync input when URL changes (e.g. back button)
  useEffect(() => {
    setSearchInput(queryParam);
  }, [queryParam]);

  const offset = (pageParam - 1) * MAX_RESULTS_PER_PAGE;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', queryParam, offset],
    queryFn: () => searchBooks(queryParam, MAX_RESULTS_PER_PAGE, offset),
    enabled: !!queryParam.trim(),
    placeholderData: keepPreviousData,
  });

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

  const totalPages = data?.meta.totalCount
    ? Math.ceil(data.meta.totalCount / MAX_RESULTS_PER_PAGE)
    : 0;

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
                도서 검색
              </Typography>
            </Box>
            <Button
              variant="outlined"
              onClick={() => navigate('/')}
              color="inherit"
            >
              내 책장
            </Button>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="lg" sx={{ pb: 8 }}>
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
                    <SearchBookCard key={book.id} book={book} />
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
    </Box>
  );
}
