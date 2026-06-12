/**
 * Fit a practice note onto exactly one A4 landscape page.
 * Short notes repeat to fill the sheet; the tail beyond one page is
 * clipped by `overflow: hidden` on the sheet container.
 */

const PX_PER_MM = 96 / 25.4;
// A4 landscape (297×210mm) minus 12mm margins on each side
const SHEET_WIDTH_MM = 273;
const SHEET_HEIGHT_MM = 186;
// Date/title caption line plus its padding/border, excluding the
// cell-sized margin accounted for below
const HEADER_BASE_PX = 18;
const MAX_REPEATS = 60;

/** Approximate character capacity of one printed sheet at a given font size. */
export function sheetCharCapacity(fontSize: number): number {
  const cell = fontSize + 8;
  const headerPx = HEADER_BASE_PX + cell;
  const cols = Math.floor((SHEET_WIDTH_MM * PX_PER_MM) / cell);
  const rows = Math.floor((SHEET_HEIGHT_MM * PX_PER_MM - headerPx) / cell);
  return Math.max(cols * rows, 1);
}

export function fillPracticeContent(content: string, fontSize: number): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  const capacity = sheetCharCapacity(fontSize);
  const length = Array.from(trimmed).length;
  // Already fills (or overflows) one page — clipping handles the excess.
  if (length >= capacity) return trimmed;
  // Overfill by 30% so rounding never leaves a gap; clipping trims the rest.
  const target = Math.ceil(capacity * 1.3);
  const repeats = Math.min(
    Math.max(Math.ceil(target / (length + 2)), 1),
    MAX_REPEATS,
  );
  return Array.from({ length: repeats }, () => trimmed).join('\n\n');
}
