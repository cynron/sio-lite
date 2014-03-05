
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Test dependencies.
 */

var sio = require('../')
  , should = require('should')
  , parser = sio.parser
  , client = require('./common-rr').client
  , create = require('./common-rr').create
  , websocket = require('./common-rr').websocket
  , ports = 15800;

/**
 * Tests.
 */

module.exports = {
  'test connection event': function (done) {
    var cl = client([ports, ports + 1, ports + 2]);
    var ios = create(cl);
    var ws;

    ports += 3;
    function finish () {
      cl.end();
      ios.forEach(function(io) {
        io.server.close();
      });
      ws.finishClose();
      done();
    };

    ios.forEach(function(io) {
      io.configure(function () {
        io.set('heartbeat interval', 0);
        io.set('heartbeat timeout', .05);
      });

      io.sockets.on('connection', function (socket) {
        socket.on('disconnect', function (reason) {
          finish();
        });
      });
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
    });
  },
 
  'test exchange data': function (done) {
    var cl = client([ports, ports + 1, ports + 2]);
    var ios = create(cl);
    var ws;
    var messages = 0;

    ports += 3;
    function finish () {
      cl.end();
      ios.forEach(function(io) {
        io.server.close();
      });
      ws.finishClose();
      done();
    };

    ios.forEach(function(io) {
      io.configure(function () {
        io.set('heartbeat interval', 0);
        io.set('heartbeat timeout', .05);
      });

      io.sockets.on('connection', function (socket) {
        socket.send('woot');
        socket.on('disconnect', function (reason) {
          finish();
        });
      });
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
      ws.on('message', function(packet) {
        if (++messages === 1) {
          packet.type.should.eql('connect');
        } else if (++messages === 2) {
          packet.type.should.eql('heartbeat');
        } else {
          packet.type.should.eql('message');
          packet.data.should.eql('woot');
        }
      });
    });
  }
};
