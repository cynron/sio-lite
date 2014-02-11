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
    opts.redisPub || (opts.redisPub = {});
    this.pub = redis.createClient(opts.redisPub.port, opts.redisPub.host, opts.redisPub);
  }

  if (opts.redisSub instanceof RedisClient) {
    this.sub = opts.redisSub;
  } else {
    opts.redisSub || (opts.redisSub = {});
    this.sub = redis.createClient(opts.redisSub.port, opts.redisSub.host, opts.redisSub);
  }

  if (opts.redisClient instanceof RedisClient) {
    this.cmd = opts.redisClient;
  } else {
    opts.redisClient || (opts.redisClient = {});
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

    if (sub !== 'undefined') {
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
};
/**
 * Inherit from Store
 */

Redis.prototype.__proto__ = Store.prototype;

/**
 * Initialize redis store
 */

Redis.prototype.init = function(manager, cb) {
  this.manager = manager;
  util.invoke(cb);
}

/**
 * Query handshaken data
 *
 * @param {String} id sessionid
 * @param {Function} cb
 * @api public
 */

Redis.prototype.handshaken = function (id, cb) {
  var self = this;
  this.cmd.get('handshaken:' + id,  function(err, msg) { 
    if (err) {
      self.log.error(err);
      util.invoke(cb);
    } else {
      var handshakenData = self.unpack(msg);
      util.invoke(cb, handshakenData);
    }
  });
}

/**
 * Add handshaken data to redis store
 *
 * @param {String} id sessionid
 * @param {Object} data handshaken data
 * @param {Function} cb
 */

Redis.prototype.onHandshaken = function(id, data, cb) {
  var self = this;
  this.cmd.set('handshaken:' + id, this.pack(data), function(err) {
    if (err) {
      self.log.error(err);
      util.invoke(cb, err);
    } else {
      // 30 seconds for handshaken expiration
      self.cmd.expire('handshaken:' + id, 30, cb);
    }
  });
}

/**
 * Check if the sessionid is connected
 *
 * @param {String} id sessionid
 * @param {Function} cb
 * @api public
 */

Redis.prototype.connected = function(id, cb) {
  var self = this;
  this.cmd.get('connected:' + id,  function(err, msg) { 
    if (err) {
      self.log.error(err);
      util.invoke(cb, false);
    } else {
      var connected = self.unpack(msg);
      util.invoke(cb, !!connected);
    }
  });
}

/**
 * Set connected flag
 *
 * @param {String} id sessionid
 * @param {Function} cb
 * @api public
 */

Redis.prototype.onConnected = function(id, cb) {
  var self = this;
  var persistentHandshaken = function(cb) {
    self.cmd.persist('handshaken:' + id, function(err) {
      if (err) {
        self.log.error(err);
      }
      util.invoke(cb, err);
    });
  };

  this.cmd.set('connected:' + id, true, function(err) {
    if (err) {
      self.log.error(err);
      util.invoke(cb, err);
    } else {
      persistentHandshaken(cb);
    }
  });
}

/**
 * Destroy the redis store
 *
 * @api public
 */

Redis.prototype.destroy = function() {
  this.pub.end();
  this.sub.end();
  this.cmd.end();
}

/**
 * Destory a connection
 *
 * @param {String} id sessionid
 * @api public
 */

Redis.prototype.destoryById = function(id) {
  this.cmd.del('handshaken:' + id);
  this.cmd.del('connected:' + id);
  this.cmd.del('sendq:' + id);
  this.cmd.del('recvq:' + id);
}

/**
 * Get msgs from recvQ in redis
 *
 * @param {Interger} timeout second to wait
 * @param {Function} cb 
 * @api public
 */

Redis.prototype.getFromRecvQ = function (id, timeout, cb) {
  this.getFromQueue('recvq:' + id, timeout, cb);
};

/**
 * Push msgs to recvQ 
 *
 * @param {Array|Object} msgs     msgs 
 * @param {Function} cb    call back 
 * @api public
 */

Redis.prototype.pushToRecvQ = function (id, msgs, cb) {
  this.pushToQueue('recvq:' + id, msgs, cb);
}

/**
 * Get msgs from sendQ 
 *
 * @param {Number} timeout  seconds to wait for msgs
 * @param {Function} cb      cb
 * @api public
 */

Redis.prototype.getFromSendQ = function (id, timeout, cb) {
  this.getFromQueue('sendq:' + id, timeout, cb);
};

/**
 * Push msgs to sendQ
 *
 * @param {Array|Object} msgs  message(s) to be pushed
 * @param {Function} cb callback
 * @api public
 */

Redis.prototype.pushToSendQ = function(id, msgs, cb) {
  this.pushToQueue('sendq:' + id, msgs, cb);
}


/**
 * Fetch the msgs from redis and then del the key
 *
 * @param {String} key    key of queue
 * @param {Function} cb   callback cb(msgs)
 * @api private
 */

Redis.prototype.fetchAndDel = function(key, cb) {
  var self = this;
  this.cmd.multi()
    .lrange(key, 0, -1)
    .del(key)
    .exec(function(err, replies) {
      if (err) {
        self.log.error(err);
        util.invoke(cb);
      } else {
        var msgs = [];
        replies[0].forEach(function(elem) {
          msgs.push(self.unpack(elem));
        });
        util.invoke(cb, msgs);
      }
    });
}

/**
 * General get operation for sendq and recvq
 *
 * @api private
 */

Redis.prototype.getFromQueue = function(key, timeout, cb) {
  var self = this;
  this.fetchAndDel(key, function(msgs) {
    if (!msgs || msgs.length === 0) {
      var waitTimer = setTimeout(function() {
        self.unsubscribe(key, function() {
          util.invoke(cb);
        });
      }, timeout * 1000);

      waitTimer.unref();

      self.subscribe(key, function() {
        clearTimeout(waitTimer);
        self.fetchAndDel(key, cb); 
      });
    } else {
      util.invoke(cb, msgs);
    }
  });
}

/**
 * General push operation for sendq and recvq
 *
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
  };

  var afterPut = function(err) {
    if (err) {
      self.log.error(err);
      util.invoke(cb, err);
    } else {
      self.pub.publish(key, 'dummy', cb)
    }
  };

  args.unshift(key);
  args.push(afterPut);
  this.cmd.rpush.apply(this.cmd, args);
}

/**
 * Publish to a channel
 *
 * @param {String} ch redis channel
 * @param {Object} val 
 * @param {Function} cb callback cb(err)
 * @api private
 */
Redis.prototype.publish = function(ch, val, cb) {
  this.pub.publish(ch, this.pack(val), cb);
}

/**
 * Subscribe a channel
 *
 * @param {String} ch redis channel
 * @param {Function} consumer message consumer, consumer(msg)
 * @param {Function} cb callback 
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
 * @param {Function} cb callback
 * @api private
 */

Redis.prototype.unsubscribe = function(ch, cb) {
  this.unsubscribeRepo[ch] = cb;
  this.sub.unsubscribe(ch);
};
