/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var url = require('url');
var tty = require('tty');
var crypto = require('crypto');
var EventEmitter = require('events');

var WebSocketServer = require('ws').Server;

var util = require('./util');
var parser = require('./parser');
var transports = require('./transports');
var Logger = require('./logger');
var Socket = require('./socket');

/**
 * Export the constructor.
 */

module.exports = Manager;

var jsonpPollingRe = /^\d+$/;
var protocol = 1;

/**
 * Manager constructor.
 *
 * @param {HTTPServer} server
 * @param {Object} options, optional
 * @api public
 */

function Manager (server, options) {
  EventEmitter.call(this);

  this.httpServer = server;

  // 
  // the socket here is socket.io socket
  // it is constructed after handshake data
  //
  this.socketMap = {};
  this.transportMap = {};

  this.settings = {
      origins: '*:*',
      log: true,
      logger: new Logger(),
      heartbeats: true,
      transports: ['websocket'],
      blacklist: ['disconnect'],

      'log level': 3,
      'log colors': tty.isatty(process.stdout.fd),
      'close timeout': 60,
      'heartbeat interval': 25,
      'heartbeat timeout': 60,
      'polling duration': 20,
      'destroy upgrade': true,
      'destroy buffer size': 10E7,
      'browser client': true,
      'browser client cache': true,
      'browser client minification': false,
      'browser client etag': false,
      'browser client expires': 315360000,
      'browser client gzip': false,
      'browser client handler': false
  };

  for (var opt in options) {
    if (options.hasOwnProperty(opt)) {
      this.settings[opt] = options[opt];
    }
  }

  var self = this;

  // compatiable
  this.sockets = this;
  this.server = this.httpServer;

  for (var tran in transports) {
    if (transports.hasOwnProperty(tran)) {
      if (transports[tran].init) {
        transports[tran].init(this);
      }
    }
  }

  this.httpServer.on('error', function(err) {
    self.log.warn('error raised: ' + err);
  });

  this.httpServer.removeAllListeners('request');

  this.httpServer.on('request', function (req, res) {
    self.handleRequest(req, res);
  });

  this.httpServer.on('upgrade', function (req, socket, head) {
    self.handleUpgrade(req, socket, head);
  });

  this.httpServer.once('listening', function() {
    self.emit('listening');
  });

  self.wsServer = new WebSocketServer({noServer: true, clientTracking: false});

  this.sn = Date.now() | 0;

  this.log.info('socket.io started');
}

/**
 * Inherits from EventEmitter
 */
util.inherits(Manager, EventEmitter);

/**
 * Logger accessor
 *
 * @api public
 */

Manager.prototype.__defineGetter__('log', function () {
  var logger = this.get('logger');

  logger.level = this.get('log level') || -1;
  logger.colors = this.get('log colors');
  logger.enabled = this.enabled('log');

  return logger;
});

/**
 * Get settings.
 *
 * @api public
 */

Manager.prototype.get = function (key) {
  return this.settings[key];
};

/**
 * Set settings
 *
 * @api public
 */

Manager.prototype.set = function (key, value) {
  if (arguments.length === 1) {
    return this.get(key);
  }

  this.settings[key] = value;
  return this;
};

/**
 * Enable a setting
 *
 * @api public
 */

Manager.prototype.enable = function (key) {
  this.settings[key] = true;
  return this;
};

/**
 * Disable a setting
 *
 * @api public
 */

Manager.prototype.disable = function (key) {
  this.settings[key] = false;
  return this;
};

/**
 * Checks if a setting is enabled
 *
 * @api public
 */

Manager.prototype.enabled = function (key) {
  return !!this.settings[key];
};

/**
 * Checks if a setting is disabled
 *
 * @api public
 */

Manager.prototype.disabled = function (key) {
  return !this.settings[key];
};

/**
 * Called when a client disconnects.
 *
 * recv disconnect packet or call disconnect on socket
 *
 * @param text
 */

