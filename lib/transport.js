/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Expose the constructor.
 */

exports = module.exports = Transport;

/**
 * Transport constructor.
 *
 * @api public
 */

function Transport (mng, data, req) {
  this.manager = mng;
  this.store = mng.store;
  this.id = data.id;
  this.data = data;
  this.req = req;
  this.socket = req.socket;
  this.readyState = 'connecting';
  this.onConnect();
};

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
 * @param {Object} packet object
 * @api private
 */

Transport.prototype.onMessage = function (packet) {
  if (packet.type === 'disconnect') {
    this.disconnect('client disconnect');
  } else {
    if (packet.id && packet.ack != 'data') {
      this.packet({
        type: 'ack'
        , ackId: packet.id
        , endpoint: packet.endpoint || ''
      });
    }
    this.manager.onClientMessage(this.id, packet);
  }
};

/**
 * Finishes the connection and clean up 
 *
 * @api public 
 */

Transport.prototype.disconnect = function (reason) {
  this.packet({ type: 'disconnect' });
  this.end(reason);

  return this;
};

/**
 * Writes an error packet with the specified reason and advice.
 *
 * @param {Number} advice
 * @param {Number} reason
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
