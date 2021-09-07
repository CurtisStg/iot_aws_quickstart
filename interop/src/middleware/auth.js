"use strict";

const { createVerifier } = require("fast-jwt");
const fs = require("fs");
const got = require("got");
const cacheManager = require("cache-manager");
const cache = cacheManager.caching({
  store: "memory",
  max: 10,
  ttl: 600 /*seconds*/,
});

const ApiError = require("../errors/ApiError");

const aud = process.env.AUDIENCE;
const verifyCacheKey = "verifier";
const isLocal = process.env.IS_LOCAL && process.env.IS_LOCAL == 1;

const publicKeyURL =
  "https://cirrent-quickstarts.s3.us-west-2.amazonaws.com/interop-public.key";

async function authMiddleware(req, res, next) {
  if (!req.headers || !req.headers.authorization) {
    return next(new ApiError(401, "Missing Authorization Header"));
  }

  const parts = req.headers.authorization.split(" ");

  if (parts.length != 2) {
    return next(new ApiError(401, "Token invalid"));
  }

  const scheme = parts[0];
  const credentials = parts[1];

  if (!/^Bearer$/i.test(scheme)) {
    return next(
      new ApiError(401, "Authorization Header must contain Bearer Token")
    );
  }

  let verify = await cache.get(verifyCacheKey);

  if (!verify) {
    try {
      verify = await fetchPublicKey();
    } catch (err) {
      return next(new ApiError(401, "Error creating token verifier"));
    }
  }

  if (!aud) {
    return next(new ApiError(401, "Audience not configured"));
  }

  try {
    verify(credentials);
  } catch (err) {
    return next(new ApiError(401, "Cannot verify and decode token"));
  }

  next();
}

async function fetchPublicKey() {
  let publicKey;

  if (isLocal) {
    publicKey = fs.readFileSync("./tests/cert/test-public.key");
  } else {
    const dl = await got(publicKeyURL);

    if (dl.rawBody) {
      publicKey = dl.rawBody;
    }
  }

  if (publicKey && aud) {
    const verify = createVerifier({
      key: publicKey,
      allowedAud: aud,
    });
    await cache.set(verifyCacheKey, verify);

    return verify;
  } else {
    throw new Error("Cannot create verifier");
  }
}

module.exports = authMiddleware;
