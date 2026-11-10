-- Places already occupied outside this booking system; no fictitious customers.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS reserved_seats INTEGER NOT NULL DEFAULT 0;
ALTER TABLE courses ADD CONSTRAINT courses_reserved_seats_valid CHECK (reserved_seats BETWEEN 0 AND capacity);
