CREATE TABLE calendar_connection (
 id INTEGER PRIMARY KEY CHECK(id=1),
 marker UUID NOT NULL DEFAULT gen_random_uuid(),
 account_email TEXT,
 refresh_token TEXT,
 calendar_id TEXT,
 enabled BOOLEAN NOT NULL DEFAULT false,
 needs_auth BOOLEAN NOT NULL DEFAULT false,
 last_scan_at TIMESTAMPTZ,
 last_synced_at TIMESTAMPTZ,
 last_error TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 connected_at TIMESTAMPTZ
);
INSERT INTO calendar_connection(id) VALUES(1);
CREATE TABLE calendar_oauth_states (
 hash TEXT PRIMARY KEY,
 browser_hash TEXT NOT NULL,
 session_hash TEXT NOT NULL REFERENCES sessions(hash) ON DELETE CASCADE,
 verifier TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL
);
-- No FK to courses: deleted courses still need to be removed from Google.
CREATE TABLE calendar_events (
 course_id UUID PRIMARY KEY,
 event_id TEXT NOT NULL UNIQUE,
 desired JSONB,
 desired_hash TEXT NOT NULL,
 synced_hash TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_error TEXT,
 synced_at TIMESTAMPTZ
);
CREATE INDEX calendar_events_due ON calendar_events(next_attempt_at);
