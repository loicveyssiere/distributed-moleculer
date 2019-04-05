'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const express = require('express');
const { ServiceBroker } = require("moleculer");
const createMiddleware = require('swagger-express-middleware');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const routes = require('./routes');
const checkOutputModel = require('./checkOutputModel');
const checkSecurity = require('./checkSecurity');
const checkLimitUsage = require('./checkLimitUsage');
const filterMonitoring = require('./filterMonitoring');

const { loadConfig, to, logger, promisify, death, exit } = require(global.APP_ROOT_DIR + "/../common/utils");

// Constants
const SERVICE_NAME = "api";

// Loading configuration
const config = loadConfig(SERVICE_NAME)

const port = config.port || 8080;
const apiVersion = 'v2';
const app = express();

// Creating broker
app.broker = new ServiceBroker(config);

// Create Swagger
app.swagger = createMiddleware(config.swaggerPath, app);

app.filterLogger = winston.createLogger({
    transports: [
        new DailyRotateFile(config.loggerOptions)
    ],
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
});

// Entry point of the programme 
start(app);

/* =============================================================================
   Private functions
==============================================================================*/
function start(app) {

    function filterFailure(err, req, res, next) {
        console.log('/filterFailure'); 
        res.statusCode = err.status;
        res.body = err.message;
        res.err = err;
        res.type('application/json');
        logger.error(err.message);
        res.status(err.status);
        res.send({
            code: err.status,
            message: err.message
        });
        next();
    }

    function filterSuccess(req, res, next) {
        console.log('/filterSuccess');
        res.status('200');
        res.type('application/json');
        res.statusCode = res.statusCode || "200"
        res.status(res.statusCode);
        res.send(res.body);
        next();
    }

    function ping(req, res, next) {
        console.log("ping")
        res.objectJSON = {'result': 'pong'};
        next();
    }

    var mwBefore = [
        app.swagger.metadata(), // formation of the swagger structure
        app.swagger.parseRequest(), // Parse request based on type
        app.swagger.validateRequest(), // Check model structure of the request
        checkSecurity, // Authentication 
        checkLimitUsage // Authorization with quotas
    ]
    
    var mwAfter = [
        checkOutputModel, // Check model structure of the response
        filterSuccess, // Return response if success
        filterFailure, // return response if failure
        filterMonitoring // store usage for monitoring
    ];

    /* Routes */
    app.get('/ping', mwBefore, ping, mwAfter);
    app.post(`/rest/ocr/${apiVersion}/task`, mwBefore, routes.postTask, mwAfter);
    app.get(`/rest/ocr/${apiVersion}/task/:taskId/status`, mwBefore, routes.getTaskStatus, mwAfter);
    app.delete(`/rest/ocr/${apiVersion}/task/:taskId`, mwBefore, routes.deleteTask, mwAfter);
    app.get(`/rest/ocr/${apiVersion}/task/:taskId/details`, mwBefore, routes.getTaskDetails, mwAfter);
    app.get(`/rest/ocr/${apiVersion}/task/:taskId/:getTask`, mwBefore, routes.getTask, mwAfter);

    app.listen(port, function() {
        logger.info('Launching Report Manager App');
        logger.info('| environment: ' + process.env.NODE_ENV);
        logger.info('| port: ' + port);
        
        //app.broker.start();

        // Clean termination of the micro-service 
        death((_, err) => { 
            // SIGINT: Sent from CTRL-C.
            // SIGQUIT: Sent from keyboard quit action.
            // SIGTERM: Sent from operating system kill.
            exit(1000);
            if (err) { logger.error(err); }
            if (app.broker != null) logger.info("Exiting, waiting for current process to finish");
        });
    });
}

/* Here an important mechanism. When promises and async are mixed, strange
behavior appended for error handling. The solution exposes here is to force a
full crash of the application. In the extend, it will be easier to monitor such
error events and a patch should be propose as soon as possible */
process.on('unhandledRejection', (error, p) => {
   logger.warn("Unhandled Rejection");
   logger.error(error);
   process.exit(1);
});
