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

/*
 * API
 *
 * on('<any_event>', function(args) {})
 * on('message', function(msg) {})
 * on('disconnect', function(reason, advice) {})
 * on('error', function(err) {})
 * disconnect
 * send
 * emit
 *
 */

function Socket (manager, id, handshaken) {
  EventEmitter.call(this);

  this.readyState = Socket.CONNECTED;
  this.id = id;
  this.manager = manager;
  this.handshake = handshaken;
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
 * Accessor shortcut for the transport type
 *
 * @api private
 */

Socket.prototype.__defineGetter__('transport', function () {
  return this.manager.transportMap[this.id];
});

/**
 * Accessor shortcut for the store.
 *
 * @api private
 */

Socket.prototype.__defineGetter__('store', function () {
  return this.manager.store;
});

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
    if (this.transport) {
      this.transport.packet(packet);
    } else {
      this.log.debug('socket packet error', 'transport missing');
    }
  } 

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

Socket.prototype.send = function (data) {
  if (this.readyState !== Socket.DISCONNECTED) {
    var packet = {
      type: 'message'
      , data: data
    };

    return this.packet(packet);
  } else {
    this.log.error('send after disconnected');
  }
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
    args = args.slice(0, args.length - 1);
  }

  packet.args = args;

  return this.packet(packet);
};

