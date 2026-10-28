ALTER TABLE bookings ADD COLUMN billing_data JSONB;
ALTER TABLE bookings ADD COLUMN transfer_reference TEXT UNIQUE;
ALTER TABLE gift_orders ADD COLUMN request_key UUID UNIQUE;
