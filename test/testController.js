'use strict';

const assert = require('assert');
const stream = require("stream");
var sinon = require('sinon');
var { service, broker, startup } = require("../services/controller.service.js");

describe('Controller', function() {
    it('createTask should proxy the queuer using the same parameters', function() {

      // Arrange
      var stub = sinon.stub(broker, "call").resolves();
      var controller = broker.getLocalService('controller')
      const name = "taskName";
      var argStream = new stream.Readable();
      argStream.push(name);
      argStream.push(null);
      const task = { user: "taskUser", name, priority: 0 };
      var meta = {meta: task}
      
      // Act
      var result = controller.actions.createTask(argStream, meta)
   
      // Assert
      assert(stub.callCount === 1);
      assert(stub.getCall(0).args.length === 3);
      assert(stub.getCall(0).args[0] === "queuer.createTask");
      assert.deepEqual(stub.getCall(0).args[1], argStream);
      assert.deepEqual(stub.getCall(0).args[2], meta);
    });
})