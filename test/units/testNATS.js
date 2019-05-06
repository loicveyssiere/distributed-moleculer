"user strict";

var NATS = require("nats");
const assert = require("assert");
const {spawn} = require("child_process");
const { logger } = require("../../common/utils");

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function initNATS(name, nats, silent=false) {
    nats = spawn("gnatsd", ["--config", `./test/nats/${name}.conf`]);
    nats.stdout.on("data", data => {
        if (!silent) {
            var lines = data.toString().split("\n");
            for (let line of lines) {
                logger.info(`${name} stdout: ${line.trim()}`);
            } 
        } 
    });
    nats.stderr.on("data", data => {
        if (!silent) {
            var lines = data.toString().split("\n");
            for (let line of lines) {
                logger.warn(`${name} stdout: ${line.trim()}`);
            }
        }
    });
    nats.on("exit", code => {
        logger.info(`${name}: code is: ${code}`);
    });
    return nats;
}

describe("NATS", function () {
    this.timeout(60000);
    var local1, local2, remote1, remote2, remote3;
    before(function (done) {
        local1 = initNATS("local1", local1);
        local2 = initNATS("local2", local2);
        remote1 = initNATS("remote1", remote1, true);
        remote2 = initNATS("remote2", remote2, true);
        remote3 = initNATS("remote3", remote3, true);
        sleep(2000).then(function(){
            done();
        });
    });

    after(function (done) {
        local1.kill("SIGINT");
        local2.kill("SIGINT");
        remote1.kill("SIGINT");
        remote2.kill("SIGINT");
        remote3.kill("SIGINT");
        done();
    });

    it ("should not be able to connect to a random port", function(done) {
        var  nc = NATS.connect({servers: ["nats://localhost:4221"]});
        nc.on("connect", c => {
            nc.close();
            assert.fail("Connection not supposed to success");
        });
        nc.on("error", err => {
            done();
        });
    });

    it("should be able to connect to an existing local NATS server", function (done) {
        var nc = NATS.connect({servers: ["nats://localhost:4222"]});
        var message = "message";
        nc.on("connect", c => {
            nc.subscribe('foo', function(msg) {
                assert.equal(msg, message);
                done();
                nc.close();
            });
            sleep(2000).then(function() {
                nc.publish('foo', message);
            });
        });
        nc.on("error", err => {
            assert.fail("Connection not supposed to fail");
        });
    });

    it("should be able to share messages between cluster nodes", function(done) {
        var nc1 = NATS.connect({servers: ["nats://localhost:4222"]});
        var nc2 = NATS.connect({servers: ["nats://localhost:4223"]});
        var message = "message";
        nc1.on("connect", c1 => {
            console.log("connected nc1")
            nc1.subscribe('foo', function(msg) {
                console.log("subscribe nc1")
                assert.equal(msg, message);
                nc1.close();
                nc2.close();
                done();
            });
        });
        nc2.on("connect", c2 => {
            console.log("connected nc2")
            sleep(2000).then(function() {
                console.log("publish nc2")
                nc2.publish('foo', message);
            });
        });

        nc1.on("error", err => {
            assert.fail("Connection not supposed to fail");
        });

        nc2.on("error", err => {
            assert.fail("Connection not supposed to fail");
        });
    });

    it("should be able to share messages between open cluster www nodes", function(done) {
        var nc1 = NATS.connect({servers: ["nats://localhost:4232"]});
        var nc2 = NATS.connect({servers: ["nats://localhost:4233"]});
        var message = "message";
        nc1.on("connect", c1 => {
            console.log("connected nc1")
            nc1.subscribe('foo', function(msg) {
                console.log("subscribe nc1")
                assert.equal(msg, message);
                nc1.close();
                nc2.close();
                done();
            });
        });

        nc2.on("connect", c2 => {
            console.log("connected nc2")
            sleep(2000).then(function() {
                console.log("publish nc2")
                nc2.publish('foo', message);
            });
        });

        nc1.on("error", err => {
            assert.fail("Connection not supposed to fail");
        });

        nc2.on("error", err => {
            assert.fail("Connection not supposed to fail");
        });
    });

    it("should not be able to share messages between no tls cluster www nodes", function(done) {
        var nc1 = NATS.connect({servers: ["nats://localhost:4232"]});
        var nc2 = NATS.connect({servers: ["nats://localhost:4234"]});
        var message = "message";
        nc1.on("connect", c1 => {
            console.log("connected nc1")
            nc1.subscribe('foo', function(msg) {
                console.log("subscribe nc1")
                assert.fail("not supposed to receive messages");
            });
            sleep(8000).then(function() {
                nc1.close();
                nc2.close();
                done();
            });
        });

        nc2.on("connect", c2 => {
            console.log("connected nc2")
            sleep(2000).then(function() {
                console.log("publish nc2")
                nc2.publish('foo', message);
            });
        });

        nc1.on("error", err => {
            assert.fail("Connection not supposed to fail");
        });

        nc2.on("error", err => {
            assert.fail("Connection not supposed to fail");
        });
    });
});
