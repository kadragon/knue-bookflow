-- Scope book requests to users: add user_id and replace UNIQUE(isbn13) with
-- UNIQUE(user_id, isbn13). No table references book_requests, so a plain
-- rebuild is safe. user_id defaults to 1 (the owner); see 0017 for why.

CREATE TABLE book_requests_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id),
    isbn13 TEXT NOT NULL,
    isbn TEXT,
    title TEXT NOT NULL,
    author TEXT,
    publisher TEXT,
    pub_date TEXT,
    cover_url TEXT,
    aladin_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, isbn13)
);

INSERT INTO book_requests_new (
    id, user_id, isbn13, isbn, title, author, publisher, pub_date, cover_url,
    aladin_link, created_at, updated_at
)
SELECT
    id, 1, isbn13, isbn, title, author, publisher, pub_date, cover_url,
    aladin_link, created_at, updated_at
FROM book_requests;

DROP TABLE book_requests;
ALTER TABLE book_requests_new RENAME TO book_requests;

CREATE INDEX IF NOT EXISTS idx_book_requests_user_created_at
    ON book_requests(user_id, created_at DESC, id DESC);
