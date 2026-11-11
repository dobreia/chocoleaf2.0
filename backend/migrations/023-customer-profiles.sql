CREATE TABLE customer_profiles (
 email TEXT PRIMARY KEY CHECK(email=lower(email)),
 name TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 deleted_at TIMESTAMPTZ
);

-- Deleting a contact does not delete reservations or financial records.
-- A genuinely new booking after deletion makes the customer visible again.
CREATE VIEW customer_directory AS
WITH history AS (
 SELECT customer_email AS email,
  (array_agg(customer_name ORDER BY updated_at DESC,booking_id))[1] AS name,
  (array_agg(customer_phone ORDER BY updated_at DESC,booking_id))[1] AS phone,
  count(*)::int AS bookings,MAX(created_at) AS last_booking,MAX(updated_at) AS updated_at,
  array_agg(DISTINCT course_title ORDER BY course_title) AS courses
 FROM customer_booking_history GROUP BY customer_email
)
SELECT h.email,
 CASE WHEN p.deleted_at IS NULL AND p.updated_at>=h.updated_at THEN p.name ELSE h.name END AS name,
 CASE WHEN p.deleted_at IS NULL AND p.updated_at>=h.updated_at THEN p.phone ELSE h.phone END AS phone,
 h.bookings,h.last_booking,h.courses
FROM history h LEFT JOIN customer_profiles p ON p.email=h.email
WHERE p.deleted_at IS NULL OR h.last_booking>p.deleted_at
UNION ALL
SELECT p.email,p.name,p.phone,0::int,NULL::timestamptz,ARRAY[]::text[]
FROM customer_profiles p WHERE p.deleted_at IS NULL
AND NOT EXISTS(SELECT 1 FROM history h WHERE h.email=p.email);
