/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var Polling = require('./polling')
  , parser = require('../parser');
var jsonpolling_re = /^\d+$/

/**
 * Export the constructor.
 */

exports = module.exports = JSONPPolling;

/**
 * JSON-P polling transport.
 *
 * @api public
 */

function JSONPPolling (mng, data, req) {
  Polling.call(this, mng, data, req);
};

JSONPPolling.prototype.onConnect = function() {
  Polling.prototype.onConnect.call(this);
  var res = this.req.res;
  var payload = parser.encodePacket({type: 'connect'}); 
  JSONPPolling.handler.payload(this.req, res, this.data, payload);
}

/**
 * Inherits from Polling.
 *
 * @api public
 */
JSONPPolling.prototype.__proto__ = Polling.prototype;

/**
 * Transport name
 *
 * @api public
 */

JSONPPolling.prototype.name = 'jsonppolling';

/**
 * setup request handler for JSONPPolling.
 *
 * @api public
 */

JSONPPolling.init = function(manager) {
  JSONPPolling.handler = new JSONPPolling.RequestHandler(manager);
}

/**
 * JSONPPolling.RequestHandler constructor
 *
 * @api private
 */

var RequestHandler = function(manager) {
  Polling.RequestHandler.call(this, manager);
  this.postEncoded = true;
}

/**
 * Inherits from Polling.RequestHandler
 */

RequestHandler.prototype.__proto__ = Polling.RequestHandler.prototype;

/**
 * Handles incoming data.
 *
 * @param {String} id sessionid
 * @param {Object}
 *
 * @api private
 */

RequestHandler.prototype.onData = function(id, data, callback) {
  // TODO: parse error
  try {
    data = JSON.parse(data);
  } catch (e) {
    data = parser.encodePacket({type: 'error', reason: 'parse', advice: 'reconnect'});
  }
  Polling.RequestHandler.prototype.onData.call(this, id, data, callback);
}

/**
 * Payload the data to response
 *
 * @param {http.IncomingMessage} req
 * @param {http.Response} res
 * @param {Object|Array} msgs
 * @api private
 */

RequestHandler.prototype.payload = function(req, res, reqData, msgs) {
  var head = 'io.j[0](';
  var foot = ');';
  
  if (reqData.query.i && jsonpolling_re.test(reqData.query.i)) {
    head = 'io.j[' + reqData.query.i + '](';
  }

  msgs = msgs === undefined
    ? '' : head + JSON.stringify(msgs) + foot;

  res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=UTF-8'
    , 'Content-Length': Buffer.byteLength(msgs)
    , 'Connection': 'Keep-Alive'
    , 'X-XSS-Protection': '0'
  });

  res.write(msgs);
  res.end();
}

JSONPPolling.RequestHandler = RequestHandler;

JSONPPolling.__defineGetter__('handleRequest', function() {
  return JSONPPolling.handler.handleRequest.bind(JSONPPolling.handler);
});

JSONPPolling.__defineGetter__('payload', function() {
  return JSONPPolling.handler.payload.bind(JSONPPolling.handler);
});

