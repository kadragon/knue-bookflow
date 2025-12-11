import {
  AutoStories as AutoStoriesIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  Alert,
  AppBar,
  Box,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNewBooks, type NewBookItem, type NewBooksResponse } from '../api';

// Trace: spec_id: SPEC-new-books-001, task_id: TASK-new-books

function useNewBooks(days: number, max: number) {
  return useQuery<NewBooksResponse>({
    queryKey: ['newBooks', days, max],
    queryFn: () => getNewBooks(days, max),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Truncate title to max characters
function truncateTitle(title: string, maxLength: number = 20): string {
  if (title.length <= maxLength) {
    return title;
  }
  return title.slice(0, maxLength) + '...';
}

// Format author display: show max 2 authors, rest as '외 N명'
function formatAuthors(authorStr: string): string {
  if (!authorStr) return '저자 미상';
  const authors = authorStr
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  if (authors.length <= 2) {
    return authors.join(', ');
  }
  const displayAuthors = authors.slice(0, 2).join(', ');
  const remaining = authors.length - 2;
  return `${displayAuthors} 외 ${remaining}명`;
}

interface NewBookCardProps {
  book: NewBookItem;
}

function NewBookCard({ book }: NewBookCardProps) {
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
              width: 100,
              height: 140,
              borderRadius: 1,
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box
            sx={{
              width: 100,
              height: 140,
              borderRadius: 1,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AutoStoriesIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          </Box>
        )}
      </Box>
      <CardContent
        sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}
      >
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{
            fontSize: '0.95rem',
            fontWeight: 600,
            lineHeight: 1.3,
            minHeight: '2.6em',
          }}
          title={book.title}
        >
          {truncateTitle(book.title)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {formatAuthors(book.author)}
        </Typography>

        <Stack
          direction="row"
          spacing={0.5}
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 'auto' }}
        >
          {book.materialType && (
            <Chip
              label={book.materialType}
              size="small"
              variant="outlined"
              color="primary"
            />
          )}
          {book.year && (
            <Chip label={book.year} size="small" variant="outlined" />
          )}
        </Stack>

        {book.publisher && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, display: 'block' }}
          >
            {book.publisher}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
      <AutoStoriesIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
      <Typography>해당 기간에 신착 도서가 없습니다.</Typography>
    </Box>
  );
}

export default function NewBooksPage() {
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useNewBooks(days, 100);

  const filteredBooks = useMemo(() => {
    if (!data?.items) return [];
    if (!search.trim()) return data.items;

    const searchLower = search.toLowerCase();
    return data.items.filter(
      (book) =>
        book.title.toLowerCase().includes(searchLower) ||
        book.author.toLowerCase().includes(searchLower) ||
        (book.publisher &&
          book.publisher.toLowerCase().includes(searchLower)) ||
        (book.isbn && book.isbn.toLowerCase().includes(searchLower)),
    );
  }, [data, search]);

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
                component={Link}
                to="/"
                variant="overline"
                color="secondary"
                sx={{
                  letterSpacing: 2,
                  fontWeight: 600,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                KNUE BookFlow
              </Typography>
              <Typography
                variant="h4"
                component="h1"
                fontWeight="bold"
                sx={{ mt: -1 }}
              >
                New Books
              </Typography>
            </Box>
            <IconButton
              onClick={() => refetch()}
              disabled={isLoading}
              color="inherit"
            >
              <RefreshIcon />
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="lg" sx={{ pb: 8 }}>
        {/* Filters */}
        <Box
          sx={{
            mb: 3,
            mt: 3,
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <TextField
            label="검색"
            placeholder="제목, 저자, 출판사, ISBN"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ flexGrow: 1, minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>기간</InputLabel>
            <Select
              value={days}
              label="기간"
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <MenuItem value={30}>최근 30일</MenuItem>
              <MenuItem value={60}>최근 60일</MenuItem>
              <MenuItem value={90}>최근 90일</MenuItem>
              <MenuItem value={180}>최근 180일</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Meta info */}
        {data?.meta && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {data.meta.fromDate} ~ {data.meta.toDate} ({filteredBooks.length}권)
          </Typography>
        )}

        {/* Loading state */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error state */}
        {isError && (
          <Alert severity="error" sx={{ mb: 4 }}>
            신착 도서 목록을 불러오지 못했습니다.
          </Alert>
        )}

        {/* Empty state */}
        {!isLoading && filteredBooks.length === 0 && <EmptyState />}

        {/* Book grid */}
        {!isLoading && filteredBooks.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr 1fr',
                sm: '1fr 1fr 1fr',
                md: '1fr 1fr 1fr 1fr',
                lg: '1fr 1fr 1fr 1fr 1fr',
              },
              gap: 2,
            }}
          >
            {filteredBooks.map((book) => (
              <NewBookCard key={book.id} book={book} />
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}
