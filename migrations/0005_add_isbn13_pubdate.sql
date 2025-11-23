-- Add isbn13 and pub_date columns to books table
-- Trace: spec_id: SPEC-storage-001, task_id: TASK-033

ALTER TABLE books ADD COLUMN isbn13 TEXT;
ALTER TABLE books ADD COLUMN pub_date TEXT;
