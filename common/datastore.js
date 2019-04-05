"user strict";

const nedb = require("nedb-promises");
const { to, logger } = require("./utils");
const { PriorityCache } = require("./structures");
const db = require("./db_hbase");

stats = { input: 0, work: 0, output: 0, error: 0, total: 0 };

shift = (offset, date) => new Date((date ? date : new Date()).getTime() + offset);

class DataStore {
    constructor() {
        console.log("init datastore");
        this.db = new db();
        this.priorities = {};
        this.cache = new PriorityCache();
    }

    /**
     * Creation of a new task, inserting in the database and in the in-memory queue
     * 
     * @param {object} item A minimal task with: user(string), name(string),
     * priority(string), input(string), output(string)
     * @param {string} parentId if any
     * @return {Task} A full Task object as described in the database
     */
    async insert(item, parentId) {
        let err, task;
        task = {
            user: item.user,
            name: item.name,
            status: "input",
            priority: item.priority | 0,
            input: item.input,
            output: item.output,
            submitTime: Date.now(),
            startTime: null,
            nextTime: Date.now(),
            duration: 0,
            process: 0,
            tries: 0,
            parentId
        };
        [err, task] = await to(this.db.insert(task));
        if (err) { logger.error(err); throw err; }

        this.cache.push(task._id, task.priority);
        stats.input++;
        stats.total++;
        
        return task;
    }

    /** 
     * Select a task only from the database, mainly to check status
     * 
     * @param {object} item A task containing _id(string)
     * @return {Task} A full Task object as described in the database
     */
    async select(item) {
        let err, task;
        [err, task] = await to(this.db.get(item._id));
        logger.warn(JSON.stringify(task));
        if (err) { logger.error(err); throw err; }
        if (!task) throw "not found (select)";
        
        return task;
    }

    /** 
     * Delete a task by removing it only from the database
     * 
     * FIXME: what if the one to delete is in input status (i.e still in the queue)
     * @param {object} item A task containing _id(string)
     * @return {Task} A full Task object as described in the database
     */
    async delete(item) {
        let err, task;
        [err, task] = await to(this.db.get(item._id));
        if (err) { logger.error(err); throw err; }
        if (!task) throw "not found (delete)";
        
        [err] = await to(this.db.remove(item._id));
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
            [err, task] = await to(this.db.get(id));

            if (err) { logger.error(err); return null; }
            if (!task) return null;
            if (task.status === "input") {
                [err, task] = await to(this.db.update(id, {
                    check: {status: "input"},
                    set: {
                        status: "work",
                        startTime: Date.now()
                    },
                    increment: null,
                    returnTask: true
                }));
            } else if (task.status === "complete") {
                [err, task] = await to(this.db.update(id, {
                    check: {status: "complete"},
                    set: {
                        status: "work",
                        startTime: Date.now()
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
        [err, task] = await to(this.db.get(inputTask._id));
        if (err) { logger.error(err); throw err; }
        if (!task) return;
        //
        if (task.tries < 10) {
            task.status = task.childrenTotal > 0 ? "complete" : "input";
            wakeup = true;
            task.tries++;
        } else {
            task.status = "error";
            wakeup = false;
        }
        //
        [err] = await to(this.db.update(task._id, {
            check: null,
            set: {
                status: task.status,
                tries: task.tries,
                nextTime: shift(5000),
                error: task.error,
                hostname: task.hostname
            },
            increment: null,
            returnTask: false
        }));      
        if (err) { logger.error(err); throw err; }
        //
        if (task.status === "input") {
            this.cache.push(task._id, task.priority);
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
        logger.debug("save_on_simple");
        let err;
        let wakeup = false;
        [err] = await to(this.db.update(inputTask._id, {
            check: null,
            set: {
                status: "output",
                duration: Date.now() - inputTask.submitTime,
                process: Date.now() - inputTask.startTime,
                nextTime: null,
                error: null,
                hostname: inputTask.hostname
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
        // Update the task
        [err, task] = await to(this.db.update(inputTask._id, {
            check: null,
            set: {
                status: "output",
                duration: Date.now() - inputTask.submitTime,
                process: Date.now() - inputTask.startTime,
                nextTime: null,
                error: null,
                hostname: inputTask.hostname
            },
            increment: null,
            returnTask: true
        }));
        if (err) { logger.error(err); throw err; }

        // Update the parent
        [err, parentTask] = await to(this.db.update(inputTask.parentId, {
            check: {status: "wait"},
            set: {status: "wait"},
            increment: {
                process: task.process, // TODO: check what expected
                childrenCompleted: 1,
            },
            returnTask: true
        }));
        if (err) { logger.error(err); throw err; }

        // Eventually update the parent status
        if (parentTask.childrenCompleted === parentTask.childrenTotal) {
            [err, parentTask] = await to(this.db.update(inputTask.parentId, {
                check: {status: "wait"},
                set: {status: "complete"},
                increment: null,
                returnTask: true
            })); 
            if (err) { logger.error(err); throw err; }
            
            // Add parent to list
            this.cache.push(parentTask._id, parentTask.priority);
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

        [err] = await to(this.db.update(inputTask._id, {
            check: null,
            set: {
                status: "wait",
                process: Date.now() - inputTask.startTime,
                nextTime: null,
                error: null,
                hostname: inputTask.hostname,
                childrenCompleted: 0,
                childrenTotal: inputTask.children.length,
                children: inputTask.children
            },
            increment: null,
            returnTask: false
        }));  
        logger.info("success:", inputTask);

        // Insert the children
        for (let child of inputTask.children) {
            child.user = inputTask.user;
            child.name = inputTask.name;
            child.priority = inputTask.priority;
            try {
                await this.insert(child, inputTask._id); // TODO: check correctness
            } catch(e) {
                console.log(e);
            }
        }
        return wakeup;
    }

    async save_on_merge(inputTask) {
        logger.debug("save_on_merge");
        let err;
        let wakeup = false;
        [err] = await to(this.db.update(inputTask._id, {
            check: null,
            set: {
                status: "output",
                duration: Date.now() - inputTask.submitTime,
                nextTime: null,
                error: null,
                hostname: inputTask.hostname
            },
            increment: {
                process: Date.now() - inputTask.startTime,
            },
            returnTask: false
        }));

        if (err) { logger.error(err); throw err; }
        return wakeup;
    }

    /**
     * Load or reload in-memory queue from the persistent database
     */
    async reload() {
        let priority_max = 0;
        let priority_min = 0;

        let err;
        let self = this;
        let scanner = this.db.scanner;

        // clean existing queue
        // TODO: add clear method to cache structure;

        for (let i = priority_max; i >=priority_min; i--) {
            let stringPriority = ("0000" + i).slice(-4);
            let table = self.db.getTableName(stringPriority);
            scanner.init({table: table});
            [err] = await to(scanner.each(async function(err, task) {
                try {
                    let updater = null;
                    let statusPush = ["input", "complete", "wait"]
                    if (statusPush.indexOf(task.status) > -1) {
                        self.cache.push(task._id, task.priority);
                    } else if (task.status == "work") {
                        if (!task.childrenTotal) {
                            updater = {check: {status:"work"}, set: {status:"input"}};
                        }
                        else if (task.childrenCompleted == task.childrenTotal) {
                            updater = {check: {status:"work"}, set: {status:"complete"}};
                        } else {
                            let error = new Error("This situation is supposed to be impossible")
                            logger.error(error);
                        }
                        if (updater) {
                            [err] = await to(self.db.update(task._id, updater));
                            if (!err) {
                                throw err;
                            } else {
                                self.cache.push(task._id, task.priority);
                            }
                        }
                    }
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
