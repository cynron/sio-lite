
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var Polling = require('./polling')
  , util = require('util')
  , parser = require('../parser');

/**
 * Export the constructor.
 */

module.exports = XHRPolling;

/**
 * Ajax polling transport.
 *
 * @api public
 */

function XHRPolling (mng, data, req) {
  Polling.call(this, mng, data, req);
}

/**
 * Inherits from Transport.
 */

util.inherits(XHRPolling, Polling);

/**
 * XHRPolling transport initialization
 *
 * @param {Manager} manager
 * @api public
 */

XHRPolling.init = function(manager) {
  XHRPolling.handler = new XHRPolling.RequestHandler(manager);
};

/**
 * handleRequest Accessor for XHRPolling
 */

XHRPolling.__defineGetter__('handleRequest', function() {
  return XHRPolling.handler.handleRequest.bind(XHRPolling.handler);
});

/**
 * XHRPolling onConnect overloading
 */

XHRPolling.prototype.onConnect = function() {
  Polling.prototype.onConnect.call(this);
  var res = this.req.res;
  var payload = parser.encodePacket({type: 'connect'});
  XHRPolling.handler.payload(this.req, res, this.data, payload);

  this.req = null;
  this.data = null;
  this.socket = null;
  res = null;
};

/**
 * Transport name
 *
 * @api public
 */

XHRPolling.prototype.name = 'xhr-polling';

/**
 * XHRPolling.RequestHandler constructor
 */

function RequestHandler(manager) {
  Polling.RequestHandler.call(this, manager);
}

/**
 * Inherits from Polling.RequestHandler
 */

util.inherits(RequestHandler, Polling.RequestHandler);

/**
 * Payload the data to response
 *
 * @param {http.IncomingMessage} req
 * @param {http.Response} res
 * @param {Object} request data
 * @param {Object|Array} msgs
 * @api private
 */

RequestHandler.prototype.payload = function(req, res, reqData, msgs) {
  var origin = req.headers.origin
    , headers = {
          'Content-Type': 'text/plain; charset=UTF-8'
        , 'Content-Length': msgs === undefined ? 0 : Buffer.byteLength(msgs)
        , 'Connection': 'Keep-Alive'
      };

  if (origin) {
    // https://developer.mozilla.org/En/HTTP_Access_Control
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  this.log.debug('xhr-polling writing:', msgs);
  res.writeHead(200, headers);
  res.write(msgs);
  res.end();
};

XHRPolling.RequestHandler = RequestHandler;

