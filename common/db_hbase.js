"use strict";

/* =============================================================================
 DB Implementation for HBase

 Specification:
    - insert(id)
    - get(id)
    - remove(id)
    - update(id, params)

 Fields types:
    - 1 Object as JSON string (stringify)
    - 2 String value
    - 3 Long (number) value

All methods return promises
============================================================================= */

const hbase = require("hbase-rpc-client");
var Int64BE = require("int64-buffer").Int64BE;

const { uuid, logger, to } = require("../common/utils");
const schema = require("../common/schema");

class Scanner {
    constructor(options, startRow, stopRow) {
        this.db = options.db;
        this.client = options.db.client;
        this.startRow = startRow || null;
        this.stopRow = stopRow || null;
        this.hbase_scanner = this.client.getScanner(this.db.table, this.startRow, this.stopRow);
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
            self.hbase_scanner.each(function(err, result, done) {
                let task = self.db.from_result_to_object(result, self.db.fields);
                job(err, task, done);
            }, function(err) {
                if (err) {
                    return reject(err);
                }
                return resolve();
            })
        });
    }

    clear() {
        if (this.hbase_scanner) {
            this.hbase_scanner.close()
            this.hbase_scanner = null;
        }
    }
}

class db {

    constructor(options) {
        logger.info("initialise database");
        this.client = hbase({
            zookeeperHosts: ["localhost:2181"],
            zookeeperRoot: "/hbase",
            rpcTimeout: 2000,
            callTimeout: 2000,
            tcpNoDelay: false
        });
        this.primary = options.primary;
        this.family = options.family.toUpperCase();
        this.fields = schema[options.table.toUpperCase()];
        if (options.schema) {
            this.table = `${options.schema.toUpperCase()}:${options.table.toUpperCase()}`
        } else {
            this.table = options.table.toUpperCase();
        }
        logger.info("database initialised");
        this.client.on("error", err => logger.error("connection error", err));
        //this.scanner = new Scanner({db: this});
    }

    scanner(startRow, stopRow) {
        return new Scanner({db: this}, startRow, stopRow);
    }

    /**
     * Insert a new item, the id is auto-generated
     * @param {object} item as described in the constant object "schema"
     * @return {Promise} Promise that return an id (string) or an error
     */
    insert(item) {
        var self = this;
        var id = item[self.primary];
        return new Promise(function(resolve, reject) {

            if (!id) {
                return reject(new Error("No Row ID provided"));
            }

            let put = new hbase.Put(id);
            let error = self.from_object_to_put(item, put, self.family, self.fields, true);
            
            if (error) {
                return reject(error);
            }

            self.client.put(self.table, put, function(err, result) {
                if (err) {
                    logger.error(err);
                    return reject(err);
                } else {
                    if (!result.processed) {
                        return reject("not processed");
                    } else {
                        return resolve(item);
                    }
                }
            });
        });
    }

    /**
     * Get an item by its unique id
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
            
            self.client.get(self.table, get, function(err, result) {
                if (err) {
                    return reject(err);
                } else if (!result) {
                    return resolve(null);
                } else {
                    let resultItem = self.from_result_to_object(result, self.fields);
                    return resolve(resultItem);
                }
            });
        });
    }

    /**
     * Remove a item by its unique id
     * 
     * @param {string} id
     * @return {Promise}
     */
    remove(id) {
        var self = this;
        return new Promise(function(resolve, reject) {
            let del = new hbase.Delete(id);
            self.client.delete(self.table, del, function(err, result) {
                if (err) {
                    return reject(err);
                } else {
                    if (!result.processed) {
                        return reject(new Error("not processed"));
                    } else {
                        return resolve(id);
                    }   
                }
            });
        });
    }

