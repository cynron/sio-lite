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
  this.setup();
  this.readyState = 'connected';
}

/**
 * Start to query client data from Queue
 * 
 * @api private
 */

Polling.prototype.setup = function() {
  var self = this;
  this.store.getFromRecvQ(this.id, this.manager.get('close timeout'), function(data) {
    if (self.readyState !== 'connected') return;
    if (!data || data.length === 0) {
      self.disconnect('close timeout fire');
    } else {
      self.handle(data);
      self.setup();
    }
  });
}

/**
 * Handle the data get from store
 *
 * @param {Array} data
 * @api private
 */

Polling.prototype.handle = function(data) {
  var self = this;

  // noop packet is used to make close timeout not fire
  var handlePacket = function(packet) {
    if (packet.type === 'noop') return;
    self.onMessage(packet);
  }

  for (var i = 0; i < data.length; ++i) {
    var packets = data[i];
    packets = parser.decodePayload(packets);
    
    if (Array.isArray(packets)) {
      packets.forEach(handlePacket);
    } else {
      handlePacket(packets);
    }
  }
}

/**
 * Send packet to client
 *
 * @param {Object|Array} packet 
 * @api public
 */

Polling.prototype.packet = function (packet) {
  if (this.readyState === 'connected') {
    this.store.pushToSendQ(this.id, packet);
  }
}

/**
 * End the transport
 * 
 * @param {String} reason
 * @api private
 */

Polling.prototype.end = function(reason) {
  if (this.readyState !== 'disconnected') {
    this.store.destroyById(this.id); 
    delete this.manager.transportMap[this.id];
    this.readyState = 'disconnected';
  }
}

/**
 * Polling.RequestHandler constructor
 *
 * @api private
 */

var RequestHandler = function(manager) {
  this.manager = manager;
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
  this.store.getFromSendQ(data.id, this.manager.get('polling duration'), function(packets) {
    if (!packets || packets.length === 0) {
      packets = {type: 'noop'};
    }
    packets = parser.encodePackets(packets);
    var noopPacket = parser.encodePacket({type: 'noop'});
    self.store.pushToRecvQ(data.id, noopPacket, function(err) {
      if (err) {
        self.manager.log.error(err);
      } else {
        self.payload(req, response, data, packets);
      }
    });
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
  this.store.pushToRecvQ(id, data, resp);
}

RequestHandler.prototype.__defineGetter__('store', function() {
  return this.manager.store;
});

Polling.RequestHandler = RequestHandler;
