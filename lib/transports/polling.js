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

module.exports = Polling;

/**
 * HTTP polling constructor.
 *
 * @api public.
 */

function Polling (mng, data, req) {
  Transport.call(this, mng, data, req);
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
  this.store.client(this.id).getFromRecvQ(this.manager.get('close timeout'), function(data) {
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
  this.store.client(this.id).pushToSendQ(packet);
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

Polling.prototype.discard = function() {
  // TODO:
}

/**
 * Polling.RequestHandler constructor
 *
 * @api private
 */

var RequestHandler = function(manager) {
  this.manager = manager;
  console.log('manager---:', this.manager);
  this.store = this.manager.store;
  console.log('store---:', this.store);
}

/**
 * Handles http polling request GET/POST
 *
 * @param {http.IncomingMessage} req
 * @param {Object} data request data
 * @api private
 */

RequestHandler.prototype.handleRequest = function(req, data) {
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

RequestHandler.prototype.handleGet = function(req, data) {
  var response = req.res;
  var self = this;
  // TODO: req.socket event handle.
  console.log('polling duration', this.manager.get('polling duration'));
  this.store.client(data.id).getFromSendQ(this.manager.get('polling duration'), function(packets) {
    console.log('packets...', packets);
    if (packets) {
      self.payload(req, response, packets);
    } else {
      self.payload(req, response, {type: 'noop'});
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
  this.store.client(id).pushToRecvQ(data, resp);
}

Polling.RequestHandler = RequestHandler;
