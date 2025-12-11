import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#fafbfc',
      paper: '#ffffff',
    },
    primary: {
      main: '#7EB8DA', // Pastel Blue
      light: '#A8D4F0',
      dark: '#5A9BC4',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#A8D5BA', // Pastel Mint
      light: '#C4E8D1',
      dark: '#8BC4A0',
      contrastText: '#2D5A3F',
    },
    success: {
      main: '#A8D5BA', // Pastel Green
      light: '#C4E8D1',
      dark: '#8BC4A0',
      contrastText: '#2D5A3F',
    },
    warning: {
      main: '#F5D89A', // Pastel Yellow
      light: '#FBE9B8',
      dark: '#E5C77A',
      contrastText: '#5C4A1F',
    },
    error: {
      main: '#F4A7B9', // Pastel Pink
      light: '#FACDD8',
      dark: '#E8899F',
      contrastText: '#5C1F2E',
    },
    text: {
      primary: '#2C3E50',
      secondary: '#6B7C8A',
    },
  },
  typography: {
    fontFamily:
      '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#ffffff',
          border: '1px solid rgba(0, 0, 0, 0.12)',
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#ffffff',
          boxShadow: 'none',
          borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

export default theme;
