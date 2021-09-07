"use strict";

const compression = require("compression");
const express = require("express");
const helmet = require("helmet");
const httpStatus = require("http-status");
const serverlessHttp = require("serverless-http");

const interop = require("./routes/interop");
const authMiddleware = require("./middleware/auth");

const app = express();
const comp = compression();

app.use(comp);
app.use(express.json());
app.use(helmet());

app.get("/", (_, res) => res.sendStatus(httpStatus.OK));

app.get("/auth", authMiddleware, (_, res) => res.sendStatus(httpStatus.OK));

app.use("/interop", authMiddleware, interop);

app.use((err, _, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  return res.status(err.statusCode || 500).json({
    error: err.message,
  });
});

const handler = serverlessHttp(app);

module.exports = {
  handler,
  app,
};
