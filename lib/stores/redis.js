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

/**
 * Redis store.
 * Options:
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

  // initialize a pubsub client and a regular client
  if (opts.redisPub instanceof RedisClient) {
    this.pub = opts.redisPub;
  } else {
    opts.redisPub  = opts.redisPub || {};
    this.pub = redis.createClient(opts.redisPub.port, opts.redisPub.host, opts.redisPub);
  }

  if (opts.redisSub instanceof RedisClient) {
    this.sub = opts.redisSub;
  } else {
    opts.redisSub = opts.redisSub || {};
    this.sub = redis.createClient(opts.redisSub.port, opts.redisSub.host, opts.redisSub);
  }

  if (opts.redisClient instanceof RedisClient) {
    this.cmd = opts.redisClient;
  } else {
    opts.redisClient = opts.redisClient || {};
    this.cmd = redis.createClient(opts.redisClient.port, opts.redisClient.host, opts.redisClient);
  }

  Store.call(this, opts);

  this.sub.setMaxListeners(0);
  this.setMaxListeners(0);

  // initialize subscribe, unsubscribe, message event.
  var self = this;

  this.subscribeRepo = {};
  this.unsubscribeRepo = {};
  this.messageConsumers = {};

  this.sub.on('subscribe', function (ch) {
    var sub = self.subscribeRepo[ch];

    if (typeof sub !== 'undefined') {
      delete self.subscribeRepo[ch];
      self.messageConsumers[ch] = sub.consumer;
      util.invoke(sub.fn);
    }
  });

  this.sub.on('unsubscribe', function (ch) {
    delete self.messageConsumers[ch];
    var fn = self.unsubscribeRepo[ch];
    delete self.unsubscribeRepo[ch];
    util.invoke(fn);
  });

  this.sub.on('message', function (ch, msg) {
    util.invoke(self.messageConsumers[ch], msg);
  });
}

/**
 * Inherit from Store
 */

util.inherits(Redis, Store);

/**
 * Initialize redis store
 *
 * @param {Manager} manager
 * @param {Function} cb cb()
 * @api public
 */

Redis.prototype.init = function(manager, cb) {
  this.manager = manager;
  util.invoke(cb);
};

/**
 * Query handshaken data
 *
 * @param {String} id session id
 * @param {Function} cb cb(handshakenData)
 * @api public
 */

Redis.prototype.handshaken = function (id, cb) {
  var self = this;
  this.cmd.get('siocache:handshaken:' + id,  function(err, msg) {
    if (err) {
      self.log.error('get handshaken data error:' + err);
      util.invoke(cb);
    } else {
      var handshakenData = self.unpack(msg);
      util.invoke(cb, handshakenData);
    }
  });
};

/**
 * Add handshaken data to redis store
 *
 * @param {String} id session id
 * @param {Object} data handshaken data
 * @param {Function} cb cb(err)
 */

Redis.prototype.onHandshaken = function(id, data, cb) {
  var self = this;
  this.cmd.setex('siocache:handshaken:' + id, self.manager.get('handshake expiration'), this.pack(data), cb);
};

/**
 * Check if session id is connected
 *
 * @param {String} id session id
 * @param {Function} cb cb(isConnected)
 * @api public
 */

Redis.prototype.connected = function(id, cb) {
  var self = this;
  this.cmd.get('siocache:connected:' + id,  function(err, msg) {
    if (err) {
      self.log.error('check connected err:' + err);
      util.invoke(cb, false);
    } else {
      var connected = self.unpack(msg);
      util.invoke(cb, !!connected);
    }
  });
};

/**
 * Add connected flag
 *
 * @param {String} id session id
 * @param {Function} cb cb(err)
 * @api public
 */

Redis.prototype.onConnected = function(id, cb) {
  var self = this;
  var delHandshaken = function(cb) {
    self.cmd.del('siocache:handshaken:' + id, function(err) {
      if (err) {
        self.log.error('del handshaken data err:' + err);
      }
      util.invoke(cb, err);
    });
  };

  this.cmd.set('siocache:connected:' + id, true, function(err) {
    if (err) {
      self.log.error('add connected flag err:' + err);
      util.invoke(cb, err);
    } else {
      delHandshaken(cb);
    }
  });
};

/**
 * Destroy the redis store
 *
 * @api public
 */

Redis.prototype.destroy = function() {
  this.pub.end();
  this.sub.end();
  this.cmd.end();
};

/**
 * Destory a connection
 *
 * @param {String} id sessionid
 * @api public
 */

Redis.prototype.destroyConnection = function(id, timeout) {
  if (timeout && typeof timeout === 'number') {
    this.cmd.expire('siocache:handshaken:' + id, timeout);
    this.cmd.expire('siocache:connected:' + id, timeout);
    this.cmd.expire('siocache:sendq:' + id, timeout);
    this.cmd.expire('siocache:recvq:' + id, timeout);
  } else {
    this.cmd.del('siocache:handshaken:' + id);
    this.cmd.del('siocache:connected:' + id);
    this.cmd.del('siocache:sendq:' + id);
    this.cmd.del('siocache:recvq:' + id);
  }
};

