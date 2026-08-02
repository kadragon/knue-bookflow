-- Migration: Add note_send_stats table tracking how often each note was drawn.
-- Originally added for the Telegram broadcast note picker; the table is now
-- read/written by the practice sheet draw tracker (services/note-selection.ts).
-- Trace (original):
--   spec_id: SPEC-notes-telegram-001
--   task_id: TASK-028

CREATE TABLE IF NOT EXISTS note_send_stats (
    note_id INTEGER PRIMARY KEY,
    send_count INTEGER NOT NULL DEFAULT 0,
    last_sent_at DATETIME,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_send_stats_count ON note_send_stats(send_count);
