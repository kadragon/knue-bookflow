import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReadStatus } from '../api';
import theme from '../theme';
import { ReadStatusButtonGroup } from './ReadStatusButtonGroup';

function renderGroup(readStatus: ReadStatus, onReadStatusChange = vi.fn()) {
  const renderResult = render(
    <ThemeProvider theme={theme}>
      <ReadStatusButtonGroup
        readStatus={readStatus}
        onReadStatusChange={onReadStatusChange}
        size="small"
      />
    </ThemeProvider>,
  );

  return { onReadStatusChange, ...renderResult };
}

describe('ReadStatusButtonGroup', () => {
  it('always renders fixed labels for each status button', () => {
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <ReadStatusButtonGroup
          readStatus="unread"
          onReadStatusChange={() => {}}
          size="small"
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button', { name: '완독' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '중단' })).toBeTruthy();

    rerender(
      <ThemeProvider theme={theme}>
        <ReadStatusButtonGroup
          readStatus="finished"
          onReadStatusChange={() => {}}
          size="small"
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button', { name: '완독' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '중단' })).toBeTruthy();

    rerender(
      <ThemeProvider theme={theme}>
        <ReadStatusButtonGroup
          readStatus="abandoned"
          onReadStatusChange={() => {}}
          size="small"
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole('button', { name: '완독' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '중단' })).toBeTruthy();
  });

  it('exposes selected state through aria-pressed', () => {
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <ReadStatusButtonGroup
          readStatus="unread"
          onReadStatusChange={() => {}}
          size="small"
        />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('button', { name: '완독' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: '중단' }).getAttribute('aria-pressed'),
    ).toBe('false');

    rerender(
      <ThemeProvider theme={theme}>
        <ReadStatusButtonGroup
          readStatus="finished"
          onReadStatusChange={() => {}}
          size="small"
        />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('button', { name: '완독' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: '중단' }).getAttribute('aria-pressed'),
    ).toBe('false');

    rerender(
      <ThemeProvider theme={theme}>
        <ReadStatusButtonGroup
          readStatus="abandoned"
          onReadStatusChange={() => {}}
          size="small"
        />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('button', { name: '완독' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: '중단' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('toggles finished status with existing behavior', () => {
    const onReadStatusChange = vi.fn();
    const { rerender } = renderGroup('unread', onReadStatusChange);
    fireEvent.click(screen.getByRole('button', { name: '완독' }));
    expect(onReadStatusChange).toHaveBeenLastCalledWith('finished');

    rerender(
      <ThemeProvider theme={theme}>
        <ReadStatusButtonGroup
          readStatus="finished"
          onReadStatusChange={onReadStatusChange}
          size="small"
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '완독' }));
    expect(onReadStatusChange).toHaveBeenLastCalledWith('unread');
  });

  it('toggles abandoned status with existing behavior', () => {
    const onReadStatusChange = vi.fn();
    const { rerender } = renderGroup('unread', onReadStatusChange);
    fireEvent.click(screen.getByRole('button', { name: '중단' }));
    expect(onReadStatusChange).toHaveBeenLastCalledWith('abandoned');

    rerender(
      <ThemeProvider theme={theme}>
        <ReadStatusButtonGroup
          readStatus="abandoned"
          onReadStatusChange={onReadStatusChange}
          size="small"
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '중단' }));
    expect(onReadStatusChange).toHaveBeenLastCalledWith('unread');
  });
});
