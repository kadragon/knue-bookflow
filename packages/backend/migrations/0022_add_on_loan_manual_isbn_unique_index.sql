CREATE UNIQUE INDEX idx_books_on_loan_manual_isbn ON books (user_id, isbn) WHERE source = 'manual' AND discharge_date IS NULL AND isbn <> '';
