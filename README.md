# distributed-moleculer

This is a template project of a task queuing scheduler in the context of
document processing. The heterogeneity of the task to be processed imposes a
`pulling` methodology. The extra need of using multiple cluster together
(`offloading`) explains the addition of a `job stealing` scheduler.

## TODO


- [ ] Bug critical, when the job script fails, the worker seems to exit its main loop
- [ ] add authentication information in log usage monitoring
- [ ] Minio load testing (read and write volume charge for documents)
- [ ] Minio configuration
- [ ] HTTPS on api server

## Backlogs

- [ ] Job stealing - add share document for children
- [ ] API: Authorization with quotas
- [ ] api-key with quotas, offloading access and priority
- [ ] Inspect for variable to put in the configuration (zookeeper conf for example)
- [ ] Inspect structure, FIFO seems weird with priority (tests)
- [ ] Enable a working library without the stealer
- [ ] Big topic on stats to enhanced for job stealing.
- [ ] Add a processedBy field to do stats on offloading
- [ ] Add stat outputs in test to show offloading results
- [ ] Define and implement a statistic system gathering and avoid using logs
- [ ] In relation with statistic, design graphics, metrics info, to link with some API calls?
- [ ] In relation with statistic, how to get the running, working, completed jobs? my docs ... problem of offloading (scanning is impossible) and perhaps offloading needs to be reported to the queuer?
- [ ] In relation with statistic, define and implement a billing database system
- [ ] Consider to pre-load the task env, start JVM?, pre-start the script?
- [ ] Define interface for script (worker), requirements, postulate etc ...
- [ ] Re-implementation of stealer with job stealing cleaner
- [ ] Design and implement plate policies for job stealing
- [ ] Implementation of Plate offloading with multi-queues
- [ ] Make a (very) great schema of the full architecture with Visio

## Done

- [x] Bug, when hbase emits an error, we should restart the service
- [x] hash api keys
- [x] Enable custom profile
- [x] Job-stealing with children: careful treatment to do (increment parent)
- [x] Data structure are broken isEmpty and highestPriority. shareLogs is impacted...
- [x] job stealing stats + correctness + working in standalone
- [x] Bug, the cache structure set isEmpty to true whereas the cache is not empty
- [x] Bug correction in reloading (use done function)
- [x] Scanner get instances and remove singleton
- [x] Cache create a real singleton class
- [x] Correction of swagger UI to use Basic authentication + WWW-auth header
- [x] Integration of swagger UI 
- [x] Clean children at the save of the parent
- [x] rest implementation of get by type
- [x] In the implementation of delete, multiple call of get methods (to clean)
- [x] API: Authentication
- [x] no task in db should not return error at the API level
- [x] rest API implementation
- [x] use cache to check user information
- [x] keep in mind that the configuration system is able to override an existing config
- [x] reimplement db_hbase to be generic (including scanning using first key and last key)
- [x] Where is the hostname field in the database?
- [x] Refactoring to use new data structures and pheonix
- [x] remove multiple table for multiple priority
- [x] use real billing data structure
- [x] refacto code to use uppercases on status and table field and table name
- [x] API: Log usage for monitoring
- [x] Add task to billing storage
- [x] API: Swagger validation of the response
- [x] define and document API that strike the system, reuse the same one
- [x] Enable data structure creation using Phoenix 
- [x] Get the previous data structures
- [x] PoC of the api metrics ingested by logstash
- [x] PoC fo the billing hbase scanner to logstash ingestion
- [x] Install the elastic stack
- [x] API: Swagger validation of the request
- [x] Add a wakeup if task generate child or complete a task
- [x] Simplification of the `save` function of datastore
- [x] Replace sleep (worker) by a script loading
- [x] Security et certificates : gnatsd global
- [x] Reloading from database
- [x] create one table per priority for the reloading process
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

- `INPUT`: The task is only created
- `OUTPUT`: The task is finished and processed
- `WORK`: A resource is allocated to compute the task
- `ERROR`: The task raised an error in its last trial
- `WAIT`: A parent task that is waiting for its children
- `COMPLETE`: A parent task where all subtasks are finished (output) and is ready for processing (merge all children)

### Technical stack

- `NATS`: a simple, high performance open source messaging system for cloud
  native applications, IoT messaging, and microservices architectures.
- `NodeJS`: an open-source, cross-platform JavaScript runtime environment that
  executes JavaScript code outside of a browser.
- `moleculer`: a progressive microservices framework for `NodeJS`.
- `pm2`: an advanced, production process manager for `NodeJS`.
- `Consul`: a distributed service mesh to connect, secure, and configure
  services across any runtime platform and public or private cloud

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

#### Worker

#### Queuer

#### Stealer

## Specification

### MVP 1.0 - Basics

1. [x] Micro-services architecture with worker, controller, queuer communicating
  with NATS.
2. [x] The system is built on a queue with specifications
    - [x] Prioritized
    - [x] In-memory logic control
    - [x] Stored information and status in database
    - [x] Possible reloading of the in-memory storage
3. [x] The controller manage the requests with:
    - [x] A task can be added to the queue for processing
    - [x] An existing task can be selected to check the status and the embedded information
    - [x] An existing task can be selected to return the result of the processing
4. [x] The worker processes the task with:
    - [x] A worker is able to pull, and process a simple task
    - [x] A worker is able to split a task in children tasks if necessary
    - [ ] A worker is able to merge a task if contains children that are completed

### MVP 1.1 - Job Stealing

1. [x] Security with TLS certificates for the communication extra-sites.
2. [ ] statistics component
3. [ ] Steal jobs form another cluster
4. [ ] multi-queue with priority and chained by authorization on plates.

### MVP 1.2 - API Interface

1. [ ] Swagger specifications
2. [ ] API layers and middleware
    - [ ] Security and usage checking
    - [ ] Swagger validation of requests
    - [ ] Check Response validation
    - [ ] Filter correctly possible errors
    - [ ] finalize with monitoring component
3. [ ] Billing with YMDHMS keys and dump into files for logstash?
    - [ ] Design data structure
4. [ ] Monitoring component, generate files for Logstash
    - [ ] Design data structure
    - [ ] Filebeat
        - [ ] Configure for resend data in a recover mode
    - [ ] Logstash
    - [ ] Elasticsearch
5. [ ] Grafana monitoring or any other tool using ElasticSearch

### MVP 1.3 - Web

1. [ ] Web

### Workflows

- input => work
- work => output if task success
- work => input if task failed and tries < 10
- work => error if task failed and tries >= 10
- work => wait if task return children
- wait => complete if last child is finished
- complete => work

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
