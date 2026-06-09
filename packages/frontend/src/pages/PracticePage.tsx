/**
 * Writing practice sheet page
 * A4 landscape — traced handwriting with adjustable guide lines and opacity
 */

import AutorenewIcon from '@mui/icons-material/Autorenew';
import CreateIcon from '@mui/icons-material/Create';
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getPracticeNote } from '../api';

type GuideMode = 'none' | 'lines' | 'grid';
type FontFamily = 'Pretendard Variable' | 'Gaegu' | 'Nanum Pen Script';

const FONT_LABEL: Record<FontFamily, string> = {
  'Pretendard Variable': '프리텐다드',
  Gaegu: '개구체',
  'Nanum Pen Script': '나눔 펜스크립트',
};

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
  // grid
  return `
    repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent ${lineHeight - 1}px,
      ${lineColor} ${lineHeight - 1}px,
      ${lineColor} ${lineHeight}px
    ),
    repeating-linear-gradient(
      to right,
      transparent 0px,
      transparent ${lineHeight - 1}px,
      ${lineColor} ${lineHeight - 1}px,
      ${lineColor} ${lineHeight}px
    )
  `;
}

export default function PracticePage() {
  const [opacity, setOpacity] = useState(0.35);
  const [font, setFont] = useState<FontFamily>('Pretendard Variable');
  const [fontSize, setFontSize] = useState(24);
  const [guide, setGuide] = useState<GuideMode>('lines');

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
    const newData = await getPracticeNote(true);
    queryClient.setQueryData(['practice', 'today', kstToday], newData);
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
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f2ede5', pb: 8 }}>
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

        {/* Font */}
        <FormControl size="small" sx={{ minWidth: 155 }}>
          <InputLabel>폰트</InputLabel>
          <Select
            value={font}
            label="폰트"
            onChange={(e) => setFont(e.target.value as FontFamily)}
          >
            {(Object.keys(FONT_LABEL) as FontFamily[]).map((f) => (
              <MenuItem key={f} value={f} style={{ fontFamily: f }}>
                {FONT_LABEL[f]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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
            startIcon={<AutorenewIcon />}
            variant="outlined"
            size="small"
            onClick={handleRedraw}
            sx={{ borderColor: 'rgba(0,0,0,0.2)', color: 'text.secondary' }}
          >
            다시 뽑기
          </Button>
          <Button
            startIcon={<PrintIcon />}
            variant="contained"
            size="small"
            onClick={handlePrint}
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
            // Screen: centered paper
            width: '297mm',
            minHeight: '210mm',
            mx: 'auto',
            mt: 3,
            backgroundColor: '#fffef9',
            boxShadow:
              '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
            p: '12mm',
            boxSizing: 'border-box',
            // Print: fill page
            '@media print': {
              width: '100%',
              mx: 0,
              mt: 0,
              boxShadow: 'none',
              p: 0,
              backgroundColor: '#fff',
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
                fontFamily: font,
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

          {/* Traceable content */}
          <Typography
            component="pre"
            sx={{
              fontFamily: font,
              fontSize: `${fontSize}px`,
              lineHeight: `${fontSize + 8}px`,
              color: `rgba(0,0,0,${opacity})`,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              m: 0,
              p: 0,
              backgroundImage: guideBackground(guide, fontSize + 8),
              backgroundSize: `100% ${fontSize + 8}px`,
              backgroundPosition: '0 0',
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          >
            {data.note.content}
          </Typography>
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
