"use strict";

const { logger, to } = require("../common/utils");

function checkSecurity(req, res, next) {
    logger.debug("/checkSecurity");

    // check for basic auth header
    if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
        return next({status: 401, message: 'Missing Authorization Header'});
    }

    // Get auth credentials form headers
    const base64Credentials =  req.headers.authorization.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [userId, apiKey] = credentials.split(':');
    
    // Get user information from database or cache
    let users = req.app.cache.get("users");
    req.identity = users[userId] || {}
    if (req.identity.params) {
        req.identity.params = req.identity.params;
    }

    // Check apiKey
    if (apiKey != req.identity.keyHash) {
        return next({status: 401, message: 'Wrong API Key'});
    }

    // Check Limit Usage
    

    return next();
}

module.exports = checkSecurity;