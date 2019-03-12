'use strict';

const assert = require('assert');
const stream = require("stream");
var sinon = require('sinon');


const controller = require("../services/controller.service.js");
const worker = require("../services/worker.service.js");
const queuer = require("../services/queuer.service.js");
const { to, logger } = require("../utils/utils");

const datastore = require(global.APP_ROOT_DIR + "/../utils/datastore");

const s3 = require(global.APP_ROOT_DIR + "/../utils/s3");

sinon.stub(s3, "writeFile").resolves();
sinon.stub(s3, "readFile").resolves();
sinon.stub(s3, "deleteFile").resolves();

logger.level = 'error';

class Service {
    constructor(broker) {
        for (let actionKey in broker.services[1].schema.actions) {
            if (broker.services[1].schema.actions.hasOwnProperty(actionKey)) {
                let action = broker.services[1].schema.actions[actionKey]
                this[actionKey] = action
            }
        }
        this.broker = {}
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
    it('should be able to process an existing task', async function () {

        // Arrange
        let err, returnTask, workTask;
        var name = "taskName";
        var argStream = new stream.Readable(); argStream.push(name); argStream.push(null);
        const task = { user: "taskUser", name, priority: 0 };

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, workTask] = await to(cluster.worker.broker.call("controller.pullTask"));
        //var dbTask = await datastore.select(returnTask);
        //console.log(dbTask);

        // Assert
        assert.equal(err, null);
        assert.equal(returnTask._id, workTask._id);
        assert.equal(returnTask.status, "input");
        assert.equal(workTask.status, "work");
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);

    })
})