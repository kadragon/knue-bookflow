import { z } from 'zod';
import { DAY_MS, KST_OFFSET_MINUTES } from '../utils/constants';
import { formatDate } from '../utils/date';

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ local: true, offset: true });
const encoder = new TextEncoder();

function kstDueDate(value: string): string | undefined {
  const date = value.trim();
  if (isoDate.safeParse(date).success) return date;

  // Older loan rows can contain timestamps. A local timestamp is already KST.
  const timestamp = date.replace(' ', 'T');
  if (!isoDateTime.safeParse(timestamp).success) return undefined;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) return timestamp.slice(0, 10);

  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return undefined;
  const kstDate = formatDate(new Date(time + KST_OFFSET_MINUTES * 60_000));
  if (isoDate.safeParse(kstDate).success) return kstDate;
}

export function foldContentLine(line: string): string {
  let result = '';
  let octets = 0;
  for (const character of line) {
    const width = encoder.encode(character).byteLength;
    if (octets + width > 75) {
      result += '\r\n ';
      octets = 1;
    }
    result += character;
    octets += width;
  }
  return result;
}

export function createDueDateCalendar(dueDates: string[]): string {
  const counts = new Map<string, number>();
  for (const value of dueDates) {
    const date = kstDueDate(value);
    if (date) counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KNUE BookFlow//Loan Due Dates//EN',
    'X-WR-CALNAME:KNUE BookFlow 반납 일정',
    'X-WR-TIMEZONE:Asia/Seoul',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    // Seoul has used UTC+09:00 since its last daylight-saving transition.
    // The timezone component also keeps a calendar with zero events valid.
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Seoul',
    'BEGIN:STANDARD',
    'DTSTART:19881009T030000',
    'TZOFFSETFROM:+1000',
    'TZOFFSETTO:+0900',
    'TZNAME:KST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');

  for (const date of Array.from(counts.keys()).sort()) {
    // UTC here is only a way to advance the KST civil date by one calendar day.
    const next = formatDate(new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS));
    if (!isoDate.safeParse(next).success) continue;

    const start = date.replaceAll('-', '');
    const end = next.replaceAll('-', '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:due-${start}@knue-bookflow`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${counts.get(date)}권 반납`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldContentLine).join('\r\n')}\r\n`;
}
