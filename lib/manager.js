
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var url = require('url')
  , tty = require('tty')
  , crypto = require('crypto')
  , util = require('./util')
  , transports = require('./transports')
  , Logger = require('./logger')
  , Socket = require('./socket')
  , MemoryStore = require('./stores/memory')
  , EventEmitter = require('events').EventEmitter;

/**
 * Export the constructor.
 */

module.exports = Manager;

/**
 * Inherited defaults.
 */

var parent = module.parent.exports
  , protocol = parent.protocol
  , jsonpPollingRe = /^\d+$/;

/**
 * Manager constructor.
 *
 * @param {HTTPServer} server
 * @param {Object} options, optional
 * @api public
 */

function Manager (server, options) {
  EventEmitter.call(this);

  this.server = server;

  // compatibility
  this.sockets = this;

  this.socketMap = {};
  this.transportMap = {};

  this.settings = {
      origins: '*:*'
    , log: true
    , store: new MemoryStore()
    , logger: new Logger()
    , heartbeats: true
    , resource: '/socket.io'
    , transports: defaultTransports
    , authorization: false
    , blacklist: ['disconnect']
    , 'log level': 3
    , 'log colors': tty.isatty(process.stdout.fd)
    , 'close timeout': 60
    , 'heartbeat interval': 25
    , 'heartbeat timeout': 60
    , 'polling duration': 20
    , 'flash policy server': true
    , 'flash policy port': 10843
    , 'destroy upgrade': true
    , 'destroy buffer size': 10E7
    , 'client store expiration': 15
    , 'match origin protocol': false
    , 'handshake expiration': 30
    , 'handshake gc interval': 10
  };

  for (var opt in options) {
    if (options.hasOwnProperty(opt)) {
      this.settings[opt] = options[opt];
    }
  }

  var self = this;

  // default error handler
  server.on('error', function(err) {
    self.log.warn('error raised: ' + err);
  });

  this.store.init(this);

  this.on('set:store', function(store) {
    store.init(self);
  });

  // reset listeners
  this.oldListeners = server.listeners('request').splice(0);
  server.removeAllListeners('request');

  server.on('request', function (req, res) {
    self.handleRequest(req, res);
  });

  server.on('upgrade', function (req, socket, head) {
    self.handleUpgrade(req, socket, head);
  });

  server.on('close', function () {
    self.store.destroy();
  });

  for (var tran in transports) {
    if (transports.hasOwnProperty(tran)) {
      if (transports[tran].init) {
        transports[tran].init(this);
      }
    }
  }

  this.sequenceNumber = Date.now() | 0;
 
  this.log.info('socket.io started');
}

/**
 * Inherits from EventEmitter
 */

util.inherits(Manager, EventEmitter);

/**
 * Default transports.
 */

var defaultTransports = Manager.defaultTransports = [
    'websocket'
  , 'xhr-polling'
  , 'jsonp-polling'
];

/**
 * Store accessor shortcut.
 *
 * @api public
 */

Manager.prototype.__defineGetter__('store', function () {
  return this.get('store');
});

/**
 * Logger accessor.
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
  this.emit('set:' + key, this.settings[key], key);
  return this;
};

/**
 * Enable a setting
 *
 * @api public
 */

Manager.prototype.enable = function (key) {
  this.settings[key] = true;
  this.emit('set:' + key, this.settings[key], key);
  return this;
};

/**
 * Disable a setting
 *
 * @api public
 */

