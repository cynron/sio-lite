/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var Polling = require('./polling');
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
  JSONPPolling.requestHandler = new JSONPPolling.RequestHandler(manager);
}

/**
 * JSONPPolling.RequestHandler constructor
 *
 * @api private
 */

var RequestHandler = function() {
  Polling.RequestHandler.call(this, arguments);
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
  try {
    data = JSON.parse(data);
  } catch (e) {
    this.manager.store.client[id].pushToRecvQ({type: 'error', reason: 'parse', advice: 'reconnect'});
    Polling.RequestHandler.prototype.onData.call(this, id, 
      {type: 'error', reason: 'parse', advice: 'reconnect'}, callback);
    return ;
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

RequestHandler.prototype.payload = function(req, res, data) {
  var head = 'io.j[0](';
  var foot = ');';
  
  if (data.query.i && jsonpolling_re.test(data.query.i)) {
    head = 'io.j[' + data.query.i + '](';
  }

  var data = data === undefined
    ? '' : this.head + JSON.stringify(data) + this.foot;

  res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=UTF-8'
    , 'Content-Length': Buffer.byteLength(data)
    , 'Connection': 'Keep-Alive'
    , 'X-XSS-Protection': '0'
  });

  res.write(data);
}

JSONPPolling.RequestHandler = RequestHandler;

JSONPPolling.__defineGetter__('handleRequest', function() {
  return JSONPPolling.handler.handleRequest.bind(JSONPPolling.handler);
});

JSONPPolling.__defineGetter__('payload', function() {
  return JSONPPolling.handler.payload.bind(JSONPPolling.handler);
});


