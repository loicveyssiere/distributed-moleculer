"use strict";

const { uuid, logger } = require(global.APP_ROOT_DIR + "/../common/utils");

function filterMonitoring(req, res, next) {
    logger.debug("/filterMonitoring");

    req.metadata.endTime = new Date();

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
        uuid: uuid(),
        ip: req.ip,
        method: req.method,
        originalUrl: req.originalUrl,
        params: req.params,
        path: req.path,
        pathName: req.swagger.pathName,
        protocol: req.protocol,
        hostname: req.hostname,
        statusCode: res.statusCode,
        responseTime: req.metadata.endTime - req.metadata.startTime
        /*
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
        */
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