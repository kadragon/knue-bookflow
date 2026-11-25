-- Scope planned loans to users: add user_id and replace
-- UNIQUE(library_biblio_id) with UNIQUE(user_id, library_biblio_id).
-- No table references planned_loans, so a plain rebuild is safe.
-- user_id defaults to 1 (the owner); see 0017 for why.

CREATE TABLE planned_loans_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id),
    library_biblio_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    publisher TEXT,
    year TEXT,
    isbn TEXT,
    cover_url TEXT,
    material_type TEXT,
    branch_volumes TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, library_biblio_id)
);

INSERT INTO planned_loans_new (
    id, user_id, library_biblio_id, source, title, author, publisher, year,
    isbn, cover_url, material_type, branch_volumes, created_at, updated_at
)
SELECT
    id, 1, library_biblio_id, source, title, author, publisher, year,
    isbn, cover_url, material_type, branch_volumes, created_at, updated_at
FROM planned_loans;

DROP TABLE planned_loans;
ALTER TABLE planned_loans_new RENAME TO planned_loans;

CREATE INDEX IF NOT EXISTS idx_planned_loans_user_created_at
    ON planned_loans(user_id, created_at DESC, id DESC);
