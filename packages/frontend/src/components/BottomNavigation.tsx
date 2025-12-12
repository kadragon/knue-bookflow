import {
  AutoStories as AutoStoriesIcon,
  BookmarkAdd as BookmarkAddIcon,
  MenuBook as MenuBookIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  BottomNavigationAction,
  BottomNavigation as MuiBottomNavigation,
  Paper,
} from '@mui/material';
import type { SyntheticEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const navigationItems = [
  { label: '내 책장', value: '/', icon: <MenuBookIcon /> },
  { label: '검색', value: '/search', icon: <SearchIcon /> },
  { label: '신작', value: '/new-books', icon: <AutoStoriesIcon /> },
  { label: '대출 예정', value: '/planned', icon: <BookmarkAddIcon /> },
];

export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleChange = (_event: SyntheticEvent, newValue: string) => {
    navigate(newValue);
  };

  return (
    <Paper
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000 }}
      elevation={3}
    >
      <MuiBottomNavigation value={location.pathname} onChange={handleChange}>
        {navigationItems.map((item) => (
          <BottomNavigationAction
            key={item.value}
            label={item.label}
            value={item.value}
            icon={item.icon}
          />
        ))}
      </MuiBottomNavigation>
    </Paper>
  );
}
