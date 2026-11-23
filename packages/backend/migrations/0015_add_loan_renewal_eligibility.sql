ALTER TABLE books ADD COLUMN is_renewable INTEGER CHECK (is_renewable IN (0, 1));
