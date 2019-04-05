"use strict";

function checkOutputModel(req, res, next) {
    console.log("/checkOutputModel");
    next();
}

module.exports = checkOutputModel;