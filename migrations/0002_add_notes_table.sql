-- Migration: Add notes table for book note-taking feature
-- Trace:
--   spec_id: SPEC-notes-002
--   task_id: TASK-023

-- Notes table: stores user notes for each book
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

-- Index for efficient lookup by book
CREATE INDEX IF NOT EXISTS idx_notes_book_id ON notes(book_id);

-- Index for sorting by page number
CREATE INDEX IF NOT EXISTS idx_notes_page_number ON notes(book_id, page_number);
