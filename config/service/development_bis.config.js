// Reuse main components of the dev config and override some of it.
const configs = require('./development.config.js')

configs.common = {
    ...configs.common,
    site: 'second',
    transporter: "nats://localhost:6222",
};

configs.s3 = {
    ...configs.s3,
    bucket: "test2",
};

module.exports = configs;