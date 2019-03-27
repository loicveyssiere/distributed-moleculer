global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname;

const { ServiceBroker } = require("moleculer");
const { loadConfig, nodeid, sleep, logger, streamToString, to } = require("../common/utils");
const program = require("commander");
const stream = require("stream");
const s3 = require("../common/s3");
const pQueue = require("p-queue");

let itemsToGenerate = 1;
let itemsName = "test-split";
let queue = new pQueue({concurrency: 10, xinterval: 1000, xintervalCap: 40 });

program
    .command("* [name] [count]")
    .action(function (name, count) {
        itemsName = name;
        itemsToGenerate = count | 0;
    });
program.parse(process.argv);

// create broker
const config = loadConfig();

config.nodeID = nodeid("test-split");
const broker = new ServiceBroker(config);

// background job
const reflect = (t, p) => p.then(
    v => ({ v, t, status: "fulfilled" }),
    e => ({ e, t, status: "rejected" })
);

let arr = [];

async function run() {
    for (let i = 0; i < itemsToGenerate; i++) {
        const name = `${itemsName}#${i + 1}`;
        const s = new stream.Readable();
        s.push("line1");
        s.push("\n");
        s.push("line2");
        s.push(null);
        const task = { user: "user", name, priority: 0 };
        queue.add(() => {
            const p = reflect('send', broker.call("controller.createTask", s, { meta: task }));
            arr.push(p);
            return p;
        });
    }
}

async function wait() {
    let res = { created: { ok: 0, error: 0, null: 0, count: 0 }, results: { ok: 0, error: 0, count: 0 }, total: itemsToGenerate };
    while (res.created.count < res.total || res.results.count < res.created.ok) {
        await sleep(1000);
        arr = arr.filter(p => p.done !== 1);
        for (let p of arr) {
            if (p.done === 1) continue;
            if (!p.isResolved()) continue;
            p.done = 1;
            p = await p;
            if (res.total === 1) console.log(p);

            if (p.t === "send") {
                res.created.count++;
                if (p.e) {
                    logger.error(p.e);
                    res.created.error++;
                } else if (p.v == null) {
                    logger.error("null found");
                    res.created.null++;
                } else {
                    let [err, s] = await to(s3.readFile(p.v.input));
                    if (err) {
                        logger.error("s3 error:", err);
                        res.created.error++;
                    } else {
                        let name = await streamToString(s);
                        if (false/*name !== p.v.name*/) {
                            logger.error("not matching:", name, p.v.name);
                            res.created.error++;
                        } else {
                            res.created.ok++;
                            const task = p.v;
                            arr.push(reflect('status', broker.call("controller.statusTask", task)));
                        }
                    }
                }
            }
            if (p.t === "status") {
                if (p.e) {
                    logger.error(p.e);
                } else if (p.v == null) {
                    logger.error("null found");
                } else if (p.v.status === "error") {
                    logger.error("task error:", p.v.error)
                    res.results.error++;
                    res.results.count++;
                } else if (p.v.status != "output") {
                    const task = p.v;
                    arr.push(reflect('status', broker.call("controller.statusTask", task)));
                } else if (p.v.status == "wait") {
                    // TODO
                    logger.warn(p)
                } else {
                    res.results.count++;
                    let [err, s] = await to(s3.readFile(p.v.output));
                    if (err) {
                        logger.error("s3 error:", err);
                        res.results.error++;
                    } else {
                        let content = await streamToString(s);
                        if (content !== "out:line1\nout:line2") {
                            logger.error("not matching:", content, "out:line1\nout:line2");
                            res.results.error++;
                        } else {
                            res.results.ok++;
                        }
                    }
                    const task = p.v;
                    broker.call("controller.deleteTask", task);
                }
            }
        }
        logger.info("r:", res);
    }
}

// start
async function startup() {
    await broker.start();
    logger.info("Start");
    wait().then(() => { process.exit(0); });
    run();
}

startup();
