/**
 * Writing practice sheet page
 * A4 landscape — traced handwriting with adjustable guide lines and opacity
 */

import AutorenewIcon from '@mui/icons-material/Autorenew';
import CreateIcon from '@mui/icons-material/Create';
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { getPracticeNote, updateNote } from '../api';
import { fillPracticeContent } from './practiceFill';

type GuideMode = 'none' | 'lines' | 'grid';

const PRACTICE_FONT = 'Yeon Sung';

const FONT_SIZES = [18, 24, 32, 40] as const;

function guideBackground(mode: GuideMode, lineHeight: number): string {
  const lineColor = 'rgba(80, 110, 200, 0.18)';
  if (mode === 'none') return 'transparent';
  if (mode === 'lines') {
    return `repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent ${lineHeight - 1}px,
      ${lineColor} ${lineHeight - 1}px,
      ${lineColor} ${lineHeight}px
    )`;
  }
  // grid mode is rendered per-cell by <GridSheet>, not via background
  return 'transparent';
}

const GRID_LINE = 'rgba(80, 110, 200, 0.18)';

/** Manuscript-paper grid: one character centered per square cell, responsive columns. */
function GridSheet({
  content,
  cell,
  fontSize,
  opacity,
}: {
  content: string;
  cell: number;
  fontSize: number;
  opacity: number;
}) {
  const lines = content.split('\n');
  const gridBg = (color: string) =>
    `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, ${cell}px)`,
        alignContent: 'start',
        height: '100%',
        backgroundImage: gridBg(GRID_LINE),
        backgroundSize: `${cell}px ${cell}px`,
        backgroundPosition: '0 0',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        '@media print': { backgroundImage: gridBg('#ccc') },
      }}
    >
      {lines.map((line, li) => {
        const chars = Array.from(line);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed positional slots, never reordered
          <Fragment key={li}>
            {/* Empty source line → one full-height blank cell so blank paragraphs keep their row */}
            {chars.length === 0 ? (
              <Box sx={{ width: cell, height: cell }} />
            ) : (
              chars.map((ch, ci) => (
                <Box
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed positional slots, never reordered
                  key={ci}
                  sx={{
                    width: cell,
                    height: cell,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: PRACTICE_FONT,
                    fontSize: `${fontSize}px`,
                    lineHeight: 1,
                    color: `rgba(0,0,0,${opacity})`,
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  {ch === ' ' ? ' ' : ch}
                </Box>
              ))
            )}
            {li < lines.length - 1 && <Box sx={{ gridColumn: '1 / -1' }} />}
          </Fragment>
        );
      })}
    </Box>
  );
}

