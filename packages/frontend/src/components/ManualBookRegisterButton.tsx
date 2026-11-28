import { LibraryAdd as LibraryAddIcon } from '@mui/icons-material';
import { Button, IconButton } from '@mui/material';

export function ManualBookRegisterButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      <IconButton
        onClick={onClick}
        color="primary"
        aria-label="직접 등록"
        sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
      >
        <LibraryAddIcon />
      </IconButton>
      <Button
        variant="outlined"
        startIcon={<LibraryAddIcon />}
        onClick={onClick}
        color="primary"
        sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
      >
        직접 등록
      </Button>
    </>
  );
}
