-- Migration: Add composite indexes for hot-path query performance
-- Trace: spec_id: SPEC-storage-001, task_id: TASK-083

CREATE INDEX IF NOT EXISTS idx_books_isbn_charge_date
  ON books(isbn, charge_date DESC);

CREATE INDEX IF NOT EXISTS idx_renewal_logs_charge_created
  ON renewal_logs(charge_id, created_at DESC);
