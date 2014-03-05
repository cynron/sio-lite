
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Test dependencies.
 */

var io = require('../')
  , parser = io.parser
  , http = require('http')
  , https = require('https')
  , RedisStore = require('../lib/stores/redis')
  , util = require('util')
  , WebSocket = require('../support/node-websocket-client/lib/websocket').WebSocket;

/**
 * Exports.
 */

exports.HTTPClient = HTTPClient;
exports.create = create;
exports.client = client;
exports.websocket = websocket;

/**
 * Client utility.
 *
 * @api publiC
 */

function HTTPClient (ports) {
  this.ports = ports;
  this.agents = [];
  this.portNum = ports.length;
  this.serialNum = 0;
  var self = this;

  this.ports.forEach(function(port) {
    self.agents.push(new http.Agent({
      host: 'localhost'
    , port: port
    }));
  });
};

/**
 * Issue a request
 *
 * @api private
 */

HTTPClient.prototype.request = function (path, opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  opts = opts || {};
  opts.agent = this.agents[this.serialNum % this.portNum];
  opts.host = 'localhost';
  opts.port = this.ports[this.serialNum % this.portNum];
  opts.path = path.replace(/{protocol}/g, io.protocol);

  opts.headers = opts.headers || {};
  opts.headers.Host = 'localhost';
  opts.headers.Connection = 'keep-alive';

  var req = http.request(opts, function (res) {
    if (false === opts.buffer)
      return fn && fn(res);

    var buf = '';

    res.on('data', function (chunk) {
      buf += chunk;
    });

    res.on('end', function () {
      fn && fn(res, opts.parse ? opts.parse(buf) : buf);
    });
  });

  // round-robin mode 
  this.serialNum ++;
  req.on('error', function (err) { });

  if (undefined !== opts.data)
    req.write(opts.data);

  req.end();

  return req;
};

/**
 * Terminates the client and associated connections.
 *
 * @api public
 */

HTTPClient.prototype.end = function () {
  for (var i = 0; i < this.agents.length; ++i) {
    var agent = this.agents[i];
    // node <v0.5 compat
    if (agent.sockets.forEach) {
      agent.sockets.forEach(function (socket) {
        if (socket.end) socket.end();
      });
      return;
    }
    // node >=v0.5 compat
    Object.keys(agent.sockets).forEach(function (socket) {
      for (var i = 0, l = agent.sockets[socket].length; i < l; ++i) {
        if (agent.sockets[socket][i]._handle) {
          if (agent.sockets[socket][i]._handle.socket) {
            agent.sockets[socket][i]._handle.socket.end();
          } else {
            agent.sockets[socket][i]._handle.owner.end();
          }
        }
      }
    });
  }
};

/**
 * Issue a GET request
 *
 * @api public
 */

HTTPClient.prototype.get = function (path, opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  opts = opts || {};
  opts.method = 'GET';

  // override the parser for transport requests
  if (/\/(xhr-polling|htmlfile|jsonp-polling)\//.test(path)) {
    // parser that might be necessary for transport-specific framing
    var transportParse = opts.parse;
    opts.parse = function (data) {
      if (data === '') return data;

      data = transportParse ? transportParse(data) : data;
      return parser.decodePayload(data);
    };
  } else {
    opts.parse = undefined;
  }

  return this.request(path, opts, fn);
};

/**
 * Issue a POST request
 *
 * @api private
 */

HTTPClient.prototype.post = function (path, data, opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  opts = opts || {};
  opts.method = 'POST';
  opts.data = data;

  return this.request(path, opts, fn);
};

/**
 * Issue a HEAD request
 *
 * @api private
 */

HTTPClient.prototype.head = function (path, opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  opts = opts || {};
  opts.method = 'HEAD';

  return this.request(path, opts, fn);
};

/**
 * Performs a handshake (GET) request
 *
 * @api private
 */

HTTPClient.prototype.handshake = function (opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  return this.get('/socket.io/{protocol}', opts, function (res, data) {
    fn && fn.apply(null, data.split(':'));
  });
};

/**
 * Generates a new client for the given port.
 *
 * @api private
 */

function client (ports) {
  return new HTTPClient(ports);
};

/**
 * Create multi socket.io servers based on given ports.
 */

function create (cl) {
  var managers = [];
  cl.ports.forEach(function(port) {
    var manager = io.listen(port, {
      store: new RedisStore(),
      'client store expiration': 0});
    managers.push(manager);
  });
  return managers;
};

/**
 * WebSocket socket.io client.
 *
 * @api private
 */

function WSClient (port, sid, transport) {
  this.sid = sid;
  this.port = port;
  this.transportName = transport || 'websocket';
  WebSocket.call(
      this
    , 'ws://localhost:' + port + '/socket.io/'
        + io.protocol + '/' + this.transportName + '/' + sid
  );
};

/**
 * Inherits from WebSocket.
 */

util.inherits(WSClient, WebSocket);

/**
 * Overrides message event emission.
 *
 * @api private
 */

WSClient.prototype.emit = function (name) {
  var args = arguments;

  if (name == 'message' || name == 'data') {
    args[1] = parser.decodePacket(args[1].toString());
  }

  return WebSocket.prototype.emit.apply(this, arguments);
};

/**
 * Writes a packet
 */

WSClient.prototype.packet = function (pack) {
  this.write(parser.encodePacket(pack));
  return this;
};

/**
 * Creates a websocket client.
 *
 * @api public
 */

function websocket (cl, sid, transport) {
  return new WSClient(cl.ports[cl.serialNum++ % cl.portNum], sid, transport);
};