Manager.prototype.onDisconnect = function (id, reason) {
  if (this.transportMap[id]) {
    delete this.transportMap[id];
  }

  if (this.sockets[id]) {
    this.sockets[id].onDisconnect(reason);
    delete this.sockets[id];
  }
};

/**
 * Handles an HTTP request.
 *
 * @api private
 */

Manager.prototype.handleRequest = function (req, res) {
  var data = this.checkRequest(req);

  if (!data) {
    res.writeHead(400);
    res.end("Not an invalid socket.io request");
    this.log.info('invalid http request');

    return;
  }

  if (data.protocol !== protocol) {
    res.writeHead(500);
    res.end('Protocol version not supported.');

    this.log.info('client protocol version unsupported');
  } else {
    if (data.id) {
      // it is a jsonp-polling or xhr-polling or post 
      res.writeHead(400);
      res.end('Long polling is not supported');
      this.log.info('long polling is not supported');
    } else {
      // handshake 
      this.handleHandshake(data, req, res);
    }
  }
};

/**
 * Handles an HTTP Upgrade.
 *
 * @api private
 */

Manager.prototype.handleUpgrade = function (req, socket, upgradeHead) {
  var data = this.checkRequest(req);
  var self = this;

  if (!data) {
    socket.destroy();
    this.log.debug('destroying non-socket.io upgrade');
    return;
  }

  // for compatibility, now don't check id length
  if (!data.id /* || (data.id.length !== 32 && data.id.length !== 20) */) {
    this.log.debug('sio id is invalid, destroy');
    socket.destroy();
    return ;
  }

  if (!data.transport || data.transport !== 'websocket') {
    this.log.debug('unsupport transport for upgrade');
    socket.destroy();
    return ;
  }

  var head = Buffer.allocUnsafe(upgradeHead.length);
  upgradeHead.copy(head);
  upgradeHead = null;

  this.wsServer.handleUpgrade(req, socket, head, function(wsSocket) {
    if (socket && socket.setKeepAlive) {
      socket.setKeepAlive(true);
    }

    self.onWebsocketConnection(data, wsSocket);
  });
};

Manager.prototype.onWebsocketConnection = function (data, wsSocket) {
  var self = this;
  var trans = new transports['websocket'](self, data, wsSocket);
  this.transportMap[data.id] = trans;

  var handshakeData = this.handshakeData(data); 
  var socket = this.createOrGetSocket(data.id, handshakeData);
  this.emit('connection', socket);
}

Manager.prototype.createOrGetSocket = function(id, handshaken) {
  if (!this.sockets[id]) {
    this.sockets[id] = new Socket(this, id, handshaken);
  }

  return this.sockets[id];
};

/**
 * Generates a session id.
 *
 * @api private
 */

Manager.prototype.generateId = function () {
  var rand = Buffer.allocUnsafe(24);
  this.sequenceNumber = (this.sequenceNumber + 1) | 0;
  var now = Date.now() / 1000;
  rand.writeInt32BE(this.sequenceNumber, 20);
  rand.writeInt32BE(now, 16);
  if (crypto.randomBytes) {
    crypto.randomBytes(16).copy(rand);
  } else {
    [0, 4, 8, 12].forEach(function(i) {
      rand.writeInt32BE(Math.random() * Math.pow(2, 32) | 0, i);
    });
  }
  return rand.toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
};

/**
 * Handles a handshake request.
 *
 * @api private
 */

