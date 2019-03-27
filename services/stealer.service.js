'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const { ServiceBroker } = require("moleculer");
const { loadConfig, death, nodeid, exit, uuid, to, logger } = require(global.APP_ROOT_DIR + "/../common/utils");

// Constants
const SERVICE_NAME = "stealer";
const states = {};

// Create cluster broker
const config = loadConfig(SERVICE_NAME);
const broker = new ServiceBroker(config);

// Create worldwide broker
const globalConfig = loadConfig("global");
const globalBroker = new ServiceBroker(globalConfig);

const service = {
    name: "stealer",
    settings: {
        globalBroker: globalBroker
    },
    actions: {
        pullTask,
        updateTask,
        shareLog
    }
}
const globalService = {
    name: `global-${globalConfig.site}`,
    settings: {
        broker: broker
    },
    actions: {
        pullTask: global_pullTask,
        pullTaskInput: global_pullTaskInput,
        updateTask: global_updateTask
    },
    events: {
        "backlog.state": event_backlog
    }
}

// Loading service
broker.createService(service);
globalBroker.createService(globalService);

// Entry-point of the micro-service (providing standalone and integration modes)
if (!module.parent) {
    broker.start();
    globalBroker.start();

    death(async (_, err) => {
        // SIGINT: Sent from CTRL-C.
        // SIGQUIT: Sent from keyboard quit action.
        // SIGTERM: Sent from operating system kill.
        exit(5000);
        if (err) { logger.error(err); }
        if (broker != null) logger.info("Exiting, waiting for current process to finish");
        await globalBroker.stop();
        await broker.stop();
        process.exit();
    });
} else {
    module.exports = {
        broker: broker,
        globalBroker: globalBroker
    }
}

/* -----------------------------------------------------------------------------
    ACTIONS
----------------------------------------------------------------------------- */
async function pullTask() {
    let err;
    logger.debug("pullTask called");
    let maxState = null;
    for (let state of Object.values(states)) {
        if (state.hasTasks >= 0) {
            if (!maxState || state.maxPriority > maxState.maxPriority) {
                maxState = state;
            }
        }
    }
    if (maxState != null) {
        const action = `global-${maxState.source}.pullTask`;
        const actionInput = `global-${maxState.source}.pullTaskInput`;
        let task;
        [err, task] = await to(this.settings.globalBroker.call(action));
        if (err) { logger.error(err); return null; }
        if (task == null) { return null; }
        [err, input] = await to(this.settings.globalBroker.call(actionInput, task));
        if (err) { logger.error(err); return null; }
        [err] = await to(s3.writeFile(input, task.input))
        if (err) { logger.error(err); return null; }
        logger.debug("remoteTask:", task);
        return task;
    }
    return null;
}

async function updateTask(ctx) {
    let err;
    const task = ctx.params;
    logger.info("updateTask:", task);
    const site = task.id.split(":")[0];
    const action = `global-${site}.updateTask`;
    let output;
    if (task.result === "success") {
        [err, output] = await to(s3.readFile(task.output));
        if (err) {
            logger.error(err);
            task.result = "failure";
        }
    }
    [err] = await to(this.settings.globalBroker.call(action, output, { meta: task }));
    if (err) { logger.error(err); }
    s3.deleteFile(task.input);
    s3.deleteFile(task.output);
}

async function shareLog(ctx) {
    const state = { ...ctx.params, source: globalConfig.site };
    logger.debug("shareLog:", state);
    this.settings.globalBroker.broadcast("backlog.state", state);
}

async function global_pullTask() {
    let err, task;
    logger.debug("pullTask called");
    [err, task] = await to(this.settings.broker.call("queuer.pullTask"));
    if (err) { logger.error(err); return null; }
    if (task == null) return null;
    return task;
}

async function global_pullTaskInput(ctx) {
    let err;
    [err, input] = await to(s3.readFile(ctx.params.input));
    if (err) { logger.error(err); return null; }
    return input;
}

async function global_updateTask(ctx) {
    let err;
    const task = ctx.meta;
    logger.debug("updateTask:", task);
    if (task.result === "success") {
        [err] = await to(s3.writeFile(ctx.params, ctx.meta.output));
        if (err) {
            logger.error(err);
            task.result = "failure";
        }
    }
    [err] = await to(this.settings.broker.call("queuer.updateTask", task));
    if (err) { logger.error(err); }
}

/* -----------------------------------------------------------------------------
    EVENTS
----------------------------------------------------------------------------- */
async function event_backlog(state) {
    if (state.source === globalConfig.site) return;
    const now = new Date();
    state.date = now;
    logger.debug("state:", state);
    states[state.source] = state;
    for (let state of Object.values(states)) {
        if (now - state.date > 10000) {
            states[state.source] = undefined;
        }
    }
    if (state.hasTasks) {
        this.settings.broker.broadcast("worker.wakeup");
    } 
}