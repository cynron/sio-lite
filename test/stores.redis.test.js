
/**
 * Test dependencies
 *
 * @api private
 */

var sio = require('../')
  , should = require('should')
  , RedisStore = sio.RedisStore
  , EventEmitter = require('events').EventEmitter
  , redis = require('redis');

var manager = {};

manager.__proto__ = EventEmitter.prototype;
manager.get = function(prop) {
  return manager[prop];
}

manager.__defineGetter__('log', function() {
  return console;
});

/**
 * Test.
 */

module.exports = {

  'test storing handshaken for a connection': function (done) {
    var store = new RedisStore();
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
    var store = new RedisStore();
    store.init(manager);
    var handshaken = {};
    handshaken.issued = Date.now();
    handshaken.data = 'test';
    store.onHandshaken('id-3', handshaken, function() {
      store.onConnected('id-3', function() {
        store.connected('id-3', function(data) {
          data.should.be.ok;
          store.handshaken('id-3', function(data) {
            data.data.should.eql('test');
            store.connected('id-4', function(data) {
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

  'test issued handshaken data expiration': function (done) {
    manager['handshake gc interval'] = 0.05;
    manager['handshake expiration'] = 0;
    var store = new RedisStore();
    store.init(manager);
    store.onHandshaken('id-5', {issued: Date.now()}, function() {
      manager.emit('listening');
      setTimeout(function() {
        store.handshaken('id-6', function(data) {
          (!!data).should.not.be.ok;
          store.destroy();
          manager.removeAllListeners();
          done();
        });
      }, 500);
    });
  },

  'test getting from recvq': function (done) {
    manager['close timeout'] = 0;
    manager['queue timeout'] = 1;
    var store = new RedisStore();
    store.init(manager);
    store.onHandshaken('id-7', 'handshakendata', function() {
      store.onConnected('id-7', function() {
        store.getFromRecvQ('id-7', function(isTimeout, data) {
          isTimeout.should.eql(true);
          (!!data).should.be.not.ok;
          store.pushToRecvQ('id-7', 'aaa', function() {
            store.getFromRecvQ('id-7', function(isTimeout, data) {
              isTimeout.should.eql(false);
              data.should.eql(['aaa']);
              store.destroy();
              manager.removeAllListeners();
              done();
            });
          });
        });
      });
    });
  },

  'test push after get recvq': function (done) {
    manager['close timeout'] = 1;
    manager['queue timeout'] = 1;
    var store = new RedisStore();
    store.init(manager);

    var test = function() {
      store.getFromRecvQ('id-8', function(isTimeout, data) {
        isTimeout.should.eql(false);
        data.should.eql(['aaa']);
        store.destroy();
        manager.removeAllListeners();
        done();
      });
      store.pushToRecvQ('id-8', 'aaa');
    }
    store.onHandshaken('id-8', 'handshakendata', function() {
      store.onConnected('id-8', test);
    });
  },

  'test getting from sendq': function(done) {
    manager['polling duration'] = 0;
    manager['queue timeout'] = 1;
    var store = new RedisStore();
    store.init(manager);

    store.getFromSendQ('id-9', function(isTimeout, data) {
      isTimeout.should.eql(true);
      (!!data).should.be.not.ok;
      store.pushToSendQ('id-9', 'aaa', function() {
        store.getFromSendQ('id-9', function(isTimeout, data) {
          isTimeout.should.eql(false);
          data.should.eql(['aaa']);
          store.destroy();
          manager.removeAllListeners();
          done();
        });
      });
    });
  },

  'test push to sendq': function(done) {
    manager['polling duration'] = 0.05;
    manager['queue timeout'] = 1;
    var store = new RedisStore();
    store.init(manager);

    store.getFromSendQ('id-10', function(isTimeout, data) {
      isTimeout.should.eql(false);
      data.should.eql(['aaa']);
      store.destroy();
      manager.removeAllListeners();
      done();
    });
    store.pushToSendQ('id-10', 'aaa');
  }
};
