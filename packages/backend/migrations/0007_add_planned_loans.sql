-- Planned loans table for borrow-later list
-- Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043

CREATE TABLE IF NOT EXISTS planned_loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    library_biblio_id INTEGER NOT NULL UNIQUE,
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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_planned_loans_created_at
  ON planned_loans(created_at DESC, id DESC);
