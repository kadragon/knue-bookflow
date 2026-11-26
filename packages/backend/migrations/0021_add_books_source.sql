ALTER TABLE books ADD COLUMN source TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('library', 'manual'));
