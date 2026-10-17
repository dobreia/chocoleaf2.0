CREATE TABLE IF NOT EXISTS courses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL, price INTEGER NOT NULL,
 capacity INTEGER NOT NULL, active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS services (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT UNIQUE, title TEXT NOT NULL UNIQUE,
 description TEXT NOT NULL DEFAULT '', long_description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
 image_detail TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', duration_minutes INTEGER NOT NULL CHECK(duration_minutes>0),
 price INTEGER NOT NULL CHECK(price>=0), capacity INTEGER NOT NULL CHECK(capacity>0), active BOOLEAN NOT NULL DEFAULT true,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS staff (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), timezone TEXT NOT NULL DEFAULT 'Europe/Budapest',
 hours JSONB NOT NULL DEFAULT '{}', cancellation_hours INTEGER NOT NULL DEFAULT 24 CHECK(cancellation_hours>=0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS blocked_periods (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), start_time TIMESTAMPTZ NOT NULL,
 end_time TIMESTAMPTZ NOT NULL, reason TEXT NOT NULL DEFAULT '', staff_id UUID REFERENCES staff(id), CHECK(end_time>start_time));
ALTER TABLE courses ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS bookings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), course_id UUID NOT NULL REFERENCES courses(id), customer_name TEXT NOT NULL,
 customer_email TEXT NOT NULL, customer_phone TEXT, seats INTEGER NOT NULL DEFAULT 1, note TEXT,
 status TEXT NOT NULL DEFAULT 'pending', payment_status TEXT NOT NULL DEFAULT 'pending', payment_method TEXT NOT NULL DEFAULT 'transfer',
 total_price INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seats INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'transfer';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manage_hash TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manage_expires TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_key TEXT UNIQUE;
CREATE TABLE IF NOT EXISTS change_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('reschedule','cancel')), target_course_id UUID REFERENCES courses(id), note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request ON change_requests(booking_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS admins (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, admin_id UUID NOT NULL REFERENCES admins(id), expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
 sent_at TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0, next_attempt TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS inquiries (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
 subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS content_pages (slug TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS gift_orders (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS booking_course ON bookings(course_id);
CREATE INDEX IF NOT EXISTS booking_email ON bookings(lower(customer_email));
CREATE INDEX IF NOT EXISTS course_start ON courses(start_time);
