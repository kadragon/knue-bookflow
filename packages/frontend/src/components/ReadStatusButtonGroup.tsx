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
    <ButtonGroup fullWidth size={size}>
      <Button
        variant={isFinished ? 'contained' : 'outlined'}
        onClick={() => onReadStatusChange(isFinished ? 'unread' : 'finished')}
        startIcon={
          isFinished ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />
        }
        color={isFinished ? 'success' : 'inherit'}
        disabled={disabled}
      >
        {isFinished ? '완독' : '완독 표시'}
      </Button>
      <Button
        variant={isAbandoned ? 'contained' : 'outlined'}
        onClick={() => onReadStatusChange(isAbandoned ? 'unread' : 'abandoned')}
        startIcon={<CloseIcon />}
        color={isAbandoned ? 'warning' : 'inherit'}
        disabled={disabled}
      >
        {isAbandoned ? '중단됨' : '중단(포기) 표시'}
      </Button>
    </ButtonGroup>
  );
}
