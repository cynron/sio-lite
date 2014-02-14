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
  this.readyState = Transport.CONNECTED;
}

/**
 * Start to query client data from Queue
 * 
 * @api private
 */

Polling.prototype.setup = function() {
  var self = this;
  this.log.debug('set close timeout');
  this.store.getFromRecvQ(this.id, function(isTimeout, data) {
    if (self.readyState !== Transport.CONNECTED) return;

    if (isTimeout) {
      self.log.debug('close timeout fired');
      self.disconnect('close timeout');
      return;
    }

    if (data && data.length !== 0) {
      self.handle(data);
    }

    self.log.debug('close timeout cleared');
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
  if (this.readyState === Transport.CONNECTED
    || this.readyState === Transport.DISCONNECTING) {
    this.store.pushToSendQ(this.id, packet);
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
  var isException = false;

  self.log.debug(data.transport + ' polls');

  var noopPacket = parser.encodePacket({type: 'noop'});
  self.store.pushToRecvQ(data.id, noopPacket, function(err) {
    if (err) {
      self.log.error('push noop packet to recvq err: ' + err);
    } else {
      var errorHandler = function(err) {
        self.log.info('socket error ' + err.stack);
        isException = true;
      }

      var exHandler = function() {
        isException = true;
      }

      req.socket.on('close', exHandler);
      req.socket.on('end', exHandler);
      req.socket.on('error', errorHandler);

      self.store.getFromSendQ(data.id, function(isTimeout, packets) {
        req.socket.removeListener('close', exHandler);
        req.socket.removeListener('end', exHandler);
        req.socket.removeListener('error', errorHandler);

        if (isException) {
          self.log.error('polling exception');
          return;
        }

        if (isTimeout || !packets || packets.length === 0) {
          packets = {type: 'noop'};
        }
        packets = parser.encodePackets(packets);
        self.payload(req, response, data, packets);
      });
    }
  });
} 

/**
 * Handles http POST request 
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
 * @param {Buffer} data 
 * @api private
 */

RequestHandler.prototype.onData = function(id, data, resp) {
  this.log.info('data from client: ' + data);
  this.store.pushToRecvQ(id, data, resp);
}

/**
 * store Accessor
 */

RequestHandler.prototype.__defineGetter__('store', function() {
  return this.manager.store;
});

/**
 * log Accessor
 */

RequestHandler.prototype.__defineGetter__('log', function() {
  return this.manager.log;
});

Polling.RequestHandler = RequestHandler;
