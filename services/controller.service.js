'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const { ServiceBroker } = require("moleculer");
const { loadConfig, death, exit, to, logger } = require(global.APP_ROOT_DIR + "/../utils/utils");

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
 * @param {object} ctx.meta Task with fields: name(string), id(string), priority(int)
 * @return {Task} A full Task object as described in the database 
 */
async function createTask(ctx) { //user,name,priority?
    let err, task, stream;
    task = ctx.meta;
    stream = ctx.params;
    [err, task] = await to(this.broker.call("queuer.createTask", stream, { meta: task }));
    if (err) { logger.error(err); throw err; } //TODO return xxx if failed
    return task;
}

/**
 * Entrypoint to remove a task from the queue with associated documents
 * 
 * @param {object} ctx Moleculer context, see the structure below
 * @param {object} ctx.params Task with field: id(string)
 * @return {Task} A full Task object as described in the database 
 */
async function deleteTask(ctx) { //user,id
    let err, task;
    task = ctx.params;
    [err, task] = await to(this.broker.call(`${store(task)}.deleteTask`, task));
    if (err) { logger.error(err); throw err; } //TODO return xxx if failed
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
    if (err) { logger.error(err); throw err; } //TODO: define return with 'missing' if not exists ?
    return task;
}

/**
 * @param {object} ctx Moleculer context, see the structure below
 * @param {object} ctx.params Task with field: id(string)
 * @return {Stream} Stream of the processed document  
 */
async function resultTask(ctx) {
    let err, task;
    task = ctx.params;
    [err, task] = await to(this.broker.call(`${store(task)}.resultTask`, task));
    if (err) { logger.error(err); throw err; } //TODO define return 404 if not exist 
    return stream;
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
        logger.debug("pull local:", task);
        return task;
    }
    [err, task] = await to(this.broker.call("stealer.pullTask"));
    if (err) { logger.error(err); }
    if (!err && task != null) {
        logger.debug("pull remote:", task);
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
async function updateTask(ctx) { //user,id,...
    let err;
    const task = ctx.params;
    if (task.result === "success") {
        logger.info("update:", task);
    } else {
        logger.warn("update:", task);
    }
    //
    [err] = await to(this.broker.call(`${store(task)}.updateTask`, task));
    if (err) { logger.error(err); throw err; }
}

/* -----------------------------------------------------------------------------
    PRIVATE
----------------------------------------------------------------------------- */

// Helpers
let store = task => { var site = task.id.split(":")[0]; return site === broker.options.site ? "queuer" : "stealer"; }



