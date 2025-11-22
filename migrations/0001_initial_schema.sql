-- Initial schema for KNUE BookFlow
-- Trace: spec_id: SPEC-storage-001, task_id: TASK-006

-- Books table: stores borrowed book records
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    charge_id TEXT UNIQUE NOT NULL,
    isbn TEXT,
    title TEXT NOT NULL,
    author TEXT,
    publisher TEXT,
    cover_url TEXT,
    description TEXT,
    charge_date DATE NOT NULL,
    due_date DATE NOT NULL,
    renew_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_charge_date ON books(charge_date);

-- Renewal logs table: tracks renewal attempts and results
CREATE TABLE IF NOT EXISTS renewal_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    charge_id TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for querying logs by charge
CREATE INDEX IF NOT EXISTS idx_renewal_logs_charge_id ON renewal_logs(charge_id);
