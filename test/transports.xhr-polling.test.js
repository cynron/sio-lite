
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
  , HTTPClient = require('./common').HTTPClient
  , parser = sio.parser
  , util = require('util')
  , create = require('./common').create 
  , websocket = require('./common').websocket
  , ports = 15300;

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
    var cl = client(++ports)
      , io = create(cl);

    io.configure(function () {
      io.set('close timeout', .05);
      io.set('polling duration', 0);
    });

    function finish () {
      cl.end();
      io.server.close();
      done();
    };

    cl.handshake(function (sid) {
      var total = 2;

      cl.get('/socket.io/{protocol}/xhr-polling/tobi', function (res, msgs) {
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
    var cl = client(++ports)
      , io = create(cl)
      , sid;

    io.configure(function () {
      io.set('polling duration', 0);
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.id.should.eql(sid);

      socket.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
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

  'test the disconnection event after a close timeout': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , sid;

    io.configure(function () {
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.id.should.eql(sid);

      socket.on('disconnect', function () {
        io.server.close();
        done();
      });
    });

    cl.handshake({ ignoreConnect: true }, function (sessid) {
      sid = sessid;

      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.eql(200);
        msgs.should.have.length(1);
        msgs[0].type.should.eql('connect');

        setTimeout(function () {
          cl.end();
        }, 10);
      });
    });
  },

  'test the disconnection event when the client sends ?disconnect req':
  function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , disconnected = false
      , sid;

    io.configure(function () {
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('disconnect', function () {
        disconnected = true;
      });
    });

    cl.handshake({ ignoreConnect: true }, function (sessid) {
      sid = sessid;

      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.eql(200);
        msgs.should.have.length(1);
        msgs[0].type.should.eql('connect');

        cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
          msgs.should.have.length(1);
          msgs[0].should.eql({ type: 'disconnect', endpoint: '' });
          disconnected.should.be.true;
          cl.end();
          io.server.close();
          done();
        });

        // with the new http bits in node 0.5, there's no guarantee that
        // the previous request is actually dispatched (and received) before the following
        // reset call is sent. to not waste more time on a workaround, a timeout is added.
        setTimeout(function() {
          cl.get('/socket.io/{protocol}/xhr-polling/' + sid + '/?disconnect');
        }, 500);
      });
    });
  },

  'test the disconnection event booting a client': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , forced = false;

    io.sockets.on('connection', function (socket) {
      socket.on('disconnect', function () {
        io.server.close();
        done();
      });

      cl.end();
      socket.disconnect();
      forced = true;
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'disconnect', endpoint: '' });

        forced.should.be.true;
      });
    });
  },

  'test the disconnection event with client disconnect packet': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , sid;

    io.sockets.on('connection', function (client) {
      cl.post(
          '/socket.io/{protocol}/xhr-polling/' + sid
        , parser.encodePacket({ type: 'disconnect' })
        , function (res, data) {
            res.statusCode.should.eql(200);
            data.should.eql('1');
          }
      );

      client.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
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

  'test that connection close does not mean disconnect': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , sid
      , end
      , disconnected = false

    io.configure(function () {
      io.set('polling duration', .2);
      io.set('close timeout', .5);
    });

    io.sockets.on('connection', function (client) {
      end = function () {
        cl.end();
        console.log('ending');
        client.on('disconnect', function () {
          disconnected = true;
        });
      }
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid);
      setTimeout(end, 30);
      setTimeout(function () {
        console.log('finished');
        disconnected.should.be.false;
        io.server.close();
        done();
      }, 100);
    });
  },

  'test sending back data': function (done) {
    var cl = client(++ports)
      , io = create(cl);

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.send('woot');

      socket.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, packs) {
        packs.should.have.length(1);
        packs[0].type.should.eql('message');
        packs[0].data.should.eql('woot');
      });
    });
  },

  'test sending a batch of messages': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , sid;

    io.configure(function () {
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      var messages = 0;

      cl.post(
          '/socket.io/{protocol}/xhr-polling/' + sid
        , parser.encodePayload([
              parser.encodePacket({ type: 'message', data: 'a' })
            , parser.encodePacket({ type: 'message', data: 'b' })
            , parser.encodePacket({ type: 'disconnect' })
          ])
        , function (res, data) {
            res.statusCode.should.eql(200);
            data.should.eql('1');
          }
      );

      socket.on('message', function (data) {
        messages++;

        if (messages == 1)
          data.should.eql('a');

        if (messages == 2)
          data.should.eql('b');
      });

      socket.on('disconnect', function () {
        messages.should.eql(2);
        cl.end();
        io.server.close();
        done();
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

  'test message buffering between a response and a request': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , messages = false
      , tobi;

    io.configure(function () {
      io.set('polling duration', .1);
      io.set('close timeout', .2);
    });

    io.sockets.on('connection', function (socket) {
      tobi = function () {
        socket.send('a');
        socket.send('b');
        socket.send('c');
      };

      socket.on('disconnect', function () {
        messages.should.be.true;

        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        tobi();

        cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
          msgs.should.have.length(3);
          msgs[0].should.eql({ type: 'message', endpoint: '', data: 'a' });
          msgs[1].should.eql({ type: 'message', endpoint: '', data: 'b' });
          msgs[2].should.eql({ type: 'message', endpoint: '', data: 'c' });
          messages = true;
        });
      })
    });
  },

 'test sending json from the server': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , messages = 0
      , s;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', 1);
    });

    io.sockets.on('connection', function (socket) {
      s = socket;

      socket.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        s.json.send(['a', 'b', 'c']);
        s.json.send({
            a: 'b'
          , c: 'd'
        });

        cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
          res.statusCode.should.eql(200);

          msgs.should.have.length(2);
          msgs[0].should.eql({
              type: 'json'
            , data: ['a', 'b', 'c']
            , endpoint: ''
          });
          msgs[1].should.eql({
              type: 'json'
            , data: {
                  a: 'b'
                , c: 'd'
              }
            , endpoint: ''
          });
        });
      })
    });
  },

  'test sending json to the server': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , messages = 0;

    io.configure(function () {
      io.set('polling duration', 0);
      io.set('close timeout', .1);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('message', function (msg) {
        messages++;

        if (messages == 1) {
          msg.should.eql({ tobi: 'rocks' });
        } else if (messages == 2) {
          msg.should.eql(5000);
        }
      });

      socket.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        cl.post(
            '/socket.io/{protocol}/xhr-polling/' + sid
          , parser.encodePacket({
                type: 'json'
              , data: { tobi: 'rocks' }
            })
          , function (res, data) {
              res.statusCode.should.eql(200);
              data.should.equal('1');

              cl.post(
                  '/socket.io/{protocol}/xhr-polling/' + sid
                , parser.encodePacket({
                      type: 'json'
                    , data: 5000
                  })
                , function (res, data) {
                    res.statusCode.should.eql(200);
                    data.should.equal('1');
                  }
              );
            }
        );
      });
    });
  },

  'test emitting an event from the server': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , s;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', 1);
    });

    io.sockets.on('connection', function (socket) {
      s = socket;

      socket.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        s.emit('tobi is playing');

        cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
          res.statusCode.should.eql(200);

          msgs.should.have.length(1);
          msgs[0].should.eql({
              type: 'event'
            , name: 'tobi is playing'
            , endpoint: ''
            , args: []
          });
        });
      });
    });
  },

  'test emitting an event with data from the server': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , s;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', 1);
    });

    io.sockets.on('connection', function (socket) {
      s = socket;

      socket.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        s.emit('edwald', { woot: 'woot' }, [1, 2, 3]);

        cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
          res.statusCode.should.eql(200);

          msgs.should.have.length(1);
          msgs[0].should.eql({
              type: 'event'
            , name: 'edwald'
            , endpoint: ''
            , args: [{ woot: 'woot' }, [1, 2, 3]]
          });
        });
      });
    });
  },

  'test emitting an event to the server': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , messaged = false;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', 1);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('jane', function (a, b, c) {
        messaged = true;
      });

      socket.on('disconnect', function () {
        messaged.should.be.true;
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        cl.post(
            '/socket.io/{protocol}/xhr-polling/' + sid
          , parser.encodePacket({
                type: 'event'
              , name: 'jane'
            })
          , function (res, data) {
              res.statusCode.should.eql(200);
              data.should.equal('1');
            }
        );
      });
    });
  },

  'test that emitting an error event doesnt throw': function (done) {
    var cl = client(++ports)
      , io = create(cl)

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', 1);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        cl.post(
            '/socket.io/{protocol}/xhr-polling/' + sid
          , parser.encodePacket({
                type: 'event'
              , name: 'error'
            })
          , function (res, data) {
              res.statusCode.should.eql(200);
              data.should.equal('1');
            }
        );
      });
    });
  },

  'test emitting an event to the server with data': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , messaged = false;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', 1);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('woot', function (a, b, c) {
        a.should.eql('a');
        b.should.eql(2);
        c.should.eql([1, 2]);

        messaged = true;
      });

      socket.on('disconnect', function () {
        messaged.should.be.true;
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        cl.post(
            '/socket.io/{protocol}/xhr-polling/' + sid
          , parser.encodePacket({
                type: 'event'
              , name: 'woot'
              , args: ['a', 2, [1, 2]]
            })
          , function (res, data) {
              res.statusCode.should.eql(200);
              data.should.equal('1');
            }
        );
      });
    });
  },

  'test automatic acknowledgements sent from the server': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , received = false;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', 1);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('message', function (msg) {
        msg.should.eql('woot');
        received = true;
      });

      socket.on('disconnect', function () {
        received.should.be.true;
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.equal(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({ type: 'noop', endpoint: '' });

        cl.post(
            '/socket.io/{protocol}/xhr-polling/' + sid
          , parser.encodePacket({
                type: 'message'
              , data: 'woot'
              , id: 1
              , endpoint: ''
            })
          , function (res, data) {
              res.statusCode.should.eql(200);
              data.should.eql('1');

              cl.get(
                  '/socket.io/{protocol}/xhr-polling/' + sid
                , function (res, msgs) {
                    res.statusCode.should.eql(200);
                    msgs.should.have.length(1);
                    msgs[0].should.eql({
                        type: 'ack'
                      , ackId: '1'
                      , endpoint: ''
                      , args: []
                    });
                  }
              );
            }
        );
      });

    });
  },

  'test manual data acknowledgement sent from the server': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , acknowledged = false;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.on('message', function (data, fn) {
        data.should.eql('tobi');
        fn('woot');
        acknowledged = true;
      });

      socket.on('disconnect', function () {
        acknowledged.should.be.true;
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.eql(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({
            type: 'ack'
          , args: ['woot']
          , endpoint: ''
          , ackId: '3'
        });
      });

      cl.post(
          '/socket.io/{protocol}/xhr-polling/' + sid
        , parser.encodePacket({
              type: 'message'
            , data: 'tobi'
            , ack: 'data'
            , id: '3'
          })
        , function (res, data) {
            res.statusCode.should.eql(200);
            data.should.eql('1');
          }
      );
    });
  },

  'test automatic acknowledgements sent from the client': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , acknowledged = false;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.send('aaaa', function () {
        acknowledged = true;
      });

      socket.on('disconnect', function () {
        acknowledged.should.be.true;
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.eql(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({
            type: 'message'
          , id: '1'
          , data: 'aaaa'
          , ack: true
          , endpoint: ''
        });

        cl.post(
            '/socket.io/{protocol}/xhr-polling/' + sid
          , parser.encodePacket({
                type: 'ack'
              , ackId: '1'
            })
          , function (res, data) {
              res.statusCode.should.eql(200);
              data.should.eql('1');
            }
        );
      });
    });
  },

  'test automatic ack with event sent from the client': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , acked = false;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.emit('woot', 1, 2, '3', function () {
        acked = true;
      });

      socket.on('disconnect', function () {
        acked.should.be.true;
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.eql(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({
            type: 'event'
          , name: 'woot'
          , args: [1, 2, '3']
          , id: '1'
          , ack: true
          , endpoint: ''
        });

        cl.post(
            '/socket.io/{protocol}/xhr-polling/' + sid
          , parser.encodePacket({
                type: 'ack'
              , ackId: '1'
              , args: []
              , endpoint: ''
            })
        );
      });
    });
  },

  'test manual data ack with event sent from the client': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , acked = false;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.emit('woot', 1, 2, '3', function (a) {
        a.should.eql('1');
        acked = true;
      });

      socket.on('disconnect', function () {
        acked.should.be.true;
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, function (res, msgs) {
        res.statusCode.should.eql(200);
        msgs.should.have.length(1);
        msgs[0].should.eql({
            type: 'event'
          , name: 'woot'
          , args: [1, 2, '3']
          , id: '1'
          , ack: 'data'
          , endpoint: ''
        });

        cl.post(
            '/socket.io/{protocol}/xhr-polling/' + sid
          , parser.encodePacket({
                type: 'ack'
              , ackId: '1'
              , args: ['1']
              , endpoint: ''
            })
        );
      });
    });
  },

  'test CORS': function (done) {
    var cl = client(++ports)
      , io = create(cl)
      , messaged = false;

    io.configure(function () {
      io.set('polling duration', .05);
      io.set('close timeout', .05);
    });

    io.sockets.on('connection', function (socket) {
      socket.send('woot');

      socket.on('message', function (msg) {
        msg.should.equal('woot');
        messaged = true;
      });

      socket.on('disconnect', function () {
        cl.end();
        io.server.close();
        done();
      });
    });

    cl.handshake(function (sid) {
      cl.get('/socket.io/{protocol}/xhr-polling/' + sid, {
        headers: {
          Origin: 'http://localhost:3500'
        }
      }, function (res, packs) {
        var headers = res.headers;

        headers['access-control-allow-origin'].should.equal('http://localhost:3500');
        headers['access-control-allow-credentials'].should.equal('true');

        packs.should.have.length(1);
        packs[0].type.should.eql('message');
        packs[0].data.should.eql('woot');

        cl.post('/socket.io/{protocol}/xhr-polling/' + sid, parser.encodePacket({
            type: 'message'
          , data: 'woot'
        }), {
          headers: {
              Origin: 'http://localhost:3500'
            , Cookie: 'woot=woot'
          }
        }, function (res, data) {
          var headers = res.headers;
          headers['access-control-allow-origin'].should.equal('http://localhost:3500');
          headers['access-control-allow-credentials'].should.equal('true');

          data.should.equal('1');
        });
      });
    });
  }
};
