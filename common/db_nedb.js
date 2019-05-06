"use strict";

/* =============================================================================
 DB Implementation for neDB

 Specification:
    - insert(id)
    - get(id)
    - remove(id)
    - update(id, params)

All methods return promises
============================================================================= */

const nedb = require("nedb-promises");
const { uuid, logger, to } = require("../common/utils");
const assert = require('assert');

const fields = {
    /* Task */
    status: 1,
    priority: 1,
    profile: 1, 
    /* User */
    userType: 1,
    userId: 1,
    /* File */
    fileName: 1,
    fileSize: 1,
    inputPath: 1,
    outputType: 1,
    outputPath: 1,
    totalPages: 1,
    /* Time */
    submitTime: 1,
    startTime: 1,
    lastStartTime: 1,
    availabilityTime: 1,
    userDuration: 1,
    cpuDuration: 1,
    processDuration: 1,
    /* Node */
    site: 1,
    hostName: 1,
    /* Error */
    tries: 1,
    errorMessage: 1,
    /* Children */
    childrenArray: 1,
    parentId: 1,
    childrenTotal: 1, 
    childrenCompleted: 1
};

class Scanner {

    /**
     * @param {object} options.client 
     */
    constructor(options) {
        this.cache = [];
        this.filter = {};
        this.client = options.client;
    }

    init(properties) {
        let priority = parseInt(properties.table.substring(5, 9));
        this.filter = {priority: priority};
    }

    async next(job) {
        let doc = this.cache.pop();
        await job(null, doc);
    }

    setFilter(filter) {
        this.filter = filter;
    }

    each(job) {
        let self = this;
        return new Promise(function(resolve, reject) {
            self.client.find(self.filter)
            .then(async docs => {
                self.cache = docs;
                let n = self.cache.length
                for (let i = 0; i < n; i++) {
                    await self.next(job);
                }
                return resolve(null);
            })
            .catch(err => {
                console.log(err);
                return reject(err);
            })
        });
    }

    clear() {
        this.cache = [];
        this.filter = {};
    }
}

class db {

    constructor(options) {
        this.client = nedb.create(); //new nedb();
        this.primary = "id";
        this.client.ensureIndex({fieldName: ['status','nextTime']});
        this.scanner = new Scanner({client: this.client});
    }

    /**
     * Insert a new task, the id is auto-generated
     * @param {Task} task as described in the constant object "fields"
     * @return {Promise}
     */
    insert(task) {
        return this.client.insert(task);
    }

    /**
     * Get a task by its unique id
     * 
     * @param {string} id 
     * @return {Promise}
     */
    get(id) {
        var filter = {};
        filter[this.primary] = id;
        return this.client.findOne(filter, fields);
    }

    /**
     * Remove a task by its unique id
     *
     * @param {string} id 
     * @return {Promise}
     */
    remove(id) {
        var filter = {};
        filter[this.primary] = id;
        return this.client.remove(filter, {});
    }

    /**
     * Update a task - refereed by its unique id - with a list of field to set
     * and a list of field to increment
     * 
     * @param {string} id 
     * @param {object} params.check A group of task field with values to check before update
     * @param {object} params.set A group of task field to update in the database
     * @param {object} params.increment A group of task field to increment atomically
     * @param {boolean} params.returnTask Options to return or not the updated task
     * @return {Promise}
     */
    update(id, params) {

        let check = params.check || null;
        let set = params.set || null;
        let increment = params.increment || null;
        let returnTask = params.returnTask || false;

        if (!check && !set && !increment) {
            // Nothing to do
            logger.warn("Update received nothing to update");
            return new Promise(function(resolve, reject) {
                resolve(null);
            });
        }

        var filter = {
            ...check
        }
        filter[this.primary] = id;
        var updater = {}
        if (set) updater["$set"] = set;
        if (increment) updater["$inc"] = increment;
        return this.client.update(filter, updater,
            { returnUpdatedDocs: returnTask }
        );
    }
}

module.exports = db;
