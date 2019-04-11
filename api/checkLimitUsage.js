"use strict";

function checkLimitUsage(req, res, next) {
    console.log("/checkLimitUsage");
    next();
}

module.exports = checkLimitUsage;