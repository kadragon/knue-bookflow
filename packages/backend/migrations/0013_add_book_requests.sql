-- Book requests (희망도서 신청 목록)
-- Locally-recorded books the KNUE library does NOT have, surfaced via Aladin
-- keyword search. Purely user-initiated; no link to the library catalog/sync flow.
-- Additive only: new table + index, no changes to existing tables.

CREATE TABLE IF NOT EXISTS book_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn13      TEXT    NOT NULL UNIQUE,
    isbn        TEXT,
    title       TEXT    NOT NULL,
    author      TEXT,
    publisher   TEXT,
    pub_date    TEXT,
    cover_url   TEXT,
    aladin_link TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_book_requests_created_at
    ON book_requests(created_at DESC, id DESC);
