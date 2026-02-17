-- Migration: Add telegram_message_notes mapping table
-- Maps Telegram message_id -> note_id for reply-based correction

CREATE TABLE IF NOT EXISTS telegram_message_notes (
    telegram_message_id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_message_notes_note_id
    ON telegram_message_notes(note_id);
