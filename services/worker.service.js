'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const { ServiceBroker } = require("moleculer");
const fs = require("fs");
const { loadConfig, death, exit, uuid, pipeline, to, logger, shortname, sleep }
    = require(global.APP_ROOT_DIR + "/../common/utils");
const s3 = require(global.APP_ROOT_DIR + "/../common/s3");
const shellExec = require(global.APP_ROOT_DIR + '/../common/shell-exec')

// Constants
const SERVICE_NAME = "worker";

// Globals
let RUNNING = false;
let EXITING = false;

logger.level("debug");

// Loading configuration
const config = loadConfig(SERVICE_NAME)

// Creating broker
const broker = new ServiceBroker(config);

// Service description
const service = {
    name: SERVICE_NAME,
    actions: {
        // Is empty as long as we use a "pulling" methodology
    },
    events: {
        "worker.wakeup": async function() {
            logger.debug("wakeup");
            this.run();
        }
    },
    methods: {
        success,
        failure,
        terminate,
        work,
        run // Background job
    },

    async started() {
        // Fired when `broker.start()` called.
        try {
            this.run();
        } catch (e) {
            logger.error(e);
        }
        setInterval(this.run, config.restartInterval);
    }
}

// Loading service
broker.createService(service);

// Entry-point of the micro-service (providing standalone and integration modes)
if (!module.parent) {
    broker.start();

    // Clean termination of the micro-service 
    death((_, err) => { 
        // SIGINT: Sent from CTRL-C.
        // SIGQUIT: Sent from keyboard quit action.
        // SIGTERM: Sent from operating system kill.
        exit(1000);
        if (err) { logger.error(err); }
        if (broker != null) logger.info("Exiting, waiting for current process to finish");
        EXITING = true;
    });
} else {
    module.exports = {
        broker: broker
    }
}

/* -----------------------------------------------------------------------------
    PRIVATE
----------------------------------------------------------------------------- */
/**
 * Termination of a single job in case of no error
 */
async function success(task) {
    let err;
    task.result = "success";
    task.hostname = shortname();
    //logger.info("success:", task);
    [err] = await to(this.broker.call("controller.updateTask", task));
    if (err) { logger.error(err); }
    return;
}

/**
 * Termination of a single job in case of errors
 */
async function failure(task, error) {
    let err;
    task.result = "failure";
    task.hostname = shortname();
    task.error = error.message || error.code || error;
    logger.info("failure:", task);
    [err] = await to(this.broker.call("controller.updateTask", task));
    if (err) { logger.error(err); }
}

/**
 * Termination of the task before update
 * 
 * @param {object} task 
 * @param {string} mode failure | simple | child | split | merge
 * @param {Error} error 
 */
async function terminate(task, mode, error) {
    let err;
    if (error || mode == "failure") {
        task.mode = "failure";
        task.error = error.message || error.code || error;
    } else {
        task.mode = mode;
    }
    [err] = await to(this.broker.call("controller.updateTask", task));
    if (err) { logger.error(err); }
}

/**
 * A full processing job
 */
async function work(task) {
    let err = null;
    let mode = null;

    // prepare parameters
    var json = {
        ...task
    }

    if (task.parentId) {
        mode = "child"
    } else {
        mode = "simple"
    }

    // 1 - Get documents from S3 -----------------------------------------------
    if (!err) {
        // MERGE MODE 
        if (task.children) {
            mode = "merge"
            logger.debug("MERGE MODE JS")
            var input;
            var tempName = uuid();
            json.children = task.children;
            
            for (let [index, child] of json.children.entries()) {

                child.tempInput = `/tmp/${tempName}.${index}.part.in`;

                // get stream from s3
                [err, input] = await to(s3.readFile(child.output));
                logger.warn("READ S3 " + child.output);

                if (!err) {
                    [err] = await to(pipeline(input, fs.createWriteStream(child.tempInput)));
                    
                }   
            }

        } else { // SPLIT MODE or NORMAL MODE
            logger.debug("NORMAL MODE JS");
            var input;
            var tempName = uuid();
            
            json.tempInput = `/tmp/${tempName}.in`;

            // get stream from s3
            [err, input] = await to(s3.readFile(json.input));
            logger.warn("READ S3 " + json.input);
    
            // save stream to tempInput
            if (!err) {
                [err] = await to(pipeline(input, fs.createWriteStream(json.tempInput)));
            }
        }
    }
    
    // 2 - Call the processing function ----------------------------------------
    if (!err) {
        try {
            // Don't forget to add permission to the script (chmod a+x)
            let promise = shellExec(this.broker.options.exec);
            promise.child.stdin.write(JSON.stringify(json))
            promise.child.stdin.end();

            let outputs // stdout, stderr, cmd, code
            [err, outputs] = await to(promise);
            logger.info("stderr: " + outputs.stderr)
            
            var resultTask = outputs && outputs.stdout && JSON.parse(outputs.stdout);
            logger.info(JSON.stringify(resultTask))

        } catch (e) {
            err = e;
        }
    }

    // 3 - Push the documents to S3 --------------------------------------------
    if (!err) {
        if (resultTask.tempOutput) { // MERGE OR NORMAL MODE
            logger.info("MERGE OR NORMAL")
            [err] = await to(s3.writeFile(fs.createReadStream(resultTask.tempOutput), resultTask.output));
            logger.warn("WRITE S3 " + resultTask.output);
        } else {
            logger.info("SPLIT")
            mode = "split";
            for (let child of resultTask.children) {
                var filename = s3.newFilename();
                child.input = `${filename}.in`;
                child.output = `${filename}.out`;
                [err] = await to(s3.writeFile(fs.createReadStream(child.tempOutput), child.input));
                logger.warn("WRITE S3 " + child.input);
            }
        }
    }

    // 4 - Clean temp files ----------------------------------------------------
    if (!err) {
        if (resultTask.tempInput) {
            fs.unlink(resultTask.tempInput, () => { });
        }
        if (resultTask.tempOutput) {
            fs.unlink(resultTask.tempOutput, () => { });
        }
        for (let child in json.children) {
            if (child.tempInput) {
                fs.unlink(child.tempInput, () => { });
            }
            if (child.tempOutput) {
                fs.unlink(child.tempOutput, () => { });
            }
        }

        if (!task.children && resultTask.children) {
            task.children = [];
            for (let child of resultTask.children) {
                task.children.push({
                    input: child.input,
                    output: child.output
                });
            }
        } else if (task.children && resultTask.children) {
            for (let child in resultTask.children) {
                if (child.output) {
                    [err] = await to(s3.deleteFile(child.output));
                }
                delete task.children; // FIXME: we should do better
            }  
        }
    }

    // 5 - Finalization of the task: failure | success -------------------------
    // return result async, so we can start next task asap
    logger.warn(mode);
    this.terminate(task, mode, err);
}

/**
 * The time infinite loop that pull tasks and process them
 */
async function run() {
    logger.debug("run called");

    // return if already RUNNING - placed here are run is called async'd
    if (RUNNING) return;

    // starting loop
    logger.debug("run loop started");
    RUNNING = true;
    while (!EXITING) {
        let err, task;
        // get a task to process
        [err, task] = await to(this.broker.call("controller.pullTask"));
        if (err) { logger.error(err); }

        // if no task, just go to sleep
        if (task == null) {
            RUNNING = false;
            logger.debug("run loop stopped");
            return;
        }

        // if task found, process it
        logger.info("task:", task);

        // Do the job, here await the job to finish
        await this.work(task);  
    }

    // EXITING
    exit(config.exitWaitTime);
    await this.broker.stop();
    process.exit();
}
