'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const { ServiceBroker } = require("moleculer");
const fs = require("fs");
const { loadConfig, death, exit, uuid, pipeline, to, logger, shortname, sleep }
    = require(global.APP_ROOT_DIR + "/../utils/utils");
const s3 = require(global.APP_ROOT_DIR + "/../utils/s3");
const shellExec = require(global.APP_ROOT_DIR + '/../utils/shell-exec')

// Constants
const SERVICE_NAME = "worker";

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
        run // Background job
    },

    async started() {
        // Fired when `broker.start()` called.
        try {
            this.run();
        } catch (e) {
            logger.error(e);
        }
        setInterval(this.run, 5000);
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
async function success(task) {
    let err;
    task.result = "success";
    task.hostname = shortname();
    //logger.info("success:", task);
    [err] = await to(this.broker.call("controller.updateTask", task));
    if (err) { logger.error(err); }
}

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

        // 1 - Get documents from S3 -------------------------------------------
        var tempInput, tempOutput
 
        if (!err) {
            // MERGE MODE 
            if (task.children) {
                console.log("MERGE MODE JS")
                var input;
                var tempName = uuid();
                tempOutput = `/tmp/${tempName}.out`;

                for (let [index, child] of task.children.entries()) {

                    child.tempInput = `/tmp/${tempName}.in.${index}`;
                    // get stream from s3
                    [err, input] = await to(s3.readFile(child.input));
                    logger.warn("READ S3 " + child.input);

                    if (!err) {
                        [err] = await to(pipeline(input, fs.createWriteStream(child.tempInput)));
                        
                    }   
                }

            } else { // SPLIT MODE or NORMAL MODE
                console.log("NORMAL MODE JS")
                var input;
                var tempName = uuid();
                tempInput = `/tmp/${tempName}.in`;
                tempOutput = `/tmp/${tempName}.out`;

                // get stream from s3
                [err, input] = await to(s3.readFile(task.input));
                logger.warn("READ S3 " + task.input);
        
                // save stream to tempInput
                if (!err) {
                    [err] = await to(pipeline(input, fs.createWriteStream(tempInput)));
                }
            }
        }
        
        // 2 - Call the processing function ------------------------------------
        if (!err) {
            try {
                // Don't forget to add permission to the script (chmod a+x)
                let promise = shellExec(this.broker.options.exec);
                var json = {
                    ...task,
                    tempInput,
                    tempOutput
                } 
                promise.child.stdin.write(JSON.stringify(json))
                promise.child.stdin.end();

                let outputs // stdout, stderr, cmd, code
                [err, outputs] = await to(promise);
                console.log(outputs.stderr)
                
                var result = outputs && outputs.stdout && JSON.parse(outputs.stdout);
                logger.info(JSON.stringify(result))

            } catch (e) {
                err = e;
            }
        }

        // 3 - Push the documents to S3 ----------------------------------------
        if (!err) { 
            if (result.children) { // SPLIT MODE 
                for (let child of result.children) {
                    var filename = s3.newFilename();
                    child.input = `${filename}.in`;
                    child.output = `${filename}.out`;
                    [err] = await to(s3.writeFile(fs.createReadStream(child.tempInput), child.input));
                    logger.warn("WRITE S3 " + child.input)
                }
            } else { // MERGE or NORMAL MODE
                [err] = await to(s3.writeFile(fs.createReadStream(result.tempOutput), result.output));
                logger.warn("WRITE S3 " + result.output);
            }
            
        }


        // 4 - Clean temp files ------------------------------------------------
        if (!err) {
            if (result.children) {
                task.children = result.children;
            }

            fs.unlink(tempInput, () => { });
            fs.unlink(tempOutput, () => { });
            if (task.children) {
                for (let child of task.children) {
                    fs.unlink(child.tempInput, () => { })
                }
            }
            if (result.children) {
                for (let child of result.children) {
                    fs.unlink(child.tempInput, () => { })
                }
            } 
        }


        // 5 - Finalization of the task: failure | success ---------------------
        // return result async, so we can start next task asap
        if (err) {
            this.failure(task, err);
            logger.warn("PB");
            console.log(err)
            logger.error(err);
        } else {
            this.success(task);
        }
    }

    // EXITING
    exit(5000);
    await this.broker.stop();
    process.exit();
}
