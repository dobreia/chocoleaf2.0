const express = require("express");
const publicRouter = require("./publicRoutes");
const admin = express.Router();
admin.use(require("./scheduleAdminRoutes"));
admin.use(require("./bookingAdminRoutes"));
admin.use(require("./recordsAdminRoutes"));
module.exports = { publicRouter, admin };
