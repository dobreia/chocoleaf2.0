ALTER TABLE gift_vouchers ADD COLUMN admin_status TEXT
 CHECK (admin_status IN ('issued','paid','redeemed','deleted'));

CREATE TABLE gift_voucher_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 code TEXT NOT NULL REFERENCES gift_vouchers(code),
 previous_status TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('issued','paid','redeemed','deleted')),
 admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
 admin_email TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gift_voucher_event_lookup ON gift_voucher_events(code,created_at);
