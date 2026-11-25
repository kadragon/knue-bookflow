-- Distinguish books synced from the library account from books the user
-- registered by hand from an Aladin search. Manual books carry no library
-- due date, so due-date consumers filter on source = 'library'.
ALTER TABLE books ADD COLUMN source TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('library', 'manual'));
