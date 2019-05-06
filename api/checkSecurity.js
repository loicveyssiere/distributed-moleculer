"use strict";

const { logger, to } = require("../common/utils");
const CacheSingleton = require('./cache');
const crypto = require('crypto');

function checkSecurity(req, res, next) {
    logger.debug("/checkSecurity");

    const cache = CacheSingleton.getInstance();

    // check for basic auth header
    if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
        return next({status: 401, message: 'Missing Authorization Header'});
    }

    // Get auth credentials form headers
    const base64Credentials =  req.headers.authorization.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [userId, apiKey] = credentials.split(':');    
    // Get user information from database or cache
    let users = cache.get("users");
    req.identity = users[userId] || {}
    if (req.identity.params) {
        req.identity.params = req.identity.params;
    }

    var hashKey = crypto.createHash('md5').update(apiKey).digest('hex');

    // Check apiKey
    if (!apiKey || !hashKey || hashKey !== req.identity.keyHash) {
        return next({status: 401, message: 'Wrong API Key'});
    }

    return next();
}

module.exports = checkSecurity;