const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { nodeid, sleep, logger } = require("./utils");
const program = require("commander");
const fs = require("fs");
const stream = require("stream");

let itemsToGenerate = 1;
let itemsName = "test";

program
    .command("* [name] [count]")
    .action(function (name, count) {
        itemsName = name;
        itemsToGenerate = count | 0;
    });
program.parse(process.argv);

// create broker
const config = {
    ...loadConfig(),
    
}
config.nodeID = nodeid("test");
const broker = new ServiceBroker(config);

// background job
const reflect = p => p.then(v => ({v, status: "fulfilled" }),
                            e => ({e, status: "rejected" }));
const waitAll = a => Promise.all(a.map(reflect));

async function run() {
    const arr = [];
    for (let i = 0; i<itemsToGenerate; i++) {
        const name = `${itemsName}#${i+1}`;
        //const stream = fs.createReadStream("./gnatsd");
        const s = new stream.Readable();
        s.push(name);
        s.push(null);
        const task = { priority: 0, name };
        const p = broker.call("controller.newTask", s, { meta: task });
        arr.push(p);
    }
    const results = await waitAll(arr);
    let i=0;
    let m = results.length;
    for (let r of results) {
        if (r.e) logger.error(r.e);
        //console.log("waiting for:", r.v.output,++i,"/",m);
        /*
        const filename = `./data/test/${r.v.output}`
        while (true) {
            if (fs.existsSync(filename)) {
                const data = fs.readFileSync(filename).toString();
                if (data !== r.v.name) {
                    logger.error("=> does not match", r.v);
                }
                break;
            }
            await sleep(1000);
        }
        */
        const filename = `/tmp/ocr-ms/moleculer/test/${r.v.output}`;
        while (true) {
            if (fs.existsSync(filename)) {
                break;
            }
            await sleep(1000);
        }
    }
    // console.log("finished");
}

// start
async function startup() {
    await broker.start();
    await run();
    process.exit();
}

startup();
