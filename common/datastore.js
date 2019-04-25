"use strict";

const nedb = require("nedb-promises");
const { to, logger, uuid } = require("./utils");
const { PriorityCache } = require("./structures");
const s3 = require("./s3");
const db = require("./db_hbase");

var stats = { input: 0, work: 0, output: 0, error: 0, total: 0 };

var shift = (offset, date) => new Date((date ? date : new Date()).getTime() + offset);

class DataStore {
    constructor() {
        console.log("init datastore");
        this.dbTask = new db({
            family: 'C',
            primary: 'id',
            schema: 'onv_ocr_2',
            table: 'task'
        });
        this.dbBilling = new db({
            family: 'C',
            primary: 'id',
            schema: 'onv_ocr_2',
            table: 'billing'
        });
        this.priorities = {};
        this.cache = new PriorityCache();
    }

    /**
     * Creation of a new task, inserting in the database and in the in-memory queue
     * 
     * @param {object} item A minimal task with: userId(string), fileName(string),
     * priority(string), inputPath(string), outputPath(string)
     * @param {string} parentId if any
     * @return {Task} A full Task object as described in the database
     */
    async insert(item, parentId) {
        let err, task;
        task = {
            status: "INPUT",
            priority: item.priority,
            profile: item.profile,
            userType: item.userType,
            userId: item.userId,
            fileName: item.fileName,
            fileSize: 0,
            inputPath: item.inputPath,
            outputType: item.outputType,
            outputPath: item.outputPath,
            totalPages: 0,
            submitTime: Date.now(),
            startTime: null,
            lastStartTime: null,
            availabilityTime: null,
            userDuration: 0,
            cpuDuration: 0,
            processDuration: 0,
            site: item.site,
            hostName: item.hostName,
            tries: 0,
            errorMessage: null,
            parentId: parentId
        };
        let stringPriority = ("0000" + task.priority).slice(-4);
        task.id = stringPriority + '.' + uuid();
        [err, task] = await to(this.dbTask.insert(task));
        if (err) { logger.error(err); throw err; }

        this.cache.push(task.id, task.priority);
        stats.input++;
        stats.total++;
        
        return task;
    }

    /** 
     * Select a task only from the database, mainly to check status
     * @info Select for a non existing task is by default null, no error is
     * expected. 
     * 
     * @param {object} item A task containing id(string)
     * @return {Task} A full Task object as described in the database
     */
    async select(item) {
        let err, task;
        [err, task] = await to(this.dbTask.get(item.id));
        if (err) { logger.error(err); throw err; }

        // Log that the task doesn't exist and continue. 
        if (!task) logger.warn(`The selected task ${item.id} does not exist`);

        return task;
    }

    /** 
     * Delete a task by removing it only from the database
     * 
     * FIXME: what if the one to delete is in input status (i.e still in the queue)
     * @param {object} item A task containing id(string)
     * @return {Task} A full Task object as described in the database
     */
    async delete(item) {
        let err, task;

        [err, task] = await to(this.dbTask.get(item.id));
        if (err) { logger.error(err); throw err; }
 
        [err] = await to(this.dbTask.remove(item.id));
        if (err) { logger.error(err); throw err; }
        
        return task;
    }

    /**
     * Pop (take an delete) a task from the in-memory queue and update the task
     * status in database to tag it as a processing task (work status).
     * 
     * FIXME: what if an error occurred in the findOne or update, we need to push
     * the task in the in-memory queue back.
     * @return {Task} A full Task object as described in the database
     */
    async take() {
        let err, task;
        while (true) {
            let id = this.cache.pop();
            if (id == null) break;
            // TODO: we should do better here
            [err, task] = await to(this.dbTask.get(id));

            if (err) { logger.error(err); return null; }
            if (!task) return null;
            if (task.status === "INPUT") {
                [err, task] = await to(this.dbTask.update(id, {
                    check: {status: "INPUT"},
                    set: {
                        status: "WORK",
                        startTime: Date.now(),
                        lastStartTime: Date.now()
                    },
                    increment: null,
                    returnTask: true
                }));
            } else if (task.status === "COMPLETE") {
                [err, task] = await to(this.dbTask.update(id, {
                    check: {status: "COMPLETE"},
                    set: {
                        status: "WORK",
                        //startTime: Date.now(),
                        lastStartTime: Date.now()
                    },
                    increment: null,
                    returnTask: true
                }));
            } else {
                continue;
            }
  
            if (err) {
                logger.error(err);
                return null;
            }
            if (task != null) break;
        }
        
        stats.input--;
        stats.work++;
        
        return task;
    }

