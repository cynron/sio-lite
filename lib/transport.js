
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Expose the constructor.
 */

module.exports = Transport;

/**
 * Transport constructor.
 *
 * @param {Manager} mng
 * @param {Object} connection request data
 * @param {WebSocket|http.IncommingMessage} socket 
 * @api public
 */

function Transport (mng, data, wsSocketOrReq) {
  this.manager = mng;
  this.id = data.id;
  this.data = data;
  this.readyState = Transport.CONNECTING;
}

/**
 * Transport readyState
 */
Transport.CONNECTING = 0;
Transport.CONNECTED = 1;
Transport.DISCONNECTING = 2;
Transport.DISCONNECTED =3;

/**
 * Access the logger.
 *
 * @api public
 */

Transport.prototype.__defineGetter__('log', function () {
  return this.manager.log;
});

/**
 * Access the store.
 *
 * @api public
 */

Transport.prototype.__defineGetter__('store', function () {
  return this.manager.store;
});

/**
 * Handles a Message
 *
 * @param {Object} packet 
 * @api private
 */
Transport.prototype.onMessage = function (packet) {
  if (packet.type === 'disconnect') {
    this.disconnect('client disconnect');
  } else {
    this.manager.handlePacket(this.id, packet);
  }
};

/**
 * Finishes the connection and clean up 
 *
 * @api public 
 */

Transport.prototype.disconnect = function (reason) {
  this.readyState = Transport.DISCONNECTING;
  this.packet({type: 'disconnect'});
  this.end(reason);

  return this;
};

/**
 * Writes an error packet with the specified reason and advice.
 *
 * @param {String} advice
 * @param {String} reason
 * @api public
 */

Transport.prototype.error = function (reason, advice) {
  this.packet({
      type: 'error'
    , reason: reason
    , advice: advice
  });

  this.log.warn(reason, advice ? ('client should ' + advice) : '');
  this.end('error');
};

/**
 * End the transport and cleanup
 *
 * @param {String} reason
 * @api private
 */

Transport.prototype.end = function (reason) {
  reason = reason || '';
  if (this.readyState !== Transport.DISCONNECTED) {
    this.readyState = Transport.DISCONNECTED;
    this.manager.onDisconnect(this.id, reason);
    this.log.info('transport disconnected(' + reason + ')');
  }
};

