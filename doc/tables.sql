/* =============================================================================
INFORMATION

    1. Apache Phoenix forces us to use uppercases for:
        - Schemas
        - Tables
        - Column Families
        - Fields
    For readability, we use camelCases but everything is processed as uppercases.

    2. Note that an additional column is created is HBase under
        - <rowFamily>:_0

    3. This sql schema is used as a documentation for OCR database structures.
        - Provide changes in this file
        - Avoid documenting somewhere else
============================================================================= */
CREATE SCHEMA IF NOT EXISTS ONV_OCR_2;

CREATE TABLE IF NOT EXISTS ONV_OCR_2.task (
    id VARCHAR NOT NULL,
    /* Task */
    C.status VARCHAR, /* INPUT | OUTPUT | WORK | ERROR | WAIT | COMPLETE */
    C.priority BIGINT, /* The bigger the more important */
    C.profile VARCHAR, 
    /* User */
    C.userType VARCHAR,
    C.userId VARCHAR, /* X<user> or API key */
    /* File */
    C.fileName VARCHAR,
    C.fileSize VARCHAR,
    C.inputPath VARCHAR,
    C.outputType VARCHAR, /* A type or a concatenation: HTML,PDF,DOCX */
    C.outputPath VARCHAR,
    C.totalPages BIGINT,
    /* Time */
    C.submitTime BIGINT, /* Time when the request reaches the API */
    C.startTime BIGINT, /* Time when a worker start working on the task for the first time */
    C.lastStartTime BIGINT, /* Time when a worker start working on the task */
    C.availabilityTime BIGINT, /* Time when the task result is available for the user */
    C.userDuration BIGINT, /* Elapse duration between the submitTime and the availability time */
    C.cpuDuration BIGINT, /* Cumulative elapse time in the different resources (CPUs) */
    C.processDuration BIGINT, /* Real processing elapse time */
    /* Node */
    C.site VARCHAR, /* The site or cluster which host the task */
    C.hostName VARCHAR, /* The node which created the task <- useless? */
    C.siteProcessor VARCHAR, /* The site or cluster which processed */
    C.hostNameProcessor VARCHAR, /* The node which processed the task */
    /* Error */
    C.tries BIGINT, /* Number of retries caused by previous errors */
    C.errorMessage VARCHAR,
    /* Children */
    C.childrenArray VARCHAR,
    C.parentId VARCHAR,
    C.childrenTotal BIGINT, 
    C.childrenCompleted BIGINT,
    CONSTRAINT PK PRIMARY KEY (id)
)
COLUMN_ENCODED_BYTES = 0;

CREATE TABLE IF NOT EXISTS ONV_OCR_2.billing (
    id VARCHAR NOT NULL,
    /* Task */
    C.taskId VARCHAR,
    C.status VARCHAR, /* INPUT | OUTPUT | WORK | ERROR | WAIT | COMPLETE */
    C.priority BIGINT, /* The bigger the more important */
    C.profile VARCHAR,
    /* User */
    C.userType VARCHAR,
    C.userId VARCHAR, /* X<user> or API key */
    C.billingEntity VARCHAR,
    /* Files */
    C.fileName VARCHAR,
    C.fileSize VARCHAR,
    C.outputType VARCHAR, /* A type or a concatenation: HTML,PDF,DOCX */
    C.totalPages BIGINT,
    /* Time */
    C.submitTime BIGINT, /* Time when the request reaches the API */
    C.startTime BIGINT, /* Time when a worker start working on the task for the first time */
    C.lastStartTime BIGINT, /* Time when a worker start working on the task */
    C.availabilityTime BIGINT, /* Time when the task result is available for the user */
    C.userDuration BIGINT, /* Elapse duration between the submitTime and the availability time */
    C.cpuDuration BIGINT, /* Cumulative elapse time in the different resources (CPUs) */
    C.processDuration BIGINT, /* Real processing elapse time */
    /* Node */
    C.site VARCHAR, /* The site or cluster which processed the task */
    C.hostName VARCHAR, /* The node which proccesed the task */
    C.siteProcessor VARCHAR, /* The site or cluster which processed */
    C.hostNameProcessor VARCHAR, /* The node which processed the task */
    /* Error */
    C.tries BIGINT, /* Number of retries caused by previous errors */
    C.errorMessage VARCHAR,
    /* Children */
    /*C.parentId VARCHAR,*/ /* Not supposed to have child in the billing table */
    C.childrenTotal BIGINT, 
    CONSTRAINT PK PRIMARY KEY (id)
)
COLUMN_ENCODED_BYTES = 0;

CREATE TABLE IF NOT EXISTS ONV_OCR_2.restKey (
    id VARCHAR NOT NULL,
    C.name VARCHAR,
    C.keyHash VARCHAR,
    C.params VARCHAR, /* JSON file containing priority (int)*/
    C.expiry BIGINT, /* Time of expiry */
    CONSTRAINT PK PRIMARY KEY (id)
)
COLUMN_ENCODED_BYTES = 0;
