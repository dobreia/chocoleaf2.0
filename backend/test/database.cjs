// Isolated PostgreSQL WASM engine. Never imported by the production server.
const { PGlite } = require("@electric-sql/pglite");
module.exports = async () => {
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require("pg");
    const schema =
      "chocoleaf_test_" + require("node:crypto").randomBytes(8).toString("hex");
    const control = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await control.query("CREATE SCHEMA " + schema);
    const pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: "-c search_path=" + schema,
      max: 12,
    });
    const close = pool.end.bind(pool);
    pool.end = async () => {
      await close();
      await control.query("DROP SCHEMA " + schema + " CASCADE");
      await control.end();
    };
    require.cache[require.resolve("../src/db")] = {
      id: require.resolve("../src/db"),
      filename: require.resolve("../src/db"),
      loaded: true,
      exports: pool,
    };
    return pool;
  }
  const db = new PGlite();
  await db.waitReady;
  let tail = Promise.resolve();
  async function acquire() {
    let unlock;
    const next = new Promise((r) => (unlock = r)),
      previous = tail;
    tail = next;
    await previous;
    return unlock;
  }
  async function query(sql, args) {
    if (!args && sql.includes(";")) {
      const r = (await db.exec(sql)).at(-1) || { rows: [] };
      return { ...r, rowCount: r.affectedRows || r.rows?.length || 0 };
    }
    const r = await db.query(sql, args);
    return { ...r, rowCount: r.affectedRows || r.rows?.length || 0 };
  }
  const pool = {
    query: async (...args) => {
      const done = await acquire();
      try {
        return await query(...args);
      } finally {
        done();
      }
    },
    connect: async () => {
      const done = await acquire();
      return { query, release: done };
    },
    end: () => db.close(),
  };
  require.cache[require.resolve("../src/db")] = {
    id: require.resolve("../src/db"),
    filename: require.resolve("../src/db"),
    loaded: true,
    exports: pool,
  };
  return pool;
};
