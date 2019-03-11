const nedb = require("nedb-promises");
const { to, logger, sleep } = require("./utils");
const Probe = require('pmx').probe();

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
    parentId: 1,
    childrenTotal: 1,
    childrenCompleted: 1,
};

Probe.metric({ name: 'total', value: () => stats.total });
Probe.metric({ name: 'input', value: () => stats.input });
Probe.metric({ name: 'work', value: () => stats.work });
Probe.metric({ name: 'output', value: () => stats.output });
Probe.metric({ name: 'error', value: () => stats.error });

stats = { input: 0, work: 0, output: 0, error: 0, total: 0 };

shift = (offset, date) => new Date((date ? date : new Date()).getTime() + offset);

class PriorityItem {
    constructor(data) {
        this.data = data;
        this.next = null;
    }
}

class PriorityQueue {
    constructor() {
        this.first = null;
        this.last = null;
    }
    push(id) {
        if (this.last != null) {
            this.last.next = new PriorityItem(id);
            this.last = this.last.next;
        } else {
            this.last = new PriorityItem(id);
            this.first = this.last;
        }
    }
    pop() {
        if (this.first == null) return null;
        let item = this.first.data;
        this.first = this.first.next;
        if (this.first == null) this.last = null;
        return item;
    }
    merge(queue) {
        if (queue.first == null) return;
        if (this.first == null) {
            this.first = queue.first;
            this.last = queue.last;
        } else {
            this.last.next = queue.first;
        }
        queue.first = null;
        queue.last = null;
    }
}

class PriorityList {
    constructor() {
        this.current = new PriorityQueue();
        this.future = new PriorityQueue();
        this.futureTime = new Date().getTime() + 5000;
        this.isEmpty = true;
    }
    push(id, lag) {
        let q = lag ? this.future : this.current;
        q.push(id);
    }
    pop() {
        let now = new Date().getTime();
        if (now > this.futureTime) {
            // merge
            this.current.merge(this.future);
        }
        let item = this.current.pop();
        if (item == null) return null;
        // update isEmpty
        this.isEmpty = this.current.first == null && this.future.first == null;
        //
        return item;
    }
}

class PriorityCache {
    constructor() {
        this.priorities = [];
        this.cache = {};
    }

    push(id, priority, lag) {
        let list = this.cache[priority];
        if (list === undefined) {
            list = new PriorityList();
            this.cache[priority] = list;
        }
        if (list.isEmpty) {
            this.priorities.push(priority);
            this.priorities.sort();
        }
        list.push(id, lag | false);
    }
    pop() {
        for (let i = this.priorities.length-1; i>=0; i--) {
            let priority = this.priorities[i];
            let list =  this.cache[priority];
            let item = list.pop();
            if (item != null) {
                if (list.isEmpty) {
                    this.priorities.splice(i,1);
                }
                return item;
            }
        }
        return null;
    }
    highestPriority() {
        return this.priorities[this.priorities-1];
    }
}

class DataStore {
    constructor() {
        this.db = nedb.create();
        this.db.ensureIndex({fieldName: ['status','nextTime']});
        this.priorities = {};
        this.cache = new PriorityCache();
        //this.date = 0;
    }

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

    // external api
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
        //
        //this.updatePriorities(task, +1);
        this.cache.push(task._id, task.priority);
        stats.input++;
        stats.total++;
        //
        return task;
    }

    async select(item) {
        let err, task;
        [err, task] = await to(this.db.findOne({ _id: item._id }, fields));
        if (err) { logger.error(err); throw err; }
        if (!task) throw "not found (select)";
        //
        return task;
    }

    async delete(item) {
        let err, task;
        [err, task] = await to(this.db.findOne({ _id: item._id }, fields));
        if (err) { logger.error(err); throw err; }
        if (!task) throw "not found (delete)";
        //
        [err] = await to(this.db.remove({ _id: item._id }, {}));
        if (err) { logger.error(err); throw err; }
        //
        return task;
    }

    // internal api
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
        //
        //this.updatePriorities(task, -1);
        stats.input--;
        stats.work++;
        //
        return task;
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
                        }
                    },
                    { returnUpdatedDocs: true }
                ));
                logger.info("success:", task);
                logger.warn("WAIT");

                // Insert the children
                for (let child of item.children) {
                    child.user = "sub";//item.user;
                    child.name = "sub";//item.name;
                    child.priority = item.priority;
                    try {
                        await this.insert(child, item._id); // TODO: check correctness
                    } catch(e) {
                        console.error("ERROR CATCH")
                        console.log(e);
                    }
                }
            } else {
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
                    if (parentTask.childrenCompleted === parentTask.childrenTotal) {
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

const task = {
    user: "user",
    name: "name",
    priority: 0,
    input: 'input',
    output: 'output'
};

async function main2() {
    let dd = new DataStore();
    err = await to(dd.save(1));
    //r = await dd.save({
    //    input: 'xf1yqCBmXGm8UXueilp2Yjt05gptm.in'
    //}, 1)
    await(dd.insert(task))
    console.log(dd.cache)
    console.log(dd.cache.pop())
}
main2();
