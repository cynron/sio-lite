
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
  , client = require('./common').client
  , create = require('./common').create 
  , websocket = require('./common').websocket
  , ports = 15900;

/**
 * Tests.
 */

module.exports = {
  'websocket identifies as websocket': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , ws;

    io.set('transports', ['websocket']);
    io.on('connection', function (socket) {
      socket.transport.name.should.equal('websocket');
      ws.finishClose();
      cl.end();
      io.server.close();
      done();
    });
    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
    });
  },

  'default websocket draft parser is used for unknown sec-websocket-version': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , ws;

    io.set('transports', ['websocket']);
    io.sockets.on('connection', function (socket) {
      socket.transport.protocolVersion.should.equal('hixie-76');
      ws.finishClose();
      cl.end();
      io.server.close();
      done();
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
    });
  },

  'hybi-07-12 websocket draft parser is used for sec-websocket-version: 8': function (done) {
    var cl = client(++ports)
      , io = create(cl);

    io.set('transports', ['websocket']);
    io.sockets.on('connection', function (socket) {
      socket.transport.protocolVersion.should.equal('07-12');
      cl.end();
      io.server.close();
      done();
    });

    var headers = {
      'sec-websocket-version': 8,
      'upgrade': 'websocket',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
    }

    cl.get('/socket.io/{protocol}', {}, function (res, data) {
      var sid = data.split(':')[0];
      var url = '/socket.io/' + sio.protocol + '/websocket/' + sid;
      cl.get(url, {headers: headers}, function (res, data) {});
    });
  },

  'hybi-16 websocket draft parser is used for sec-websocket-version: 13': function (done) {
    var cl = client(++ports)
      , io = create(cl)

    io.set('transports', ['websocket']);

    io.sockets.on('connection', function (socket) {
      socket.transport.protocolVersion.should.equal('16');
      cl.end();
      io.server.close();
      done();
    });

    var headers = {
      'sec-websocket-version': 13,
      'upgrade': 'websocket',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
    }

    cl.get('/socket.io/{protocol}', {}, function (res, data) {
      var sid = data.split(':')[0];
      var url = '/socket.io/' + sio.protocol + '/websocket/' + sid;
      cl.get(url, {headers: headers}, function (res, data) {});
    });
  },

  'hybi-07-12 origin filter blocks access for mismatched sec-websocket-origin': function (done) {
    var cl = client(++ports)
      , io = create(cl)

    io.set('transports', ['websocket']);
    io.set('origins', 'foo.bar.com:*');
    var notConnected = true;
    io.sockets.on('connection', function() {
        notConnected = false;
    });

    var headers = {
      'sec-websocket-version': 8,
      'upgrade': 'websocket',
      'Sec-WebSocket-Origin': 'http://baz.bar.com',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
    }

    // handshake uses correct origin -- we want to block the actual websocket call
    cl.get('/socket.io/{protocol}', {headers: {origin: 'http://foo.bar.com'}}, function (res, data) {
      var sid = data.split(':')[0];
      var url = '/socket.io/' + sio.protocol + '/websocket/' + sid;
      var req = cl.get(url, {headers: headers}, function (res, data) {});
      var closed = false;
      (req.socket || req).on('close', function() {
        if (closed) return;
        closed = true;
        // notConnected.should.be.true;
        cl.end();
        try {
          io.server.close();
        }
        catch (e) {}
        done();
      });
    });
  },

  'hybi-16 origin filter blocks access for mismatched sec-websocket-origin': function (done) {
    var cl = client(++ports)
      , io = create(cl);

    io.set('transports', ['websocket']);
    io.set('origins', 'foo.bar.com:*');
    var notConnected = true;
    io.sockets.on('connection', function() {
        notConnected = false;
    });

    var headers = {
      'sec-websocket-version': 13,
      'upgrade': 'websocket',
      'origin': 'http://baz.bar.com',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
    }

    // handshake uses correct origin -- we want to block the actual websocket call
    cl.get('/socket.io/{protocol}', {headers: {origin: 'http://foo.bar.com'}}, function (res, data) {
      var sid = data.split(':')[0];
      var url = '/socket.io/' + sio.protocol + '/websocket/' + sid;
      var req = cl.get(url, {headers: headers}, function (res, data) {});
      var closed = false;
      (req.socket || req).on('close', function() {
        if (closed) return;
        closed = true;
        // notConnected.should.be.true;
        cl.end();
        try {
          io.server.close();
        }
        catch (e) {}
        done();
      });
    });
  },

  'hybi-07-12 origin filter accepts implicit port 80 for sec-websocket-origin': function (done) {
done();return;
    var cl = client(++ports)
      , io = create(cl)

    io.set('transports', ['websocket']);
    io.set('origins', 'foo.bar.com:80');

    var headers = {
      'sec-websocket-version': 8,
      'upgrade': 'websocket',
      'Sec-WebSocket-Origin': 'http://foo.bar.com',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
    }

    io.sockets.on('connection', function() {
        cl.end();
        io.server.close();
        done();
    });

    // handshake uses correct origin -- we want to block the actual websocket call
    cl.get('/socket.io/{protocol}', {headers: {origin: 'http://foo.bar.com'}}, function (res, data) {
      var sid = data.split(':')[0];
      var url = '/socket.io/' + sio.protocol + '/websocket/' + sid;
      cl.get(url, {headers: headers}, function (res, data) {});
    });
  },

  'hybi-16 origin filter accepts implicit port 80 for sec-websocket-origin': function (done) {
    var cl = client(++ports)
      , io = create(cl)

    io.set('transports', ['websocket']);
    io.set('origins', 'foo.bar.com:80');

    var headers = {
      'sec-websocket-version': 13,
      'upgrade': 'websocket',
      'origin': 'http://foo.bar.com',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
    }

    io.sockets.on('connection', function() {
        cl.end();
        io.server.close();
        done();
    });

    // handshake uses correct origin -- we want to block the actual websocket call
    cl.get('/socket.io/{protocol}', {headers: {origin: 'http://foo.bar.com'}}, function (res, data) {
      var sid = data.split(':')[0];
      var url = '/socket.io/' + sio.protocol + '/websocket/' + sid;
      cl.get(url, {headers: headers}, function (res, data) {});
    });
  },

  'test that not responding to a heartbeat drops client': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , messages = 0
      , ws;

    io.configure(function () {
      io.set('heartbeat interval', .05);
      io.set('heartbeat timeout', .05);
      io.set('close timeout', 0);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('disconnect', function (reason) {
        beat.should.be.true;

        cl.end();
        ws.finishClose();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
      ws.on('message', function (packet) {
        if (++messages == 1) {
          packet.type.should.eql('connect');
        } else {
          packet.type.should.eql('heartbeat');
          beat = true;
        }
      });
    });
  },

  'test that responding to a heartbeat maintains session': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , messages = 0
      , heartbeats = 0
      , ws;

    io.configure(function () {
      io.set('heartbeat interval', .05);
      io.set('heartbeat timeout', .05);
      io.set('close timeout', 0);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('disconnect', function (reason) {
        heartbeats.should.eql(2);

        cl.end();
        ws.finishClose();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
      ws.on('message', function (packet) {
        if (++messages == 1) {
          packet.type.should.eql('connect');
        } else {
          packet.type.should.eql('heartbeat');
          heartbeats++;

          if (heartbeats == 1) {
            ws.packet({ type: 'heartbeat' });
          }
        }
      });
    });
  },

  'test accessing handshake data from sockets': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , ws;

    io.sockets.on('connection', function (socket) {
      (!!socket.handshake.address.address).should.be.true;
      (!!socket.handshake.address.port).should.be.true;
      socket.handshake.headers.host.should.equal('localhost');
      socket.handshake.headers.connection.should.equal('keep-alive');
      socket.handshake.time.should.match(/GMT/);

      socket.on('disconnect', function () {
        setTimeout(function () {
          ws.finishClose();
          cl.end();
          io.server.close();
          done();
        }, 10);
      });

      socket.disconnect();
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
      ws.on('message', function (msg) {
        if (!ws.connected) {
          msg.type.should.eql('connect');
          ws.connected = true;
        }
      });
    });
  },

  'test accessing handshake data from sockets on disconnect': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , ws;

    io.sockets.on('connection', function (socket) {
      socket.on('disconnect', function () {

      (!!socket.handshake.address.address).should.be.true;
      (!!socket.handshake.address.port).should.be.true;
      socket.handshake.headers.host.should.equal('localhost');
      socket.handshake.headers.connection.should.equal('keep-alive');
      socket.handshake.time.should.match(/GMT/);

        setTimeout(function () {
          ws.finishClose();
          cl.end();
          io.server.close();
          done();
        }, 10);
      });

      socket.disconnect();
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
      ws.on('message', function (msg) {
        if (!ws.connected) {
          msg.type.should.eql('connect');
          ws.connected = true;
        }
      });
    });
  },

  'test socket clean up': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , ws;

    io.sockets.on('connection', function (socket) {
      var self = this
        , id = socket.id;

      socket.on('disconnect', function () {
        setTimeout(function () {
          var available = !!self.sockets[id];

          available.should.be.false;
          ws.finishClose();
          cl.end();
          io.server.close();
          done();
        }, 10);
      });

      socket.disconnect();
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
      ws.on('message', function (msg) {
        if (!ws.connected) {
          msg.type.should.eql('connect');
          ws.connected = true;
        }
      });
    });
  },

  'accessing the transport type': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , ws;

    io.sockets.on('connection', function (socket) {
      socket.transport.name.should.equal('websocket');

      socket.on('disconnect', function () {
        setTimeout(function () {
          ws.finishClose();
          cl.end();
          io.server.close();
          done();
        }, 10);
      });

      socket.disconnect();
    });

    cl.handshake(function (sid) {
      ws = websocket(cl, sid);
      ws.on('message', function (msg) {
        if (!ws.connected) {
          msg.type.should.eql('connect');
          ws.connected = true;
        }
      });
    });
  }

};
