/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var Store = require('../store')
  , util = require('../util');

/**
 * Exports the constructor.
 */

module.exports = Redis;
Redis.Client = Client;

/**
 * Redis store.
 * Options:
 *     - nodeId (fn) gets an id that uniquely identifies this node
 *     - redis (fn) redis constructor, defaults to redis
 *     - redisPub (object) options to pass to the pub redis client
 *     - redisSub (object) options to pass to the sub redis client
 *     - redisClient (object) options to pass to the general redis client
 *     - pack (fn) custom packing, defaults to JSON or msgpack if installed
 *     - unpack (fn) custom packing, defaults to JSON or msgpack if installed
 *
 * @api public
 */

function Redis (opts) {
  opts = opts || {};

  // packing / unpacking mechanism
  if (opts.pack) {
    this.pack = opts.pack;
    this.unpack = opts.unpack;
  } else {
    try {
      var msgpack = require('msgpack');
      this.pack = msgpack.pack;
      this.unpack = msgpack.unpack;
    } catch (e) {
      this.pack = JSON.stringify;
      this.unpack = JSON.parse;
    }
  }

  var redis = opts.redis || require('redis')
    , RedisClient = redis.RedisClient;

  if (opts.redisClient instanceof RedisClient) {
    this.client = opts.redisClient;
  } else {
    opts.redisClient || (opts.redisClient = {});
    this.client = redis.createClient(opts.redisClient.port, opts.redisClient.host, opts.redisClient);
  }

  Store.call(this, opts);

  this.sub.setMaxListeners(0);
  this.setMaxListeners(0);
};

/**
 * Inherit from Store
 */

Redis.prototype.__proto__ = Store.prototype;

/**
 * Initialize redis store
 */

Redis.prototype.init = function(cb) {
  // TODO: init
  util.invoke(cb);
}

/**
 * Query handshaken data
 *
 * @param {String} id sessionid
 * @param {Function} cb
 * @api public
 */

Redis.prototype.handshaken = function(id, cb) {
  // TODO:
  util.invoke(cb);
}

/**
 * Add handshaken data to redis store
 *
 * @param {String} id sessionid
 * @param {Object} data handshaken data
 * @param {Function} cb
 */

Redis.prototype.onHandshaken = function(id, data, cb) {
  // TODO:
  util.invoke(cb);
}

/**
 * Set connected flag
 *
 * @param {String} id sessionid
 * @param {Function} cb
 * @api public
 */

Redis.prototype.connected = function(id, cb) {
  // TODO:
  util.invoke(cb);
}

/**
 * Check if the sessionid is connected
 *
 * @param {String} id sessionid
 * @param {Function} cb
 * @api public
 */

Redis.prototype.onConnected = function(id, cb) {
  // TODO:
  util.invoke(cb);
}

/**
 * Destroy the redis store
 *
 * @api public
 */

Redis.prototype.destroy = function() {
  Store.prototype.destroy.call(this);
  // TODO: cleaup redis client
}

/**
 * Client constructor
 *
 * @api private
 */

function Client () {
  Store.Client.apply(this, arguments);
};

/**
 * Inherits from Store.Client
 */

Client.prototype.__proto__ = Store.Client.prototype;

/**
 * Get msgs from recvQ in redis
 *
 * @param {Interger} timeout second to wait
 * @param {Function} cb 
 * @api public
 */

Client.prototype.getFromRecvQ = function (timeout, cb) {
  // TODO:
  util.invoke(cb);
};

/**
 * Push msgs to recvQ 
 *
 * @param {Array} msgs     msgs 
 * @param {Function} cb    call back 
 * @api public
 */

Client.prototype.pushToRecvQ = function (msgs, cb) {
  // TODO:
  util.invoke(cb);
};

/**
 * Get msgs from sendQ 
 *
 * @param {Integer} timeout  seconds to wait for msgs
 * @param {Function} cb      cb
 * @api public
 */

Client.prototype.getFromSendQ = function (timeout, cb) {
  // TODO:
  util.invoke(cb);
};

/**
 * Push msgs to sendQ
 *
 * @param {Array} msgs  messages to be pushed
 * @param {Function} cb callback
 * @api public
 */

Client.prototype.pushToSendQ = function(msgs, cb) {
  // TODO:
  util.invoke(cb);
}

/**
 * Destroys a store client
 *
 * @param {Number} number of seconds to expire data
 * @api private
 */

Client.prototype.destroy = function (expiration) {
  // TODO:
  return this;
};
