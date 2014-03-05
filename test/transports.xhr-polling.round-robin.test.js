
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
  , HTTPClient = require('./common-rr').HTTPClient
  , create = require('./common-rr').create
  , parser = sio.parser
  , util = require('util')
  , ports = 15200;

/**
 * HTTPClient for xhr-polling transport.
 */

function XHRPolling (port) {
  HTTPClient.call(this, port);
};

/**
 * Inhertis from HTTPClient.
 */

util.inherits(XHRPolling, HTTPClient);

/**
 * Performs the handshake and expects the connect echo packet.
 *
 * @api public
 */

XHRPolling.prototype.handshake = function (opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  var self = this;

  return this.get('/socket.io/{protocol}', opts, function (res, data) {
    var parts = data.split(':');

    if (opts.ignoreConnect) {
      return fn && fn.apply(null, parts);
    }

    // expect connect packet right after handshake
    self.get(
        '/socket.io/{protocol}/xhr-polling/' + parts[0]
      , function (res, msgs) {
          res.statusCode.should.eql(200);

          msgs.should.have.length(1);
          msgs[0].should.eql({ type: 'connect', endpoint: '', qs: '' });

          fn && fn.apply(null, parts);
        }
    );
  });
};

/**
 * Create client for this transport.
 *
 * @api public
 */

function client (port) {
  return new XHRPolling(port);
};

/**
 * Test.
 */

module.exports = {

  'test handshake': function (done) {
    var cl = client([ports, ports + 1, ports + 2]);
    ports += 3;
    var ios = create(cl);
    ios.forEach(function(io) {
      io.configure(function() {
        io.set('close timeout', 1);
        io.set('polling timeout', 0);
      });
    });

    function finish () {
      cl.end();
      ios.forEach(function(io) {
        io.server.close();
      });
      done();
    };

    cl.handshake(function (sid) {
      var total = 2;

      cl.get('/socket.io/{protocol}/xhr-polling/dummy', function (res, msgs) {
        res.statusCode.should.eql(200);

        msgs.should.have.length(1);
        msgs[0].should.eql({
            type: 'error'
          , reason: 'client not handshaken'
          , endpoint: ''
          , advice: 'reconnect'
        });

        --total || finish();
      });

      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.eql(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });
        --total || finish();
      });
    });
  },

  'test the connection event': function (done) {
    var cl = client([ports, ports + 1, ports + 2])
      , ios = create(cl)
      , sid;

    ports += 3;
    function finish () {
      cl.end();
      ios.forEach(function(io) {
        io.server.close();
      });
      done();
    };

    ios.forEach(function(io) {
      io.configure(function () {
        io.set('polling duration', 0);
        io.set('close timeout', 1);
      });

      io.sockets.on('connection', function (socket) {
        socket.id.should.eql(sid);
        socket.on('disconnect', function () {
          finish(); 
        });
      });
    });
    cl.handshake({ ignoreConnect: true }, function (sessid) {
      sid = sessid;

      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.eql(200);
        msgs.should.have.length(1);
        msgs[0].type.should.eql('connect');
      });
    });
  },

  'test data exchange': function (done) {
    var cl = client([ports, ports + 1, ports + 2])
      , ios = create(cl);
    ports += 3;

    function finish () {
      cl.end();
      ios.forEach(function(io) {
        io.server.close();
      });
      done();
    }

    ios.forEach(function(io) {
      io.configure(function () {
        io.set('polling duration', 1);
        io.set('close timeout', 2);
      });

      io.sockets.on('connection', function (socket) {
        socket.send('woot');

        socket.on('disconnect', function () {
          finish();
        });
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, packs) {
        packs.should.have.length(1);
        packs[0].type.should.eql('message');
        packs[0].data.should.eql('woot');
      });
    });
  }
}

