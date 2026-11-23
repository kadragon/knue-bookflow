import { DAY_MS } from '../utils/constants';
import { formatDate, normalizeKstDate } from '../utils/date';

const encoder = new TextEncoder();

function nextCivilDate(date: string): string {
  return formatDate(new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS));
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

function escapeCalendarText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
    .replace(/\r\n|\r|\n/g, '\\n');
}

export function createDueDateCalendar(
  loans: { dueDate: string; title: string }[],
): string {
  const titlesByDate = new Map<string, string[]>();
  for (const { dueDate, title } of loans) {
    const date = normalizeKstDate(dueDate);
    if (!date) continue;

    const titles = titlesByDate.get(date) ?? [];
    titles.push(title);
    titlesByDate.set(date, titles);
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

  const dates = Array.from(titlesByDate).sort(([a], [b]) => a.localeCompare(b));
  for (const [date, titles] of dates) {
    const next = nextCivilDate(date);
    if (next.length !== date.length) continue;

    const start = date.replaceAll('-', '');
    const end = next.replaceAll('-', '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:due-${start}@knue-bookflow`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${titles.length}권 반납`,
      `DESCRIPTION:${escapeCalendarText(titles.join('\n'))}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldContentLine).join('\r\n')}\r\n`;
}
