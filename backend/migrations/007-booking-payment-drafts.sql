-- Checkout intents reserve capacity independently of actual bookings.
ALTER TABLE payment_orders ADD COLUMN course_id UUID REFERENCES courses(id);
ALTER TABLE payment_orders ADD COLUMN seats INTEGER CHECK(seats BETWEEN 1 AND 100);
ALTER TABLE payment_orders ADD COLUMN booking_data JSONB;
ALTER TABLE payment_orders DROP CONSTRAINT payment_orders_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_order_target CHECK (
 (gift_order_id IS NOT NULL AND booking_id IS NULL AND course_id IS NULL AND booking_data IS NULL AND seats IS NULL)
 OR (gift_order_id IS NULL AND (
   (course_id IS NOT NULL AND booking_data IS NOT NULL AND seats IS NOT NULL)
   OR booking_id IS NOT NULL
 ))
);
CREATE INDEX payment_course_holds ON payment_orders(course_id) WHERE status='pending' AND booking_id IS NULL;
