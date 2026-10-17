const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const pool = require("../db");
const { hash, token, fail, email, str } = require("./rules");
async function passwordHash(password) {
  const salt = token();
  return salt + ":" + (await scrypt(password, salt, 64)).toString("hex");
}
async function verify(password, stored) {
  const [salt, key] = stored.split(":");
  const value = await scrypt(password, salt, 64);
  return (
    key.length === 128 && crypto.timingSafeEqual(value, Buffer.from(key, "hex"))
  );
}
function cookie(req) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("chocoleaf_session="))
      ?.split("=")[1] || ""
  );
}
async function requireAdmin(req, res, next) {
  try {
    const session = (
      await pool.query(
        "SELECT a.id,a.email FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.hash=$1 AND s.expires_at>now()",
        [hash(cookie(req))],
      )
    ).rows[0];
    if (!session) fail("Jelentkezz be az admin felületre.", 401);
    req.admin = session;
    next();
  } catch (e) {
    next(e);
  }
}
function setCookie(res, value, age) {
  res.cookie("chocoleaf_session", value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: age,
  });
}
const attempts = new Map();
function rateLimit(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || a.until < now) a = { count: 0, until: now + 600000 };
  a.count++;
  attempts.set(key, a);
  if (attempts.size > 10000)
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  if (a.count > 80)
    return res
      .status(429)
      .json({ message: "Túl sok kérés. Próbáld újra tíz perc múlva." });
  next();
}
function routes() {
  const r = require("express").Router();
  r.post("/login", rateLimit, async (req, res) => {
    const address = email(req.body.email),
      password = str(req.body.password, "Jelszó", 256);
    const a = (
      await pool.query("SELECT * FROM admins WHERE email=$1", [address])
    ).rows[0];
    const dummy = "0".repeat(64) + ":" + "0".repeat(128);
    if (!(await verify(password, a?.password_hash || dummy)) || !a)
      fail("Hibás email vagy jelszó.", 401);
    const t = token();
    await pool.query("DELETE FROM sessions WHERE expires_at<now()");
    await pool.query(
      "INSERT INTO sessions(hash,admin_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [hash(t), a.id],
    );
    setCookie(res, t, 8 * 3600000);
    res.json({ email: a.email });
  });
  r.get("/me", requireAdmin, (req, res) => res.json(req.admin));
  r.post("/logout", async (req, res) => {
    await pool.query("DELETE FROM sessions WHERE hash=$1", [hash(cookie(req))]);
    setCookie(res, "", 0);
    res.json({ ok: true });
  });
  return r;
}
module.exports = { requireAdmin, routes, passwordHash, rateLimit };
