# distributed-moleculer

This is a template project of a task queuing scheduler in the context of
document processing. The heterogeneity of the task to be processed imposes a
`pulling` methodology. The extra need of using multiple cluster together
(`offloading`) explains the addition of a `job stealing` scheduler.

## TODO

- [ ] Simplification of the `save` function of datastore
- [ ] Inspect structure, FIFO seems weird with priority (tests)
- [ ] Bug, the cache structure set isEmpty to true whereas the cache is not empty
- [ ] create one table per priority for the reloading process
- [ ] Bug critical, when the job script fails, the worker seems to exit its main loop
- [ ] Security et certificates : gnatsd global
- [ ] Minio load testing (read and write volume charge for documents)
- [ ] When hbase emits an error, should restart the service
- [ ] rest interface
- [ ] implementation of the API (`high level` -> running doc, my docs, processed doc ... `low level` -> createTask, statusTask ...)
- [ ] define and document API that strike the system
- [ ] Enable a working library without the stealer

## Backlogs

- [ ] Add a processedBy field to do stats on offloading
- [ ] Add stat outputs in test to show offloading results
- [ ] Define and implement a statistic system gathering and avoid using logs
- [ ] In relation with statistic, design graphics, metrics info, to link with some API calls?
- [ ] In relation with statistic, how to get the running, working, completed jobs? my docs ... problem of offloading (scanning is impossible) and perhaps offloading needs to be reported to the queuer?
- [ ] In relation with statistic, define and implement a billing database system
- [ ] api-key with quotas, offloading access and priority
- [ ] Replace sleep (worker) by a script loading
- [ ] Consider to pre-load the task env, start JVM?, pre-start the script?
- [ ] Define interface for script (worker), requirements, postulate etc ...
- [ ] Re-implementation of stealer with job stealing cleaner
- [ ] Design and implement plate policies for job stealing
- [ ] keep in mind that the configuration system is able to override an existing config
- [ ] Make a (very) great schema of the full architecture with Visio
- [ ] Implementation of Plate offloading with multi-queues
- [ ] Reloading from database

## Done

- [x] Refacto id with priority in the string (0001:id)
- [x] refacto update with object in params and return object boolean option
- [x] Scan task in hbase to enable recovery
- [x] Finish to write a basic version of the readme file
- [x] Replace neDB by HBase -> tasks (hbase) billing (hbase + aggregation hbase -> sql server)
- [x] Finish to add basic documentation of all different actions
- [x] Inherit name and user for parent, modify the do.py to split if the file contains multiple lines.
- [x] Inspect multipage and child-parent mechanism
- [x] Merge documents need to have all files in the task
- [x] generate input output in task (worker)
- [x] Merge document (delete properly all subdocuments)
- [x] Change input output to let the script creating it own output names
- [x] Separation and isolation of datastore and data structures
- [x] Finish refactoring in similar services with renaming
- [x] documentation of all task update structure
- [x] change childs to children
- [x] Implement 3 modes of worker. in py and js
- [x] execute python with config of the path and enable only script (shebang mode)
- [x] worker : replace copy by calling script and in/out

## Questions

