"use strict";

function checkSecurity(req, res, next) {
    console.log("/checkSecurity");
    next();
}

module.exports = checkSecurity;