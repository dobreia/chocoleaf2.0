ALTER TABLE customer_booking_archive ADD COLUMN category TEXT NOT NULL DEFAULT '';
UPDATE customer_booking_archive a SET category=s.category FROM services s WHERE s.id=a.service_id;
CREATE OR REPLACE VIEW customer_booking_history AS
 SELECT b.id AS booking_id,lower(b.customer_email) AS customer_email,
   b.customer_name,b.customer_phone,c.id AS course_id,c.service_id,c.title AS course_title,
   c.start_time,c.end_time,
   (SELECT jsonb_agg(jsonb_build_object('id',st.id,'start_time',st.start_time,'end_time',st.end_time)
     ORDER BY st.start_time,st.id) FROM course_session_times st WHERE st.course_id=c.id) AS sessions,
   b.status,b.payment_status,b.seats,b.created_at,b.updated_at,NULL::timestamptz AS archived_at,
   COALESCE(s.category,'') AS category
 FROM bookings b JOIN courses c ON c.id=b.course_id LEFT JOIN services s ON s.id=c.service_id
 UNION ALL
 SELECT booking_id,customer_email,customer_name,customer_phone,course_id,service_id,course_title,
   start_time,end_time,sessions,status,payment_status,seats,created_at,updated_at,archived_at,category
 FROM customer_booking_archive;
CREATE OR REPLACE FUNCTION archive_customer_booking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO customer_booking_archive(booking_id,customer_email,customer_name,customer_phone,
    course_id,service_id,course_title,start_time,end_time,sessions,status,payment_status,seats,created_at,updated_at,category)
  SELECT booking_id,customer_email,customer_name,customer_phone,course_id,service_id,course_title,
    start_time,end_time,sessions,status,payment_status,seats,created_at,updated_at,category
  FROM customer_booking_history WHERE booking_id=OLD.id AND archived_at IS NULL;
  RETURN OLD;
END;
$$;

CREATE TABLE contacts_connection (
 id INTEGER PRIMARY KEY CHECK(id=1), marker UUID NOT NULL DEFAULT gen_random_uuid(),
 account_email TEXT,refresh_token TEXT,enabled BOOLEAN NOT NULL DEFAULT false,
 needs_auth BOOLEAN NOT NULL DEFAULT false,include_cancelled BOOLEAN NOT NULL DEFAULT false,
 campaign_mode TEXT NOT NULL DEFAULT 'all' CHECK(campaign_mode IN ('all','categories')),
 campaign_categories JSONB NOT NULL DEFAULT '[]',
 last_scan_at TIMESTAMPTZ,last_synced_at TIMESTAMPTZ,connected_at TIMESTAMPTZ,
 last_error TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 audit_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO contacts_connection(id) VALUES(1);
CREATE TABLE contacts_oauth_states (
 hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,
 session_hash TEXT NOT NULL REFERENCES sessions(hash) ON DELETE CASCADE,
 verifier TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE contacts_groups (
 key TEXT PRIMARY KEY,name TEXT NOT NULL,resource_name TEXT UNIQUE
);
CREATE TABLE contacts_people (
 email TEXT PRIMARY KEY,resource_name TEXT UNIQUE,desired JSONB,desired_hash TEXT NOT NULL,
 synced_hash TEXT,synced_at TIMESTAMPTZ,uncertain_since TIMESTAMPTZ,
 last_error TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