export default function PracticePage() {
  const [opacity, setOpacity] = useState(0.35);
  const [fontSize, setFontSize] = useState(24);
  const [guide, setGuide] = useState<GuideMode>('lines');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [redrawError, setRedrawError] = useState<string | null>(null);
  const [redrawing, setRedrawing] = useState(false);

  const kstToday = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Seoul',
  });
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['practice', 'today', kstToday],
    queryFn: () => getPracticeNote(false),
    staleTime: Infinity,
    retry: false,
  });

  const handleRedraw = async () => {
    setRedrawError(null);
    setRedrawing(true);
    try {
      const newData = await getPracticeNote(true);
      if (!newData) {
        setRedrawError('다시 뽑기할 노트가 없습니다.');
        return;
      }
      queryClient.setQueryData(['practice', 'today', kstToday], newData);
      setEditing(false);
    } catch (err) {
      setRedrawError(
        err instanceof Error ? err.message : '다시 뽑기에 실패했습니다.',
      );
    } finally {
      setRedrawing(false);
    }
  };

  const handleEditStart = () => {
    if (!data) return;
    setDraft(data.note.content);
    setSaveError(null);
    setRedrawError(null);
    setEditing(true);
  };

  const handleEditSave = async () => {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    let result: Awaited<ReturnType<typeof updateNote>> | undefined;
    try {
      result = await updateNote(data.note.id, { content: draft });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
    if (result) {
      queryClient.setQueryData(['practice', 'today', kstToday], {
        ...data,
        note: result.note,
      });
      queryClient.invalidateQueries({ queryKey: ['notes', data.note.bookId] });
      queryClient.invalidateQueries({ queryKey: ['book', data.note.bookId] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
      setEditing(false);
    }
  };

  const handlePrint = async () => {
    await document.fonts.ready;
    window.print();
  };

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: '#f2ede5',
        pb: 8,
        // Print: no extra padding/height so nothing spills onto a second page
        '@media print': { minHeight: 0, pb: 0, backgroundColor: '#fff' },
      }}
    >
      {/* Controls — hidden in print */}
      <Box
        sx={{
          displayPrint: 'none',
          px: 3,
          py: 1.5,
          backgroundColor: '#faf7f2',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'center',
        }}
      >
        {/* Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mr: 1 }}>
          <CreateIcon
            sx={{ fontSize: 18, color: 'text.secondary', opacity: 0.7 }}
          />
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontWeight: 700,
              fontSize: '1.05rem',
              letterSpacing: '-0.01em',
              color: 'text.primary',
            }}
          >
            글씨 연습장
          </Typography>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ opacity: 0.4 }} />

        {/* Opacity */}
        <Box sx={{ width: 130 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 0.25 }}
          >
            글자 농도
          </Typography>
          <Slider
            value={opacity}
            min={0.1}
            max={0.6}
            step={0.05}
            onChange={(_e, v) => setOpacity(v as number)}
            size="small"
            sx={{ color: 'text.secondary' }}
          />
        </Box>

        <Divider orientation="vertical" flexItem sx={{ opacity: 0.4 }} />

        {/* Font size */}
        <FormControl size="small" sx={{ minWidth: 85 }}>
          <InputLabel>크기</InputLabel>
          <Select
            value={fontSize}
            label="크기"
            onChange={(e) => setFontSize(Number(e.target.value))}
          >
            {FONT_SIZES.map((px) => (
              <MenuItem key={px} value={px}>
                {px}px
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Divider orientation="vertical" flexItem sx={{ opacity: 0.4 }} />

        {/* Guide mode */}
        <ToggleButtonGroup
          value={guide}
          exclusive
          size="small"
          onChange={(_e, v) => v && setGuide(v as GuideMode)}
          sx={{
            '& .MuiToggleButton-root': {
              fontSize: '0.75rem',
              px: 1.5,
              py: 0.5,
              borderColor: 'rgba(0,0,0,0.15)',
            },
          }}
        >
          <ToggleButton value="none">없음</ToggleButton>
          <ToggleButton value="lines">줄선</ToggleButton>
          <ToggleButton value="grid">격자</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button
            startIcon={<EditIcon />}
            variant="outlined"
            size="small"
            onClick={handleEditStart}
            disabled={!data || editing || saving || redrawing}
            sx={{ borderColor: 'rgba(0,0,0,0.2)', color: 'text.secondary' }}
          >
            수정
          </Button>
          <Button
            startIcon={<AutorenewIcon />}
            variant="outlined"
            size="small"
            onClick={handleRedraw}
            disabled={editing || saving || redrawing}
            sx={{ borderColor: 'rgba(0,0,0,0.2)', color: 'text.secondary' }}
          >
            다시 뽑기
          </Button>
          <Button
            startIcon={<PrintIcon />}
            variant="contained"
            size="small"
            onClick={handlePrint}
            disabled={isLoading || !data}
            sx={{
              backgroundColor: '#4a5568',
              '&:hover': { backgroundColor: '#2d3748' },
              boxShadow: 'none',
            }}
          >
            인쇄
          </Button>
        </Box>
      </Box>

      {/* Note editor — hidden in print */}
      {editing && data && (
        <Box
          sx={{
            displayPrint: 'none',
            px: 3,
            py: 2,
            backgroundColor: '#faf7f2',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            multiline
            minRows={4}
            fullWidth
            size="small"
            label="노트 내용 수정"
            autoFocus
            sx={{ backgroundColor: '#fff' }}
          />
          {saveError && (
            <Typography variant="caption" color="error">
              {saveError}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={() => setEditing(false)}
              disabled={saving}
              sx={{ color: 'text.secondary' }}
            >
              취소
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleEditSave}
              disabled={saving || !draft.trim()}
              sx={{
                backgroundColor: '#4a5568',
                '&:hover': { backgroundColor: '#2d3748' },
                boxShadow: 'none',
              }}
            >
              저장
            </Button>
          </Box>
        </Box>
      )}

      {redrawError && !editing && (
        <Box sx={{ displayPrint: 'none', px: 3, py: 1 }}>
          <Typography variant="caption" color="error">
            {redrawError}
          </Typography>
        </Box>
      )}

      {/* Sheet area */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress size={32} sx={{ color: '#8a7a6a' }} />
        </Box>
      )}

      {isError && (
        <Box sx={{ displayPrint: 'none', textAlign: 'center', mt: 10 }}>
          <Typography sx={{ color: 'error.main', mb: 2 }}>
            노트를 불러오지 못했습니다.
          </Typography>
          <Button
            onClick={() => refetch()}
            variant="outlined"
            size="small"
            sx={{ borderColor: 'rgba(0,0,0,0.2)', color: 'text.secondary' }}
          >
            다시 시도
          </Button>
        </Box>
      )}

      {!isLoading && !isError && !data && (
        <Box
          sx={{
            displayPrint: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mt: 12,
            gap: 1.5,
          }}
        >
          <CreateIcon sx={{ fontSize: 40, color: 'rgba(0,0,0,0.18)' }} />
          <Typography
            sx={{
              color: 'text.secondary',
              fontFamily: '"Fraunces", serif',
              fontSize: '1rem',
              letterSpacing: '0.01em',
            }}
          >
            연습할 노트가 없습니다
          </Typography>
          <Typography variant="caption" color="text.disabled">
            독서 노트를 먼저 작성해주세요.
          </Typography>
        </Box>
      )}

      {data && (
        <Box
          className="practice-sheet"
          sx={{
            // Screen: centered paper, exactly one A4 landscape page
            width: '297mm',
            height: '210mm',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            mx: 'auto',
            mt: 3,
            backgroundColor: '#fffef9',
            boxShadow:
              '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
            p: '12mm',
            boxSizing: 'border-box',
            // Print: fill the single page; overflow stays clipped
            '@media print': {
              width: '100%',
              height: '185mm',
              mx: 0,
              mt: 0,
              boxShadow: 'none',
              p: 0,
              backgroundColor: '#fff',
              pageBreakInside: 'avoid',
              breakInside: 'avoid',
            },
          }}
        >
          {/* Header */}
          <Box
            sx={{
              mb: `${(fontSize + 8) * 0.5}px`,
              pb: `${(fontSize + 8) * 0.5}px`,
              borderBottom: '1px solid rgba(0,0,0,0.12)',
              '@media print': { borderBottom: '1px solid #ccc' },
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                color: 'text.secondary',
                fontFamily: PRACTICE_FONT,
                lineHeight: 1.5,
                fontSize: '0.72rem',
                letterSpacing: '0.02em',
                '@media print': { color: '#666' },
              }}
            >
              {today} · {data.book.title} · {data.book.author}
              {data.note.pageNumber ? ` · p.${data.note.pageNumber}` : ''}
            </Typography>
          </Box>

          {/* Traceable content — fills the remaining sheet height, clipped by overflow */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {guide === 'grid' ? (
              <GridSheet
                content={fillPracticeContent(data.note.content)}
                cell={fontSize + 8}
                fontSize={fontSize}
                opacity={opacity}
              />
            ) : (
              <Typography
                component="pre"
                sx={{
                  fontFamily: PRACTICE_FONT,
                  fontSize: `${fontSize}px`,
                  lineHeight: `${fontSize + 8}px`,
                  color: `rgba(0,0,0,${opacity})`,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  m: 0,
                  p: 0,
                  height: '100%',
                  backgroundImage: guideBackground(guide, fontSize + 8),
                  backgroundSize: `100% ${fontSize + 8}px`,
                  backgroundPosition: '0 0',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                }}
              >
                {fillPracticeContent(data.note.content)}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Global print styles */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
        }
      `}</style>
    </Box>
  );
}
