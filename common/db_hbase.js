"use strict";

/* =============================================================================
 DB Implementation for neDB

 Specification:
    - insert(id)
    - get(id)
    - remove(id)
    - update(id, params)

 Fields types:
    - 1 Normal, inserted in the data main json (stringify)
    - 2 Separated, inserted in its own column mainly for checking (as a string value)
    - 3 Incremental, in its own column, initialized as increment

All methods return promises
============================================================================= */

const hbase = require("hbase-rpc-client");
const { uuid, logger, to } = require("../common/utils");
const ByteBuffer = require('bytebuffer');

const fields = {
    user: 2,
    name: 2,
    status: 2,
    priority: 1,
    input: 2,
    output: 2,
    submitTime: 1,
    startTime: 1,
    nextTime: 1,
    duration: 3,
    process: 3,
    tries: 1,
    hostname: 2,
    error: 1,
    parentId: 1, // If child
    childrenTotal: 1, // If parent
    childrenCompleted: 3, // If parent
    children: 1 // List of object
};

class Scanner {
    constructor(options) {
        this.db = options.db;
        this.client = options.db.client;
        this.hbase_scanner = null;
    }

    init(properties) {
        this.hbase_scanner = this.client.getScanner(properties.table);
    }

    next(job) {
        throw "not implemented";
    }

    setFilter(filter) {
        throw "not implemented";
    }

    each(job) {
        let self = this;
        return new Promise(function(resolve, reject) {
            self.hbase_scanner.each(function(err, result) {
                console.log(result.row.toString());
                let task = self.db.from_result_to_object(result, fields);
                job(err, task);
            }, function(err) {
                if (err) {
                    return reject(err);
                }
                return resolve();
            })
        });
    }

    clear() {
        this.hbase_scanner.close()
        this.hbase_scanner = null;
    }
}

class db {

    constructor(options) {
        logger.info("initialise database");
        this.family = "data";
        this.primary = "_id";
        this.client = hbase({
            zookeeperHosts: ["localhost:2181"],
            zookeeperRoot: "/hbase",
            rpcTimeout: 2000,
            callTimeout: 2000,
            tcpNoDelay: false
        });
        logger.info("database initialised");
        this.client.on("error", err => logger.error("connection error", err));
        this.scanner = new Scanner({db: this});
    }

    /**
     * Insert a new task, the id is auto-generated
     * @param {Task} task as described in the constant object "fields"
     * @return {Promise} Promise that return an id (string) or an error
     */
    insert(task) {
        var self = this;
        var id = task._id;
        return new Promise(function(resolve, reject) {

            if (task.priority == null) {
                return reject("insert: no priority in task");
            }
            
            if (!id) {
                let stringPriority = ("0000" + task.priority).slice(-4);
                id = stringPriority + '.' + uuid();
            }

            let put = new hbase.Put(id);
            let table = self.getTableName(id);
            let error = self.from_object_to_put(task, put, self.family, fields);
            
            if (error) {
                return reject(error);
            }

            self.client.put(table, put, function(err, result) {
                if (err) {
                    logger.error(err);
                    return reject(err);
                } else {
                    if (!result.processed) {
                        return reject("not processed");
                    } else {
                        let returnTask = {...task};
                        returnTask[self.primary] = id;
                        return resolve(returnTask);
                    }
                }
            });
        });
    }

    /**
     * Get a task by its unique id
     * 
     * @param {string} id
     * @return {Promise}
     */
    get(id) {
        var self = this;
        return new Promise(function(resolve, reject) {

            if (id == null) {
                return resolve(null);
            }

            let get = new hbase.Get(id);
            let table = self.getTableName(id);
            
            self.client.get(table, get, function(err, result) {
                if (err) {
                    return reject(err);
                } else if (!result) {
                    return reject("Item not existing");
                } else {
                    let resultTask = self.from_result_to_object(result, fields);
                    return resolve(resultTask);
                }
            });
        });
    }

