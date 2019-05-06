'use strict';

const assert = require('assert');
const stream = require("stream");
const sinon = require('sinon');
const proxyquire = require('proxyquire');


// Here we need to mock the submodule imports

const projectPath = "../../"
console.log(__dirname)

const utils = require(projectPath + "common/utils");

sinon.stub(utils, 'pipeline').resolves();

const db_nedb = require(projectPath + "common/db_nedb");
const DataStore = proxyquire(projectPath + "common/datastore.js", {"../common/db_hbase": db_nedb});

proxyquire(projectPath + "services/worker.service.js", {"../common/utils": utils});

const controller = require(projectPath + "services/controller.service.js");
const worker = require(projectPath + "services/worker.service.js");
const queuer = require(projectPath + "services/queuer.service.js");
const stealer = require(projectPath + "services/stealer.service.js");

const s3 = require(projectPath + "common/s3");
const { to, logger } = require(projectPath + "common/utils");

// Here we stub the classes
sinon.stub(s3, "writeFile").resolves();
sinon.stub(s3, "readFile").resolves();
sinon.stub(s3, "deleteFile").resolves();

logger.level = 'info';

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
        this.settings = broker.services[1].schema.settings;
        this.broker.options = broker.options;
        this.broker.settings = broker
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
    queuer: new Service(queuer.broker),
    stealer: new Service(stealer.broker),
    dealer: new Service(stealer.globalBroker)
}

cluster.queuer.settings.datastore = new DataStore();
var datastore = cluster.queuer.settings.datastore;

describe('MVP 1.0', function() {
    it('should be able to create a task and see it in the queue and the storage', async function() {

        // Arrange
        let err, returnTask, dbTask;
        var name = "taskName";
        var argStream = new stream.Readable(); argStream.push(name); argStream.push(null);
        const task = {
            priority: 0,
            profile: "Default",
            userType: "WEB",
            userId: "XLOIC",
            fileName: "filename.pdf",
            outputType: "HTML,DOCX"
        };

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, dbTask] = await to(datastore.take());

        // Assert
        console.log(err)
        assert.equal(err, null);
        assert.equal(returnTask.fileName, task.fileName);
        assert.equal(returnTask.status, "INPUT");        
        assert.equal(dbTask.id, returnTask.id);
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);
        //assert.deepEqual(dbTask, returnTask);

    });
    it('should be able to pull an existing task', async function () {

        // Arrange
        let err, returnTask, workTask;
        var name = "taskName";
        var argStream = new stream.Readable(); argStream.push(name); argStream.push(null);
        const task = {
            priority: 0,
            profile: "Default",
            userType: "WEB",
            userId: "XLOIC",
            fileName: "filename.pdf",
            outputType: "HTML,DOCX"
        };

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, workTask] = await to(cluster.worker.broker.call("controller.pullTask"));

        // Assert
        assert.equal(err, null);
        assert.equal(returnTask.id, workTask.id);
        assert.equal(returnTask.status, "INPUT");
        assert.equal(workTask.status, "WORK");
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);
    });
    it ("should be able to process an single, simple, existing task", async function () {
        //assert.fail("Not implemented")
        
        // Arrange
        let err, returnTask, workTask, successTask, dbTask;
        var name = "taskName";
        var argStream = new stream.Readable(); argStream.push(name); argStream.push(null);
        const task = {
            priority: 0,
            profile: "Default",
            userType: "WEB",
            userId: "XLOIC",
            fileName: "filename.pdf",
            outputType: "HTML,DOCX"
        };
        var terminate = sinon.stub(cluster.worker, "terminate");

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, workTask] = await to(cluster.worker.broker.call("controller.pullTask"));
        await cluster.worker.work(workTask);
        
        // Assert
        assert.equal(err, null);
        assert.equal(returnTask.id, workTask.id);
        assert.equal(returnTask.status, "INPUT");
        assert.equal(workTask.status, "WORK");
        assert.equal(terminate.getCall(0).args.length, 3);
        assert.equal(terminate.getCall(0).args[0].status, "WORK");
        assert.equal(terminate.getCall(0).args[1], "simple");
        assert.equal(terminate.getCall(0).args[2], null);
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);

        // Arrange 2
        successTask = terminate.getCall(0).args[0];
        terminate.restore();

        // Act 2
        await cluster.worker.terminate(successTask, "simple", null);
        [err, dbTask] = await to(datastore.select(workTask));

        // Assert 2
        assert.equal(dbTask.error, null);
        assert.equal(dbTask.status, "OUTPUT");
    });

    it("should be able to split a task in 2 sub tasks", async function() {
        // Arrange
        let err, returnTask, workTask, successTask, dbTask;
        var name = "test-split#1";
        var argStream = new stream.Readable();
        argStream.push("line1"); argStream.push("\n"); argStream.push("line2");
        argStream.push(null);
        const task = {
            priority: 0,
            profile: "Default",
            userType: "WEB",
            userId: "XLOIC",
            fileName: "filename.pdf",
            outputType: "HTML,DOCX"
        };
        var terminate = sinon.stub(cluster.worker, "terminate");

        // Act
        [err, returnTask] = await to(cluster.controller.broker.call("controller.createTask", argStream, {meta: task}));
        [err, workTask] = await to(cluster.worker.broker.call("controller.pullTask"));
        await cluster.worker.work(workTask);

        // Assert
        assert.equal(err, null);
        assert.equal(returnTask.id, workTask.id);
        assert.equal(returnTask.status, "INPUT");
        assert.equal(workTask.status, "WORK");
        assert.equal(terminate.getCall(0).args.length, 3);
        assert.equal(terminate.getCall(0).args[0].status, "WORK");
        assert.equal(terminate.getCall(0).args[1], "split");
        assert.equal(terminate.getCall(0).args[2], null);
        assert.equal(datastore.cache.cache[task.priority].isEmpty, true);

        // Arrange 2
        successTask = terminate.getCall(0).args[0];
        terminate.restore();
        //console.log(successTask)

        // Act 2
        await cluster.worker.terminate(successTask, "split", null);
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

    it("should be able to reload the in-memory-queue from persistent data", async function() {
        // Arrange
        let task, returnTask1, returnTask2 , pullTask1, pullTask2;
        let err1, err2, err3, err4;
        const task1 = { user: "taskUser1", name:"name1", priority: 1, status:"input" };
        const task2 = { user: "taskUser2", name:"name2", priority: 0, status:"input" };

        // Act
        [err1, returnTask1] = await to(datastore.db.insert(task1));
        [err2, returnTask2] = await to(datastore.db.insert(task2));

        //assert.equal(datastore.cache.cache[0].isEmpty, true);
        await cluster.queuer.reload();

        //console.log(datastore.cache);
        //assert.equal(datastore.cache.cache['0'].isEmpty, false);
        [err3, pullTask1] = await to(cluster.worker.broker.call("controller.pullTask"));
        [err4, pullTask2] = await to(cluster.worker.broker.call("controller.pullTask"));

        await to(datastore.db.remove(returnTask1));
        await to(datastore.db.remove(returnTask2));

        // Assert
        assert.equal(err1, null);
        assert.equal(err2, null);
        assert.equal(err3, null);
        assert.equal(err4, null);
        assert.equal(datastore.cache.cache['0'].isEmpty, true);
        assert.equal(returnTask1.id, pullTask2.id);
        assert.equal(returnTask2.id, pullTask1.id);
    });
});