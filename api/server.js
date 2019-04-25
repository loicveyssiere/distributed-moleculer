'use strict';

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const express = require('express');
var http = require('http');
const https = require('https');
const stream = require("stream");
const fs = require('fs')
const { ServiceBroker } = require("moleculer");
const createMiddleware = require('swagger-express-middleware');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const CacheSingleton = require('./cache');
const routes = require('./routes');
const checkSecurity = require('./checkSecurity');
const checkLimitUsage = require('./checkLimitUsage');
const filterMonitoring = require('./filterMonitoring');

const { loadConfig, to, logger, promisify, death, exit } = require(global.APP_ROOT_DIR + "/../common/utils");

// Constants
const SERVICE_NAME = "api";

// Loading configuration
const config = loadConfig(SERVICE_NAME)

const port = config.port || 8080;
const apiVersion = 'v1';
const app = express();

// Creating broker
app.broker = new ServiceBroker(config);

// Create Swagger
app.swagger = createMiddleware(config.swaggerPath, app);

// Read Swagger file for swagger UI
app.swaggerDoc = YAML.load(config.swaggerPath);

app.filterLogger = winston.createLogger({
    transports: [
        new DailyRotateFile(config.loggerOptions)
    ],
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
});

app.configHttpsOptions = {
    key: fs.readFileSync(config.httpsOptions.keyPath),
    cert: fs.readFileSync(config.httpsOptions.certPath),
    ca: fs.readFileSync(config.httpsOptions.caPath)
}

// Entry point of the programme 
start(app);

/* =============================================================================
   Private functions
==============================================================================*/
function start(app) {

    function filterFailure(err, req, res, next) {
        logger.debug('/filterFailure'); 
        res.statusCode = err.status;
        res.body = err.message;
        res.err = err;
        res.type('application/json');
        logger.info(`API sent a ${err.status} error with the message: ${err.message}`);
        res.status(err.status);
        if (err.status === 401) {
            res.set("WWW-Authenticate", "Basic realm=\"Authorization Required\"");
        }
        res.send({
            code: err.status,
            message: err.message
        });
        next();
    }

    function filterSuccess(req, res, next) {
        logger.debug('/filterSuccess');
        res.statusCode = res.statusCode || "200"
        res.status(res.statusCode);

        if (res.body instanceof stream.Stream) {
            //res.type('application/octet-stream');
            //res.body.pipe(res);
            res.body.on('data', function(data) {
                res.write(data);
            });
            res.body.on('end', function() {
                res.end();
            });
        } else {
            res.type('application/json');
            res.send(res.body);
        }
        return next();
    }

    function init(req, res, next) {
        req.metadata =  {}
        req.metadata.startTime = new Date();
        return next();
    }

    var mwBefore = [
        init,
        app.swagger.metadata(), // formation of the swagger structure
        app.swagger.parseRequest(), // Parse request based on type
        app.swagger.validateRequest(), // Check model structure of the request
        checkSecurity, // Authentication 
        checkLimitUsage // Authorization with quotas
    ]
    
    var mwAfter = [
        filterSuccess, // Return response if success
        filterFailure, // return response if failure
        filterMonitoring // store usage for monitoring
    ];

    /* Routes */
    app.get(`/rest/ocr/${apiVersion}/task`, mwBefore, function(req, res, next) {
        res.type('text/plain');
        res.body = fs.createReadStream(config.swaggerPath);
        return next();
    }, mwAfter);
    app.post(`/rest/ocr/${apiVersion}/task`, mwBefore, routes.postTask, mwAfter);
    app.get(`/rest/ocr/${apiVersion}/task/:taskId/status`, mwBefore, routes.getTaskStatus, mwAfter);
    app.get(`/rest/ocr/${apiVersion}/task/:taskId`, mwBefore, routes.getTask, mwAfter);
    app.delete(`/rest/ocr/${apiVersion}/task/:taskId`, mwBefore, routes.deleteTask, mwAfter);
    app.get(`/rest/ocr/${apiVersion}/task/:taskId/details`, mwBefore, routes.getTaskDetails, mwAfter);
    app.get(`/rest/ocr/${apiVersion}/task/:taskId/:getTask`, mwBefore, routes.getTaskByType, mwAfter);

    /* Swagger UI */
    app.use(`/rest/ocr/${apiVersion}/swaggerUI`,
        checkSecurity,
        filterFailure,
        function(req, res, next) { /* To avoid problems of multiple responses */
            if (res.err) {return;} else {return next();}
        },
        swaggerUi.serve,
        swaggerUi.setup(app.swaggerDoc, config.swaggerUiOptions));

    //let server = https.createServer(app.configHttpsOptions, app);
    let server = http.createServer(app);

    server.listen(/*port*/8081, function() {
        logger.info('Launching Report Manager App');
        logger.info('| environment: ' + process.env.NODE_ENV);
        logger.info('| port: ' + /*port*/8081);
        
        app.broker.start();
        CacheSingleton.setOptions(config.cacheOptions);
        app.cache = CacheSingleton.getInstance();

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
