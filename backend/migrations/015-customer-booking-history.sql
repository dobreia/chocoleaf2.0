-- Live bookings remain the source of truth; deleted bookings keep only a
-- short customer/course snapshot, without billing, notes or management tokens.
CREATE TABLE customer_booking_archive (
  booking_id UUID PRIMARY KEY,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  course_id UUID NOT NULL,
  service_id UUID,
  course_title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  sessions JSONB NOT NULL,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  seats INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_archive_email ON customer_booking_archive(customer_email);
CREATE INDEX customer_archive_service ON customer_booking_archive(service_id);

CREATE VIEW customer_booking_history AS
 SELECT b.id AS booking_id,lower(b.customer_email) AS customer_email,
   b.customer_name,b.customer_phone,c.id AS course_id,c.service_id,c.title AS course_title,
   c.start_time,c.end_time,
   (SELECT jsonb_agg(jsonb_build_object('id',st.id,'start_time',st.start_time,'end_time',st.end_time)
     ORDER BY st.start_time,st.id) FROM course_session_times st WHERE st.course_id=c.id) AS sessions,
   b.status,b.payment_status,b.seats,b.created_at,b.updated_at,NULL::timestamptz AS archived_at
 FROM bookings b JOIN courses c ON c.id=b.course_id
 UNION ALL
 SELECT booking_id,customer_email,customer_name,customer_phone,course_id,service_id,course_title,
   start_time,end_time,sessions,status,payment_status,seats,created_at,updated_at,archived_at
 FROM customer_booking_archive;

CREATE FUNCTION archive_customer_booking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO customer_booking_archive(booking_id,customer_email,customer_name,customer_phone,
    course_id,service_id,course_title,start_time,end_time,sessions,status,payment_status,seats,created_at,updated_at)
  SELECT booking_id,customer_email,customer_name,customer_phone,course_id,service_id,course_title,
    start_time,end_time,sessions,status,payment_status,seats,created_at,updated_at
  FROM customer_booking_history WHERE booking_id=OLD.id AND archived_at IS NULL;
  RETURN OLD;
END;
$$;
CREATE TRIGGER archive_customer_booking BEFORE DELETE ON bookings
 FOR EACH ROW EXECUTE FUNCTION archive_customer_booking();
