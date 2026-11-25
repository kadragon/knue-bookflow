-- Users authenticated through Cloudflare Access.
-- Row id 1 is the owner (admin): every row that existed before per-user
-- separation is backfilled to it, and the Worker maps the ADMIN_EMAIL identity
-- to it at runtime, so its email stays NULL here. Other users are created on
-- first sign-in, keyed by the verified Access JWT email claim (lowercased).

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    access_sub TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (id, email) VALUES (1, NULL);
