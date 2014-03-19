
/**
 * Test dependencies
 *
 * @api private
 */

var sio = require('../')
  , should = require('should')
  , MemoryStore = sio.MemoryStore
  , EventEmitter = require('events').EventEmitter;

var manager = {};

manager.__proto__ = EventEmitter.prototype;

manager.get = function(prop) {
  return manager[prop];
}

manager['log'] = console;

/**
 * Test.
 */

module.exports = {

  'test storing handshaken for a connection': function (done) {
    var store = new MemoryStore();
    store.init(manager);
    store.onHandshaken('id-1', 'handshaken', function() {
      store.handshaken('id-1', function(data) {
        data.should.eql('handshaken');
        store.handshaken('id-2', function(data) {
          (!!data).should.not.be.ok;
          store.destroy();
          manager.removeAllListeners();
          done();
        });
      });
    });
  },

  'test storing connected state for a connection': function (done) {
    var store = new MemoryStore();
    store.init(manager);
    var handshaken = {};
    handshaken.issued = Date.now();
    handshaken.data = 'test';
    store.onHandshaken('id-1', handshaken, function() {
      store.onConnected('id-1', function() {
        store.connected('id-1', function(data) {
          data.should.be.ok;
          store.handshaken('id-1', function(data) {
            (!!data).should.not.be.ok;
            store.connected('id-2', function(data) {
              (!!data).should.not.be.ok;
              store.destroy();
              manager.removeAllListeners();
              done();
            });
          });
        });
      });
    });
  },

  'test issued handshaken data expiration': function (done){
    manager['handshake gc interval'] = 0.05;
    manager['handshake expiration'] = 0;
    var store = new MemoryStore();
    store.init(manager);
    store.onHandshaken('id-1', {issued: Date.now()}, function() {
      manager.emit('listening');
      setTimeout(function() {
        store.handshaken('id-1', function(data) {
          (!!data).should.not.be.ok;
          store.destroy();
          manager.removeAllListeners();
          done();
        });
      }, 500);
    });
  },

  'test getting from recvq': function (done) {
    manager['close timeout'] = 0.00;
    var store = new MemoryStore();
    store.init(manager);

    store.getFromRecvQ('id-1', function(isTimeout, data) {
      isTimeout.should.eql(true);
      (!!data).should.be.not.ok;
      store.pushToRecvQ('id-1', 'aaa', function() {
        store.getFromRecvQ('id-1', function(isTimeout, data) {
          isTimeout.should.eql(false);
          data.should.eql(['aaa']);
          store.destroy();
          manager.removeAllListeners();
          done();
        });
      });
    });
  },

  'test push after get recvq': function (done) {
    manager['close timeout'] = 0.05;
    var store = new MemoryStore();
    store.init(manager);

    store.getFromRecvQ('id-1', function(isTimeout, data) {
      isTimeout.should.eql(false);
      data.should.eql(['aaa']);
      store.destroy();
      manager.removeAllListeners();
      done();
    });
    store.pushToRecvQ('id-1', 'aaa');
  },

  'test getting from sendq': function(done) {
    manager['polling duration'] = 0.00;
    var store = new MemoryStore();
    store.init(manager);

    store.getFromSendQ('id-1', function(isTimeout, data) {
      isTimeout.should.eql(true);
      (!!data).should.be.not.ok;
      store.pushToSendQ('id-1', 'aaa', function() {
        store.getFromSendQ('id-1', function(isTimeout, data) {
          isTimeout.should.eql(false);
          data.should.eql(['aaa']);
          store.destroy();
          manager.removeAllListeners();
          done();
        });
      });
    });
  },

  'test push after get sendq': function(done) {
    manager['polling duration'] = 0.05;
    var store = new MemoryStore();
    store.init(manager);

    store.getFromSendQ('id-1', function(isTimeout, data) {
      isTimeout.should.eql(false);
      data.should.eql(['aaa']);
      store.destroy();
      manager.removeAllListeners();
      done();
    });
    store.pushToSendQ('id-1', 'aaa');
  },
};
