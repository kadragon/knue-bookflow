-- Migration: Drop unused speculative index added in 0009
-- idx_books_read_charge_date was added before the query that needs it exists.
-- Remove to avoid unnecessary write overhead on books INSERT/UPDATE.

DROP INDEX IF EXISTS idx_books_read_charge_date;
