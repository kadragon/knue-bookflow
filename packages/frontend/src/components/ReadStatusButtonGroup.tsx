/**
 * ReadStatusButtonGroup Component
 * Reusable button group for managing book read status
 *
 * Trace: spec_id: SPEC-frontend-001, task_id: TASK-read-status-component
 */

import {
  CheckCircle as CheckCircleIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { Button, ButtonGroup } from '@mui/material';
import type { ReadStatus } from '../api';

interface ReadStatusButtonGroupProps {
  readStatus: ReadStatus;
  onReadStatusChange: (newStatus: ReadStatus) => void;
  size: 'small' | 'large';
  disabled?: boolean;
}

export function ReadStatusButtonGroup({
  readStatus,
  onReadStatusChange,
  size,
  disabled,
}: ReadStatusButtonGroupProps) {
  const isFinished = readStatus === 'finished';
  const isAbandoned = readStatus === 'abandoned';

  return (
    <ButtonGroup
      fullWidth
      size={size}
      sx={{
        '& .MuiButton-root': {
          fontWeight: 700,
          transition:
            'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        },
      }}
    >
      <Button
        variant={isFinished ? 'contained' : 'outlined'}
        onClick={() => onReadStatusChange(isFinished ? 'unread' : 'finished')}
        startIcon={
          isFinished ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />
        }
        color={isFinished ? 'success' : 'inherit'}
        disabled={disabled}
        aria-pressed={isFinished}
        sx={
          isFinished
            ? {
                borderColor: 'success.dark',
                boxShadow: (theme) =>
                  `0 0 0 2px ${theme.palette.success.light}`,
              }
            : undefined
        }
      >
        완독
      </Button>
      <Button
        variant={isAbandoned ? 'contained' : 'outlined'}
        onClick={() => onReadStatusChange(isAbandoned ? 'unread' : 'abandoned')}
        startIcon={<CloseIcon />}
        color={isAbandoned ? 'warning' : 'inherit'}
        disabled={disabled}
        aria-pressed={isAbandoned}
        sx={
          isAbandoned
            ? {
                borderColor: 'warning.dark',
                boxShadow: (theme) =>
                  `0 0 0 2px ${theme.palette.warning.light}`,
              }
            : undefined
        }
      >
        중단
      </Button>
    </ButtonGroup>
  );
}
