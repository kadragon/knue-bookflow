import {
  Close as CloseIcon,
  LibraryAdd as LibraryAddIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ApiError,
  type BookItem,
  createManualBook,
  type ExternalSearchResultItem,
  searchExternalBooks,
} from '../api';
import { buildManualBookFromAladinItem } from '../bookRequestPayload';
import { AladinBookCard } from './AladinBookCard';

interface ManualBookRegisterDialogProps {
  open: boolean;
  onClose: () => void;
  onRegistered: (book: BookItem) => void;
}

function registerErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'DUPLICATE_MANUAL_BOOK') {
    return '이미 책장에 등록한 도서입니다.';
  }
  return error instanceof Error ? error.message : '등록에 실패했습니다.';
}

/**
 * Register a book that did not come from the library account: search Aladin
 * by keyword, pick a result, and add it to the bookshelf.
 */
export function ManualBookRegisterDialog({
  open,
  onClose,
  onRegistered,
}: ManualBookRegisterDialogProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [pendingIsbn, setPendingIsbn] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['externalSearch', query],
    queryFn: () => searchExternalBooks(query, 10, 0),
    enabled: open && query.length > 0,
  });

  const registerMutation = useMutation({
    mutationFn: createManualBook,
    onSuccess: ({ item }) => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      onRegistered(item);
    },
    onError: (error) => setRegisterError(registerErrorMessage(error)),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) {
      setRegisterError(null);
      setQuery(trimmed);
    }
  };

  const handleRegister = (item: ExternalSearchResultItem) => {
    setRegisterError(null);
    setPendingIsbn(item.isbn13);
    registerMutation.mutate(buildManualBookFromAladinItem(item));
  };

  const handleClose = () => {
    setRegisterError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        책 직접 등록
        <IconButton
          onClick={handleClose}
          size="small"
          aria-label="직접 등록 창 닫기"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          도서관에서 빌리지 않은 책을 알라딘에서 찾아 책장에 추가합니다. 다
          읽거나 그만 읽으면 대출 중 목록에서 빠집니다.
        </Typography>

        <Box component="form" onSubmit={handleSearch} sx={{ mb: 2 }}>
          <TextField
            fullWidth
            autoFocus
            label="알라딘 검색"
            placeholder="제목, 저자, ISBN"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            slotProps={{
              input: {
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
                      disabled={!input.trim()}
                    >
                      검색
                    </Button>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        {registerError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {registerError}
          </Alert>
        )}

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error">
            알라딘 검색에 실패했어요. 잠시 후 다시 시도해 주세요.
          </Alert>
        )}

        {data && data.items.length === 0 && (
          <Typography
            color="text.secondary"
            sx={{ textAlign: 'center', py: 4 }}
          >
            알라딘에서 결과를 찾지 못했어요.
          </Typography>
        )}

        {data && data.items.length > 0 && (
          <Stack spacing={2}>
            {data.items.map((item) => (
              <AladinBookCard
                key={item.isbn13}
                item={item}
                actionLabel="등록"
                actionIcon={<LibraryAddIcon />}
                onAction={handleRegister}
                isSaving={
                  registerMutation.isPending && pendingIsbn === item.isbn13
                }
              />
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
