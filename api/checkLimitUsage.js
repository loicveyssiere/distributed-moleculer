"use strict";

const { logger } = require("../common/utils");


function checkLimitUsage(req, res, next) {
    logger.debug("/checkLimitUsage");
    next();
}

module.exports = checkLimitUsage;