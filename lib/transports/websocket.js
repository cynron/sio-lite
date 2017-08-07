
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */


var Transport = require('../transport');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var parser = require('../parser');
var util = require('../util');

/**
 * Export the constructor.
 */

exports = module.exports = WebSocket;


/**
 * HTTP interface constructor. Interface compatible with all transports that
 * depend on request-response cycles.
 *
 * @api public
 */

function WebSocket (mng, data, wsSocket) {
  Transport.call(this, mng, data, wsSocket);

  this.socket = wsSocket;
  this.socket.on('message', this._onMessage.bind(this));
  this.socket.once('close', this._onClose.bind(this));
  this.socket.on('error', this._onError.bind(this));
  this.onConnect();
}

util.inherits(WebSocket, Transport);

WebSocket.prototype.name = 'websocket';

WebSocket.prototype._onMessage = function(message) {
  var packet = parser.decodePacket(message);

  if (packet.type === 'heartbeat') {
    this.log.debug('got heartbeat packet');
    this.clearHeartbeatTimeout();
    this.setHeartbeatInterval();
  } else {
    Transport.prototype.onMessage.call(this, packet);
  }
}

WebSocket.prototype._onClose = function() {
  this.log.debug('websocket on close');
  this.end('close');
}

WebSocket.prototype._onError = function(e) {
  this.end('error: ' + e);
}

WebSocket.prototype.onConnect = function() {
  this.readyState = Transport.CONNECTED;
  this.packet({type: 'connect'});
  this.setHeartbeatInterval();
}

WebSocket.prototype.write = function(data) {
  this.socket.send(data);
}

WebSocket.prototype.packet = function(msgs) {
  msgs = parser.encodePackets(msgs);
  this.write(msgs);
  return this;
}

WebSocket.prototype.end = function() {
  this.socket.terminate();
  this.clearHeartbeatTimeout();
  this.clearHeartbeatInterval();
  this.log.debug('websocket end');

  Transport.prototype.end.call(this);
}

WebSocket.prototype.setHeartbeatTimeout = function() {
  if (!this.heartbeatTimeout && this.manager.enabled('heartbeats')) {
    var self = this;
    this.heartbeatTimeout = setTimeout(function() {
      self.log.debug('fired heartbeat timeout for client', self.id);
      self.heartbeatTimeout = undefined;
      self.end('heartbeat timeout');
    }, this.manager.get('heartbeat timeout') * 1000);

    this.log.debug('set heartbeat timeout for client', this.id);
  }
};

/**
 * Clears the heartbeat timeout
 */

WebSocket.prototype.clearHeartbeatTimeout = function() {
  if (this.heartbeatTimeout && this.manager.enabled('heartbeats')) {
    clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = undefined;
    this.log.debug('cleared heartbeat timeout for client', this.id);
  }
};

/**
 * Sets the heartbeat interval.
 */

WebSocket.prototype.setHeartbeatInterval = function() {
  if (!this.heartbeatInterval && this.manager.enabled('heartbeats')) {
    var self = this;

    this.heartbeatInterval = setTimeout(function() {
      self.heartbeat();
      self.heartbeatInterval = undefined;
    }, this.manager.get('heartbeat interval') * 1000);

    this.log.debug('set heartbeat interval for client', this.id);
  }
};

/**
 * Clears the heartbeat interval
 */

WebSocket.prototype.clearHeartbeatInterval = function() {
  if (this.heartbeatInterval && this.manager.enabled('heartbeats')) {
    clearTimeout(this.heartbeatInterval);
    this.heartbeatInterval = undefined;
    this.log.debug('cleared heartbeat interval for client');
  }
};

/**
 * Send heartbeat packet
 */

WebSocket.prototype.heartbeat = function() {
  if (this.readyState === Transport.CONNECTED) {
    this.packet({type: 'heartbeat'});
    this.setHeartbeatTimeout();
  }

  return this;
};

