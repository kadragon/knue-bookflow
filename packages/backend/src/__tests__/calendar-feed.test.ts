/// <reference types="node" />

import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../index';
import { createBookRecord } from '../services/book-repository';
import { foldContentLine } from '../services/due-date-calendar';
import type { Charge, Env } from '../types';

const token = 'test-calendar-token';
const url = 'https://bookflow.test/api/calendar.ics';
const ctx = {} as ExecutionContext;
const renewalEligibilityMigration = readFileSync(
  new URL(
    '../../migrations/0015_add_loan_renewal_eligibility.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('loan due date calendar feed', () => {
  let db: DatabaseSync;
  let env: Env;
  let prepare: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(
      'CREATE TABLE books (user_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, due_date DATE, discharge_date DATE, renew_count INTEGER DEFAULT 0)',
    );
    db.exec(renewalEligibilityMigration);
    prepare = vi.fn((sql: string) => ({
      all: async () => ({ results: db.prepare(sql).all() }),
      bind: (...values: number[]) => ({
        all: async () => ({ results: db.prepare(sql).all(...values) }),
      }),
    }));
    env = { DB: { prepare }, CALENDAR_FEED_TOKEN: token } as unknown as Env;

    // Vitest runs in Node, where timingSafeEqual lives on node:crypto.
    vi.stubGlobal('crypto', {
      subtle: {
        digest: crypto.subtle.digest.bind(crypto.subtle),
        timingSafeEqual: (a: ArrayBuffer, b: ArrayBuffer) =>
          timingSafeEqual(new Uint8Array(a), new Uint8Array(b)),
      },
    });
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  function addLoan(
    title: string,
    due: string | null,
    renewCount: number | null = 1,
    returned: string | null = null,
    isRenewable: 0 | 1 | null = null,
    userId = 1,
  ) {
    db.prepare(
      'INSERT INTO books (user_id, title, due_date, discharge_date, renew_count, is_renewable) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(userId, title, due, returned, renewCount, isRenewable);
  }

  function fetchFeed(query = `?token=${token}`) {
    return worker.fetch(new Request(url + query), env, ctx);
  }

  it('groups loans that cannot be renewed by KST date and lists their titles', async () => {
    addLoan('First title', '2026-11-30');
    addLoan('First title', '2026-11-30 00:00:00', 2);
    const synced = createBookRecord({
      id: 3,
      biblio: { titleStatement: 'Synced title', isbn: '' },
      chargeDate: '2026-11-16',
      dueDate: '2026-11-29T15:00:00Z',
      renewCnt: 1,
    } as Charge);
    addLoan(synced.title, synced.due_date, synced.renew_count);
    addLoan('Legacy title', '2026-11-29T15:00:00Z');
    addLoan('Later title', '2026-12-01');
    addLoan('Blocked title', '2026-11-30', 0, null, 0);
    addLoan('Renewable title', '2026-11-30', 0, null, 1);
    addLoan('Unknown count', '2026-11-30', null);
    addLoan('Returned title', '2026-11-30', 0, '2026-11-23', 0);
    addLoan('Invalid date', '2026-02-30');
    addLoan('Numeric date', '20261130');
    addLoan('Invalid suffix', '2026-11-30garbage');
    addLoan('Invalid time', '2026-11-30 25:00:00');
    addLoan('Missing date', null);
    addLoan('Empty date', '');

    const response = await fetchFeed();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/calendar; charset=utf-8',
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');

    const ics = await response.text();
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
    expect(ics.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(ics).toContain('X-WR-CALNAME:');
    expect(ics).toContain('X-WR-TIMEZONE:Asia/Seoul\r\n');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n');
    expect(ics).toContain('X-PUBLISHED-TTL:PT1H\r\n');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toMatch(
      /UID:due-20261130@knue-bookflow\r\nDTSTAMP:\d{8}T\d{6}Z\r\nDTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201\r\nSUMMARY:5권 반납\r\n/,
    );
    expect(ics.replaceAll('\r\n ', '')).toContain(
      'DESCRIPTION:Blocked title\\nFirst title\\nFirst title\\nLegacy title\\nSynced title\r\n',
    );
    expect(ics).toContain('SUMMARY:1권 반납\r\nDESCRIPTION:Later title\r\n');
    expect(ics).not.toMatch(
      /Renewable title|Unknown count|Returned title|ATTENDEE:|ORGANIZER:/,
    );
    expect(
      ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75),
    ).toBe(true);
  });

  it('adds a loan to its new due date after using its renewal allowance', async () => {
    addLoan('Renewed', '2026-11-30', 0);
    addLoan('Already due later', '2026-12-07');
    const before = await (await fetchFeed()).text();
    expect(before).not.toContain('UID:due-20261130@knue-bookflow');
    expect(before).toContain('UID:due-20261207@knue-bookflow');

    db.exec(
      "UPDATE books SET due_date = '2026-12-07', renew_count = 1 WHERE title = 'Renewed'",
    );
    const after = await (await fetchFeed()).text();
    expect(after.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(after).toContain('UID:due-20261207@knue-bookflow');
    expect(after).toContain('SUMMARY:2권 반납');
    expect(after).toContain('DESCRIPTION:Already due later\\nRenewed\r\n');
    expect(after).not.toContain('UID:due-20261130@knue-bookflow');
  });

  it('serves an empty calendar when all active loans are renewable', async () => {
    addLoan('Returned', '2026-11-30', 1, '2026-11-23');
    addLoan('Renewable', '2026-11-30', 0, null, 1);
    addLoan('Legacy renewable', '2026-12-01', 0);
    const response = await fetchFeed();
    expect(response.status).toBe(200);
    const ics = await response.text();
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Asia/Seoul\r\n');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('escapes and folds book titles in the calendar description', async () => {
    const longTitle = '한'.repeat(46);
    const controlCharacters = String.fromCharCode(0x01, 0x0b, 0x1f, 0x7f);
    addLoan(
      `${longTitle}📚: 쉼표, 세미콜론; 역슬래시\\\r\n둘째\r셋째\n넷째\t끝${controlCharacters}`,
      '2026-11-30',
    );

    const ics = await (await fetchFeed()).text();
    expect(ics).toContain('\r\n ');
    expect(ics.replaceAll('\r\n ', '')).toContain(
      `DESCRIPTION:${longTitle}📚: 쉼표\\, 세미콜론\\; 역슬래시\\\\\\n둘째\\n셋째\\n넷째\t끝\r\nEND:VEVENT`,
    );
    expect(
      ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75),
    ).toBe(true);
  });

  it('folds long lines on UTF-8 character boundaries', () => {
    const content = `SUMMARY:${'반'.repeat(46)}📚`;
    const folded = foldContentLine(content);
    const lines = folded.split('\r\n ');
    expect(lines).toHaveLength(3);
    expect(lines.join('')).toBe(content);
    expect(lines.slice(1).every((line) => Buffer.byteLength(line) <= 74)).toBe(
      true,
    );
    expect(Buffer.byteLength(lines[0])).toBe(74);
  });

  it("serves only the owner's loans", async () => {
    addLoan('Owner title', '2026-11-30');
    addLoan('Member title', '2026-11-30', 1, null, null, 2);

    const ics = await (await fetchFeed()).text();
    expect(ics).toContain('DESCRIPTION:Owner title\r\n');
    expect(ics).not.toContain('Member title');
  });

  it('returns calendar headers without a body on an authenticated HEAD', async () => {
    const response = await worker.fetch(
      new Request(`${url}?token=${token}`, { method: 'HEAD' }),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'text/calendar; charset=utf-8',
    );
    expect(await response.text()).toBe('');
  });

  it.each(['?token=wrong', '?token=', '', `?token=${token}&token=wrong`])(
    'returns 404 before reading D1 for invalid credentials (%s)',
    async (query) => {
      expect((await fetchFeed(query)).status).toBe(404);
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  it('returns 404 before reading D1 if the secret is unset', async () => {
    delete env.CALENDAR_FEED_TOKEN;
    expect((await fetchFeed()).status).toBe(404);
    expect(prepare).not.toHaveBeenCalled();
  });
});
