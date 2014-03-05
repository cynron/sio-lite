
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Test dependencies.
 */

var sio = require('../')
  , net = require('net')
  , http = require('http')
  , should = require('should')
  , WebSocket = require('../support/node-websocket-client/lib/websocket').WebSocket
  , WSClient = require('./transports.websocket.test')
  , parser = sio.parser
  , client = require('./common').client
  , create = require('./common').create
  , websocket = require('./common').websocket
  , util = require('util')
  , ports = 15500;

/**
 * FlashSocket client constructor.
 *
 * @api private
 */

function FlashSocket (port, sid) {
  this.sid = sid;
  this.port = port;

  WebSocket.call(
      this
    , 'ws://localhost:' + port + '/socket.io/'
        + sio.protocol + '/flashsocket/' + sid
  );
};

/**
 * Inherits from WSClient.
 */

util.inherits(FlashSocket, WebSocket);

/**
 * Creates a TCP connection to a port.
 *
 * @api public
 */

function netConnection (port, callback){
  var nclient = net.createConnection(port);

  nclient.on('data', function (data) {
    callback.call(nclient, null, data);
  });

  nclient.on('error', function (e){
    callback.call(nclient, e);
  });

  nclient.write('<policy-file-request/>\0');
}

/**
 * Tests.
 */

module.exports = {

  'flashsocket disabled by default': function (done) {
    var io = sio.listen(http.createServer());
    io.get('transports').should.not.containEql('flashsocket');
    done();
  },

  'flash policy port': function (done) {
    var io = sio.listen(http.createServer())
      , port = ++ports;

    io.get('flash policy port').should.eql(10843);
    io.set('flash policy port', port);
    io.get('flash policy port').should.eql(port);

    should.strictEqual(io.flashPolicyServer, undefined);

    netConnection(port, function (err, data){
      err.should.be.an.instanceof(Error);
      err.code.should.eql('ECONNREFUSED');

      this.destroy();
      done();
    })
  },

  'start flash policy': function (done) {
    var io = sio.listen(http.createServer())
      , port = ++ports;

    io.set('flash policy port', port);
    io.set('transports', ['flashsocket']);

    io.flashPolicyServer.should.be.a.Object;

    netConnection(port, function (err, data){
      should.strictEqual(err, null);

      data.toString().should.match(/<cross-domain-policy>/);

      this.destroy();
      io.flashPolicyServer.close();
      done();
    })

  },

  'change running flash server port': function (done) {
    var io = sio.listen(http.createServer())
      , port = ++ports
      , next = ++ports;

    io.set('flash policy port', port);
    io.set('transports', ['flashsocket']);
    io.set('flash policy port', next);
    io.flashPolicyServer.port.should.eql(next);

    netConnection(port, function (err, data){
      err.should.be.an.instanceof(Error);
      err.code.should.eql('ECONNREFUSED');

      this.destroy();

      // should work
      netConnection(next, function (err, data){
        should.strictEqual(err, null);

        data.toString().should.match(/<cross-domain-policy>/);

        this.destroy();
        io.flashPolicyServer.close();
        done();
      });
    });
  },

  'different origins': function(done) {
    var io = sio.listen(http.createServer())
      , port = ++ports;

    io.set('flash policy port', port);
    io.set('transports', ['flashsocket']);
    io.set('origins', 'google.com:80');

    var server = io.flashPolicyServer;

    server.origins.should.containEql('google.com:80');
    server.origins.should.not.containEql('*.*');

    io.set('origins', ['foo.bar:80', 'socket.io:1337']);
    server.origins.should.not.containEql('google.com:80');
    server.origins.should.containEql('foo.bar:80');
    server.origins.should.containEql('socket.io:1337');
    server.buffer.toString('utf8').should.match(/socket\.io/);

    io.flashPolicyServer.close();
    done();
  },

  'flashsocket identifies as flashsocket': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , ws;

    io.set('transports', ['flashsocket']);
    io.sockets.on('connection', function (socket) {
      socket.transport.name.should.equal('flashsocket');
      ws.finishClose();
      cl.end();
      io.flashPolicyServer.close();
      io.server.close();
      done();
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid, 'flashsocket');
    });
  }
};
