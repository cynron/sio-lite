
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Version.
 */

exports.version = '0.9.16';

/**
 * Supported protocol version.
 */

exports.protocol = 1;

/**
 * Attaches a manager
 *
 * @param {HTTPServer/Number} a HTTP/S server or a port number to listen on.
 * @param {Object} opts to be passed to Manager and/or http server
 * @param {Function} callback if a port is supplied
 * @api public
 */

exports.listen = function (server, options, fn) {
  if ('function' === typeof server) {
    console.warn('Socket.IO\'s `listen()` method expects an `http.Server` instance\n' +
      'as its first parameter. Are you migrating from Express 2.x to 3.x?\n' +
      'If so, check out the "Socket.IO compatibility" section at:\n' +
      'https://github.com/visionmedia/express/wiki/Migrating-from-2.x-to-3.x');
  }

  if ('function' === typeof options) {
    fn = options;
    options = {};
  }

  if ('undefined' === typeof server) {
    // create a server that listens on port 80
    server = 80;
  }

  if ('number' === typeof server) {
    // if a port number is passed
    var port = server;

    if (options && options.key) {
      server = require('https').createServer(options);
    } else {
      server = require('http').createServer();
    }

    server.listen(port, '0.0.0.0', fn);
  }

  // otherwise assume a http/s server
  return new exports.Manager(server, options);
};

/**
 * Manager constructor.
 *
 * @api public
 */

exports.Manager = require('./manager');

/**
 * Socket constructor.
 *
 * @api public
 */

exports.Socket = require('./socket');

/**
 * Parser.
 *
 * @api public
 */

exports.parser = require('./parser');