    /**
     * Update an item - refereed by its unique id - with a list of field to set
     * and a list of field to increment
     * 
     * @param {string} id 
     * @param {object} params.check A group of item field with values to check before update
     * @param {object} params.set A group of item field to update in the database
     * @param {object} params.increment A group of item field to increment atomically
     * @param {boolean} params.returnTask Options to return or not the updated item
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
                return reject("No Id in the item");
            }

            let checkValue, checkKey;
            if (check) {
                let toCheck = Object.keys(check);
                if (toCheck.length != 1) {
                    return reject(new Error("Only support for one key to check"));
                }
                if (toCheck[0] != "status") {
                    return reject(new Error("Only support for 'status' key to check"));
                }
                checkKey = toCheck[0].toUpperCase();
                checkValue = check[toCheck[0]];
            }

            let put = new hbase.Put(id);
            let inc = new hbase.Increment(id);
            let error;

            error = self.from_object_to_put(set, put, self.family, self.fields);
            if (error) {
                return reject(error);
            }
            error = self.from_object_to_inc(increment, inc, self.family, self.fields);
            if (error) {
                return reject(error);
            }

            if (check && set && increment) { // --------------------------------

                self.client.checkAndPut(
                    self.table, // table name
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
                                return reject(new Error("not processed"));
                            } else {
                                self.client.increment(self.table, inc, function(err, result) {
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
                    self.table, // table name
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
                                return reject(new Error("not processed"));
                            } else {
                                return filterReturnTask(id);   
                            }
                        }
                    }
                );
            } else if (check && increment) { // --------------------------------
                return reject("not implemented, not possible in this version");
            } else if (set && increment) { // ----------------------------------
                self.client.put(self.table, put, function(err, result) {
                    if (err) {
                        return reject(err);
                    } else {
                        if (!result.processed) {
                            logger.error("error");
                            return reject(new Error("not processed"));
                        } else {
                            self.client.increment(self.table, inc, function(err, result) {
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

                self.client.put(self.table, put, function(err, result) {
                    if (err) {
                        return reject(err);
                    } else {
                        if (!result.processed) {
                            return reject(new Error("not processed"));
                        } else {
                            return filterReturnTask(id);
                        }
                    }
                });
            } else if (increment) { // -----------------------------------------
                
                self.client.increment(self.table, inc, function(err, result) {
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
    from_object_to_put(input, put, family, fields, firstInsert) {
        if (!fields) {
            return new Error("No field schema in from_result_to_object");
        }
        for (let key in input) {
            if (fields.hasOwnProperty(key) && input.hasOwnProperty(key)) {
                let fieldType = fields[key];
                let value = input[key];
                if (typeof value === 'undefined') continue
                if (fieldType == 1) {       
                    put.add(family, key.toUpperCase(), JSON.stringify(value));
                } else if (fieldType == 2) {
                    put.add(family, key.toUpperCase(), value);
                } else if (fieldType == 3) { 
                    //let buffer = new ByteBuffer(8);
                    //buffer = buffer.writeLong(ByteBuffer.Long.fromString(JSON.stringify(value)));
                    //buffer = buffer.toBuffer();
                    let buffer = new Int64BE(value).toBuffer();
                    put.add(family, key.toUpperCase(), buffer);
                } else {
                    return new Error("field type not supported");
                }
            }
        }
        // Specific to Phoenix
        if (firstInsert) {
            put.add(family, "_0", "x");
        }
        return null;
    }

    from_object_to_inc(input, inc, family, fields) {
        if (!fields) {
            return new Error("No field schema in from_result_to_object");
        }
        for (var key in input) {
            if (fields.hasOwnProperty(key)) {
                let fieldType = fields[key];
                let value = input[key];
                if (fieldType == 3) {
                    inc.add(family, key.toUpperCase(), value);
                } else {
                    return new Error("Not possible to increment a 'Normal' string entry");
                }
            }
        }
        return null;
    }

    from_result_to_object(result, fields) {
        let item = {};
        if (!result) {
            return result;
        }
        if (!fields) {
            throw new Error("No field schema in from_result_to_object");
        }

        for (let key in fields) {
            let dbKey = `${this.family}:${key.toUpperCase()}`
            if (fields.hasOwnProperty(key) && result.cols.hasOwnProperty(dbKey)) {
                let fieldType = fields[key];
                let value;
                if (fieldType == 1) {       
                    value = JSON.parse(result.cols[dbKey].value.toString());
                } else if (fieldType == 2) {
                    value = result.cols[dbKey].value.toString();
                } else if (fieldType == 3) {
                    //value = parseInt(result.cols[dbKey].value.toString("hex"), 16);
                    value = new Int64BE(result.cols[dbKey].value).toNumber();
                } else {
                    logger.warn(`field type "${fieldType}" is not supported`);
                }
                item[key] = value;
            } 
        }
        if (result.row) {
            item[this.primary] = result.row.toString();
        }
        return item;
    }

}

module.exports = db;
