CREATE TABLE gift_vouchers (
 code TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES gift_orders(id), recipient_name TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0), valid_until DATE NOT NULL,
 changes_used INTEGER NOT NULL DEFAULT 0 CHECK(changes_used BETWEEN 0 AND 1)
);
CREATE TABLE booking_vouchers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL REFERENCES gift_vouchers(code),
 booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released','consumed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), released_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_voucher_use ON booking_vouchers(code) WHERE status IN ('active','consumed');
CREATE INDEX booking_voucher_lookup ON booking_vouchers(booking_id);
ALTER TABLE bookings ADD COLUMN voucher_codes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN voucher_discount INTEGER NOT NULL DEFAULT 0 CHECK(voucher_discount>=0 AND voucher_discount<=total_price);
-- Recover previously issued serials without changing the PDFs or their names.
-- Match Date.setMonth overflow used by the original PDF generator.
INSERT INTO gift_vouchers(code,order_id,recipient_name,amount,valid_until)
 SELECT upper(g.data->>'voucherBase') || '-' || lpad(n.ordinality::text,2,'0'),g.id,n.name,
 (g.data->'meta'->>'unitAmount')::integer,
 (date_trunc('month',to_timestamp((g.data->>'generatedAt')::double precision/1000) AT TIME ZONE 'UTC')
  + interval '3 months'
  + (extract(day FROM to_timestamp((g.data->>'generatedAt')::double precision/1000) AT TIME ZONE 'UTC')::integer-1)*interval '1 day')::date
 FROM gift_orders g CROSS JOIN LATERAL jsonb_array_elements_text(g.data->'meta'->'names') WITH ORDINALITY n(name,ordinality)
 WHERE g.data->>'generatedAt' IS NOT NULL AND g.data->>'voucherBase' IS NOT NULL;
