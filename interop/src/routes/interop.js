"use strict";

const { Router } = require("express");

const postInteropController = require("../controllers/postInterop");

const router = Router();

router.post("/", postInteropController);

module.exports = router;
