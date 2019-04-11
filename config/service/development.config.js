// here the configuration of a cluster (site)
const common = {
    nodeID: "common",
    site: "dev",
    logger: true,
    logLevel: "error",
    transporter: "nats://localhost:4222",
    skipProcessEventRegistration: true,
    retryPolicy: {
        enabled: true,
    },
};

const api = {
    nodeID: "api",
    port: 8081,
    swaggerPath: "./doc/OCRServiceAPI.yml",
    loggerOptions: {
        frequency: "12h",
        datePattern: "YYYY-MM-DD:HH",
        zippedArchive: false,
        filename: "ocr.api.%DATE%",
        dirname: "./logs/api/",
        stream: null,
        maxSize: "10m",
        maxFiles: "2d",
        //options: {flags: 'a'},
        //auditFile: '..json'
    }
};

const controller = {
    nodeID: "controller",
};

const worker = {
    exec: "./scripts-job/do.py",
    restartInterval: 5000,
    exitWaitTime: 5000,
    nodeID: "worker",
};

const queuer = {
    nodeID: "queuer",
};

const stealer = {
    nodeID: "stealer",
};

const global = {
    nodeID: "global",
    logger: true,
    transporter: "nats://localhost:5222",
    skipProcessEventRegistration: true,
    retryPolicy: {
        enabled: true,
    },
};

const s3 = {
    bucket: "test",
    endPoint: "localhost",
    port: 9000,
    useSSL: false,
    accessKey: "test",
    secretKey: "test1234",
}

const configs = {
    common,
    api,
    controller,
    worker,
    queuer,
    stealer,
    global,
    s3,
};

module.exports = configs;
