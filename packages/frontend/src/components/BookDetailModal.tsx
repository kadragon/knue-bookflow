import { Close as CloseIcon } from '@mui/icons-material';
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getBookByIsbn } from '../api';

interface BookDetailModalProps {
  isbn: string | null;
  onClose: () => void;
}

export function BookDetailModal({ isbn, onClose }: BookDetailModalProps) {
  const open = isbn !== null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['book-detail', isbn],
    queryFn: () => getBookByIsbn(isbn!),
    enabled: open && !!isbn,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  const book = data?.book;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '80vh',
        },
      }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {isLoading ? '책 정보 불러오는 중...' : book?.title || '책 정보'}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 200,
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="error">책 정보를 불러올 수 없습니다.</Typography>
          </Box>
        )}

        {book && (
          <Box>
            {/* Book cover and basic info */}
            <Box sx={{ display: 'flex', gap: 3, mb: 3 }}>
              {book.coverUrl && (
                <Box
                  component="img"
                  src={book.coverUrl}
                  alt={book.title}
                  sx={{
                    width: 150,
                    height: 'auto',
                    borderRadius: 1,
                    boxShadow: 2,
                  }}
                />
              )}
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" gutterBottom>
                  {book.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  저자: {book.author}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  출판사: {book.publisher}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  출간일: {book.pubDate}
                </Typography>
                {book.isbn13 && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    ISBN: {book.isbn13}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Description */}
            {book.description && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  책 소개
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    whiteSpace: 'pre-line',
                    lineHeight: 1.8,
                  }}
                >
                  {book.description}
                </Typography>
              </>
            )}

            {/* Table of Contents */}
            {book.tableOfContents && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  목차
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    whiteSpace: 'pre-line',
                    lineHeight: 1.8,
                  }}
                >
                  {book.tableOfContents}
                </Typography>
              </>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
