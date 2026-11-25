-- Scope planned loan dismissals to users: add user_id and replace
-- UNIQUE(library_biblio_id) with UNIQUE(user_id, library_biblio_id).
-- No table references planned_loan_dismissals, so a plain rebuild is safe.
-- user_id defaults to 1 (the owner); see 0017 for why.

CREATE TABLE planned_loan_dismissals_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id),
    library_biblio_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, library_biblio_id)
);

INSERT INTO planned_loan_dismissals_new (id, user_id, library_biblio_id, created_at)
SELECT id, 1, library_biblio_id, created_at
FROM planned_loan_dismissals;

DROP TABLE planned_loan_dismissals;
ALTER TABLE planned_loan_dismissals_new RENAME TO planned_loan_dismissals;