Manager.prototype.disable = function (key) {
  this.settings[key] = false;
  this.emit('set:' + key, this.settings[key], key);
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
 * Configure callbacks.
 *
 * @api public
 */

Manager.prototype.configure = function (env, fn) {
  if ('function' === typeof env) {
    env.call(this);
  } else if (env === (process.env.NODE_ENV || 'development')) {
    fn.call(this);
  }

  return this;
};

/**
 * Called when a client disconnects.
 *
 * @param text
 */

Manager.prototype.onDisconnect = function (id) {
  if (this.transportMap[id]) {
    delete this.transportMap[id];
  }

  if (this.sockets[id]) {
    this.sockets[id].onDisconnect();
    delete this.sockets[id];
  }

  var self = this;
  setTimeout(function() {
    self.store.destroyConnection(id);
  }, this.get('client store expiration'));
};

/**
 * Handles an HTTP request.
 *
 * @api private
 */

Manager.prototype.handleRequest = function (req, res) {
  var data = this.checkRequest(req);

  if (!data) {
    for (var i = 0, l = this.oldListeners.length; i < l; i++) {
      this.oldListeners[i].call(this.server, req, res);
    }

    return;
  }

  // remove static support, if static request comes,
  // treats it as unhandled socket.io url too.
  if (!data.transport && !data.protocol) {
    res.writeHead(200);
    res.end('Welcome to socket.io.');

    this.log.info('unhandled socket.io url');
    return;
  }

  if (data.protocol !== protocol) {
    res.writeHead(500);
    res.end('Protocol version not supported.');

    this.log.info('client protocol version unsupported');
  } else {
    if (data.id) {
      this.handleHTTPRequest(data, req, res);
    } else {
      this.handleHandshake(data, req, res);
    }
  }
};

/**
 * Handles an HTTP Upgrade.
 *
 * @api private
 */

Manager.prototype.handleUpgrade = function (req, socket, head) {
  var data = this.checkRequest(req);

  if (!data) {
    if (this.enabled('destroy upgrade')) {
      socket.end();
      this.log.debug('destroying non-socket.io upgrade');
    }

    return;
  }

  req.head = head;
  this.handleClient(data, req);
  req.head = null;
};

/**
 * Handles a normal handshaken HTTP request (eg: long-polling)
 *
 * @api private
 */

Manager.prototype.handleClient = function (data, req) {
  var self = this
    , id = data.id
    , Transport;

  // get a disconnect packet
  if (data.query.disconnect) {
    this.store.pushToRecvQ(id, {type: 'disconnect'}, function() {
      req.res.writeHead(200);
      req.res.end();
    });
    return;
  }

  if (!~this.get('transports').indexOf(data.transport)) {
    this.log.warn('unknown transport: "' + data.transport + '"');
    req.connection.end();
    return;
  }

  Transport = transports[data.transport];

  var handleHandshaken = function(handshaken) {
    if (handshaken) {
      self.store.onConnected(id, function() {
        var transport = new transports[data.transport](self, data, req);
        self.transportMap[id] = transport;
        var socket = self.socket(id, handshaken);
        self.emit('connection', socket);
      });
    } else {
      self.log.error('client not handshaken', 'reconnect');
      req.connection.end();
    }
  };

  var handleConnected = function(connected) {
    if (connected) {
      Transport.handleRequest(req, data);
    } else {
      self.store.handshaken(id, handleHandshaken);
    }
  };

  this.store.connected(id, handleConnected);
};

/**
 * Intantiantes a new client.
 *
 * @api private
 */

Manager.prototype.handleHTTPRequest = function (data, req, res) {
  req.res = res;
  this.handleClient(data, req);
};

Manager.prototype.socket = function(id, handshaken) {
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
  var rand = new Buffer(15); // multiple of 3 for base64
  if (!rand.writeInt32BE) {
    return Math.abs(Math.random() * Math.random() * Date.now() | 0).toString() +
      Math.abs(Math.random() * Math.random() * Date.now() | 0).toString();
  }
  this.sequenceNumber = (this.sequenceNumber + 1) | 0;
  rand.writeInt32BE(this.sequenceNumber, 11);
  if (crypto.randomBytes) {
    crypto.randomBytes(12).copy(rand);
  } else {
    // not secure for node 0.4
    [0, 4, 8].forEach(function(i) {
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

  function error (err) {
    writeErr(500, 'handshake error');
    self.log.warn('handshake error ' + err);
  }

  if (!this.verifyOrigin(req)) {
    writeErr(403, 'handshake bad origin');
    return;
  }

  var handshakeData = this.handshakeData(data);

  if (origin) {
    // https://developer.mozilla.org/En/HTTP_Access_Control
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  this.authorize(handshakeData, function (err, authorized, newData) {
    if (err) {
      return error(err);
    }

    if (authorized) {
      var id = self.generateId()
        , hs = [
              id
            , self.enabled('heartbeats') ? self.get('heartbeat timeout') || '' : ''
            , self.get('close timeout') || ''
            , self.transports(data).join(',')
          ].join(':');

      if (data.query.jsonp && jsonpPollingRe.test(data.query.jsonp)) {
        hs = 'io.j[' + data.query.jsonp + '](' + JSON.stringify(hs) + ');';
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
      } else {
        res.writeHead(200, headers);
      }

      self.store.onHandshaken(id, newData || handshakeData, function() {
        res.end(hs);
      });

      self.log.info('handshake authorized', id);
    } else {
      writeErr(403, 'handshake unauthorized');
      self.log.info('handshake unauthorized');
    }
  });
};

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
    , time: date.toString()
    , query: data.query
    , url: data.request.url
    , xdomain: !!data.request.headers.origin
    , secure: data.request.connection.secure
    , issued: +date
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
    var socket = this.socket(sessid)
    , dataAck = packet.ack === 'data'
    , manager = this.manager
    , params
    , self = this;

  function ack () {
    self.log.debug('sending data ack packet');
    socket.packet({
        type: 'ack'
      , args: util.toArray(arguments)
      , ackId: packet.id
    });
  }

  // only `ack, event, disconnect, json, message` packet will be handled here. 
  switch (packet.type) {
    case 'ack':
      if (socket.acks[packet.ackId]) {
        socket.acks[packet.ackId].apply(socket, packet.args);
      } else {
        this.log.info('unknown ack packet');
      }
      break;

    case 'event':
      // check if the emitted event is not blacklisted
      if (-~manager.get('blacklist').indexOf(packet.name)) {
        this.log.debug('ignoring blacklisted event `' + packet.name + '`');
      } else {
        params = [packet.name].concat(packet.args);

        if (dataAck) {
          params.push(ack);
        }

        socket.$emit.apply(socket, params);
      }
      break;

    case 'disconnect':

      socket.$emit('disconnect', packet.reason || 'packet');
      break;

    case 'json':
    case 'message':
      params = ['message', packet.data];

      if (dataAck) {
        params.push(ack);
      }

      socket.$emit.apply(socket, params);
  }
};

/**
 * Performs authentication.
 *
 * @param Object client request data
 * @api private
 */

Manager.prototype.authorize = function (data, fn) {
  if (this.get('authorization')) {
    var self = this;

    this.get('authorization').call(this, data, function (err, authorized) {
      self.log.debug('client ' + authorized ? 'authorized' : 'unauthorized');
      fn(err, authorized);
    });
  } else {
    this.log.debug('client authorized');
    fn(null, true);
  }

  return this;
};

/**
 * Retrieves the transports adviced to the user.
 *
 * @api private
 */

Manager.prototype.transports = function (data) {
  var transp = this.get('transports')
    , ret = [];

  for (var i = 0, l = transp.length; i < l; i++) {
    var transport = transp[i];

    if (transport) {
      if (!transport.checkClient || transport.checkClient(data)) {
        ret.push(transport);
      }
    }
  }

  return ret;
};

/**
 * Checks whether a request is a socket.io one.
 *
 * @return {Object} a client request data object or `false`
 * @api private
 */

var regexp = /^\/([^\/]+)\/?([^\/]+)?\/?([^\/]+)?\/?$/;

Manager.prototype.checkRequest = function (req) {
  var resource = this.get('resource');

  var match;
  if (typeof resource === 'string') {
    match = req.url.substr(0, resource.length);
    if (match !== resource) {
      match = null;
    }
  } else {
    match = resource.exec(req.url);
    if (match) {
      match = match[0];
    }
  }

  if (match) {
    var uri = url.parse(req.url.substr(match.length), true)
      , path = uri.pathname || ''
      , pieces = path.match(regexp);

    // client request data
    var data = {
        query: uri.query || {}
      , headers: req.headers
      , request: req
      , path: path
    };

    if (pieces) {
      data.protocol = Number(pieces[1]);
      data.transport = pieces[2];
      data.id = pieces[3];
    }

    return data;
  }

  return false;
};

