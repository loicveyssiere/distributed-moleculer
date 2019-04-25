const request = require('request');

global.APP_ROOT_DIR = global.APP_ROOT_DIR || __dirname + "/..";

const { loadConfig, death, exit, to, logger, sleep } = require(global.APP_ROOT_DIR + "/../common/utils");

const URI = "http://localhost:8081";

const routes = {
    postTask: (body) => {return {
        method: 'post',
        uri: `${URI}/rest/ocr/v1/task`,
        body: body,
        json: true
    }},
    getTaskStatus: (taskId) => { return {
        method: 'get',
        uri: `${URI}/rest/ocr/v1/task/${taskId}/status`,
        json: true
    }},
    getTask: (taskId) => { return {
        method: 'get',
        uri: `${URI}/rest/ocr/v1/task/${taskId}`,
        json: true
    }},
    getTaskDetails: (taskId) => { return {
        method: 'get',
        uri: `${URI}/rest/ocr/v1/task/${taskId}/details`,
        json: true
    }}
};

async function send(r) {
    console.log(r.uri);
    return new Promise(function(resolve, reject) {
        request(r, function(error, response, body) {
            if (error) {
                return reject(error);
            } else {
                return resolve(response);
            }
        });
    });
}

async function run() {

    let ids = new Array(100);
    total = 0;
    
    while(true) {
        let n;
        if (total > 1000 - 20) {
            n = 1000 - total;
        } else {
            n = getRandomInt(1, 10);
        }

        total += n;
        
        let jobs = new Array();

        console.log(n);

        for (let i = 0; i < n; i++) {
            let p = getRandomInt(0, 10000);
            let r;
            if (p % 3 == 0) {
                r = routes.getTaskDetails("0000.C");
            } else if (p % 5 == 0) {
                r = routes.getTaskStatus("000.B");
            } else if (p % 7) {
                r = routes.getTask("0000.A");
            } else {
                let body = {
                    ocrTaskRequestElements: [{
                        fileName: "fileName",
                        contents: "am9obiBzbm93",
                        outputTypes: ["PDF", "HTML"],
                        ocrProfile: "Default"
                    }]
                };
                if (p % 9 == 0) {
                    body.ocrProfile = "Corrupted";
                }
                r = routes.postTask(body);
            }

            if (p % 13 == 0) {
                r.headers = {}
            } else {
                if (p % 11 == 0) {
                    r.headers = {"x-api-key": "mykey"}
                } else {
                    r.headers = {"Authorization": "Basic am9obiBzbm93"}
                }
            }
            r.headers["Content-Type"] = "application/json"
            jobs.push(send(r));
        }
        await Promise.all(jobs);
        //await sleep(n*14);

        if (total > 999) break;
    }
    console.log("Total: ", total);
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

run();

