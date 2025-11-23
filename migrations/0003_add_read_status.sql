-- Migration: Add is_read column to books table
-- Trace: spec_id: SPEC-read-status-001, task_id: TASK-027

ALTER TABLE books ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;
