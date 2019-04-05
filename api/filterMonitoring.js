"use strict";

function filterMonitoring(req, res, next) {
    console.log("/filterMonitoring");

    req.app.filterLogger.log({
        level: levelFromStatus(req, res), message: message(req, res)
    });

    //next();
}

/* -----------------------------------------------------------------------------
    METHODS
----------------------------------------------------------------------------- */
function message(req, res) {
    return {
        req: {
            ip: req.ip,
            method: req.method,
            originalUrl: req.originalUrl,
            params: req.params,
            path: req.path,
            protocol: req.protocol,
            //body: req.body,
            hostname: req.hostname
        },
        res: {
            statusCode: res.statusCode,
            //body: res.body
        }
    }
}

function levelFromStatus(req, res) {
    var level = "";
    if (res.statusCode >= 100) { level = "info"; }
    if (res.statusCode >= 400) { level = "error"; }
    if (res.statusCode >= 500) { level = "error"; }
    return level;
}

module.exports = filterMonitoring;