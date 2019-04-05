'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const { loadConfig, death, exit, to, logger } = require(global.APP_ROOT_DIR + "/../common/utils");

const request = require('request');
const hbase = require("hbase-rpc-client");
const moment = require("moment");
const assert = require("assert");


/*
request('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY', { json: true }, (err, res, body) => {
  if (err) { return console.log(err); }
  console.log(body.url);
  console.log(body.explanation);
});
*/

const fields = {
    nbPages: 2
}

start();

/* -----------------------------------------------------------------------------
    METHODS
----------------------------------------------------------------------------- */

async function job(client, options) {
    logger.info("/job");
    var i = 0, j = 0;
    var scanner = null; client.getScanner(options.table);
    var stop = false;

    scanner = client.getScanner(options.table, options.lastEvaluatedKey, null);


    function next(scanner) {
        return new Promise(function (resolve, reject) {
            scanner.next(function(err, result) {
                if (err) {
                    return reject(err);
                }
                let task = from_result_to_object(result, fields);
                return resolve(task);
            });
        }).then(task => {
            return [task, null];
        }).catch(err => {
            return [null, err];
        })
    }

    var skipFirstElement = true;

    while (j < 100000) {
        var tasks = new Array();
        var err;
        var tmpLastEvaluatedKey = options.lastEvaluatedKey;
        for (let i = 0; i < options.maxScannedElements; i++) {
            let task;
            [task, err] = await next(scanner);
            if (err) {
                break;
            }
            if (task == null) {
                break;
            }
            if (skipFirstElement) {
                skipFirstElement = false;
            } else {
                tmpLastEvaluatedKey = task._id;
                tasks.push(task);
            } 
        }

        console.log(tasks);
        if (err) {
            break;
        }
        if (tasks.length == 0) {
            break;
        }
        if (tasks.length > 0) {
            let body;
            [body, err] = await send(tasks, options);
            if (err) {
                logger.error(err.message);
            } else {
                options.lastEvaluatedKey = tmpLastEvaluatedKey;
            }
        }
        if (err) {
            break;
        }
        j++;
    }
}

async function send(tasks, options) {
    return new Promise(function(resolve, reject) {
        request({
            method: 'post',
            uri: "http://localhost:5043",
            body: tasks,
            json: true
        }, function(error, response, body) {
            if (error) {
                return reject(error);
            } else if (response.statusCode != 200) {
                return reject(new Error(`status code is ${response.statusCode}`));
            } else {
                return resolve(body);
            }
        });
    }).then(data => {
        return [data, null];
    }).catch(err => {
        return [null, err];
    });
}

function start() {

    var nextEvaluatedDate = moment().subtract(2, 'days').toISOString();
    console.log(nextEvaluatedDate.substring(0, 19));

    var options = {
        restartInterval: 60 * 1000,
        table: "taskBilling",
        rowFamily: "data",
        lastEvaluatedKey: nextEvaluatedDate,
        skipFirstElement: false,
        maxScannedElements: 100,
    }

    var client = hbase({
        zookeeperHosts: ["localhost:2181"],
        zookeeperRoot: "/hbase"
    });
    client.on("error", err => logger.error("connection error", err));

    job(client, options);
    setInterval(() => {
        job(client, options);
      }, options.restartInterval);

    death(async (_, err) => {
        // SIGINT: Sent from CTRL-C.
        // SIGQUIT: Sent from keyboard quit action.
        // SIGTERM: Sent from operating system kill.
        exit(5000);
        if (err) { logger.error(err); }
        process.exit();
    });
}

function from_result_to_object(result, fields) {
    let task = {};
    if (!result) {
        return null;
    }
    if (!result.row) {
        return null;
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
        task._id = result.row.toString();
    }
    return task;
}