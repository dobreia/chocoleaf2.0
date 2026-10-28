ALTER TABLE inquiries ADD COLUMN read_at TIMESTAMPTZ;
UPDATE inquiries SET read_at=created_at WHERE status='handled';
CREATE INDEX unread_inquiries ON inquiries(created_at) WHERE read_at IS NULL;
