global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname+"/..";

const { ServiceBroker } = require("moleculer");
const { loadConfig, nodeid, sleep, logger, streamToString, to } = require("../../common/utils");
const program = require("commander");
const stream = require("stream");
const s3 = require("../../common/s3");
const pQueue = require("p-queue");

let itemsToGenerate = 1;
let itemsName = "test";
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

config.nodeID = nodeid("test");
const broker = new ServiceBroker(config);

// background job
const reflect = (t, p) => p.then(
    v => ({ v, t, status: "fulfilled" }),
    e => ({ e, t, status: "rejected" })
);
const waitAll = a => Promise.all(a.map(reflect));

let arr = [];

async function run() {
    for (let i = 0; i < itemsToGenerate; i++) {
        const name = `${itemsName}#${i + 1}`;
        //const stream = fs.createReadStream("./gnatsd");
        const s = new stream.Readable();
        s.push(name);
        s.push(null);
        const task = {
            priority: 0,
            profile: "Default",
            userType: "WEB",
            userId: "XLOIC",
            fileName: name,
            outputType: "HTML,DOCX"
        };
        //const p = reflect('send', broker.call("controller.createTask", s, { meta: task }));
        //arr.push(reflect('send', broker.call("controller.createTask", s, { meta: task })));
        queue.add(() => {
            const p = reflect('send', broker.call("controller.createTask", s, { meta: task }));
            arr.push(p);
            return p;
        });
        //arr.push(p);
        //await sleep(0);
    }
}

async function wait() {
    // wait for all tasks
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
//                    res.created.error++;

                    let [err, s] = await to(s3.readFile(p.v.inputPath));
                    if (err) {
                        logger.error("s3 error:", err);
                        res.created.error++;
                    } else {
                        let name = await streamToString(s);
                        if (name !== p.v.fileName) {
                            logger.error("not matching:", name, p.v.fileName);
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
                } else if (p.v.status != "OUTPUT") {
                    const task = p.v;
                    arr.push(reflect('status', broker.call("controller.statusTask", task)));
                } else {
                    res.results.count++;
                    let [err, s] = await to(s3.readFile(p.v.outputPath));
                    if (err) {
                        logger.error("s3 error:", err);
                        res.results.error++;
                    } else {
                        let name = await streamToString(s);
                        if (name !== `out:${p.v.fileName}`) {
                            logger.error("not matching:", name, `out:${p.v.fileName}`);
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
    //run();
    logger.info("Start");
    wait().then(() => { process.exit(0); });
    run();
    //process.exit(0);
}

startup();
