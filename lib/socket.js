
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var parser = require('./parser')
  , util = require('./util')
  , EventEmitter = process.EventEmitter

/**
 * Export the constructor.
 */

exports = module.exports = Socket;

/**
 * Default error event listener to prevent uncaught exceptions.
 */

var defaultError = function () {};

/**
 * Socket constructor.
 *
 * @param {Manager} manager instance
 * @param {String} session id
 * @param {Namespace} namespace the socket belongs to
 * @param {Boolean} whether the 
 * @api public
 */

function Socket (manager, id) {
  this.readyState = 'connected';
  this.id = id;
  this.manager = manager;
  this.ackPackets = 0;
  this.acks = {};
  this.store = this.manager.store.client(this.id);
  this.setFlags();
  this.on('error', defaultError);
};

/**
 * Inherits from EventEmitter.
 */

Socket.prototype.__proto__ = EventEmitter.prototype;

/**
 * Accessor shortcut for the handshake data
 *
 * @api private
 */

Socket.prototype.__defineGetter__('handshake', function () {
  return this.manager.handshaken[this.id];
});

/**
 * Accessor shortcut for the transport type
 *
 * @api private
 */

Socket.prototype.__defineGetter__('transport', function () {
  return this.manager.transports[this.id].name;
});

Socket.prototype.__defineGetter__('json', function() {
  this.flags.json = true;
  return this;
});


Socket.prototype.setFlags = function() {
  this.flags = {};
  return this;
}

/**
 * Accessor shortcut for the logger.
 *
 * @api private
 */

Socket.prototype.__defineGetter__('log', function () {
  return this.manager.log;
});

/**
 * Triggered on disconnect
 *
 * @api private
 */

Socket.prototype.onDisconnect = function (reason) {
  if (this.readyState === 'connected') {
    this.$emit('disconnect', reason);
    this.readyState = 'disconnected';
  }
};

/**
 * Transmits a packet.
 *
 * @api private
 */

Socket.prototype.packet = function (packet) {
  this.manager.transportMap[this.id].packet(packet);
  return this;
};

/**
 * Stores data for the client.
 *
 * @api public
 */

Socket.prototype.set = function (key, value, fn) {
  this.store.set(key, value, fn);
  return this;
};

/**
 * Retrieves data for the client
 *
 * @api public
 */

Socket.prototype.get = function (key, fn) {
  this.store.get(key, fn);
  return this;
};

/**
 * Checks data for the client
 *
 * @api public
 */

Socket.prototype.has = function (key, fn) {
  this.store.has(key, fn);
  return this;
};

/**
 * Deletes data for the client
 *
 * @api public
 */

Socket.prototype.del = function (key, fn) {
  this.store.del(key, fn);
  return this;
};

/**
 * Kicks client
 *
 * @api public
 */

Socket.prototype.disconnect = function () {
  if (this.readyState !== 'disconnected') {
    this.log.info('booting client');
    this.manager.transportMap[this.id].disconnect();
    this.acks = null; 
    this.$emit('disconnect', 'booted');
  }

  return this;
};

/**
 * Send a message.
 *
 * @api public
 */

Socket.prototype.send = function (data, fn) {
  var packet = {
      type: this.flags.json ? 'json' : 'message'
    , data: data
  };

  if (fn) {
    packet.id = ++this.ackPackets;
    packet.ack = true;
    this.acks[packet.id] = fn;
  }

  return this.packet(packet);
};

/**
 * Original emit function.
 *
 * @api private
 */

Socket.prototype.$emit = EventEmitter.prototype.emit;

/**
 * Emit override for custom events.
 *
 * @api public
 */

Socket.prototype.emit = function (ev) {
  if (ev == 'newListener') {
    return this.$emit.apply(this, arguments);
  }

  var args = util.toArray(arguments).slice(1)
    , lastArg = args[args.length - 1]
    , packet = {
          type: 'event'
        , name: ev
      };

  if ('function' == typeof lastArg) {
    packet.id = ++this.ackPackets;
    packet.ack = lastArg.length ? 'data' : true;
    this.acks[packet.id] = lastArg;
    args = args.slice(0, args.length - 1);
  }

  packet.args = args;

  return this.packet(packet);
};
