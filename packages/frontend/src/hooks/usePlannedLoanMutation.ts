import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, createPlannedLoan, type PlannedLoanPayload } from '../api';
import type { FeedbackState } from '../components/FeedbackSnackbar';

// Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043

interface UsePlannedLoanMutationOptions {
  successMessage?: string;
}

export function usePlannedLoanMutation(
  options: UsePlannedLoanMutationOptions = {},
) {
  const { successMessage = '대출 예정에 추가했어요.' } = options;

  const [feedback, setFeedback] = useState<FeedbackState>({
    open: false,
    message: '',
    severity: 'success',
  });

  const mutation = useMutation({
    mutationFn: (payload: PlannedLoanPayload) => createPlannedLoan(payload),
    onSuccess: () => {
      setFeedback({ open: true, message: successMessage, severity: 'success' });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError && error.code === 'DUPLICATE_PLANNED_LOAN'
          ? '이미 대출 예정에 있습니다.'
          : error instanceof Error
            ? error.message
            : '등록에 실패했습니다.';
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
