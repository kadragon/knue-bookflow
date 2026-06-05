import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ApiError,
  type CreateBookRequestPayload,
  createBookRequest,
} from '../api';
import type { FeedbackState } from '../components/FeedbackSnackbar';

interface UseBookRequestMutationOptions {
  successMessage?: string;
}

export function useBookRequestMutation(
  options: UseBookRequestMutationOptions = {},
) {
  const { successMessage = '신청 목록에 추가했어요.' } = options;
  const queryClient = useQueryClient();

  const [feedback, setFeedback] = useState<FeedbackState>({
    open: false,
    message: '',
    severity: 'success',
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateBookRequestPayload) =>
      createBookRequest(payload),
    onSuccess: () => {
      // Refresh the 신청 목록 so a request added from the search page is
      // visible when the user later opens the requests page.
      queryClient.invalidateQueries({ queryKey: ['book-requests'] });
      setFeedback({ open: true, message: successMessage, severity: 'success' });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError && error.code === 'DUPLICATE_BOOK_REQUEST'
          ? '이미 신청한 도서입니다.'
          : error instanceof Error
            ? error.message
            : '신청에 실패했습니다.';
      setFeedback({ open: true, message, severity: 'error' });
    },
  });

  const closeFeedback = () => setFeedback((prev) => ({ ...prev, open: false }));

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    feedback,
    closeFeedback,
  };
}
