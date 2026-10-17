-- One-time adoption of the six-seat standard, preserving existing bookings.
ALTER TABLE services ALTER COLUMN capacity SET DEFAULT 6;
ALTER TABLE courses ALTER COLUMN capacity SET DEFAULT 6;
UPDATE services SET capacity = 6;
UPDATE courses c SET capacity = GREATEST(6, (
  SELECT COALESCE(SUM(b.seats), 0) FROM bookings b
  WHERE b.course_id = c.id AND b.status <> 'cancelled'
));
