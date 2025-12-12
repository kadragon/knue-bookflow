import { AppBar, Box, Container, Toolbar, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface HeaderProps {
  title: string;
  leading?: ReactNode;
  actions?: ReactNode;
}

export function Header({ title, leading, actions }: HeaderProps) {
  return (
    <AppBar position="static" color="transparent" elevation={0}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: 'space-between', py: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {leading && <Box>{leading}</Box>}
            <Box>
              <Typography
                variant="overline"
                color="secondary"
                sx={{ letterSpacing: 2, fontWeight: 600 }}
              >
                KNUE BookFlow
              </Typography>
              <Typography
                variant="h4"
                component="h1"
                fontWeight="bold"
                sx={{ mt: -1 }}
              >
                {title}
              </Typography>
            </Box>
          </Box>
          {actions && <Box>{actions}</Box>}
        </Toolbar>
      </Container>
    </AppBar>
  );
}
