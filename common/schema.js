/* =============================================================================
 The value of each key is representing the type:
    - 1 Object as JSON string (stringify)
    - 2 String value
    - 3 Long (number) value
============================================================================= */
module.exports = {
    TASK: {
        /* Task */
        status: 2,
        priority: 3,
        profile: 2, 
        /* User */
        userType: 2,
        userId: 2,
        /* File */
        fileName: 2,
        fileSize: 3,
        inputPath: 2,
        outputType: 2,
        outputPath: 2,
        totalPages: 3,
        /* Time */
        submitTime: 3,
        startTime: 3,
        lastStartTime: 3,
        availabilityTime: 3,
        userDuration: 3,
        cpuDuration: 3,
        processDuration: 3,
        /* Node */
        site: 2,
        hostName: 2,
        siteProcessor: 2,
        hostNameProcessor: 2,
        /* Error */
        tries: 3,
        errorMessage: 1,
        /* Children */
        childrenArray: 1,
        parentId: 2,
        childrenTotal: 3, 
        childrenCompleted: 3
    },
    BILLING: {
        /* Task */
        taskId: 2,
        status: 2,
        priority: 3,
        profile: 2,
        /* User */
        userType: 2,
        userId: 2,
        billingEntity: 2,
        /* Files */
        fileName: 2,
        fileSize: 3,
        outputType: 2,
        totalPages: 3,
        /* Time */
        submitTime: 3,
        startTime: 3,
        lastStartTime: 3,
        availabilityTime: 3,
        userDuration: 3,
        cpuDuration: 3,
        processDuration: 3,
        /* Node */
        site: 2,
        hostName: 2,
        /* Error */
        tries: 3,
        errorMessage: 1,
        /* Children */
        childrenTotal: 3, 
    },
    RESTKEY: {
        name: 2,
        keyHash: 2,
        params: 1,
        expiry: 3
    }
}