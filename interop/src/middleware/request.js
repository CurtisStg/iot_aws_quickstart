"use strict";

const httpStatus = require("http-status");

const ApiError = require("../errors/ApiError");

const getMessageFromJoiError = (error) => {
  if (!error.details && error.message) {
    return error.message;
  }
  return error.details.map((details) => details.message).join(", ");
};

const requestMiddleware = (handler, options) => async (req, res, next) => {
  if (options?.validation?.body) {
    const { error } = options.validation.body.validate(req.body);
    if (error) {
      return next(
        new ApiError(httpStatus.BAD_REQUEST, getMessageFromJoiError(error))
      );
    }
  }

  try {
    await handler(req, res, next);
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = requestMiddleware;
