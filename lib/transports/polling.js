/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var Transport = require('../transport')
  , parser = require('../parser')
  , qs = require('querystring');

/**
 * Exports the constructor.
 */

exports = module.exports = Polling;
Polling.RequestHandler = RequestHandler;

/**
 * HTTP polling constructor.
 *
 * @api public.
 */

function Polling (mng, data, req) {
  Transport.call(this, mng, data, req);
  delete this.req;
  delete this.socket; // not used in this interface
};

/**
 * Inherits from HTTPTransport.
 *
 * @api public.
 */

Polling.prototype.__proto__ = Transport.prototype;

/**
 * Transport name
 *
 * @api public
 */

Polling.prototype.name = 'polling';

/**
 * Do some initialization when connection is established
 *
 * @api private
 */

Polling.prototype.onConnect = function () {
  this.readyState = 'connected';
  this.setup();
}

/**
 * Start to query client data from Queue
 * 
 * @api private
 */

Polling.prototype.setup = function() {
  var self = this;
  this.store.getFromRecvQ(this.id, this.manager.get('close timeout'), function(data) {
    if (this.readyState != 'connected') return;
    if (!data) {
      self.disconnect('close timeout fire');
    }
    self.handle(data);
    self.setup();
  });
}

/**
 * Handle the data get from store
 *
 * @param {Array} data
 * @api private
 */

Polling.prototype.handle = function(data) {
  for (var i = 0; i < data.length; ++i) {
    var packet = data[i];
    
    // discarding polling packet
    // polling packet is used to make close timeout not fire
    if (packet.type === 'polling') continue;

    this.onMessage(packet);
  }
}

/**
 * Send packet to client
 *
 * @param {Object|Array} packet 
 * @api public
 */

Polling.prototype.packet = function (packet) {
  this.store.pushToSendQ(this.id, packet);
}

/**
 * End the transport
 * 
 * @param {String} reason
 * @api private
 */

Polling.prototype.end = function(reason) {
  this.log.debug('end: ', reason);
  this.readyState = 'end';
  this.store.destroyClient(this.id); 
  delete this.manager.transportMap[this.id];
}

/**
 * Polling.RequestHandler constructor
 *
 * @api private
 */

var RequstHandler = function(manager) {
  this.manager = manager;
  this.store = this.manager.store;
}

/**
 * Handles http polling request GET/POST
 *
 * @param {http.IncomingMessage} req
 * @param {Object} data request data
 * @api private
 */

RequstHandler.prototype.handleRequest = function(req, data) {
  if (req.method === 'POST') {
    this.handlePost(req, data);
  } else {
    this.handleGet(req, data);
  }
}

/**
 * Handles http GET request 
 *
 * @param {http.IncomingMessage} req
 * @param {Object} data request data
 * @api private
 */

RequstHandler.prototype.handleGet = function(req, data) {
  var response = req.res;
  this.store.getFromSendQ(data.id, this.manager.get('polling timeout'), function(packets) {
    if (packets) {
      this.payload(req, response, packets);
      response.end();
    } else {
      this.payload(req, response, {type: 'noop'});
      response.end();
    }
  });
} 

/**
 * Handles http GET request 
 *
 * @param {http.IncomingMessage} req
 * @param {Object} data request data
 * @api private
 */

RequestHandler.prototype.handlePost = function(req, data) {
  var buffer = ''
    , res = req.res
    , origin = req.headers.origin
    , headers = { 'Content-Length': 1, 'Content-Type': 'text/plain; charset=UTF-8' }
    , self = this;

  req.on('data', function (data) {
    buffer += data;

    if (Buffer.byteLength(buffer) >= self.manager.get('destroy buffer size')) {
      buffer = '';
      req.connection.destroy();
    }
  });

  req.on('end', function () {
    var resp = function() {
      res.writeHead(200, headers);
      res.end('1');
    }

    self.onData(data.id, self.postEncoded ? qs.parse(buffer).d : buffer, resp);
  });

  req.on('close', function () {
    buffer = '';
  });

  if (origin) {
    // https://developer.mozilla.org/En/HTTP_Access_Control
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['X-XSS-Protection'] = '0';
  }
};

/**
 * Decode the packets and put them to RecvQ
 *
 * @param {String} id sessionid
 * @param {Buffer} packets
 * @api private
 */

RequestHandler.prototype.onData = function(id, data, resp) {
  var messages = parser.decodePayload(data);
  this.store.client[id].pushToRecvQ(data, resp);
}