- Should we use NATS for minio (link)[https://github.com/nats-io/demo-minio-nats]‡
  - Answer: ...

- Do we need a lock for the stealer service?
  - Answer: ...

- Recursive splitting: is it a useful feature or should we disable it for stability?
  - Answer: ...

## Vocabulary

### Topology

- `Distributed Computing`: a model in which components of a software system
  are shared among multiple computers to improve efficiency and performance.
- `Microservice Architecture`: an architectural style that structures an
  application as a collection of services that are highly maintainable and
  testable, loosely coupled, independently deployable, organized around business
  capabilities.
- `Plate`: A group of clusters (FR, NY).
- `Cluster` or `site`: A group of nodes often located in the same location (FR01, FR02).
- `Node`: A machine often used in as a server.
- `Service`: An independent application as described in the microservice architecture
- `Task`: The common indivisible job to process (transform a document)

### Concepts

- `Scheduling`: a method that organizes tasks to process and resources.
Optimizing the performance can be based on optimizing the scheduler.
- `Queuing`: Organize and process tasks in the order of arrival and/or based on
  some extra criteria link priority or latency.
- `Pushing`: in this context, a scheduling where tasks are assigned to resources
- `Pulling`: in this context, a scheduling where resources ask for some task to tasks to process
- `Job Stealing` or work stealing: process a task of attached to other workers.
- `Offloading`: transfer of resource intensive computational tasks to an
external platform, such as a cluster, grid, or a cloud.

### Services

- `worker`: a micro-service in charge of processing the task
- `controller`: a micro-service routing the different requests of the client
- `queuer`: a micro-service that maintains a queue list of task with persistence
- `stealer`: a micro-service that proxies a remote queue used for the job stealing

### Status

- `input`: The task is only created
- `output`: The task is finished and processed
- `work`: A resource is allocated to compute the task
- `error`: The task raised an error in its last trial
- `wait`: A parent task that is waiting for its children
- `complete`: A parent task where all subtasks are finished (output) and is ready for processing (merge all children)

### Technical stack

- `NATS`: a simple, high performance open source messaging system for cloud
  native applications, IoT messaging, and microservices architectures.
- `NodeJS`: an open-source, cross-platform JavaScript runtime environment that
  executes JavaScript code outside of a browser.
- `moleculer`: a progressive microservices framework for `NodeJS`.
- `pm2`: an advanced, production process manager for `NodeJS`.
- `Consul`: a distributed service mesh to connect, secure, and configure
  services across any runtime platform and public or private cloud

## Usage

Prepare the bucket:

```bash
mkdir -p /tmp/ocr-ms/moleculer/
cd /tmp/ocr-ms/moleculer/
mc mb test
```

Start an ecosystem with `pm2`

```bash
NODE_ENV=development pm2 start config/pm2/ecosystem.config.js
```

## Project Structure

### Hierarchy

- common
- config
- scripts
- scripts-job
- services
- tests

### Services

#### Controller

Entrypoint and router of client demands

- api.createTask(stream, meta { task })
- api.deleteTask(task)
- api.statusTask(task)
- api.resultTask(task)

return { result: "success|failure", err: (null|err) }

#### Worker

#### Queuer

#### Stealer

## Specification

### MVP 1.0 - Basics

1. [ ] Micro-services architecture with worker, controller, queuer communicating
  with NATS.
2. [ ] The system is built on a queue with specifications
    - [ ] Prioritized
    - [ ] In-memory logic control
    - [ ] Stored information qnd status in database
    - [ ] Possible reloading of the In-memory storage
3. [ ] The controller manage the requests with:
    - [ ] A task can be added to the queue for processing
    - [ ] An existing task can be selected to check the status and the embedded information
    - [ ] An existing task can be selected to return the result of the processing
4. [ ] The worker processes the task with:
    - [ ] A worker is able to pull, and process a simple task
    - [ ] A worker is able to split a task in children tasks if necessary
    - [ ] A worker is able to merge a task if contains children that are completed

### MVP 1.1 - Job Stealing

1. [ ] Steal jobs form another cluster
2. [ ] Security with TLS certificates for the communication extra-sites.

### MVP 1.2 - API Interface

1. [ ] Swagger specifications

### Task model

| Name              | Type                  | Description                      |
|-------------------|:---------------------:|----------------------------------|
|id                 |string                 |Identifier                        |
|user               |string                 |??                                |
|name               |string                 |??                                |
|status             |string                 |see status                        |
|priority           |long                   |0 for very low, 100 for the most important|
|input              |string                 |input file name                   |
|output             |string                 |output file name                  |
|submitTime         |string                 |Unix 13 digits                    |
|startTime          |string                 |Unix 13 digits                    |
|nextTime           |string                 |Deprecated                        |
|duration           |long                   |in milliseconds                   |
|process            |long                   |in milliseconds                   |
|tries              |string                 |number of previous fails          |
|hostname           |string                 |                                  |
|error              |string                 |message log                       |
|parentId           |string                 |if any                            |
|childrenTotal      |long                   |if task is a parent               |
|childrenCompleted  |long                   |if task is a parent               |
|children           |object                 |object list with children ids     |


id : site#id
name: customer task name
input/output: s3 filename
status: input|output|work|error|wait|complete
submitTime
startTime
duration
tries
priority
hostname: hostname on which worker did the job, this is not relevant for subtasks

status:

- input => work
- work => output if task success
- work => input if task failed and tries < 10
- work => error if task failed and tries >= 10
- TODO: work => wait if task return children

Entrypoint for external call is `api`.

task.id => site#id

## Tests

Test multiple processing `input` => `work` => `output`

```bash
node testFunctional/testNormal.js
```

Test document that needs to be split and merged `input` => `wait` => `complete` => `output`

```bash
node testFunctional/testSplit.js
```
