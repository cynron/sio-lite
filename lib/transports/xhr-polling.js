/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var Polling = require('./polling');

/**
 * Export the constructor.
 */

exports = module.exports = XHRPolling;
XHRPolling.RequestHandler = RequestHandler;

/**
 * Ajax polling transport.
 *
 * @api public
 */

function XHRPolling (mng, data, req) {
  Polling.call(this, mng, data, req);
};

XHRPolling.init = function(manager) {
  XHRPolling.handler = new XHRPolling.RequestHandler;
}

/**
 * Inherits from Transport.
 */

XHRPolling.prototype.__proto__ = Polling.prototype;

/**
 * Transport name
 *
 * @api public
 */

XHRPolling.prototype.name = 'xhr-polling';

/**
 * XHRPolling.RequestHandler constructor
 */

var RequestHandler = function() {
  Polling.RequestHandler.call(this, arguments);
}

/**
 * Payload the data to response
 *
 * @param {http.IncomingMessage} req
 * @param {http.Response} res
 * @param {Object|Array} msgs
 * @api private
 */

RequestHandler.prototype.payload = function(req, res, data) {
  var origin = req.headers.origin
    , headers = {
          'Content-Type': 'text/plain; charset=UTF-8'
        , 'Content-Length': data === undefined ? 0 : Buffer.byteLength(data)
        , 'Connection': 'Keep-Alive'
      };

  if (origin) {
    // https://developer.mozilla.org/En/HTTP_Access_Control
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  res.writeHead(200, headers);
  res.write(data);
}
