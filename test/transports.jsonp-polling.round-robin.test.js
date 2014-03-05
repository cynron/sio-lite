
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
  , qs = require('querystring')
  , HTTPClient = require('./common-rr').HTTPClient
  , create = require('./common-rr').create
  , parser = sio.parser
  , util = require('util')
  , ports = 15600;

/**
 * HTTPClient for jsonp-polling transport.
 */

function JSONPPolling (port) {
  HTTPClient.call(this, port);
};

/**
 * Inhertis from HTTPClient.
 */

util.inherits(JSONPPolling, HTTPClient);

/**
 * Performs a json-p (cross domain) handshake
 *
 * @api public
 */

JSONPPolling.prototype.handshake = function (opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  var self = this;

  return this.get(
      '/socket.io/{protocol}?jsonp=0'
    , opts
    , function (res, data) {
        var head = 'io.j[0]('
          , foot = ');';

        data.substr(0, head.length).should.eql(head);
        data.substr(-foot.length).should.eql(foot);
        data = data.slice(head.length, data.length - foot.length);

        var parts = JSON.parse(data).split(':');

        if (opts.ignoreConnect) {
          return fn && fn.apply(null, parts);
        }

        // expect connect packet right after handshake
        self.get(
            '/socket.io/{protocol}/jsonp-polling/' + parts[0]
          , function (res, msgs) {
              res.statusCode.should.eql(200);

              msgs.should.have.length(1);
              msgs[0].should.eql({ type: 'connect', endpoint: '', qs: '' });

              fn && fn.apply(null, parts);
            }
        );
      }
  );
};

/**
 * Override GET requests.
 *
 * @api public
 */

JSONPPolling.prototype.get = function (path, opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  opts = opts || {};

  opts.parse = function (data) {
    var head = 'io.j[0]('
      , foot = ');';

    if (~path.indexOf('?i=1')) {
      head = 'io.j[1](';
    }

    data.substr(0, head.length).should.eql(head);
    data.substr(-foot.length).should.eql(foot);

    data = data.substr(head.length, data.length - head.length - foot.length);

    return JSON.parse(data);
  };

  return HTTPClient.prototype.get.call(this, path, opts, fn);
};

/**
 * Issue an encoded POST request
 *
 * @api private
 */

JSONPPolling.prototype.post = function (path, data, opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  opts = opts || {};
  opts.method = 'POST';
  opts.data = qs.stringify({ d: data });

  return this.request(path, opts, fn);
};

/**
 * Create client for this transport.
 *
 * @api public
 */

function client (ports) {
  return new JSONPPolling(ports);
};

/**
 * Test.
 */

module.exports = {

  'test jsonp handshake': function (done) {
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

      cl.get('/socket.io/{protocol}/jsonp-polling/dummy', function (res, msgs) {
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

      cl.get('/socket.io/{protocol}/jsonp-polling/' + sid, function (res, msgs) {
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

      cl.get('/socket.io/{protocol}/jsonp-polling/' + sid, function (res, msgs) {
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
      cl.get('/socket.io/{protocol}/jsonp-polling/' + sid, function (res, packs) {
        packs.should.have.length(1);
        packs[0].type.should.eql('message');
        packs[0].data.should.eql('woot');
      });
    });
  }
};