    async save_on_failure(inputTask) {
        let wakeup, err, task;
        [err, task] = await to(this.dbTask.get(inputTask.id));
        if (err) { logger.error(err); throw err; }
        if (!task) return;
        //
        if (task.tries < 10) {
            task.status = task.childrenTotal > 0 ? "COMPLETE" : "INPUT";
            wakeup = true;
            task.tries++;
        } else {
            task.status = "ERROR";
            wakeup = false;
        }
        //
        [err] = await to(this.dbTask.update(task.id, {
            check: null,
            set: {
                status: task.status,
                tries: task.tries,
                errorMessage: task.errorMessage,
                hostName: task.hostName
            },
            increment: null,
            returnTask: false
        }));      
        if (err) { logger.error(err); throw err; }
        //
        if (task.status === "INPUT") {
            this.cache.push(task.id, task.priority);
            stats.input++;
        } else {
            stats.error++;
        }
        stats.work--;
        //
        return wakeup;
    }

    /**
     * input => output
     */
    async save_on_simple(inputTask) {
        logger.warn("save_on_simple");
        let err;
        let wakeup = false;
        let now = Date.now();
        [err] = await to(this.dbTask.update(inputTask.id, {
            check: null,
            set: {
                status: "OUTPUT",
                availabilityTime: now,
                userDuration: now - inputTask.submitTime,
                processDuration: now - inputTask.startTime,
                cpuDuration: now - inputTask.startTime,
                errorMessage: null,
                hostName: inputTask.hostName
            },
            increment: null,
            returnTask: false
        }));  

        if (err) { logger.error(err); throw err; }
        //
        stats.work--;
        stats.output++;
        return wakeup;
    }

    /**
     * input => output + update parent
     */
    async save_on_child(inputTask) {
        logger.debug("save_on_child");
        let wakeup = false;
        let task, parentTask, err;
        let now = Date.now();
        // Update the task
        [err, task] = await to(this.dbTask.update(inputTask.id, {
            check: null,
            set: {
                status: "OUTPUT",
                availabilityTime: now,
                userDuration: now - inputTask.submitTime,
                processDuration: now - inputTask.startTime,
                cpuDuration: now - inputTask.startTime,
                errorMessage: null,
                hostName: inputTask.hostName
            },
            increment: null,
            returnTask: true
        }));
        if (err) { logger.error(err); throw err; }

        // Update the parent
        [err, parentTask] = await to(this.dbTask.update(inputTask.parentId, {
            check: {status: "WAIT"},
            set: {
                status: "WAIT",
                lastStartTime: Date.now()
            },
            increment: {
                cpuDuration: task.cpuDuration,
                childrenCompleted: 1,
            },
            returnTask: true
        }));
        if (err) { logger.error(err); throw err; }

        // Eventually update the parent status
        if (parentTask.childrenCompleted === parentTask.childrenTotal) {
            [err, parentTask] = await to(this.dbTask.update(inputTask.parentId, {
                check: {status: "WAIT"},
                set: {status: "COMPLETE"},
                increment: null,
                returnTask: true
            })); 
            if (err) { logger.error(err); throw err; }
            
            // Add parent to list
            this.cache.push(parentTask.id, parentTask.priority);
            wakeup = true;
        }
        return wakeup;
    }

