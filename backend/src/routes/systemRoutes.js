const express = require("express");
const publicRouter = require("./publicRoutes");
const admin = express.Router();
admin.use(require("./scheduleAdminRoutes"));
admin.use(require("./bookingAdminRoutes"));
admin.use(require("./recordsAdminRoutes"));
admin.use(require('./mailAdminRoutes'));
module.exports = { publicRouter, admin };
