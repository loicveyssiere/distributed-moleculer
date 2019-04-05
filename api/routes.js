"use strict";

const { loadConfig, death, exit, uuid, pipeline, to, logger, shortname, sleep }
    = require(global.APP_ROOT_DIR + "/../common/utils");

async function postTask(req, res, next) {
    console.log("/postTask");
    let err;
    //[err] = await to(req.app.broker.call("controller.updateTask", {test:"test"}));
    if(err) console.log(err);
    next();
}

function getTaskStatus(req, res, next) {
    console.log("/getTaskStatus");
    next();
}

function deleteTask(req, res, next) {
    console.log("/deleteTask");
    next();
}

function getTaskDetails(req, res, next) {
    console.log("/getTaskDetails");
    next();
}

function getTask(req, res, next) {
    console.log("/getTask");
    next();
}

module.exports = {
    postTask,
    getTaskStatus,
    deleteTask,
    getTaskDetails,
    getTask
}