    /**
     * input => wait
     */
    async save_on_split(inputTask) {
        logger.debug("save_on_split");
        let err;
        let wakeup = true;
        let now = Date.now();

        [err] = await to(this.dbTask.update(inputTask.id, {
            check: null,
            set: {
                status: "WAIT",
                processDuration: now - inputTask.startTime,
                cpuDuration: now - inputTask.startTime,
                hostName: inputTask.hostName,
                errorMessage: null
            },
            increment: null,
            returnTask: false
        }));

        var childrenArray = new Array();

        // Insert the children - should follow the specs of queuer.createTask
        for (let child of inputTask.childrenArray) {

            child.userType = inputTask.userType;
            child.userId = inputTask.userId;
            child.priority = inputTask.priority;
            child.profile = inputTask.profile;
            child.userType = inputTask.userType;
            child.userId = inputTask.userId;
            child.fileName = inputTask.fileName;
            child.outputType = inputTask.outputType;
            child.site = inputTask.site;
            child.hostName = inputTask.hostName;

            try {
                let childTask = await this.insert(child, inputTask.id);
                childrenArray.push({
                    id: childTask.id,
                    inputPath: childTask.inputPath,
                    outputPath: childTask.outputPath
                });
            } catch (err) {
                throw err;
            } 
            if (err) { logger.error(err); throw err; }
        }

        [err] = await to(this.dbTask.update(inputTask.id, {
            check: {status: "WAIT"},
            set: {
                childrenArray: childrenArray,
                childrenTotal: childrenArray.length
            },
            increment: null,
            returnTask: false
        }));

        return wakeup;
    }

    async save_on_merge(inputTask) {
        logger.debug("save_on_merge");
        let err;
        let wakeup = false;
        let now = Date.now();
        [err] = await to(this.dbTask.update(inputTask.id, {
            check: null,
            set: {
                status: "OUTPUT",
                availabilityTime: now,
                userDuration: now - inputTask.submitTime,
                processDuration: now - inputTask.startTime,
                errorMessage: null,
                hostName: inputTask.hostName
            },
            increment: {
                cpuDuration: now - inputTask.lastStartTime
            },
            returnTask: false
        }));
        if (err) { logger.error(err); throw err; }

        // Cleanup children
        for (let child of inputTask.childrenArray) {
            [err] = await to(s3.deleteFile(child.outputPath));
            [err] = await to(s3.deleteFile(child.inputPath));
            this.delete(child);
        }
        return wakeup;
    }

    async billing(id) {

        let err, task;
        [err, task] = await to(this.dbTask.get(id));
        if (err) { logger.error(err); throw err; }

        logger.info("Finished task ", task);

        let site = task.site
        let billingDate = new Date().toISOString();
        task.taskId = task.id;

        task.id = `${billingDate}.${site}.${task.taskId}`;

        [err, task] = await to(this.dbBilling.insert(task));
        if (err) { throw err; }
    }

    /**
     * Load or reload in-memory queue from the persistent database
     */
    async reload() {
        let priority_min = 0;
        let priority_max = 100;
        
        let err;
        let self = this;

        // clean existing queue
        // TODO: add clear method to cache structure;

        for (let i = priority_max; i >=priority_min; i--) {
            let startRow = ("0000" + i.toString()).slice(-4);
            let stopRow = ("0000" + (i+1).toString()).slice(-4);
            let scanner = this.dbTask.scanner(startRow, stopRow);

            [err] = await to(scanner.each(async function(err, task, done) {
                console.log(task.id);
                try {
                    let updater = null;
                    let statusPush = ["INPUT", "COMPLETE", "WAIT"]
                    if (statusPush.indexOf(task.status) > -1) {
                        self.cache.push(task.id, task.priority);
                    } else if (task.status == "WORK") {
                        if (!task.childrenTotal) {
                            updater = {check: {status:"WORK"}, set: {status:"INPUT"}};
                        }
                        else if (task.childrenCompleted == task.childrenTotal) {
                            updater = {check: {status:"WORK"}, set: {status:"COMPLETE"}};
                        } else {
                            let error = new Error("This situation is supposed to be impossible")
                            logger.error(error);
                            return done(error);
                        }
                        if (updater) {
                            [err] = await to(self.dbTask.update(task.id, updater));
                            if (!err) {
                                throw err;
                            } else {
                                self.cache.push(task.id, task.priority);
                            }
                        }
                    }
                    return done();
                    //stats.input++;
                    //stats.total++;
                } catch (exception) {
                    return exception
                }
            }));
            scanner.clear();
        }
        return err;
    }

    async stats() {
        let maxPriority = this.cache.highestPriority();
        let hasTasks = maxPriority !== undefined;
        return { maxPriority, hasTasks };
    }
}

module.exports = DataStore;
