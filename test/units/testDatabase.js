'use strict';

const assert = require('assert');
var sinon = require('sinon');
const { uuid, logger, to } = require("../../common/utils");
//const bdd = require("../common/db_nedb");

const db_nedb = require("../../common/db_nedb");
const database_nedb = new db_nedb();

const db_hbase = require("../../common/db_hbase");
const database_hbase = new db_hbase({
    family: 'C',
    primary: 'id',
    schema: 'onv_ocr',
    table: 'task'
});
/*
describe('neDB', function() {

    it ('should return null object if id is null on get call', async function() {
        await return_null_on_get(database_nedb);
    });
    
    it('should be able to insert, get and delete a task', async function() {
        await insert_get_delete(database_nedb);
    });

    it('should be able to update (set) an existing task', async function() {
        await update(database_nedb);
    });

    it ("should to able to check before updating a task in one database call", async function() {
        await check_and_update(database_nedb);
    });

    it ("should be able to check, update and increment a task", async function() {
        await check_update_increment(database_nedb);
    });

    it("should be able to increment selected task field", async function() {
        await increment(database_nedb);
    });

    it("should be able to increment atomically selected task fields on distributed calls", async function() {
        await atomic_increment(database_nedb);
    });

    it ("should be able to scan tasks in the persistent database", async function() {
        await scan(database_nedb);
    });
});
*/
describe('HBase', function() {

    it ('should return null object if id is null on get call', async function() {
        await return_null_on_get(database_hbase);
    });

    it('should be able to insert, get and delete a task', async function() {
        await insert_get_delete(database_hbase);
    });

    it('should be able to update (set) an existing task', async function() {
        await update(database_hbase)
    });

    it ("should to able to check before updating a task in one database call", async function() {
        await check_and_update(database_hbase);
    });

    it ("should be able to check, update and increment a task", async function() {
        await check_update_increment(database_hbase);
    });

    it("should be able to increment selected task field", async function() {
        await increment(database_hbase);
    });

    it("should be able to increment atomically selected task fields on distributed calls", async function() {
        await atomic_increment(database_hbase);
    });

    it ("should be able to scan tasks in the persistent database", async function() {
        await scan(database_hbase);
    });
});

/* -----------------------------------------------------------------------------
    METHODS
----------------------------------------------------------------------------- */
function getInputTask(priority) {
    let stringPriority = ("0000" + priority).slice(-4);
    return {
        id: `${stringPriority}.${uuid()}`, // "0000.abcd",
        status: "input",
        priority: priority,
        profile: "Default",
        userType: "WEB",
        userId: "veyssiere",
        inputPath: "input",
        outputPath: "output",
        submitTime: 1234,
        startTime: 1234,
        userDuration: 0,
        processDuration: 0,
        tries: 8,
        hostName: "host",
        errorMessage: null,
        childrenCompleted: 2,
        childrenArray: [{a: "a"}, {a: "b"}]
    } 
}

async function return_null_on_get(database) {
    
    let err, getTask;
    [err, getTask] = await to(database.get(null));
    assert.equal(err, null);
    assert.equal(getTask, null);

}

async function insert_get_delete(database) {
    // Arrange
    let err1, err2, err3, err4;
    let inputTask = getInputTask(0);
    let insertTask, getTask, removeTask, noTask;
    
    // Act
    [err1, insertTask] = await to(database.insert(inputTask));
    [err2, getTask] = await to(database.get(inputTask.id));
    [err3, removeTask] = await to(database.remove(insertTask.id));
    [err4, noTask] = await to(database.get(insertTask.id));
    
    // Assert
    assert.equal(err1, null);
    assert.equal(err2, null);
    assert.equal(err3, null);
    assert(err4 == null || err4 == "Item not existing");
    
    assert(insertTask != null);
    assert.deepEqual(insertTask, getTask);
    //assert.equal(removeTask, 1);
    assert.equal(noTask, null);
}