Manager.prototype.handleHandshake = function (data, req, res) {
  var self = this
    , origin = req.headers.origin
    , headers = {
        'Content-Type': 'text/plain'
    };

  function writeErr (status, message) {
    if (data.query.jsonp && jsonpPollingRe.test(data.query.jsonp)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('io.j[' + data.query.jsonp + '](new Error("' + message + '"));');
    } else {
      res.writeHead(status, headers);
      res.end(message);
    }
  }

  if (!this.verifyOrigin(req)) {
    writeErr(403, 'Handshake bad origin');
    return;
  }

  if (origin) {
    // https://developer.mozilla.org/En/HTTP_Access_Control
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  var id = self.generateId();
  var hs = [
    id,
    self.get('heartbeat timeout') || '',
    self.get('close timeout') || '',
    'websocket'
  ].join(':');

  if (data.query.jsonp && jsonpPollingRe.test(data.query.jsonp)) {
    hs = 'io.j[' + data.query.jsonp + '](' + JSON.stringify(hs) + ');';
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
  } else {
    res.writeHead(200, headers);
  }

  res.end(hs);
}

/**
 * Gets normalized handshake data
 *
 * @api private
 */
Manager.prototype.handshakeData = function (data) {
  var connection = data.request.connection
    , connectionAddress
    , date = new Date();

  if (connection.remoteAddress) {
    connectionAddress = {
        address: connection.remoteAddress
      , port: connection.remotePort
    };
  } else if (connection.socket && connection.socket.remoteAddress) {
    connectionAddress = {
        address: connection.socket.remoteAddress
      , port: connection.socket.remotePort
    };
  }

  return {
      headers: data.headers
    , address: connectionAddress
    , query: data.query
    , url: data.request.url
    , xdomain: !!data.request.headers.origin
    , secure: data.request.connection.secure
  };
};

/**
 * Verifies the origin of a request.
 *
 * @api private
 */

Manager.prototype.verifyOrigin = function (request) {
  var origin = request.headers.origin || request.headers.referer
    , origins = this.get('origins');

  if (origin === 'null') {
    origin = '*';
  }

  if (origins.indexOf('*:*') !== -1) {
    return true;
  }

  if (origin) {
    try {
      var parts = url.parse(origin);
      parts.port = parts.port || 80;
      var ok =
        ~origins.indexOf(parts.hostname + ':' + parts.port) ||
        ~origins.indexOf(parts.hostname + ':*') ||
        ~origins.indexOf('*:' + parts.port);
      if (!ok) {
        this.log.warn('illegal origin: ' + origin);
      }
      return ok;
    } catch (ex) {
      this.log.warn('error parsing origin');
    }
  }
  else {
    this.log.warn('origin missing from handshake, yet required by config');
  }
  return false;
};

/**
 * Handles an incoming packet.
 *
 * @api private
 */

Manager.prototype.handlePacket = function (sessid, packet) {
    var socket = this.createOrGetSocket(sessid)
    , params
    , self = this;

  // only `ack, event, disconnect, json, message` packet will be handled here. 
  switch (packet.type) {
    case 'event':
      // check if the emitted event is not blacklisted
      if (-~this.get('blacklist').indexOf(packet.name)) {
        this.log.debug('ignoring blacklisted event `' + packet.name + '`');
      } else {
        params = [packet.name].concat(packet.args);
        socket.$emit.apply(socket, params);
      }
      break;

    case 'disconnect':
      socket.$emit('disconnect', packet.reason || 'packet');
      break;

    case 'json':
    case 'message':
      params = ['message', packet.data];
      socket.$emit.apply(socket, params);
      break;
  }
};

/**
 * Checks whether a request is a socket.io one.
 *
 * @return {Object} a client request data object or `false`
 * @api private
 */

var regexp = /^\/([^\/]+)\/?([^\/]+)?\/?([^\/]+)?\/?$/;

function SioData () {

}

Manager.prototype.checkRequest = function (req) {
  var sock_path = '/socket.io';
  var match = req.url.substr(0, sock_path.length);

  if (match !== sock_path) {
    match = false;
  } 

  if (match) {
    var uri = url.parse(req.url.substr(match.length), true)
      , path = uri.pathname || ''
      , pieces = path.match(regexp);

    var data = new SioData();
    data.query = uri.query || {};
    data.headers = req.headers;
    data.request = req;
    data.path = path;

    if (pieces) {
      data.protocol = Number(pieces[1]);
      data.transport = pieces[2];
      data.id = pieces[3];
    }

    return data;
  }

  return false;
};

