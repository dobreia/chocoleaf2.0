ALTER TABLE settings ADD COLUMN IF NOT EXISTS hours_enabled BOOLEAN NOT NULL DEFAULT false;
UPDATE settings SET hours_enabled=true WHERE hours<>'{}'::jsonb;
-- NOT VALID retains legacy rows for review while enforcing constraints on new writes.
ALTER TABLE courses ADD CONSTRAINT course_interval_valid CHECK (end_time>start_time) NOT VALID;
ALTER TABLE courses ADD CONSTRAINT course_capacity_valid CHECK (capacity BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE courses ADD CONSTRAINT course_price_valid CHECK (price>=0) NOT VALID;
ALTER TABLE bookings ADD CONSTRAINT booking_seats_valid CHECK (seats BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE bookings ADD CONSTRAINT booking_status_valid CHECK (status IN ('pending','confirmed','completed','cancelled','no-show')) NOT VALID;
ALTER TABLE bookings ADD CONSTRAINT booking_payment_valid CHECK (payment_status IN ('pending','paid','refunded','failed')) NOT VALID;
ALTER TABLE bookings ADD CONSTRAINT booking_price_valid CHECK (total_price>=0) NOT VALID;
