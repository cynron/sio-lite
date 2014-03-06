
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Expose the constructor.
 */

module.exports = Store;

/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter
  , util = require('util');

/**
 * Store interface
 *
 * @param {Object} options
 * @api public
 */

function Store (options) {
  EventEmitter.call(this);
  this.options = options;
}

/**
 * Inherits from EventEmitter
 */

util.inherits(Store, EventEmitter);

/**
 * Define getter for log, delegate it to manager.log
 */

Store.prototype.__defineGetter__('log', function() {
  return this.manager.log;
});

