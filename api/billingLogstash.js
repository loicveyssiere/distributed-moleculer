'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const { loadConfig, death, exit, to, logger } = require(global.APP_ROOT_DIR + "/../common/utils");
const Int64BE = require("int64-buffer").Int64BE;

const request = require('request');
const hbase = require("hbase-rpc-client");
const moment = require("moment");
const db = require("../common/db_hbase");

start();

/* -----------------------------------------------------------------------------
    METHODS
----------------------------------------------------------------------------- */

async function job(client, options) {
    var start = new Date()
    logger.info("/job");
    var i = 0;
    //var scanner = null; client.getScanner(options.table);
    var stop = false;

    //scanner = client.getScanner(options.table, options.lastEvaluatedKey, null);

    let scanner = client.scanner;
    scanner.init(options.lastEvaluatedKey, null);

    var tasks = new Array();
    var err;
    var tmpLastEvaluatedKey = options.lastEvaluatedKey;
    scanner.each(async function(err, task, done) {
        i++;
        if (task == null) {
            logger.info("empty");
        }
        console.log(task.id);
        tmpLastEvaluatedKey = task.id;
        tasks.push(task);
        let shouldSendData = (!task && task.length > 0) || (tasks.length >= options.maxScannedElements)
        if (shouldSendData) {
            let body;
            [body, err] = await send(tasks, options);
            if (err) {
                logger.error(err.message);
            } else {
                options.lastEvaluatedKey = tmpLastEvaluatedKey;
                tasks = new Array();
                console.log('refresh')
            }
        }
        done();
    }).then(data => {
        return;
    }).catch(err => {
        console.log(err);
        return;
    });

    var end = new Date() - start
    console.info('%d tasks | Execution time: %dms', i, end)
}

async function send(tasks, options) {
    return new Promise(function(resolve, reject) {
        request({
            method: 'post',
            uri: "http://localhost:5043",
            body: {
                results: tasks
            },
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

    const client = new db({
        family: 'C',
        primary: 'id',
        schema: 'onv_ocr_2',
        table: 'billing'
    });

    var nextEvaluatedDate = moment().subtract(2, 'days').toISOString();
    console.log(nextEvaluatedDate.substring(0, 19));

    var options = {
        restartInterval: 60 * 1000,
        lastEvaluatedKey: nextEvaluatedDate,
        maxScannedElements: 3
    }

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
