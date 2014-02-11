/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var Polling = require('./polling');
var parser = require('../parser'); 

/**
 * Export the constructor.
 */

exports = module.exports = XHRPolling;
/**
 * Ajax polling transport.
 *
 * @api public
 */

function XHRPolling (mng, data, req) {
  Polling.call(this, mng, data, req);
};

XHRPolling.init = function(manager) {
  XHRPolling.handler = new XHRPolling.RequestHandler(manager);
}

XHRPolling.prototype.onConnect = function() {
  Polling.prototype.onConnect.call(this);
  var res = this.req.res;
  var payload = parser.encodePacket({type: 'connect'});
  XHRPolling.handler.payload(this.req, res, this.data, payload);
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

var RequestHandler = function(manager) {
  Polling.RequestHandler.call(this, manager);
}

RequestHandler.prototype.__proto__ = Polling.RequestHandler.prototype;

/**
 * Payload the data to response
 *
 * @param {http.IncomingMessage} req
 * @param {http.Response} res
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

  res.writeHead(200, headers);
  res.write(msgs);
  res.end();
}

XHRPolling.__defineGetter__('handleRequest', function() {
  return XHRPolling.handler.handleRequest.bind(XHRPolling.handler);
});


XHRPolling.__defineGetter__('payload', function() {
  return XHRPolling.handler.payload.bind(XHRPolling.handler);
});

XHRPolling.RequestHandler = RequestHandler;
