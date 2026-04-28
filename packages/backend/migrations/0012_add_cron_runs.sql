-- Migration: Add cron_runs table for cron phase observability

CREATE TABLE IF NOT EXISTS cron_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NOT NULL,
    duration_ms INTEGER NOT NULL,
    detail TEXT,
    cron_expr TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_phase_started_at
    ON cron_runs(phase, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at
    ON cron_runs(started_at DESC);
