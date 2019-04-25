'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const { ServiceBroker } = require("moleculer");
const { loadConfig, death, exit, to, logger } = require(global.APP_ROOT_DIR + "/../common/utils");

// Constants
const SERVICE_NAME = "controller";

// Loading configuration
const config = loadConfig(SERVICE_NAME)

// Creating broker
const broker = new ServiceBroker(config);

// Service description
const service = {
    name: SERVICE_NAME,
    actions: {
        // external api
        createTask,
        deleteTask,
        statusTask,
        resultTask,
        // internal api
        pullTask,
        updateTask
    }
}

// Loading service
broker.createService(service);

// Entry-point of the micro-service (providing standalone and integration modes)
if (!module.parent) {
    broker.start();

    death(async (_, err) => {
        // SIGINT: Sent from CTRL-C.
        // SIGQUIT: Sent from keyboard quit action.
        // SIGTERM: Sent from operating system kill.
        exit(5000);
        if (err) { logger.error(err); }
        if (broker != null) logger.info("Exiting, waiting for current process to finish");
        await broker.stop();
        process.exit();
    });
} else {
    module.exports = {
        broker: broker
    }
}

/* -----------------------------------------------------------------------------
    ACTIONS
----------------------------------------------------------------------------- */
/**
 * Entrypoint for Queuing new task to process
 * 
 * @info Molecular forces to use a specific interface for streams. The stream
 * needs the only param of ctx and other information goes to meta. 
 * @param {object} ctx Moleculer context, see the structure below
 * @param {object} ctx.params Stream of the document to process
 * @param {object} ctx.meta Task with fields: priority(int), profile(string),
 * userType(string), userId(string), fileName(string), outputType(string)
 * @return {Task} A full Task object as described in the database 
 */
async function createTask(ctx) {
    let err, task, stream;
    task = ctx.meta;
    stream = ctx.params;
    [err, task] = await to(this.broker.call("queuer.createTask", stream, { meta: task }));
    if (err) { logger.error(err); throw err; }
    return task;
}

/**
 * Entrypoint to remove a task from the queue and associated documents
 * 
 * @param {object} ctx Moleculer context, see the structure below
 * @param {object} ctx.params Task with field: id(string)
 * @return {Task} A full Task object as described in the database 
 */
async function deleteTask(ctx) {
    let err, task;
    task = ctx.params;
    [err, task] = await to(this.broker.call(`${store(task)}.deleteTask`, task));
    if (err) { logger.error(err); throw err; }
    return task;
}


/**
 * Entrypoint to get information (status) of a specific task
 * 
 * @param {object} ctx Moleculer context, see the structure below
 * @param {object} ctx.params Task with field: id(string)
 * @return {Task} A full Task object as described in the database 
 */
async function statusTask(ctx) {
    let err, task;
    task = ctx.params;
    [err, task] = await to(this.broker.call(`${store(task)}.statusTask`, task));
    if (err) { logger.error(err); throw err; }
    return task;
}

/**
 * @param {object} ctx Moleculer context, see the structure below
 * @param {object} ctx.params Task with field: id(string)
 * @return {Stream} Stream of the processed (result) document  
 */
async function resultTask(ctx) {
    let err, task, doc_stream;
    task = ctx.params;
    [err, doc_stream] = await to(this.broker.call(`${store(task)}.resultTask`, task));
    if (err) { logger.error(err); throw err; } //TODO define return 404 if not exist 
    return doc_stream;
}

/**
 * Get a task for processing in the current cluster queue. If empty check a 
 * remote queue for job stealing
 * 
 * @return TODO: we should return something better here 
 */
async function pullTask() {
    let err, task;
    [err, task] = await to(this.broker.call("queuer.pullTask"));
    if (err) { logger.error(err); }
    if (!err && task != null) {
        return task;
    }
    [err, task] = await to(this.broker.call("stealer.pullTask"));
    if (err) { logger.debug(err); }
    if (!err && task != null) {
        logger.info(`stealer pulling the task ${task.id}`);
        return task;
    }
    return null;
}

/**
 * Update task after being processed by a worker
 * 
 * @param {object} ctx Moleculer context, see the structure below
 * @param {object} ctx.params Task with field: id(string) TODO: check all fields
 * TODO: Should return the updateTask??
 */
async function updateTask(ctx) {
    let err;
    const task = ctx.params;
    [err] = await to(this.broker.call(`${store(task)}.updateTask`, task));
    if (err) { logger.error(err); throw err; }
}

/* -----------------------------------------------------------------------------
    PRIVATE
----------------------------------------------------------------------------- */

// Helpers
let store = task => { var site = task.site; return (!site) || (site === broker.options.site) ? "queuer" : "stealer"; }



