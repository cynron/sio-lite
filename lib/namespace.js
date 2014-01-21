/**
 * Module dependencies.
 */

var Socket = require('./socket')
  , EventEmitter = process.EventEmitter
  , parser = require('./parser')
  , util = require('./util');

/**
 * Exports the constructor.
 */

exports = module.exports = SocketNamespace;

/**
 * Constructor.
 *
 * @api public.
 */

function SocketNamespace (mgr, name) {
  this.manager = mgr;
  this.name = name || '';
  this.sockets = {};
  this.auth = false;
  this.setFlags();
};

/**
 * Inherits from EventEmitter.
 */

SocketNamespace.prototype.__proto__ = EventEmitter.prototype;

/**
 * Copies emit since we override it.
 *
 * @api private
 */

SocketNamespace.prototype.$emit = EventEmitter.prototype.emit;

/**
 * Access logger interface.
 *
 * @api public
 */

SocketNamespace.prototype.__defineGetter__('log', function () {
  return this.manager.log;
});

/**
 * Access store.
 *
 * @api public
 */

SocketNamespace.prototype.__defineGetter__('store', function () {
  return this.manager.store;
});

/**
 * JSON message flag.
 *
 * @api public
 */

SocketNamespace.prototype.__defineGetter__('json', function () {
  this.flags.json = true;
  return this;
});

/**
 * Sets the default flags.
 *
 * @api private
 */

SocketNamespace.prototype.setFlags = function () {
  this.flags = {
      endpoint: this.name
    , exceptions: []
  };
  return this;
};

/**
 * Retrieves or creates a write-only socket for a client, unless specified.
 *
 * @param {Boolean} whether the socket will be readable when initialized
 * @api public
 */

SocketNamespace.prototype.socket = function (sid, readable) {
  if (!this.sockets[sid]) {
    this.sockets[sid] = new Socket(this.manager, sid, this, readable);
  }

  return this.sockets[sid];
};

/**
 * Sets authorization for this namespace.
 *
 * @api public
 */

SocketNamespace.prototype.authorization = function (fn) {
  this.auth = fn;
  return this;
};

/**
 * Called when a socket disconnects entirely.
 *
 * @api private
 */

SocketNamespace.prototype.handleDisconnect = function (sid, reason, raiseOnDisconnect) {
  if (this.sockets[sid] && this.sockets[sid].readable) {
    if (raiseOnDisconnect) this.sockets[sid].onDisconnect(reason);
    delete this.sockets[sid];
  }
};

/**
 * Performs authentication.
 *
 * @param Object client request data
 * @api private
 */

SocketNamespace.prototype.authorize = function (data, fn) {
  if (this.auth) {
    var self = this;

    this.auth.call(this, data, function (err, authorized) {
      self.log.debug('client ' +
        (authorized ? '' : 'un') + 'authorized for ' + self.name);
      fn(err, authorized);
    });
  } else {
    this.log.debug('client authorized for ' + this.name);
    fn(null, true);
  }

  return this;
};

/**
 * Handles a packet.
 *
 * @api private
 */

SocketNamespace.prototype.handlePacket = function (sessid, packet) {
  var socket = this.socket(sessid)
    , dataAck = packet.ack == 'data'
    , manager = this.manager
    , self = this;

  function ack () {
    self.log.debug('sending data ack packet');
    socket.packet({
        type: 'ack'
      , args: util.toArray(arguments)
      , ackId: packet.id
    });
  };

  function error (err) {
    self.log.warn('handshake error ' + err + ' for ' + self.name);
    socket.packet({ type: 'error', reason: err });
  };

  function connect () {
    self.manager.onJoin(sessid, self.name);
    self.store.publish('join', sessid, self.name);

    // packet echo
    socket.packet({ type: 'connect' });

    // emit connection event
    self.$emit('connection', socket);
  };

  switch (packet.type) {
    case 'connect':
      if (packet.endpoint == '') {
        connect();
      } else {
        var handshakeData = manager.handshaken[sessid];

        this.authorize(handshakeData, function (err, authorized, newData) {
          if (err) return error(err);

          if (authorized) {
            manager.onHandshake(sessid, newData || handshakeData);
            self.store.publish('handshake', sessid, newData || handshakeData);
            connect();
          } else {
            error('unauthorized');
          }
        });
      }
      break;

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
        var params = [packet.name].concat(packet.args);

        if (dataAck) {
          params.push(ack);
        }

        socket.$emit.apply(socket, params);
      }
      break;

    case 'disconnect':
      this.manager.onLeave(sessid, this.name);
      this.store.publish('leave', sessid, this.name);

      socket.$emit('disconnect', packet.reason || 'packet');
      break;

    case 'json':
    case 'message':
      var params = ['message', packet.data];

      if (dataAck)
        params.push(ack);

      socket.$emit.apply(socket, params);
  };
};
