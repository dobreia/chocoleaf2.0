ALTER TABLE services ADD COLUMN session_count INTEGER NOT NULL DEFAULT 1
 CHECK (session_count BETWEEN 1 AND 100);

-- Existing advertisements keep their own dates and number of sessions.
-- Use the largest existing package as the default for future advertisements.
UPDATE services s SET session_count = COALESCE((
 SELECT MAX(n) FROM (
  SELECT COUNT(*)::int AS n FROM course_session_times t
  JOIN courses c ON c.id=t.course_id WHERE c.service_id=s.id
  GROUP BY c.id
 ) counts
), 1);
