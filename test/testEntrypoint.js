'use strict';

const assert = require('assert');
const stream = require("stream");
var sinon = require('sinon');
var proxyquire = require('proxyquire');

// Here we need to mock the submodule imports
const utils = require("../utils/utils");
sinon.stub(utils, 'pipeline').resolves();
proxyquire("../services/worker.service.js", {"../utils/utils": utils});

const controller = require("../services/controller.service.js");
const worker = require("../services/worker.service.js");
const queuer = require("../services/queuer.service.js");

const datastore = require(global.APP_ROOT_DIR + "/../utils/datastore");
const s3 = require(global.APP_ROOT_DIR + "/../utils/s3");
const { to, logger } = require("../utils/utils");

// Here we stub the classes
sinon.stub(s3, "writeFile").resolves();
sinon.stub(s3, "readFile").resolves();
sinon.stub(s3, "deleteFile").resolves();

logger.level = 'error';

class Service {
    constructor(broker) {
        for (let actionKey in broker.services[1].schema.actions) {
            if (broker.services[1].schema.actions.hasOwnProperty(actionKey)) {
                let action = broker.services[1].schema.actions[actionKey];
                this[actionKey] = action;
            }
        }
        for (let methodKey in broker.services[1].schema.methods) {
            if (broker.services[1].schema.methods.hasOwnProperty(methodKey)) {
                let method = broker.services[1].schema.methods[methodKey];
                this[methodKey] = method;
            }
        }
        this.broker = {}
        this.broker.options = broker.options;
        this.broker.broadcast = function(string) {logger.debug("BROADCAST " + string);}; // mock
        this.broker.call = async function(name, params, opts) {
            var [service, method] = name.split('.')
            var meta = opts && opts.meta;
            if (!(service in cluster) || !(method in cluster[service])) {
                logger.debug("Test error")
            }
            return await cluster[service][method]({params, meta, opts})
        }
    }
}

const cluster = {
    controller: new Service(controller.broker),
    worker: new Service(worker.broker),
    queuer: new Service(queuer.broker)
}

//cluster.worker.syncSuccess = cluster.worker.success;

describe('MVP 1.0', function() {
    it('should be able to create a task and see it in the queue and the storage', async function() {

        // Arrange
        let err, returnTask, dbTask;
        var name = "taskName";
        var argStream = new stream.Readable(); argStream.push(name); argStream.push(null);
        const task = { user: "taskUser", name, priority: 0 };

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, dbTask] = await to(datastore.take());

        // Assert
        assert.equal(err, null);
        assert.equal(returnTask.name, task.name);
        assert.equal(returnTask.status, "input");        
        assert.equal(dbTask._id, returnTask._id);
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);
        //assert.deepEqual(dbTask, returnTask);

    });
    it('should be able to pull an existing task', async function () {

        // Arrange
        let err, returnTask, workTask;
        var name = "taskName";
        var argStream = new stream.Readable(); argStream.push(name); argStream.push(null);
        const task = { user: "taskUser", name, priority: 0 };

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, workTask] = await to(cluster.worker.broker.call("controller.pullTask"));

        // Assert
        assert.equal(err, null);
        assert.equal(returnTask._id, workTask._id);
        assert.equal(returnTask.status, "input");
        assert.equal(workTask.status, "work");
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);
    });
    it ("should be able to process an single, simple, existing task", async function () {
        //assert.fail("Not implemented")
        
        // Arrange
        let err, returnTask, workTask, successTask, dbTask;
        var name = "taskName";
        var argStream = new stream.Readable(); argStream.push(name); argStream.push(null);
        const task = { user: "taskUser", name, priority: 0 };
        var failure = sinon.spy(cluster.worker.failure);
        var success = sinon.stub(cluster.worker, "success");

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, workTask] = await to(cluster.worker.broker.call("controller.pullTask"));
        await cluster.worker.work(workTask);
        
        // Assert
        assert.equal(err, null);
        assert.equal(returnTask._id, workTask._id);
        assert.equal(returnTask.status, "input");
        assert.equal(workTask.status, "work");
        assert.equal(failure.callCount, 0);
        assert.equal(success.callCount, 1);
        assert.equal(success.getCall(0).args.length, 1);
        assert.equal(success.getCall(0).args[0].status, "work");
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);

        // Arrange 2
        successTask = success.getCall(0).args[0];
        success.restore();

        // Act 2
        await cluster.worker.success(successTask);
        [err, dbTask] = await to(datastore.select(workTask));

        // Assert 2
        assert.equal(dbTask.error, null);
        assert.equal(dbTask.status, "output");
    });

    it("should be able to split a task in 2 sub tasks", async function() {
        // Arrange
        let err, returnTask, workTask, successTask, dbTask;
        var name = "test-split#1";
        var argStream = new stream.Readable();
        argStream.push("line1"); argStream.push("\n"); argStream.push("line2");
        argStream.push(null);
        const task = { user: "taskUser", name, priority: 0 };
        var failure = sinon.spy(cluster.worker.failure);
        var success = sinon.stub(cluster.worker, "success");

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, workTask] = await to(cluster.worker.broker.call("controller.pullTask"));
        await cluster.worker.work(workTask);

        // Assert
        assert.equal(err, null);
        assert.equal(returnTask._id, workTask._id);
        assert.equal(returnTask.status, "input");
        assert.equal(workTask.status, "work");
        assert.equal(failure.callCount, 0);
        assert.equal(success.callCount, 1);
        assert.equal(success.getCall(0).args.length, 1);
        assert.equal(success.getCall(0).args[0].status, "work");
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);

        // Arrange 2
        successTask = success.getCall(0).args[0];
        success.restore();
        //console.log(successTask)

        // Act 2
        await cluster.worker.success(successTask);
        [err, dbTask] = await to(datastore.select(workTask));

        // Assert 2
        assert.equal(dbTask.error, null);
        //assert.equal(dbTask.status, "wait");
        //console.log(datastore.cache.cache[task.priority])
        //assert.equal(datastore.cache.cache[task.priority].isEmpty, false);
    });

    it("should be able to merge a task", async function() {
        assert.fail("Not implemented");
    });

    it("should be able to steal a task", async function() {
        assert.fail("Not implemented");
    });
})