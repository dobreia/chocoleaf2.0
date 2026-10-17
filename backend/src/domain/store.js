const pool = require("../db");
async function transaction(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(829105)");
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const one = async (c, q, p = []) => (await c.query(q, p)).rows[0];
module.exports = { transaction, one };