async function update(database) {
    // Arrange
    let err1, err2, err3, err4;
    let inputTask = getInputTask(0);
    let insertTask, updateTask, getTask, removeTask;

    // Act
    [err1, insertTask] = await to(database.insert(inputTask));
    [err2, updateTask] = await to(database.update(insertTask.id, {
        check: null, 
        set: {
            status: "output",
            outputPath: "new_output"
        },
        increment: null,
        returnTask: true
    }));
    [err3, getTask] = await to(database.get(insertTask.id));
    [err4, removeTask] = await to(database.remove(insertTask.id));

    // Assert
    assert.equal(err1, null);
    assert.equal(err2, null);
    assert.equal(err3, null);
    assert.equal(err4, null);

    assert(insertTask != null);
    assert(updateTask != null);
    assert(getTask != null);
    assert(removeTask != null);

    assert.deepEqual(updateTask, getTask);
    assert.equal(getTask.status, "output");
    assert.equal(getTask.outputPath, "new_output");
}

async function check_and_update(database) {
    // Arrange
    let err1, err2, err3, err4, err5, err6;
    let inputTask = getInputTask(0);
    let insertTask, updateTask1, updateTask2, getTask1, getTask2, removeTask;

    // Act
    [err1, insertTask] = await to(database.insert(inputTask));
    [err2, updateTask1] = await to(database.update(insertTask.id, {
        check: {status:"work"}, 
        set: {
            status: "output1",
            outputPath: "new_output1"
        },
        increment: null,
        returnTask: true
    }));
    [err3, getTask1] = await to(database.get(insertTask.id));

    [err4, updateTask2] = await to(database.update(insertTask.id, {
        check: {status:"input"}, 
        set: {
            status: "output2",
            outputPath: "new_output2"
        },
        increment: null,
        returnTask: true
    }));
    [err5, getTask2] = await to(database.get(insertTask.id));
    [err6, removeTask] = await to(database.remove(insertTask.id));

    // Assert
    assert.equal(err1, null);
    //assert.equal(err2, null);
    assert.equal(err3, null);
    assert.equal(err4, null);
    assert.equal(err5, null);
    assert.equal(err6, null);
    
    assert.deepEqual(updateTask2, getTask2);
    assert.equal(getTask1.status, "input");
    assert.equal(getTask1.outputPath, "output");
    assert.equal(getTask2.status, "output2");
    assert.equal(getTask2.outputPath, "new_output2");
}

async function check_update_increment(database) {
        // Arrange
        let err1, err2, err3, err4, err5, err6;
        let inputTask = getInputTask(0);
        let insertTask, updateTask1, updateTask2, getTask1, getTask2, removeTask;
    
        // Act
        [err1, insertTask] = await to(database.insert(inputTask));
        [err2, updateTask1] = await to(database.update(insertTask.id, {
            check: {status:"work"}, 
            set: {
                status: "output1",
                outputPath: "new_output1"
            },
            increment: {
                processDuration: 2000,
                childrenCompleted: 2,
                userDuration: 2000
            },
            returnTask: true
        }));
        [err3, getTask1] = await to(database.get(insertTask.id));
    
        [err4, updateTask2] = await to(database.update(insertTask.id, {
            check: {status:"input"}, 
            set: {
                status: "output2",
                outputPath: "new_output2"
            },
            increment: {
                processDuration: 3000,
                childrenCompleted: 3,
                userDuration: 3000
            },
            returnTask: true
        }));
        [err5, getTask2] = await to(database.get(insertTask.id));
        [err6, removeTask] = await to(database.remove(insertTask.id));
    
        // Assert
        assert.equal(err1, null);
        //assert.equal(err2, null);
        assert.equal(err3, null);
        assert.equal(err4, null);
        assert.equal(err5, null);
        assert.equal(err6, null);
    
        assert.equal(getTask1.status, "input");
        assert.equal(getTask1.outputPath, "output");
        assert.equal(getTask1.processDuration, inputTask.processDuration);
        assert.equal(getTask1.childrenCompleted, inputTask.childrenCompleted);
        assert.equal(getTask1.userDuration, inputTask.userDuration);
        
        assert.deepEqual(updateTask2, getTask2);
        assert.equal(getTask2.status, "output2");
        assert.equal(getTask2.outputPath, "new_output2");
        assert.equal(getTask2.processDuration, inputTask.processDuration + 3000);
        assert.equal(getTask2.childrenCompleted, inputTask.childrenCompleted + 3);
        assert.equal(getTask2.userDuration, inputTask.userDuration + 3000);
}

