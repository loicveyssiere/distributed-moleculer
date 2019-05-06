// Reuse main components of the dev config and override some of it.
const configs = require('./development.config.js')

configs.common = {
    ...configs.common,
    site: 'dev2',
    transporter: "nats://localhost:6222",
    hbaseOptions: {
        zookeeperHosts: ["localhost:2182"],
        zookeeperRoot: "/hbase",
        rpcTimeout: 2000,
        callTimeout: 2000,
        tcpNoDelay: false
    }
};

configs.global = {
    nodeID: "z-global", // Important to change to nodeID in local to avoid conflict
    logger: true,
    transporter: "nats://localhost:5222",
    skipProcessEventRegistration: false,
    retryPolicy: {
        enabled: true,
    }
};

configs.s3 = {
    ...configs.s3,
    bucket: "bucket2"
};

module.exports = configs;