-- Planned loan dismissal table to prevent re-adding dismissed request_book items

CREATE TABLE IF NOT EXISTS planned_loan_dismissals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_biblio_id INTEGER NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_planned_loan_dismissals_biblio_id
  ON planned_loan_dismissals(library_biblio_id);
