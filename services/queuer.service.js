'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;


const { ServiceBroker } = require("moleculer");
const { loadConfig, death, exit, to, logger, shortname } = require(global.APP_ROOT_DIR + "/../common/utils");
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
 * @param {object} ctx.meta Task with fields: priority(int), profile(string),
 * userType(string), userId(string), fileName(string), outputType(string)
 * @return {Task} A full Task object as described in the database 
 */
async function createTask(ctx) {
    let err, task, dataS3, filename;
    task = ctx.meta;
    logger.debug("create:", task);
    
    filename = s3.newFilename();
    task.inputPath = `${filename}.in`;
    task.outputPath = `${filename}.out`;
    task.site = this.broker.options.site;
    task.hostName = shortname();

    [err, dataS3] = await to(s3.writeFile(ctx.params, task.inputPath));
    if (err) { logger.error(err); throw err; }
    
    [err, task] = await to(this.settings.datastore.insert(task));
    if (err) { logger.error(err); throw err; }
    
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

    [err, task] = await to(this.settings.datastore.delete(task));
    if (err) { logger.error(err); throw err; }

    [err] = await to(s3.deleteFile(task.inputPath));
    if (err) { logger.error(err); }
    [err] = await to(s3.deleteFile(task.outputPath));
    if (err) { logger.error(err); }
  
    return task;
}

/**
 * Get information (status) of a specific task
 * @info The status for a non existing task is by default null, no error is
 * expected. 
 * 
 * @param {object} ctx.params Task with field: id(string)
 * @return {Task} A full Task object as described in the database 
 */
async function statusTask(ctx) {
    let err, task;
    task = ctx.params;

    [err, task] = await to(this.settings.datastore.select(task));
    if (err) { logger.error(err); throw err; }

    return task;
}

/**
 * Asynchronously retrieve a document, processed and finished
 * 
 * @param {object} ctx.params Task with field: id(string)
 * @return {Stream} Stream of the processed document 
 */
async function resultTask(ctx) {
    let err, task, doc_stream;
    task = ctx.params;
    
    [err, task] = await to(this.settings.datastore.select(task));
    if (err) { logger.error(err); throw err; }
    
    [err, doc_stream] = await to(s3.readFile(task.inputPath));
    if (err) { logger.error(err); throw err; }

    return doc_stream;
}

/**
 * Get (and pop) a task from the current cluster queue with stored information
 * 
 * @return {Task} A full Task object as described in the database
 */
async function pullTask() {
    let err, task;
    [err, task] = await to(this.settings.datastore.take());
    if (err) { logger.error(err); }
    if (!task) return null;
    
    return task;
}

/**
 * Update task after being processed by a worker
 * 
 * @param {object} ctx The context, see the structure below
 * @param {object} ctx.params Task with field: id(string) TODO: check all fields
 */
async function updateTask(ctx) {
    let err, task, wakeup;
    task = ctx.params;

    if (task.mode === "failure") {
        [err, wakeup] = await to(this.settings.datastore.save_on_failure(task));
    } else if (task.mode === "simple") {
        [err, wakeup] = await to(this.settings.datastore.save_on_simple(task));
    } else if (task.mode === "child") {
        [err, wakeup] = await to(this.settings.datastore.save_on_child(task));
    } else if (task.mode === "split") {
        [err, wakeup] = await to(this.settings.datastore.save_on_split(task));
    } else if (task.mode === "merge") {
        [err, wakeup] = await to(this.settings.datastore.save_on_merge(task));
    } else {
        err = `${task.mode} task result not supported in updateTask`;
    }

    if (err) { logger.error(err); throw err; }

    // Add task to billing storage
    if (task.mode === "failure" || task.mode === "simple" || task.mode === "merge") {
        await(this.settings.datastore.billing(task.id));
    }

    if (wakeup) {
        this.broker.broadcast("worker.wakeup");
    }

    return;
}

/* -----------------------------------------------------------------------------
    PRIVATE
----------------------------------------------------------------------------- */

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