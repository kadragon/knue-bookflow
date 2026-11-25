-- Scope books to users: add user_id and replace UNIQUE(charge_id) with
-- UNIQUE(user_id, charge_id). SQLite cannot alter a column constraint, so the
-- table is rebuilt.
--
-- books is the foreign-key parent of notes (ON DELETE CASCADE), and notes is
-- the parent of note_send_stats. D1 always enforces foreign keys, and DROP
-- TABLE runs an implicit DELETE that would cascade, so both child tables are
-- copied aside, emptied before the drop, and restored with their original ids
-- once the rebuilt table carries the name again. renewal_logs has no foreign
-- key (it joins on charge_id) and is left as is.
--
-- user_id defaults to 1 (the owner) so the single-user Worker keeps working
-- between applying this migration and deploying the per-user code, and after a
-- code rollback. The per-user code always binds user_id explicitly.

PRAGMA defer_foreign_keys = on;

CREATE TABLE books_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id),
    charge_id TEXT NOT NULL,
    isbn TEXT,
    isbn13 TEXT,
    title TEXT NOT NULL,
    author TEXT,
    publisher TEXT,
    cover_url TEXT,
    description TEXT,
    pub_date TEXT,
    charge_date DATE NOT NULL,
    due_date DATE NOT NULL,
    discharge_date DATE,
    renew_count INTEGER DEFAULT 0,
    is_renewable INTEGER CHECK (is_renewable IN (0, 1)),
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, charge_id)
);

INSERT INTO books_new (
    id, user_id, charge_id, isbn, isbn13, title, author, publisher, cover_url,
    description, pub_date, charge_date, due_date, discharge_date, renew_count,
    is_renewable, is_read, created_at, updated_at
)
SELECT
    id, 1, charge_id, isbn, isbn13, title, author, publisher, cover_url,
    description, pub_date, charge_date, due_date, discharge_date, renew_count,
    is_renewable, is_read, created_at, updated_at
FROM books;

CREATE TABLE notes_backup AS SELECT * FROM notes;
CREATE TABLE note_send_stats_backup AS SELECT * FROM note_send_stats;

DELETE FROM note_send_stats;
DELETE FROM notes;
DROP TABLE books;
ALTER TABLE books_new RENAME TO books;

INSERT INTO notes (id, book_id, page_number, content, created_at, updated_at)
SELECT id, book_id, page_number, content, created_at, updated_at
FROM notes_backup;

INSERT INTO note_send_stats (note_id, send_count, last_sent_at)
SELECT note_id, send_count, last_sent_at
FROM note_send_stats_backup;

DROP TABLE notes_backup;
DROP TABLE note_send_stats_backup;

CREATE INDEX IF NOT EXISTS idx_books_user_charge_date
    ON books(user_id, charge_date DESC);

CREATE INDEX IF NOT EXISTS idx_books_user_isbn_charge_date
    ON books(user_id, isbn, charge_date DESC);

PRAGMA defer_foreign_keys = off;
