ALTER TABLE outbox ADD COLUMN IF NOT EXISTS calendar JSONB;

CREATE TABLE IF NOT EXISTS booking_calendar_events (
  uid TEXT PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK(sequence >= 0),
  active BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_calendar_booking ON booking_calendar_events(booking_id);
