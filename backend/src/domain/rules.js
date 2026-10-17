const crypto = require("node:crypto");
const statuses = ["pending", "confirmed", "completed", "cancelled", "no-show"];
const held = ["pending", "confirmed", "completed", "no-show"];
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function uuid(v) {
  if (
    typeof v !== "string" ||
    !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v)
  )
    fail("Érvénytelen azonosító.");
  return v;
}
function str(v, name, max = 200, required = true) {
  if (typeof v !== "string" || (required && !v.trim()) || v.length > max)
    fail(`${name}: hiányzó vagy túl hosszú érték.`);
  return v.trim();
}
function email(v) {
  v = str(v, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail("Hibás email cím.");
  return v;
}
function integer(v, name, min = 0, max = 10000000) {
  if (
    v === "" ||
    v == null ||
    typeof v === "boolean" ||
    !Number.isSafeInteger(Number(v)) ||
    Number(v) < min ||
    Number(v) > max
  )
    fail(`${name}: ${min} és ${max} közötti egész szám szükséges.`);
  return Number(v);
}
function instant(v) {
  if (
    typeof v !== "string" ||
    !/(Z|[+-]\d\d:\d\d)$/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    fail("Az időponthoz időzóna is szükséges.");
  return new Date(v);
}
function hash(v) {
  return crypto.createHash("sha256").update(v).digest("hex");
}
function token() {
  return crypto.randomBytes(32).toString("hex");
}
module.exports = {
  fail,
  uuid,
  str,
  email,
  integer,
  instant,
  hash,
  token,
  statuses,
  held,
};