async function increment(database) {
    // Arrange
    let err1, err2, err3, err4;
    let inputTask = getInputTask(0);
    let insertTask, updateTask, getTask, removeTask;

    // Act
    [err1, insertTask] = await to(database.insert(inputTask));
    [err2, updateTask] = await to(database.update(insertTask.id, {
        check: null, 
        set: null,
        increment: {
            processDuration: 123456789,
            childrenCompleted: 1,
            userDuration: 100
        },
        returnTask: true
    }));
    [err3, getTask] = await to(database.get(insertTask.id));
    [err4, removeTask] = await to(database.remove(insertTask.id));

    // Assert
    assert.equal(err1, null);
    assert.equal(err2, null);
    assert.equal(err3, null);
    assert.equal(err4, null);

    assert(insertTask != null);
    assert(updateTask != null);
    assert(getTask != null);
    assert(removeTask != null);

    assert.deepEqual(updateTask, getTask);
    assert.equal(getTask.status, "input");
    assert.equal(getTask.outputPath, "output");
    assert.equal(getTask.processDuration, inputTask.processDuration + 123456789);
    assert.equal(getTask.childrenCompleted, inputTask.childrenCompleted + 1);
    assert.equal(getTask.userDuration, inputTask.userDuration + 100);
}

async function atomic_increment(database) {
 
    // Arrange
    let err1, err2, err3;
    let inputTask = getInputTask(0);
    let insertTask, getTask, removeTask;
    let n = 100;
    let jobs = [];
    async function job() {
        await to(database.update(insertTask.id, {
            check: null, 
            set: null,
            increment: {
                processDuration: 1,
                childrenCompleted: 2,
                userDuration: 3
            },
            returnTask: false
        }));
    }

    // Act
    [err1, insertTask] = await to(database.insert(inputTask));
    for (let i = 0; i < n; i++) {
        jobs.push(job());
    }
    await Promise.all(jobs);
    [err2, getTask] = await to(database.get(insertTask.id));
    [err3, removeTask] = await to(database.remove(insertTask.id));

    // Assert
    assert.equal(err1, null);
    assert.equal(err2, null);
    assert.equal(err3, null);

    assert.equal(getTask.processDuration, inputTask.processDuration + n * 1);
    assert.equal(getTask.childrenCompleted, inputTask.childrenCompleted + n * 2);
    assert.equal(getTask.userDuration, inputTask.userDuration + n * 3);    
}

async function scan(database) {

    // Arrange
    let inputTask = getInputTask(0);
    let err1, err2, err3, err4, insertTask, getTask, removeTask;
    let cat = 10;
    let n = cat * 10;
    let ids = [];
    let tasks = [];
    let scanner = database.scanner;
    for (let i = 0; i < n; i++) {
        let new_task = {...getInputTask(parseInt(i / cat))};
        [err1, insertTask] = await to(database.insert(new_task));
        ids.push(insertTask.id);
    }

    async function job(err, row) {
        try {
            //console.log(row);
            [err3, getTask] = await to(database.get(row.id));
            tasks.push(getTask);
            [err4, removeTask] = await to(database.remove(row.id));
            assert.equal(err3, null);
            assert.equal(err4, null);
            return null;
        } catch (e) {
            logger.error(e);
            return e;
        }
    }

    // Act
    for (let i = cat; i >= 0; i--) {
        let startRow = ("0000" + i.toString()).slice(-4);
        let stopRow = ("0000" + (i+1).toString()).slice(-4);
        scanner.init(startRow, stopRow);
        [err1] = await to(scanner.each(job));
        if (err1) break;
        scanner.clear();
    }

    // Assert
    assert.equal(err1, null);

    assert.equal(ids.length, n);
    assert.equal(tasks.length, n);

    console.log(ids);
    console.log(tasks);

    let previousPriority = 9999;
    for (let task of tasks) {
        if (ids.indexOf(task.id) == -1) {
            assert.fail("missing id")
        }

        let priority = task.priority;
        assert(priority <= previousPriority);
        previousPriority = priority;
    }
}
