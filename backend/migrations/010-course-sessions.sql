CREATE TABLE course_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 start_time TIMESTAMPTZ NOT NULL,
 end_time TIMESTAMPTZ NOT NULL,
 CHECK(end_time>start_time)
);
CREATE INDEX course_sessions_course ON course_sessions(course_id,start_time);
ALTER TABLE courses ADD COLUMN session_count_locked BOOLEAN NOT NULL DEFAULT false;
UPDATE courses c SET session_count_locked=true WHERE EXISTS(SELECT 1 FROM bookings b WHERE b.course_id=c.id) OR EXISTS(SELECT 1 FROM payment_orders p WHERE p.course_id=c.id);
INSERT INTO course_sessions(id,course_id,start_time,end_time)
 SELECT id,id,start_time,end_time FROM courses;

-- Legacy importers can still insert a single course directly. Its interval is
-- used until the application first saves its explicit sessions.
CREATE VIEW course_session_times AS
 SELECT id,course_id,start_time,end_time FROM course_sessions
 UNION ALL
 SELECT c.id,c.id,c.start_time,c.end_time FROM courses c
 WHERE NOT EXISTS(SELECT 1 FROM course_sessions s WHERE s.course_id=c.id);

ALTER TABLE calendar_events ADD COLUMN session_id UUID;
UPDATE calendar_events SET session_id=course_id;
ALTER TABLE calendar_events ALTER COLUMN session_id SET NOT NULL;
ALTER TABLE calendar_events DROP CONSTRAINT calendar_events_pkey;
ALTER TABLE calendar_events ADD PRIMARY KEY(session_id);
CREATE INDEX calendar_events_course ON calendar_events(course_id);
