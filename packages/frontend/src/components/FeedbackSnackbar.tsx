import { Alert, Snackbar } from '@mui/material';

// Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043

export type FeedbackSeverity = 'success' | 'error' | 'info' | 'warning';

export interface FeedbackState {
  open: boolean;
  message: string;
  severity: FeedbackSeverity;
}

interface FeedbackSnackbarProps {
  feedback: FeedbackState;
  onClose: () => void;
  autoHideDuration?: number;
}

export function FeedbackSnackbar({
  feedback,
  onClose,
  autoHideDuration = 4000,
}: FeedbackSnackbarProps) {
  return (
    <Snackbar
      open={feedback.open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={onClose}
        severity={feedback.severity}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {feedback.message}
      </Alert>
    </Snackbar>
  );
}