    /**
     * Remove a task by its unique id
     * 
     * @param {string} id
     * @return {Promise}
     */
    remove(id) {
        var self = this;
        return new Promise(function(resolve, reject) {
            let table = self.getTableName(id);
            let del = new hbase.Delete(id);
            self.client.delete(table, del, function(err, result) {
                if (err) {
                    return reject(err);
                } else {
                    if (!result.processed) {
                        return reject("not processed");
                    } else {
                        return resolve(id);
                    }   
                }
            });
        });
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

        var self = this;
        let check = params.check || null;
        let set = params.set || null;
        let increment = params.increment || null;
        let returnTask = params.returnTask || false;

        return new Promise(function(resolve, reject) {

            function filterReturnTask(id) {
                if (!returnTask) {
                    return resolve(null);
                }
                self.get(id).then(p => {
                    return resolve(p);
                }).catch(err => {
                    return reject(err);
                });
            }

            if (id == null) {
                logger.error("error");
                return reject("No Id in the task");
            }

            let checkValue, checkKey;
            if (check) {
                let toCheck = Object.keys(check);
                if (toCheck.length != 1) {
                    return reject("Only support for one key to check");
                }
                if (toCheck[0] != "status") {
                    return reject("Only support for 'status' key to check");
                }
                checkKey = toCheck[0];
                checkValue = check[checkKey];
            }

            let put = new hbase.Put(id);
            let inc = new hbase.Increment(id);
            let table = self.getTableName(id);
            let error;

            error = self.from_object_to_put(set, put, self.family, fields);
            if (error) {
                return reject(error);
            }
            error = self.from_object_to_inc(increment, inc, self.family, fields);
            if (error) {
                return reject(error);
            }

            if (check && set && increment) { // --------------------------------

                self.client.checkAndPut(
                    table, // table name
                    id, // rowKey to check
                    self.family, // row family to check
                    checkKey, // column to check
                    checkValue, // value to check
                    put,
                    function(err, result) {
                        if (err) {
                            return reject(err);
                        } else {
                            if (!result.processed) {
                                return reject("not processed");
                            } else {
                                self.client.increment(table, inc, function(err, result) {
                                    if (err) {
                                        return reject(err);
                                    } else {
                                        // result.processed broken here
                                        return filterReturnTask(id);
                                    }
                                });
                            }
                        }
                    }
                );
            } else if (check && set) { // --------------------------------------
                
                self.client.checkAndPut(
                    table, // table name
                    id, // rowKey to check
                    self.family, // row family to check
                    checkKey, // column to check
                    checkValue, // value to check
                    put,
                    function(err, result) {
                        if (err) {
                            return reject(err);
                        } else {
                            if (!result.processed) {
                                return reject("not processed");
                            } else {
                                return filterReturnTask(id);   
                            }
                        }
                    }
                );
            } else if (check && increment) { // --------------------------------
                return reject("not implemented, not possible in this version");
            } else if (set && increment) { // ----------------------------------
                self.client.put(table, put, function(err, result) {
                    if (err) {
                        return reject(err);
                    } else {
                        if (!result.processed) {
                            logger.error("error");
                            return reject("not processed");
                        } else {
                            self.client.increment(table, inc, function(err, result) {
                                if (err) {
                                    return reject(err);
                                } else {
                                    // result.processed broken here
                                    return filterReturnTask(id);
                                }
                            });
                        }
                    }
                });
            } else if (set) { // -----------------------------------------------

                self.client.put(table, put, function(err, result) {
                    if (err) {
                        return reject(err);
                    } else {
                        if (!result.processed) {
                            logger.error("error");
                            return reject("not processed");
                        } else {
                            return filterReturnTask(id);
                        }
                    }
                });
            } else if (increment) { // -----------------------------------------
                
                self.client.increment(table, inc, function(err, result) {
                    if (err) {
                        return reject(err);
                    } else {
                        // result.processed broken here
                        return filterReturnTask(id);                        
                    }
                });

            } else { // --------------------------------------------------------
                // Nothing to update
                return filterReturnTask(id);
            }
        });
    }

    /* -------------------------------------------------------------------------
        PRIVATE METHODS
    ------------------------------------------------------------------------- */
    getTableName(id) {
        let stringPriority = id.substring(0, 4);
        return `taskP${stringPriority}`;
    }

    from_object_to_put(input, put, family, fields) {
        for (let key in input) {
            if (fields.hasOwnProperty(key) && input.hasOwnProperty(key)) {
                let fieldType = fields[key];
                let value = input[key];
                if (typeof value === 'undefined') continue
                if (fieldType == 1) {       
                    put.add(family, key, JSON.stringify(value));
                } else if (fieldType == 2) {
                    put.add(family, key, value);
                } else if (fieldType == 3) { 
                    let buffer = new ByteBuffer(8);
                    buffer = buffer.writeLong(ByteBuffer.Long.fromString(JSON.stringify(value)));
                    buffer = buffer.toBuffer();
                    put.add(family, key, buffer);
                } else {
                    return new Error("field type not supported");
                }
            }
        }
        return null;
    }

    from_object_to_inc(input, inc, family, fields) {
        for (var key in input) {
            if (fields.hasOwnProperty(key)) {
                let fieldType = fields[key];
                let value = input[key];
                if (fieldType == 3) {
                    inc.add(family, key, value);
                } else {
                    return new Error("Not possible to increment a 'Normal' string entry");
                }
            }
        }
        return null;
    }

    from_result_to_object(result, fields) {
        let task = {};
        if (!result) {
            return result;
        }
        for (var key in result.cols) {
            let small_key = key.split(":")[1]
            if (fields.hasOwnProperty(small_key)) {
                let fieldType = fields[small_key];
                let value;
                if (fieldType == 1) {       
                    value = JSON.parse(result.cols[key].value.toString());
                } else if (fieldType == 2) {
                    value = result.cols[key].value.toString();
                } else if (fieldType == 3) {
                    value = parseInt(result.cols[key].value.toString("hex"), 16)
                } else {
                    logger.error("field type not supported");
                }
                task[key.split(":")[1]] = value;
            }
        }
        if (result.row) {
            task[this.primary] = result.row.toString();
        }
        return task;
    }

}

module.exports = db;
