/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var Store = require('../store')
  , util = require('../util');

/**
 * Exports the constructor.
 */

module.exports = Memory;

/**
 * Memory store
 *
 * @param {Object} opts
 * @api public
 */

function Memory (opts) {
  Store.call(this, opts);
  this.handshakens = {};
  this.connecteds = {};
  this.recvQs = {};
  this.sendQs = {};
};

/**
 * Inherits from Store
 */

Memory.prototype.__proto__ = Store.prototype;

/**
 * Initilize memory store
 *
 * @param {Manager} manager
 * @param {Function} cb cb()
 * @api public
 */

Memory.prototype.init = function(manager, cb) {
  var self = this;
  this.manager = manager;
  this.manager.once('listening', function() {
    self.gcInterval = setInterval(function() {
      self.handshakenGC(); 
    }, self.manager.get('handshake gc interval') * 1000);
  });
  util.invoke(cb);
}

/**
 * Query handshaken data 
 *
 * @param {String} id session id
 * @param {Function} cb cb(handshakenData)
 * @api public
 */

Memory.prototype.handshaken = function(id, cb) {
  util.invoke(cb, this.handshakens[id]);
}

/**
 * Add handshaken data to memory store
 *
 * @param {String} id session id
 * @param {Object} data handshaken data
 * @param {Function} cb cb(err)
 */

Memory.prototype.onHandshaken = function(id, data, cb) {
  this.handshakens[id] = data;
  util.invoke(cb, null);
}

/**
 * Check if session id is connected
 *
 * @param {String} id session id
 * @param {Function} cb cb(isConnected)
 * @api public
 */

Memory.prototype.connected = function(id, cb) {
  util.invoke(cb, this.connecteds[id]);
}

/**
 * Add connected flag 
 *
 * @param {String} id session id
 * @param {Function} cb cb(err) 
 * @api public
 */

Memory.prototype.onConnected = function(id, cb) {
  this.connecteds[id] = true;
  if ('issued' in this.handshakens[id]) {
    delete this.handshakens[id].issued;
  }
  util.invoke(cb, null);
}

/**
 * Destroy the memory store
 *
 * @api public
 */

Memory.prototype.destroy = function() {
  if (this.gcInterval) {
    clearInterval(this.gcInterval);
  }

  this.handshakens = {};
  this.connecteds = {};
  this.sendQs = {};
  this.recvQs = {};
}

/**
 * Destroy a connection
 *
 * @param {String} id session id
 * @api public
 */

Memory.prototype.destroyConnection = function(id) {
  delete this.handshakens[id];
  delete this.connecteds[id];
  delete this.sendQs[id];
  delete this.recvQs[id];
}

/**
 * Get msgs from recvQ 
 *
 * @param {String} id sessionid
 * @param {Function} cb cb(msgs) 
 * @api public
 */

Memory.prototype.getFromRecvQ = function(id, cb) {
  var self = this;
  var timeout = this.manager.get('close timeout');
  this.recvQs[id] = this.recvQs[id] || [];

  var fetchMsgs = function() {
    var msgs = self.recvQs[id];
    self.recvQs[id] = [];
    util.invoke(cb, msgs);
  };

  if (self.recvQs[id].length === 0) {
    var waitTimer = setTimeout(function() {
      self.removeAllListeners('recvq:' + id);
      util.invoke(cb);
    }, timeout * 1000);

    waitTimer.unref();

    self.once('recvq:' + id, function() {
      clearTimeout(waitTimer);
      fetchMsgs();
    });
  } else {
    fetchMsgs(); 
  }
}

/**
 * Push msgs to recvQ 
 *
 * @param {String} id session id
 * @param {Array|Object} msgs msg(s) to be pushed
 * @param {Function} cb cb(err) 
 * @api public
 */

Memory.prototype.pushToRecvQ = function(id, msgs, cb) {
  this.recvQs[id] = this.recvQs[id] || [];
  this.recvQs[id] = this.recvQs[id].concat(msgs);
  this.emit('recvq:' + id);
  util.invoke(cb, null); 
}

/**
 * Get msgs from sendQ 
 *
 * @param {String} id session id
 * @param {Function} cb cb(msgs)
 * @api public
 */

Memory.prototype.getFromSendQ = function(id, cb) {
  var self = this;
  var timeout = this.manager.get('polling duration');
  this.sendQs[id] = this.sendQs[id] || [];

  var fetchMsgs = function() {
    var msgs = self.sendQs[id];
    self.sendQs[id] = [];
    util.invoke(cb, msgs);
  };

  if (this.sendQs[id].length === 0) {
    var waitTimer = setTimeout(function() {
      self.removeAllListeners('sendq:' + id);
      util.invoke(cb);
    }, timeout * 1000);

    waitTimer.unref();

    self.once('sendq:' + id, function() {
      clearTimeout(waitTimer);
      fetchMsgs(); 
    });
  } else {
    fetchMsgs();
  }
}
  
/**
 * Push msgs to sendQ
 *
 * @param {String} id session id
 * @param {Array|Object} msgs msg(s) to be pushed
 * @param {Function} cb cb(err) 
 * @api public
 */

Memory.prototype.pushToSendQ = function(id, msgs, cb) {
  this.sendQs[id] = this.sendQs[id] || [];
  this.sendQs[id] = this.sendQs[id].concat(msgs);
  this.emit('sendq:' + id);
  util.invoke(cb, null);
}

/**
 * GC on long living handshaken data which is not connectd
 *
 * @api private
 */

Memory.prototype.handshakenGC = function() {
  var ids = Object.keys(this.handshakens)
    , i = ids.length
    , now = Date.now()
    , handshake

  while (i--) {
    handshake = this.handshakens[ids[i]];
    if ('issued' in handshake && (now - handshake.issued) >= this.manager.get('handshake expiration')) {
      delete this.handshakens[ids[i]];
    }
  }
}
