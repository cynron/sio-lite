/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var Store = require('../store')
  , util = require('../util')
  , EventEmitter = process.EventEmitter; 

/**
 * Exports the constructor.
 */

module.exports = Memory;
Memory.Client = Client;

/**
 * Memory store
 *
 * @api public
 */

function Memory (manager, opts) {
  Store.call(this, manager, opts);
  this.handshakens = {};
  this.connecteds = {};
};

/**
 * Inherits from Store
 */

Memory.prototype.__proto__ = Store.prototype;

/**
 * Initilize memory store
 */

Memory.prototype.init = function(cb) {
  var self = this;
  this.manager.once('listening', function() {
    self.gcInterval = setInterval(function() {
      self.handshakenGC(); 
    }, self.manager.get('handshaken gc interval') * 1000);
  });
  util.invoke(cb);
}

/**
 * Query handshaken data 
 *
 * @param {String} id sessionid
 * @param {Function} cb
 * @api public
 */

Memory.prototype.handshaken = function(id, cb) {
  util.invoke(cb, this.handshakens[id]);
}

/**
 * Add handshaken data to memory store
 *
 * @param {String} id sessionid
 * @param {Object} data handshaken data
 * @param {Function} cb
 */

Memory.prototype.onHandshaken = function(id, data, cb) {
  this.handshakens[id] = data;
  util.invoke(cb);
}

/**
 * Set connected flag 
 *
 * @param {String} id sessionid
 * @param {Function} cb 
 * @api public
 */

Memory.prototype.connected = function(id, cb) {
  util.invoke(cb, this.connecteds[id]);
}

/**
 * Check if sessionid is connected
 *
 * @param {String} id sessionid
 * @param {Function} cb
 * @api public
 */

Memory.prototype.onConnected = function(id, cb) {
  this.connecteds[id] = true;
  if ('issued' in this.handshakens[id]) {
    delete this.handshakends[id].issued;
  }
  util.invoke(cb);
}

/**
 * Destroy the store
 *
 * @api public
 */

Memory.prototype.destory = function() {
  Store.prototype.destroy.call(this);

  if (this.gcInterval) {
    clearInterval(this.gcInterval);
  }

  this.handshakens = {};
  this.connecteds = {};
}

/**
 * Client constructor
 *
 * @api private
 */

function Client () {
  Store.Client.apply(this, arguments);

  this.recvQ = [];
  this.sendQ = [];
  this.event = new EventEmitter(); 
};

/**
 * Inherits from Store.Client
 */

Client.prototype.__proto__ = Store.Client.prototype;

/**
 * Get msgs from recvQ with timeout
 *
 * @param {Integer} timeout second to wait 
 * @param {Function} cb    call back 
 * @api public
 */

Client.prototype.getFromRecvQ = function(timeout, cb) {
  var msgs;
  var self = this;

  if (self.recvQ.length === 0) {

    var waitTimer = setTimeout(function() {
      self.event.removeAllListeners('recv');
      util.invoke(cb);
    }, timeout * 1000);

    this.event.once('recv', function() {
      clearTimeout(waitTimer);
      msgs = self.recvQ;
      self.recvQ = [];
      util.invoke(cb, msgs);
    });

  } else {
    msgs = self.recvQ;
    self.recvQ = [];
    util.invoke(msgs);
  }
}

/**
 * Push msgs to recvQ 
 *
 * @param {Array} msgs     msgs 
 * @param {Function} cb    call back 
 * @api public
 */

Client.prototype.pushToRecvQ = function(msgs, cb) {
  this.recvQ.concat(msgs);
  this.event.emit('recv');
  util.invoke(cb); 
}

/**
 * Get msgs from sendQ 
 *
 * @param {Integer} timeout  seconds to wait for msgs
 * @param {Function} cb      cb
 * @api public
 */

Client.prototype.getFromSendQ = function(timeout, cb) {
  var msgs;
  var self = this;

  if (self.sendQ.length === 0) {

    var waitTimer = setTimeout(function() {
      self.event.removeAllListeners('send');
      util.invokeCb(cb);
    }, timeout * 1000);

    this.event.once('send', function() {
      clearTimeout(waitTimer);
      msgs = self.sendQ;
      self.sendQ = [];
      util.invoke(cb, msgs);
    });

  } else {
    msgs = self.sendQ;
    self.sendQ = [];
    util.invoke(cb, msgs);
  }
}
  
/**
 * Push msgs to sendQ
 *
 * @param {Array} msgs  messages to be pushed
 * @param {Function} cb callback
 * @api public
 */

Client.prototype.pushToSendQ = function(msgs, cb) {
  this.sendQ.concat(msgs);
  this.event.emit('send');
  util.invoke(cb);
}

/**
 * Destroy a store client
 */

Client.prototype.destroy = function (expiration) {
  if ('number' != typeof expiration) {
    this.recvQ = [];
    this.sendQ = [];
  } else {
    var self = this;

    setTimeout(function () {
      self.recvQ = [];
      self.sendQ = [];
    }, expiration * 1000);
  }
  return this;
};

/**
 * GC on long living handshaken data which is not connectd
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
