-- Internal customer notes are independent of individual bookings.
CREATE TABLE customer_notes (
  customer_email TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note)<=10000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
