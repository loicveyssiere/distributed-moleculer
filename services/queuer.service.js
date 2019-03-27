'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;


const { ServiceBroker } = require("moleculer");
const { loadConfig, death, exit, to, logger } = require(global.APP_ROOT_DIR + "/../common/utils");
const s3 = require(global.APP_ROOT_DIR + "/../common/s3");
const DataStore = require(global.APP_ROOT_DIR + "/../common/datastore");
//const datastore = require(global.APP_ROOT_DIR + "/../common/datastore");

// Constants
const SERVICE_NAME = "queuer";

// Globals
let RUNNING = false;
let EXITING = false;

// Loading configuration
const config = loadConfig(SERVICE_NAME)

// Creating broker
const broker = new ServiceBroker(config);

// Service description
const service = {
    name: SERVICE_NAME,
    settings: {
        datastore: null
    },
    actions: {
        // external api
        createTask,
        deleteTask,
        statusTask,
        resultTask,
        // internal api
        pullTask,
        updateTask
    },
    methods: {
        reload,
        run // Background job
    },
    async started() {
        // Fired when `broker.start()` called.
        try {
            this.settings.datastore = new DataStore();
            this.reload();
            this.run();
        } catch (e) {
            logger.error(e);
        }
        setInterval(this.run, 1000);
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
        if (broker != null) logger.info("Exiting, waiting for current process to finish (5s)");
        EXITING = true;
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
 * Insert a new task in the queue data structure and update the storage
 * 
 * @info Molecular forces to use a specific interface for streams. The stream
 * needs the only param of ctx and other information goes to meta. 
 * @param {object} ctx.params Stream of the document to process
 * @param {object} ctx.meta Task with fields: name(string), id(string), priority(int)
 * @return {Task} A full Task object as described in the database 
 */
async function createTask(ctx) {
    let err, task, dataS3, filename;
    task = ctx.meta;
    logger.debug("create:", task);
    
    filename = s3.newFilename();
    task.input = `${filename}.in`;
    task.output = `${filename}.out`;

    [err, dataS3] = await to(s3.writeFile(ctx.params, task.input));
    if (err) { logger.error(err); throw err; }
    
    [err, task] = await to(this.settings.datastore.insert(task));
    if (err) { logger.error(err); throw err; }
    
    // generate a full global id
    task = toid(task);
    
    logger.debug("created:", task);
    this.broker.broadcast("worker.wakeup");
    
    return task;
}

/**
 * Delete a (finished) task form the storage queue and remove the associated
 * input and output files of the shared file system.
 * 
 * @param {object} ctx.params Task with field: id(string)
 * @return {Task} A full Task object as described in the database 
 */
async function deleteTask(ctx) {
    let err, task;
    task = ctx.params;
    logger.debug("delete:", task);
    task = fromid(task);
    //
    [err, task] = await to(this.settings.datastore.delete(task));
    if (err) { logger.error(err); throw err; }
    //
    [err] = await to(s3.deleteFile(task.input));
    if (err) { logger.error(err); }
    [err] = await to(s3.deleteFile(task.output));
    if (err) { logger.error(err); }
    //
    logger.debug("deleted:", task);
    return;
}

/**
 * Get information (status) of a specific task
 * 
 * @param {object} ctx.params Task with field: id(string)
 * @return {Task} A full Task object as described in the database 
 */
async function statusTask(ctx) {
    let err, task, filename;
    task = ctx.params;
    logger.debug("status:", task);
    //
    task = fromid(task);
    //
    [err, task] = await to(this.settings.datastore.select(task));
    if (err) { logger.error(err); throw err; }
    //
    task = toid(task);
    //
    logger.debug("statusd:", task);
    return task;
}

/**
 * Asynchronously retrieve a document, processed and finished
 * 
 * @param {object} ctx.params Task with field: id(string)
 * @return {Stream} Stream of the processed document 
 */
async function resultTask(ctx) {
    let err, task;
    task = ctx.params;
    logger.info("result:", task);
    
    task = fromid(task);
    
    [err, task] = await to(this.settings.datastore.select(task));
    if (err) { logger.error(err); throw err; }
    
    [err, stream] = await to(s3.readFile(task.input));
    if (err) { logger.error(err); throw err; }

    return stream;
}

/**
 * Get (and pop) a task from the current cluster queue with stored information
 * 
 * @return {Task} A full Task object as described in the database
 */
async function pullTask() {
    let err, task;
    [err, task] = await to(this.settings.datastore.take());
    if (err) { logger.error(err);  err; }
    if (!task) return null;
    
    task = toid(task);

    return task;
}

/**
 * Update task after being processed by a worker
 * 
 * @param {object} ctx The context, see the structure below
 * @param {object} ctx.params Task with field: id(string) TODO: check all fields
 */
async function updateTask(ctx) {
    let err, task;
    task = ctx.params;
    logger.info("update:", task);
    //
    task = fromid(task);
    //
    if (task.result === "success") {
        [err] = await to(this.settings.datastore.save(task));
        if (err) { logger.error(err); throw err; }
    } else {
        [err] = await to(this.settings.datastore.undo(task));
        if (err) { logger.error(err); throw err; }
    }
    //
    logger.info("updated: " + task.name +  task._id);
    return;
}

/* -----------------------------------------------------------------------------
    PRIVATE
----------------------------------------------------------------------------- */

// Helpers
let toid = t => { t.id = `${config.site}:${t._id}`; return t; }
let fromid = t => { t._id = t.id.split(':')[1]; return t; }

async function reload() {
    logger.debug("reload from database");
    await this.settings.datastore.reload();
}

async function run() {
    logger.debug("run called");

    // return if already RUNNING - placed here are run is called async'd
    if (RUNNING) return;

    // starting loop
    logger.debug("run loop started");
    RUNNING = true;
    while (!EXITING) {
        let err, stats;
        //
        if (!err) {
            [err, stats] = await to(this.settings.datastore.stats());
            if (err) { logger.error(err); }
        }
        //
        if (!err) {
            [err] = await to(this.broker.call("stealer.shareLog", stats));
            if (err) { logger.error(err); }
        }
        //
        RUNNING = false;
        return;
    }

    // EXITING
    exit(5000);
    await this.broker.stop();
    process.exit();
}