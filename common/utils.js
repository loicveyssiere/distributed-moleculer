'use strict';

const program = require("commander");
const death = require("death")({ uncaughtException: true });
const os = require("os");
const nanoid = require("nanoid");
const util = require("util");
const stream = require('stream');
const winston = require("winston");
const { format } = require("logform");
const { SPLAT } = require('triple-beam');

// TODO: clean me
function loadConfig(name) {
    const config_name = process.env.NODE_ENV || "development"
    const config_path = global.APP_ROOT_DIR + '/../config/service/' + config_name + '.config.js'
    const configs = require(config_path)
    const common = configs["common"];
    const config = name && configs[name];
    // FIXME: cause problems for executing tests
    //program.option("-c, --config [file]", "configuration file").parse(process.argv);
    const override = program.config && require(program.config);
    const common2 = override && override.common;
    const config2 = override && override[name];
    const res = {
        ...common,
        ...common2,
        ...config,
        ...config2,
    };
    res.nodeID = nodeid(res.nodeID);
    return res;
}

const log_level = process.env.LOG_LEVEL || 'info';

/**
 * Return the log message if it is a string or decompose an Error object to
 * provide message and stack strings.
 * @param {string} key 
 * @param {*} value A log message or an error object
 * @return {*} A decomposition of error messages or just the value
 */
function errorReplacer(key, value) {
    if (value instanceof Error) {
       return { message: value.message, stack: value.stack };
    }
    return value;
 }
  
 const logFormat = winston.format.printf((info) => {
    return `${JSON.stringify(info, errorReplacer)}`;
 });
 
 const logger = winston.createLogger({
    level: log_level,
    format: winston.format.combine(
        format((info, opts) => {
            if (!info[SPLAT]) return info;
            var s = info[SPLAT].map(s => util.inspect(s, { breakLength: Infinity })).join(" ");
            info.message = util.format(info.message, s);
            return info;
        })(),
       winston.format.splat(),
       format.colorize(),
       winston.format.timestamp(),
       logFormat,
       
 
       winston.format.printf( (info, opts) => {
          const ts = info.timestamp.slice(0, 19).replace('T', ' ');
          return `${ts} [${info.level}]: \t${info.message} ${(info.stack ? '\n' + info.stack : '')}`;
       })
    ),
    transports: [
       new winston.transports.Console()
     ]
 });

 /*
const alignedWithColorsAndTime = format.combine(
    format((info, opts) => {
        if (!info[SPLAT]) return info;
        var s = info[SPLAT].map(s => util.inspect(s, { breakLength: Infinity })).join(" ");
        info.message = util.format(info.message, s);
        return info;
    })(),
    format((info, opts) => { info.level = info.level.toUpperCase(); return info; })(),
    format.colorize(),
    format.timestamp(),
    format.align(),
    format.printf(info => { return `[${info.timestamp}] ${info.level}: ${info.message}` })
)
const logger = winston.createLogger({
    format: alignedWithColorsAndTime,
});
logger.add(new winston.transports.Console);
*/

function to(promise) {
    return promise.then(
        data => [null, data],
        err => [err, null]
    );
}

function promisify(obj, ...args) {

}

function sleep(ms) {
    return new Promise(resolve => {
        if (ms === 0) resolve();
        else setTimeout(resolve, ms);
    })
}

function shortname() {
    return os.hostname().split('.')[0];
}

function nodeid(nodeid) {
    const pm_id = process.env.NODE_APP_INSTANCE;
    const suffix = pm_id && `-${pm_id}` || '';
    const name = shortname() + '-' + nodeid + suffix;
    return name;
}

function exit(timeout) {
    setTimeout(function () { process.exit(1); }, timeout);
}

function uuid() {
    return nanoid() + new Date().getTime().toString(36);
}

const pipeline = util.promisify(stream.pipeline);

function streamToString(stream) {
    const chunks = []
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
}

module.exports = {
    loadConfig,
    sleep,
    death,
    nodeid,
    shortname,
    exit,
    uuid,
    pipeline,
    to,
    logger,
    promisify,
    streamToString,
};
