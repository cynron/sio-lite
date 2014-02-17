
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter
  , util = require('util');

/**
 * Export the constructor.
 */

module.exports = Socket;

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

function Socket (manager, id, handshaken) {
  EventEmitter.call(this);

  this.readyState = Socket.CONNECTED;
  this.id = id;
  this.manager = manager;
  this.ackPackets = 0;
  this.acks = {};
  this.handshaken = handshaken;
  this.store = this.manager.store;
  this.setFlags();
  this.on('error', defaultError);
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(Socket, EventEmitter);

/**
 * Socket readyState
 */

Socket.CONNECTED = 0;
Socket.DISCONNECTING = 1;
Socket.DISCONNECTED = 2;

/**
 * Accessor shortcut for the handshake data
 * It is just a cache for the data in Store
 *
 * @api private
 */

Socket.prototype.__defineGetter__('handshake', function () {
  return this.handshaken;
});

/**
 * Accessor shortcut for the transport type
 *
 * @api private
 */

Socket.prototype.__defineGetter__('transport', function () {
  return this.manager.transportMap[this.id];
});

/**
 * JSON message flag.
 *
 * @api public
 */
 
Socket.prototype.__defineGetter__('json', function() {
  this.flags.json = true;
  return this;
});

/**
 * Resets flags
 *
 * @api private
 */

Socket.prototype.setFlags = function() {
  this.flags = {};
  return this;
};

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
  if (this.readyState !== Socket.DISCONNECTED) {
    this.$emit('disconnect', reason);
    this.readyState = Socket.DISCONNECTED;
  }
};

/**
 * Transmits a packet.
 *
 * @api private
 */

Socket.prototype.packet = function (packet) {
  if (this.readyState !== Socket.DISCONNECTED) {
    this.transport.packet(packet);
  }

  this.setFlags();
  return this;
};

/**
 * Kicks client
 *
 * @api public
 */

Socket.prototype.disconnect = function () {
  if (this.readyState !== Socket.DISCONNECTED) {
    this.readyState = Socket.DISCONNECTING;
    this.log.info('booting client');
    this.transport.disconnect('booted');
    this.acks = null;
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
  if (ev === 'newListener') {
    return this.$emit.apply(this, arguments);
  }

  var args = Array.prototype.slice.call(arguments, 1)
    , lastArg = args[args.length - 1]
    , packet = {
          type: 'event'
        , name: ev
      };

  if ('function' === typeof lastArg) {
    packet.id = ++this.ackPackets;
    packet.ack = lastArg.length ? 'data' : true;
    this.acks[packet.id] = lastArg;
    args = args.slice(0, args.length - 1);
  }

  packet.args = args;

  return this.packet(packet);
};

