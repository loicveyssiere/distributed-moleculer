const nedb = require("nedb-promises");
const { to, logger, sleep } = require("./utils");
const { PriorityCache } = require("./structures");

const fields = {
    user: 1,
    name: 1,
    status: 1,
    priority: 1,
    input: 1,
    output: 1,
    submitTime: 1,
    startTime: 1,
    nextTime: 1,
    duration: 1,
    process: 1,
    tries: 1,
    hostname: 1,
    error: 1,
    parentId: 1, // If child
    childrenTotal: 1, // If parent
    childrenCompleted: 1, // If parent
    children: 1 // List of object
};

/*
const Probe = require('pmx').probe();
Probe.metric({ name: 'total', value: () => stats.total });
Probe.metric({ name: 'input', value: () => stats.input });
Probe.metric({ name: 'work', value: () => stats.work });
Probe.metric({ name: 'output', value: () => stats.output });
Probe.metric({ name: 'error', value: () => stats.error });
*/

stats = { input: 0, work: 0, output: 0, error: 0, total: 0 };

shift = (offset, date) => new Date((date ? date : new Date()).getTime() + offset);

class DataStore {
    constructor() {
        this.db = nedb.create();
        this.db.ensureIndex({fieldName: ['status','nextTime']});
        this.priorities = {};
        this.cache = new PriorityCache();
    }

    // FIXME: Am I deprecated?
    updatePriorities(task, offset) {
        task.priority = task.priority | 0;
        let cur = this.priorities[task.priority];
        if (cur) {
            cur = cur + offset;
            if (cur <= 0) {
                this.priorities[task.priority] = undefined;
            } else {
                this.priorities[task.priority] = cur;
            }
        } else {
            cur = offset;
            if (cur > 0) {
                this.priorities[task.priority] = cur;
            }
        }
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
            submitTime: new Date(),
            startTime: null,
            nextTime: new Date(0),
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
        [err, task] = await to(this.db.findOne({ _id: item._id }, fields));
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
        [err, task] = await to(this.db.findOne({ _id: item._id }, fields));
        if (err) { logger.error(err); throw err; }
        if (!task) throw "not found (delete)";
        
        [err] = await to(this.db.remove({ _id: item._id }, {}));
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
            [err, task] = await to(this.db.findOne({ _id: id }, fields));

            if (err) { logger.error(err); return null; }
            if (!task) return null;
            if (task.status != "input" && task.status != "complete") continue;
            //
            [err, task] = await to(this.db.update(
                { _id: task._id, status: { $in: ["input", "complete"] } },
                {
                    $set: {
                        status: "work",
                        startTime: new Date()
                    }
                },
                { returnUpdatedDocs: true }
            ));
            if (err) { logger.error(err); return null; }
            if (task != null) break;
        }
        
        //this.updatePriorities(task, -1);
        stats.input--;
        stats.work++;
        
