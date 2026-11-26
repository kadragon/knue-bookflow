import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import type { ExternalSearchResultItem } from '../api';

/**
 * One Aladin keyword-search result with a single action button: 신청 on the
 * search page fallback, 등록 in the manual registration dialog.
 */
export function AladinBookCard({
  item,
  actionLabel,
  actionIcon,
  onAction,
  isSaving,
}: {
  item: ExternalSearchResultItem;
  actionLabel: string;
  actionIcon: ReactNode;
  onAction: (item: ExternalSearchResultItem) => void;
  isSaving: boolean;
}) {
  return (
    <Card variant="outlined" sx={{ display: 'flex', minHeight: 160 }}>
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
        {item.coverUrl ? (
          <CardMedia
            component="img"
            image={item.coverUrl}
            alt={item.title}
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
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}
      >
        <Typography
          variant="h6"
          component="h3"
          sx={{ fontSize: '1rem', fontWeight: 600 }}
        >
          {item.title}
        </Typography>
        {item.author && (
          <Typography variant="body2" color="text.secondary">
            {item.author}
          </Typography>
        )}
        {item.publisher && (
          <Typography variant="caption" color="text.secondary">
            {item.publisher}
            {item.pubDate && ` · ${item.pubDate}`}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          ISBN: {item.isbn13}
        </Typography>
        <Button
          variant="contained"
          color="secondary"
          startIcon={actionIcon}
          onClick={() => onAction(item)}
          disabled={isSaving}
          sx={{ alignSelf: 'flex-start', mt: 1 }}
        >
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