/**
 * Get msgs from recvQ in redis
 *
 * @param {String} id session id
 * @param {Function} cb cb(isTimeout, msgs)
 * @api public
 */

Redis.prototype.getFromRecvQ = function (id, cb) {
  var self = this;
  var timeout = this.manager.get('close timeout');
  this.cmd.expire('siocache:connected:' + id, timeout, function(err) {
    if (err) {
      self.log.error('expire connected state error:' + err);
      util.invoke(cb, err);
    } else {
      self.getFromQueue('siocache:recvq:' + id, timeout, cb);
    }
  });
};

/**
 * Push msgs to recvQ
 *
 * @param {String} id session id
 * @param {Array|Object} msgs msg(s) to be pushed
 * @param {Function} cb cb(err)
 * @api public
 */

Redis.prototype.pushToRecvQ = function (id, msgs, cb) {
  this.pushToQueue('siocache:recvq:' + id, msgs, cb);
};

/**
 * Get msgs from sendQ
 *
 * @param {String} id session id
 * @param {Function} cb cb(isTimeout, msgs)
 * @api public
 */

Redis.prototype.getFromSendQ = function (id, cb) {
  var timeout = this.manager.get('polling duration');
  this.getFromQueue('siocache:sendq:' + id, timeout, cb);
};

/**
 * Push msgs to sendQ
 *
 * @param {Array|Object} msgs msg(s) to be pushed
 * @param {Function} cb callback
 * @api public
 */

Redis.prototype.pushToSendQ = function(id, msgs, cb) {
  this.pushToQueue('siocache:sendq:' + id, msgs, cb);
};

/**
 * Fetch the msgs from redis and then del the key
 *
 * @param {String} key
 * @param {Function} cb cb(msgs)
 * @api private
 */

Redis.prototype.fetchAndDel = function(key, cb) {
  var self = this;
  this.cmd.multi()
    .lrange(key, 0, -1)
    .del(key)
    .exec(function(err, replies) {
      if (err) {
        self.log.error('fetch msgs from redis err:' + err);
        util.invoke(cb);
      } else {
        var msgs = [];
        replies[0].forEach(function(elem) {
          msgs.push(self.unpack(elem));
        });
        util.invoke(cb, msgs);
      }
    });
};

/**
 * General get operation for sendq/recvq
 *
 * @param {String} key key of queue [sendq:|recvq:]<session id>
 * @param {Number} timeout seconds to wait msgs
 * @param {Function} cb cb(isTimeout, msgs)
 * @api private
 */

Redis.prototype.getFromQueue = function getFromQueue(key, timeout, cb) {
  var self = this;
  this.fetchAndDel(key, function(msgs) {
    if (!msgs || msgs.length === 0) {
      var waitTimer = setTimeout(function() {
        clearTimeout(waitTimer);
        self.unsubscribe(key, function() {
          util.invoke(cb, true);
        });
      }, timeout * 1000);

      self.subscribe(key, function() {
        clearTimeout(waitTimer);
        self.unsubscribe(key, function() {
          self.fetchAndDel(key, function(msgs) {
            util.invoke(cb, false, msgs);
          });
        });
      });
    } else {
      util.invoke(cb, false, msgs);
    }
  });
};

/**
 * General push operation for sendq and recvq
 *
 * @param {String} key key of queue [sendq:|recvq:]<session id>
 * @param {Array|Object} msgs msg(s) to be pushed
 * @param {Function} cb cb(err)
 * @api private
 */

Redis.prototype.pushToQueue = function(key, msgs, cb) {
  var self = this;
  var args = [];
  if (Array.isArray(msgs)) {
    msgs.forEach(function(elem) {
      args.push(self.pack(elem));
    });
  } else {
    args.push(self.pack(msgs));
  }
  
  var timeout = this.manager.get('queue timeout');

  var afterPublish = function(err) {
    if (err) {
      self.log.error('publish push signal err: ', err);
      util.invoke(cb, err);
    } else {
      self.cmd.expire(key, timeout, cb);
    }
  };

  var afterPut = function(err) {
    if (err) {
      self.log.error('push msg to queue err:' + err);
      util.invoke(cb, err);
    } else {
      self.publish(key, afterPublish);
    }
  };

  args.unshift(key);
  args.push(afterPut);
  this.cmd.rpush.apply(this.cmd, args);
};

/**
 * Publish to a channel
 *
 * @param {String} ch redis channel
 * @param {Function} cb cb(err)
 * @api private
 */
Redis.prototype.publish = function(ch, cb) {
  this.pub.publish(ch, '', cb);
};

/**
 * Subscribe a channel
 *
 * @param {String} ch redis channel
 * @param {Function} consumer message consumer, consumer(msg)
 * @param {Function} cb cb()
 * @api private
 */

Redis.prototype.subscribe = function(ch, consumer, cb) {
  this.subscribeRepo[ch] = {
    consumer: consumer,
    cb: cb
  };

  this.sub.subscribe(ch);
};

/**
 * Unsubscribe a channel
 *
 * @param {String} ch redis channel
 * @param {Function} cb
 * @api private
 */

Redis.prototype.unsubscribe = function(ch, cb) {
  this.unsubscribeRepo[ch] = cb;
  this.sub.unsubscribe(ch);
};
