"use strict";

const stream = require("stream");
const { loadConfig, death, exit, uuid, pipeline, to, logger, shortname, sleep }
    = require(global.APP_ROOT_DIR + "/../common/utils");

async function postTask(req, res, next) {
    logger.debug("/postTask");

    // For all elements in the body, create one task
    let promises = req.body.ocrTaskRequestElements.map(async requestBody => {
        let err, resultTask;
        let task = {
            priority: req.identity.params.priority,
            profile: requestBody.profile || "Default",
            userType: "REST",
            userId: req.identity.id,
            fileName: requestBody.fileName,
            outputType: requestBody.outputTypes.join(',')
        }
        let doc_stream = new stream.Readable();
        doc_stream.push(requestBody.contents);
        doc_stream.push(null);
        [err, resultTask] = await to(req.app.broker.call("controller.createTask", doc_stream, { meta: task }));
        if(err) {
            console.error(err);
            throw err;
        }

        return {
            taskId: resultTask.id,
            fileName: resultTask.fileName,
        };
    });

    // Get the results
    let results = await Promise.all(promises);

    // Return the response
    res.body = {
        ocrTaskResponseElements: results
    };

    return next();
}

/**
 * Get the processing status of the task.
 * Return 200 code if the document is available otherwise return 202,
 * the task is still in process.'
 */
async function getTaskStatus(req, res, next) {
    logger.debug("/getTaskStatus");

    let err, resultTask;
    const task = {id: req.params.taskId};
    [err, resultTask] = await to(req.app.broker.call("controller.statusTask", task));

    if (err) {
        logger.error(err);
        return next({status: 500, message: 'Internal Server Error'});
    }
    if (!resultTask || !resultTask.id || !resultTask.status) {
        return next({status: 404, message: 'Task does not exist'});
    }
    if (resultTask.userId != req.identity.id) {
        return next({status: 401, message: 'Task does not belong to you'});
    }

    if (resultTask.status !== "OUTPUT") {
        res.statusCode = 202;
    } else {
        res.statusCode = 200;
    }
    return next();
}

/**
 * Get the document corresponding to the task by downloading it
 */
async function getTask(req, res, next) {

    let err, resultTask, doc_stream;
    const task = {id: req.params.taskId};
    [err, resultTask] = await to(req.app.broker.call("controller.statusTask", task));

    if (err) {
        logger.error(err);
        return next({status: 500, message: 'Internal Server Error'});
    }
    if (!resultTask || !resultTask.id || !resultTask.status) {
        return next({status: 404, message: 'Task does not exist'});
    }
    if (resultTask.userId != req.identity.id) {
        return next({status: 401, message: 'Task does not belong to you'});
    }

    [err, doc_stream] = await to(req.app.broker.call("controller.resultTask", task));
    if (err) {
        logger.error(err);
        return next({status: 500, message: 'Internal Server Error'});
    }

    res.body = doc_stream;

    return next();

}

/**
 * Delete the corresponding task
 */
async function deleteTask(req, res, next) {
    logger.debug("/deleteTask");

    let err, resultTask;
    const task = {id: req.params.taskId};
    [err, resultTask] = await to(req.app.broker.call("controller.statusTask", task));

    if (err) {
        logger.error(err);
        return next({status: 500, message: 'Internal Server Error'});
    }
    if (!resultTask || !resultTask.id || !resultTask.status) {
        return next({status: 404, message: 'Task does not exist'});
    }
    if (resultTask.userId != req.identity.id) {
        return next({status: 401, message: 'Task does not belong to you'});
    }

    [err] = await to(req.app.broker.call("controller.deleteTask", task));
    if (err) {
        logger.error(err);
        return next({status: 500, message: 'Internal Server Error'});
    }

    return next();
}

/**
 * Get most of the available information about a given task
 */
async function getTaskDetails(req, res, next) {
    logger.debug("/getTaskDetails");

    let err, resultTask;
    const task = {id: req.params.taskId};
    [err, resultTask] = await to(req.app.broker.call("controller.statusTask", task));

    if (err) {
        logger.error(err);
        return next({status: 500, message: 'Internal Server Error'});
    }
    if (!resultTask || !resultTask.id || !resultTask.status) {
        return next({status: 404, message: 'Task does not exist'});
    }
    if (resultTask.userId != req.identity.id) {
        return next({status: 401, message: 'Task does not belong to you'});
    }

    res.body = {
        taskId: resultTask.id,
        status: resultTask.status,
        priority: resultTask.priority,
        profile: resultTask.profile,
        fileName: resultTask.fileName,
        fileSize: resultTask.fileSize,
        outputTypes: resultTask.outputType.split(','),
        submitDate: new Date(resultTask.submitTime).toISOString().substr(0, 19),
        startTime: new Date(resultTask.startTime).toISOString().substr(0, 19),
        duration: Math.ceil(resultTask.processDuration / 1000),
        tries: resultTask.tries
    };
    if (resultTask.errorMessage) {
        res.body.errorMessage = resultTask.errorMessage
    }
    return next();
}

/**
 * @deprecated Not implemented in this version
 * Get the document corresponding to the task and the type
 */
async function getTaskByType(req, res, next) {
    logger.debug("/getTaskByType");
    return next({status: 501, message: "Not Implemented"});
}

module.exports = {
    postTask,
    getTaskStatus,
    getTask,
    deleteTask,
    getTaskDetails,
    getTaskByType
}