const fs = require("node:fs");
const path = require("node:path");
const pool = require("./db");
async function migrate() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(829104)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())",
    );
    for (const name of fs
      .readdirSync(path.join(__dirname, "../migrations"))
      .sort()) {
      if (
        (await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]))
          .rowCount
      )
        continue;
      await c.query(
        fs.readFileSync(path.join(__dirname, "../migrations", name), "utf8"),
      );
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    }
    if (
      !(
        await c.query(
          "SELECT 1 FROM schema_migrations WHERE name='catalog-import-v1'",
        )
      ).rowCount
    ) {
      await c.query(
        `INSERT INTO services(title,description,duration_minutes,price,capacity) SELECT DISTINCT ON(title) title,COALESCE(description,''),GREATEST(1,EXTRACT(EPOCH FROM(end_time-start_time))/60)::int,GREATEST(0,price),GREATEST(1,capacity) FROM courses ORDER BY title,start_time DESC ON CONFLICT(title) DO NOTHING`,
      );
      const catalog = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../data/courses.json"), "utf8"),
      );
      for (const [slug, s] of Object.entries(catalog))
        await c.query(
          `INSERT INTO services(slug,title,description,long_description,image,image_detail,category,duration_minutes,price,capacity,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,6,$10) ON CONFLICT(title) DO UPDATE SET slug=COALESCE(services.slug,EXCLUDED.slug),long_description=CASE WHEN services.long_description='' THEN EXCLUDED.long_description ELSE services.long_description END,image=CASE WHEN services.image='' THEN EXCLUDED.image ELSE services.image END,image_detail=CASE WHEN services.image_detail='' THEN EXCLUDED.image_detail ELSE services.image_detail END`,
          [
            slug,
            s.title,
            s.description,
            s.longDescription || "",
            "/" + s.imageIndex,
            "/" + s.imageDetail,
            s.level || "",
            s.durationHour * 60,
            s.priceHUF,
            s.active !== false,
          ],
        );
      await c.query(
        "UPDATE courses c SET service_id=s.id FROM services s WHERE c.title=s.title AND c.service_id IS NULL",
      );
      await c.query(
        "INSERT INTO schema_migrations(name) VALUES('catalog-import-v1')",
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
module.exports = migrate;
if (require.main === module)
  migrate()
    .then(() => console.log("Migráció kész."))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
