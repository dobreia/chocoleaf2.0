ALTER TABLE contacts_connection ADD COLUMN campaign_courses JSONB NOT NULL DEFAULT '[]';
ALTER TABLE contacts_connection DROP CONSTRAINT contacts_connection_campaign_mode_check;
-- A category selection cannot be translated into an intentional course selection.
-- Keep it empty until the administrator explicitly chooses the intended courses.
UPDATE contacts_connection SET campaign_mode='courses' WHERE campaign_mode='categories';
ALTER TABLE contacts_connection ADD CONSTRAINT contacts_connection_campaign_mode_check CHECK(campaign_mode IN ('all','courses'));
ALTER TABLE contacts_groups ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE contacts_groups ADD COLUMN synced_name TEXT;
UPDATE contacts_groups SET synced_name=name,active=key NOT LIKE 'category:%';
UPDATE contacts_people SET synced_hash=NULL,next_attempt_at=now();
UPDATE contacts_connection SET next_attempt_at=now(),audit_at=now();
