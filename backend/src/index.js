const express = require("express"),
  cors = require("cors"),
  path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  quiet: true,
});
const pool = require("./db");
const { routes, requireAdmin, rateLimit } = require("./domain/auth");
const { publicRouter, admin } = require("./routes/systemRoutes");
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
const origins = (process.env.FRONTEND_URL || "http://localhost:5173").split(
  ",",
);
app.use(cors({ origin: origins, credentials: true }));
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), require('./routes/paymentRoutes').webhook);
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (req.path.startsWith("/api/admin") || req.path.includes("/auth"))
    res.set("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    !origins.includes(req.headers.origin)
  )
    return res.status(403).json({ message: "Nem engedélyezett kérésforrás." });
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (req.body === undefined) req.body = {};
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
      return res.status(400).json({ message: "Hibás kérésadatok." });
    if (req.body.active !== undefined && typeof req.body.active !== "boolean")
      return res
        .status(400)
        .json({ message: "Az aktív állapot igaz/hamis érték legyen." });
  }
  next();
});
app.get("/api/health", async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});
app.use("/api", require("./routes/mediaRoutes").router);
app.use("/api/auth", routes());
app.use("/api/admin/calendar-sync", require("./routes/calendarSyncRoutes").admin);
app.use("/api/calendar", require("./routes/calendarSyncRoutes").callback);
app.use("/api/admin", requireAdmin, admin);
app.use("/api", publicRouter);
app.use("/api/gallery", require("./routes/galleryRoutes"));
app.use("/api/transfer-info", require("./routes/transferRoutes"));
app.use('/api/payments', require('./routes/paymentRoutes').router);
app.use("/api/giftcard", rateLimit, require("./routes/giftcardRoutes"));
app.use("/api", (_req, res) =>
  res.status(404).json({ message: "Az API végpont nem található." }),
);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let message = err.status
    ? err.message
    : "A művelet nem sikerült. Próbáld újra később.";
  if (["22P02", "22007", "22008"].includes(err.code)) {
    status = 400;
    message = "Hibás azonosító vagy dátum.";
  }
  if (["23505", "23503", "23514"].includes(err.code)) {
    status = 409;
    message =
      "Az adatok ütköznek egy meglévő bejegyzéssel vagy megsértik az adatkorlátokat.";
  }
  if (err.type === "entity.too.large") { status=413; message="A feltöltött fájl vagy kérés túl nagy. Képeknél a korlát 5 MB."; }
  if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Hibás JSON kérés.";
  }
  if (err.type === "entity.too.large") {
    status = 413;
    message = "Túl nagy kérés.";
  }
  if (status >= 500) console.error("API error", err.code || err.name);
  res.status(status).json({ message });
});
module.exports = app;
if (require.main === module)
  require("./migrate")()
    .then(() => {
      const server = app.listen(process.env.PORT || 3001, process.env.HOST || undefined, () =>
        console.log("ChocoLeaf API elindult."),
      );
      const stopCalendarSync = require("./calendar/sync").start();
      const payments = setInterval(() => require('./payments/orders').work().catch(e => console.error('Payments worker:', e.code || e.name)), 15000);
      payments.unref();
      const worker = setInterval(
        () =>
          require("./domain/notifications")
            .deliver()
            .catch(() => {}),
        15000,
      );
      worker.unref();
      process.on("SIGTERM", () => {
        clearInterval(worker);
        clearInterval(payments);
        stopCalendarSync();
        server.close(() => pool.end());
      });
    })
    .catch((e) => {
      console.error("Az adatbázis nem indítható:", e.code || e.message);
      process.exitCode = 1;
      pool.end();
    });