        return task;
    }

    async save_new(givenTask) {
        
        //TODO 
    }

    async save(item) {
        logger.warn("SAVE")
        let err, task, parentTask;
        [err, task] = await to(this.db.findOne({ _id: item._id }));
        if (err) { logger.error(err); throw err; }
        if (!task) return;
        //
        // if status = work
        //   if children, status => wait, create children
        //   else status = output, update parent
        // if status = complete
        //   status => output
        //   delete children
        if (task.status === "work") {
            if (item.children) {
                logger.warn("BRANCH 1")
                // status => wait
                [err, task] = await to(this.db.update(
                    { _id: task._id },
                    {
                        $set: {
                            status: "wait",
                            process: new Date() - task.startTime,
                            nextTime: null,
                            error: null,
                            hostname: item.hostname,
                            childrenCompleted: 0,
                            childrenTotal: item.children.length,
                            children: item.children
                        }
                    },
                    { returnUpdatedDocs: true }
                ));
                logger.info("success:", task);
                logger.warn("WAIT");

                // Insert the children
                for (let child of item.children) {
                    child.user = item.user;
                    child.name = item.name;
                    child.priority = item.priority;
                    try {
                        await this.insert(child, item._id); // TODO: check correctness
                    } catch(e) {
                        console.error("ERROR CATCH")
                        console.log(e);
                    }
                }
            } else {
                logger.warn("BRANCH 2")
                // status => output
                [err, task] = await to(this.db.update(
                    { _id: task._id },
                    {
                        $set: {
                            status: "output",
                            duration: new Date() - task.submitTime,
                            process: new Date() - task.startTime,
                            nextTime: null,
                            error: null,
                            hostname: item.hostname
                        }
                    },
                    { returnUpdatedDocs: true }
                ));
                if (err) { logger.error(err); throw err; }
                //
                stats.work--;
                stats.output++;
                // parent.completed++ and eventually parent.status => complete
                if (task.parentId) {
                    logger.warn("BRANCH 3")
                    let parentTask;
                    [err, parentTask] = await to(this.db.update(
                        { _id: task.parentId, status: "wait" },
                        {
                            $inc: {
                                process: task.duration, // TODO: check what expected
                                childrenCompleted: 1,
                            }
                        },
                        { returnUpdatedDocs: true }
                    ));
                    if (err) { logger.error(err); throw err; }
                    logger.warn("STEP")
                    logger.warn(JSON.stringify(parentTask, null, 4))
                    if (parentTask.childrenCompleted === parentTask.childrenTotal) {
                        logger.warn("BRANCH 4")
                        [err, parentTask] = await to(this.db.update(
                            { _id: task.parentId, status: "wait" },
                            {
                                $set: {
                                    status: "complete"
                                }
                            },
                            { returnUpdatedDocs: true }
                        ));
                        if (err) { logger.error(err); throw err; }
                        // Add parent to list
                        logger.warn("ADD PARENT")
                        this.cache.push(parentTask._id, parentTask.priority);
                    }
                }
            }
        }
        if (task.status === "complete") {
            // status => output
            logger.warn("BRANCH 5")
            [err, task] = await to(this.db.update(
                { _id: task._id },
                {
                    $set: {
                        status: "output",
                        duration: new Date() - task.submitTime,
                        nextTime: null,
                        error: null,
                        hostname: item.hostname
                    },
                    $inc: {
                        process: new Date() - item.startTime,
                    }
                },
                { returnUpdatedDocs: true }
            ));
            if (err) { logger.error(err); throw err; }
            //
            stats.work--;
            stats.output++;
            // remove all children
            // TODO
        }
        logger.warn("END BRANCH")
        //
        return;
    }

    async undo(item) {
        let err, task;
        [err, task] = await to(this.db.findOne({ _id: item._id }));
        if (err) { logger.error(err); throw err; }
        if (!task) return;
        //
        if (task.tries < 10) {
            task.status = task.childrenTotal > 0 ? "complete" : "input";
            task.tries++;
        } else {
            task.status = "error";
        }
        //
        [err, task] = await to(this.db.update(
            { _id: task._id },
            {
                $set: {
                    status: task.status,
                    tries: task.tries,
                    nextTime: shift(5000),
                    error: item.error,
                    hostname: item.hostname
                }
            },
            { returnUpdatedDocs: true }
        ));
        if (err) { logger.error(err); throw err; }
        //
        if (task.status === "input") {
            //this.updatePriorities(task, 1);
            this.cache.push(task._id, task.priority);
            stats.input++;
        } else {
            stats.error++;
        }
        stats.work--;
        //
        return;
    }

    async stats() {
        //let maxPriority = undefined;
        //for (let p of Object.keys(this.priorities)) {
        //    if (maxPriority === undefined || p > maxPriority) {
        //        maxPriority = p | 0;
        //    }
        //}
        let maxPriority = this.cache.highestPriority();
        let hasTasks = maxPriority !== undefined;
        return { maxPriority, hasTasks };
    }
}

module.exports = new DataStore();

async function main() {
    console.log("test");
    let c = new PriorityCache();
    c.push(0,0);
    c.push(1,0);
    c.push(2,1);
    c.push(3,0,true);
    c.push(4,1);
    console.log(c.pop());
    console.log(c.pop());
    console.log(c.pop());
    console.log(c.pop());
    console.log(c.pop());
    console.log(c);
    await require("./utils").sleep(5000);
    console.log(c.pop());
    console.log(c);

};