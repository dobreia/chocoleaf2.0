-- Legacy timezone-naive course dates are interpreted as local workshop time.
-- Inspect the source database backup before migrating if its naive values represent UTC.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='courses' AND column_name='start_time' AND data_type='timestamp without time zone') THEN
  ALTER TABLE courses ALTER COLUMN start_time TYPE TIMESTAMPTZ USING start_time AT TIME ZONE 'Europe/Budapest';
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='courses' AND column_name='end_time' AND data_type='timestamp without time zone') THEN
  ALTER TABLE courses ALTER COLUMN end_time TYPE TIMESTAMPTZ USING end_time AT TIME ZONE 'Europe/Budapest';
 END IF;
END $$;
