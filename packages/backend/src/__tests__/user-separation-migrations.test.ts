/// <reference types="node" />

/**
 * Migrations 0016-0020 rebuild the user-owned tables with user_id. Replays
 * every migration in node:sqlite with foreign keys enforced (as on D1) and
 * checks that the pre-existing single-user data survives intact.
 */

import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations, listMigrations } from './helpers/sqlite-d1';

const all = listMigrations();
const before = all.filter((name) => name < '0016');
const after = all.filter((name) => name >= '0016');

type Row = Record<string, unknown>;

function rows(db: DatabaseSync, sql: string): Row[] {
  return db.prepare(sql).all() as Row[];
}

function withoutUserId(list: Row[]): Row[] {
  return list.map(({ user_id: _userId, ...rest }) => rest);
}

function seedSingleUserData(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO books (id, charge_id, isbn, title, author, publisher, cover_url,
      description, charge_date, due_date, renew_count, created_at, updated_at,
      is_read, isbn13, pub_date, discharge_date, is_renewable)
    VALUES
      (1, 'c-1', '111', 'First', 'A', 'P', 'https://c/1', 'd1', '2026-01-01',
       '2026-01-15', 1, '2026-01-01', '2026-01-02', 1, '9780000000001',
       '2020', '2026-01-10', 0),
      (5, 'c-5', '555', 'Fifth', 'B', NULL, NULL, NULL, '2026-02-01',
       '2026-02-15', 0, '2026-02-01', '2026-02-01', 0, NULL, NULL, NULL, 1);

    INSERT INTO notes (id, book_id, page_number, content, created_at, updated_at)
    VALUES
      (3, 1, 10, 'note on first', '2026-01-03', '2026-01-03'),
      (4, 1, 20, 'second note on first', '2026-01-04', '2026-01-04'),
      (9, 5, 7, 'note on fifth', '2026-02-02', '2026-02-02');

    INSERT INTO note_send_stats (note_id, send_count, last_sent_at)
    VALUES (3, 2, '2026-03-01T00:00:00Z'), (9, 1, NULL);

    INSERT INTO renewal_logs (charge_id, action, status, message, created_at)
    VALUES ('c-5', 'renewal_attempt', 'success', 'Renewed', '2026-02-10');

    INSERT INTO planned_loans (id, library_biblio_id, source, title, author,
      publisher, year, isbn, cover_url, material_type, branch_volumes,
      created_at, updated_at)
    VALUES
      (2, 100, 'search', 'Planned', 'C', NULL, '2024', NULL, NULL, NULL, '[]',
       '2026-01-05', '2026-01-05'),
      (7, 200, 'request_book', 'Requested', 'D', 'P', NULL, '222', NULL, 'Book',
       '[{"branchId":1}]', '2026-01-06', '2026-01-06');

    INSERT INTO planned_loan_dismissals (id, library_biblio_id, created_at)
    VALUES (4, 300, '2026-01-07');

    INSERT INTO book_requests (id, isbn13, isbn, title, author, publisher,
      pub_date, cover_url, aladin_link, created_at, updated_at)
    VALUES (6, '9780000000099', NULL, 'Wanted', NULL, NULL, NULL, NULL, NULL,
      '2026-01-08', '2026-01-08');
  `);
}

const SNAPSHOT_QUERIES = {
  books: 'SELECT * FROM books ORDER BY id',
  notes: 'SELECT * FROM notes ORDER BY id',
  note_send_stats: 'SELECT * FROM note_send_stats ORDER BY note_id',
  renewal_logs: 'SELECT * FROM renewal_logs ORDER BY id',
  planned_loans: 'SELECT * FROM planned_loans ORDER BY id',
  planned_loan_dismissals: 'SELECT * FROM planned_loan_dismissals ORDER BY id',
  book_requests: 'SELECT * FROM book_requests ORDER BY id',
} as const;

function snapshot(db: DatabaseSync): Record<string, Row[]> {
  return Object.fromEntries(
    Object.entries(SNAPSHOT_QUERIES).map(([table, sql]) => [
      table,
      rows(db, sql),
    ]),
  );
}

describe('per-user separation migrations (0016-0020)', () => {
  let db: DatabaseSync;
  let original: Record<string, Row[]>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    applyMigrations(db, before);
    seedSingleUserData(db);
    original = snapshot(db);
    applyMigrations(db, after);
  });

  it('runs with foreign keys enforced', () => {
    expect(rows(db, 'PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
    expect(rows(db, 'PRAGMA foreign_key_check')).toEqual([]);
  });

  it('seeds the owner user as id 1', () => {
    expect(rows(db, 'SELECT id, email, access_sub FROM users')).toEqual([
      { id: 1, email: null, access_sub: null },
    ]);
  });

  it('keeps every existing row and id, assigning it to the owner', () => {
    const migrated = snapshot(db);

    for (const table of [
      'books',
      'planned_loans',
      'planned_loan_dismissals',
      'book_requests',
    ]) {
      expect(migrated[table]?.map((row) => row.user_id)).toEqual(
        original[table]?.map(() => 1),
      );
      expect(withoutUserId(migrated[table] ?? [])).toEqual(original[table]);
    }

    expect(migrated.notes).toEqual(original.notes);
    expect(migrated.note_send_stats).toEqual(original.note_send_stats);
    expect(migrated.renewal_logs).toEqual(original.renewal_logs);
    expect(original.notes).toHaveLength(3);
    expect(original.note_send_stats).toHaveLength(2);
  });

  it('keeps notes wired to the rebuilt books table', () => {
    expect(
      rows(db, 'PRAGMA foreign_key_list(notes)').map((fk) => [
        fk.table,
        fk.on_delete,
      ]),
    ).toEqual([['books', 'CASCADE']]);

    db.exec('DELETE FROM books WHERE id = 1');

    expect(rows(db, 'SELECT id FROM notes ORDER BY id')).toEqual([{ id: 9 }]);
    expect(rows(db, 'SELECT note_id FROM note_send_stats')).toEqual([
      { note_id: 9 },
    ]);
  });

  it('enforces uniqueness per user instead of globally', () => {
    db.exec("INSERT INTO users (id, email) VALUES (2, 'member@example.com')");

    const insertBook = (userId: number) =>
      db
        .prepare(
          "INSERT INTO books (user_id, charge_id, title, charge_date, due_date) VALUES (?, 'c-1', 'T', '2026-01-01', '2026-01-15')",
        )
        .run(userId);
    expect(() => insertBook(2)).not.toThrow();
    expect(() => insertBook(1)).toThrow(/UNIQUE/);

    const insertPlanned = (userId: number) =>
      db
        .prepare(
          "INSERT INTO planned_loans (user_id, library_biblio_id, source, title, author) VALUES (?, 100, 'search', 'T', 'A')",
        )
        .run(userId);
    expect(() => insertPlanned(2)).not.toThrow();
    expect(() => insertPlanned(1)).toThrow(/UNIQUE/);

    const insertDismissal = (userId: number) =>
      db
        .prepare(
          'INSERT INTO planned_loan_dismissals (user_id, library_biblio_id) VALUES (?, 300)',
        )
        .run(userId);
    expect(() => insertDismissal(2)).not.toThrow();
    expect(() => insertDismissal(1)).toThrow(/UNIQUE/);

    const insertRequest = (userId: number) =>
      db
        .prepare(
          "INSERT INTO book_requests (user_id, isbn13, title) VALUES (?, '9780000000099', 'T')",
        )
        .run(userId);
    expect(() => insertRequest(2)).not.toThrow();
    expect(() => insertRequest(1)).toThrow(/UNIQUE/);
  });

  it('rejects rows for users that do not exist', () => {
    expect(() =>
      db.exec(
        "INSERT INTO book_requests (user_id, isbn13, title) VALUES (99, '9780000000100', 'T')",
      ),
    ).toThrow(/FOREIGN KEY/);
  });

  it('keeps single-user inserts working by defaulting to the owner', () => {
    // The pre-separation Worker never binds user_id; it must keep working
    // between applying the migrations and deploying, and after a rollback.
    db.exec(
      "INSERT INTO books (charge_id, title, charge_date, due_date) VALUES ('c-new', 'New', '2026-03-01', '2026-03-15')",
    );
    db.exec(
      "INSERT INTO book_requests (isbn13, title) VALUES ('978new', 'New')",
    );
    db.exec(
      "INSERT INTO planned_loans (library_biblio_id, source, title, author) VALUES (400, 'search', 'New', 'A')",
    );
    db.exec(
      'INSERT OR IGNORE INTO planned_loan_dismissals (library_biblio_id) VALUES (500)',
    );

    expect(
      rows(db, "SELECT id, user_id FROM books WHERE charge_id = 'c-new'"),
    ).toEqual([{ id: 6, user_id: 1 }]);
    expect(
      rows(db, "SELECT user_id FROM book_requests WHERE isbn13 = '978new'"),
    ).toEqual([{ user_id: 1 }]);
    expect(
      rows(
        db,
        'SELECT user_id FROM planned_loans WHERE library_biblio_id = 400',
      ),
    ).toEqual([{ user_id: 1 }]);
    expect(
      rows(
        db,
        'SELECT user_id FROM planned_loan_dismissals WHERE library_biblio_id = 500',
      ),
    ).toEqual([{ user_id: 1 }]);
  });

  it('replaces the dropped indexes with user-scoped ones', () => {
    const indexes = rows(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
    ).map((row) => row.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_book_requests_user_created_at',
        'idx_books_user_charge_date',
        'idx_books_user_isbn_charge_date',
        'idx_notes_book_id',
        'idx_notes_page_number',
        'idx_note_send_stats_count',
        'idx_planned_loans_user_created_at',
        'idx_renewal_logs_charge_created',
      ]),
    );
    expect(indexes).not.toContain('idx_books_isbn');
    expect(
      rows(db, "SELECT name FROM sqlite_master WHERE name LIKE '%_backup'"),
    ).toEqual([]);
  });
});
