-- Add discharge_date column to books table to track returns
-- Trace: spec_id: SPEC-return-001, task_id: TASK-034

ALTER TABLE books ADD COLUMN discharge_date DATE;
