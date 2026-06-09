/**
 * Writing practice sheet page
 * A4 landscape — traced handwriting with adjustable guide lines and opacity
 */

import AutorenewIcon from '@mui/icons-material/Autorenew';
import PrintIcon from '@mui/icons-material/Print';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getPracticeNote } from '../api';

type GuideMode = 'none' | 'lines' | 'grid';
type FontFamily = 'Pretendard Variable' | 'Gaegu' | 'Nanum Pen Script';

const FONT_LABEL: Record<FontFamily, string> = {
  'Pretendard Variable': '프리텐다드',
  Gaegu: '개구체',
  'Nanum Pen Script': '나눔 펜스크립트',
};

const LINE_HEIGHTS: Record<number, string> = {
  18: '18px',
  24: '24px',
  32: '32px',
  40: '40px',
};

function guideBackground(mode: GuideMode, lineHeight: number): string {
  const lineColor = 'rgba(180,180,180,0.4)';
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
  const [forceKey, setForceKey] = useState(0);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['practice', 'today', forceKey],
    queryFn: () => getPracticeNote(forceKey > 0),
    staleTime: Infinity, // stable all day; forceKey bump triggers refetch
    retry: false,
  });

  const handleRedraw = () => {
    setForceKey((k) => k + 1);
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
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f0f0f0', pb: 8 }}>
      {/* Controls — hidden in print */}
      <Box
        sx={{
          displayPrint: 'none',
          px: 2,
          py: 1.5,
          backgroundColor: 'background.paper',
          boxShadow: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'center',
        }}
      >
        <Typography variant="subtitle1" fontWeight={600} sx={{ mr: 1 }}>
          글씨 연습장
        </Typography>

        {/* Opacity */}
        <Box sx={{ width: 140 }}>
          <Typography variant="caption" color="text.secondary">
            글자 농도
          </Typography>
          <Slider
            value={opacity}
            min={0.1}
            max={0.6}
            step={0.05}
            onChange={(_e, v) => setOpacity(v as number)}
            size="small"
          />
        </Box>

        {/* Font */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
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
        <FormControl size="small" sx={{ minWidth: 90 }}>
          <InputLabel>크기</InputLabel>
          <Select
            value={fontSize}
            label="크기"
            onChange={(e) => setFontSize(Number(e.target.value))}
          >
            {Object.entries(LINE_HEIGHTS).map(([px]) => (
              <MenuItem key={px} value={Number(px)}>
                {px}px
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Guide mode */}
        <ToggleButtonGroup
          value={guide}
          exclusive
          size="small"
          onChange={(_e, v) => v && setGuide(v as GuideMode)}
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
          >
            다시 뽑기
          </Button>
          <Button
            startIcon={<PrintIcon />}
            variant="contained"
            size="small"
            onClick={handlePrint}
          >
            인쇄
          </Button>
        </Box>
      </Box>

      {/* Sheet area */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {isError && (
        <Box sx={{ displayPrint: 'none', textAlign: 'center', mt: 8 }}>
          <Typography color="error">노트를 불러오지 못했습니다.</Typography>
          <Button onClick={() => refetch()} sx={{ mt: 2 }}>
            다시 시도
          </Button>
        </Box>
      )}

      {!isLoading && !isError && !data && (
        <Box sx={{ displayPrint: 'none', textAlign: 'center', mt: 8 }}>
          <Typography color="text.secondary">
            연습할 노트가 없습니다. 독서 노트를 먼저 작성해주세요.
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
            backgroundColor: '#fff',
            boxShadow: 3,
            p: '12mm',
            boxSizing: 'border-box',
            // Apply guide background
            backgroundImage: guideBackground(guide, fontSize + 8),
            backgroundSize: `100% ${fontSize + 8}px`,
            backgroundPosition: `0 ${(fontSize + 8) * 1.5}px`, // offset past header
            // Print: fill page
            '@media print': {
              width: '100%',
              mx: 0,
              mt: 0,
              boxShadow: 'none',
              p: 0,
            },
          }}
        >
          {/* Header */}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mb: `${(fontSize + 8) * 1}px`,
              color: 'text.secondary',
              fontFamily: font,
              lineHeight: 1.4,
              '@media print': { color: '#555' },
            }}
          >
            {today} · {data.book.title} · {data.book.author}
            {data.note.pageNumber ? ` · p.${data.note.pageNumber}` : ''}
          </Typography>

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
