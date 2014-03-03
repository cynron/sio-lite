
/*!
 * socket.io-node
 * Copyright(c) 2011 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 */

/**
 * Module requirements.
 */

var Transport = require('../../transport')
  , EventEmitter = require('events').EventEmitter
  , crypto = require('crypto')
  , url = require('url')
  , parser = require('../../parser')
  , util = require('../../util');

/**
 * Export the constructor.
 */

exports = module.exports = WebSocket;
exports.Parser = Parser;

/**
 * HTTP interface constructor. Interface compatible with all transports that
 * depend on request-response cycles.
 *
 * @api public
 */

function WebSocket (mng, data, req) {
  // parser
  var self = this;

  this.manager = mng;
  this.parser = new Parser({maxBuffer: mng.get('destroy buffer size')});
  this.parser.on('data', function (packet) {
    self.log.debug(self.name + ' received data:', packet);
    self.onMessage(parser.decodePacket(packet));
  });
  this.parser.on('ping', function () {
    // version 8 ping => pong
    try {
      self.socket.write('\u008a\u0000');
    }
    catch (e) {
      self.end();
      return;
    }
  });
  this.parser.on('close', function () {
    self.end();
  });
  this.parser.on('error', function (reason) {
    self.log.warn(self.name + ' parser error: ' + reason);
    self.end();
  });
  this.parser.on('kick', function (reason) {
    self.log.warn(self.name + ' parser forced user kick: ' + reason);
    self.onMessage({type: 'disconnect', endpoint: ''});
    self.end();
  });

  Transport.call(this, mng, data, req);
}

/**
 * Inherits from Transport.
 */

util.inherits(WebSocket, Transport);

/**
 * Transport name
 *
 * @api public
 */

WebSocket.prototype.name = 'websocket';

/**
 * Websocket draft version
 *
 * @api public
 */

WebSocket.prototype.protocolVersion = '16';

/**
 * Called when the socket connects.
 *
 * @api private
 */

WebSocket.prototype.onConnect = function () {
  var self = this;

  if (typeof this.req.headers.upgrade === 'undefined' ||
      this.req.headers.upgrade.toLowerCase() !== 'websocket') {
    this.log.warn(this.name + ' connection invalid');
    this.end();
    return;
  }

  var origin = this.req.headers.origin || '';

  if (!this.verifyOrigin(origin)) {
    this.log.warn(this.name + ' connection invalid: origin mismatch');
    this.end();
    return;
  }

  if (!this.req.headers['sec-websocket-key']) {
    this.log.warn(this.name + ' connection invalid: received no key');
    this.end();
    return;
  }

  // calc key
  var key = this.req.headers['sec-websocket-key'];
  var shasum = crypto.createHash('sha1');
  shasum.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
  key = shasum.digest('base64');

  var headers = [
      'HTTP/1.1 101 Switching Protocols'
    , 'Upgrade: websocket'
    , 'Connection: Upgrade'
    , 'Sec-WebSocket-Accept: ' + key
  ];

  try {
    this.socket.write(headers.concat('', '').join('\r\n'));
    this.socket.setTimeout(0);
    this.socket.setNoDelay(true);
  } catch (e) {
    this.end();
    return;
  }

  this.socket.on('data', function (data) {
    self.parser.add(data);
  });

  var socketEventHandler = function() {
    self.end();
  };

  var errorHandler = function() {
    self.log.error('websocket socket error');
    self.end();
  };

  this.socket.on('close', socketEventHandler);
  this.socket.on('end', socketEventHandler);
  this.socket.on('error', errorHandler);

  this.readyState = Transport.CONNECTED;
  this.packet({type: 'connect'});
  this.setHeartbeatInterval();
  // now, the data stored is useless
  this.store.destroyConnection(this.id);
};

/**
 * onMessage overloading
 */

WebSocket.prototype.onMessage = function(packet) {
  if (packet.type === 'heartbeat') {
    this.log.debug('got heartbeat packet');
    this.clearHeartbeatTimeout();
    this.setHeartbeatInterval();
  } else {
    Transport.prototype.onMessage.call(this, packet);
  }
};

/**
 * Verifies the origin of a request.
 *
 * @api private
 */

WebSocket.prototype.verifyOrigin = function (origin) {
  var origins = this.manager.get('origins');

  if (origin === 'null') {
    origin = '*';
  }

  if (origins.indexOf('*:*') !== -1) {
    return true;
  }

  if (origin) {
    try {
      var parts = url.parse(origin);
      parts.port = parts.port || 80;
      var ok =
        ~origins.indexOf(parts.hostname + ':' + parts.port) ||
        ~origins.indexOf(parts.hostname + ':*') ||
        ~origins.indexOf('*:' + parts.port);
      if (!ok) {
        this.log.warn('illegal origin: ' + origin);
      }

      return ok;
    } catch (ex) {
      this.log.warn('error parsing origin');
    }
  }
  else {
    this.log.warn('origin missing from websocket call, yet required by config');
  }
  return false;
};

/**
 * Writes to the socket.
 *
 * @api private
 */

WebSocket.prototype.write = function (data) {
  if (this.readyState === Transport.CONNECTED ||
      this.readyState === Transport.DISCONNECTING) {
    var buf = this.frame(0x81, data);
    try {
      this.socket.write(buf, 'binary');
    }
    catch (e) {
      this.end();
      return;
    }
    this.log.debug(this.name + ' writing', data);
  }
};

/**
 * Writes a payload.
 *
 * @api private
 */

WebSocket.prototype.packet = function (msgs) {
  msgs = parser.encodePackets(msgs);
  this.write(msgs);
  return this;
};

/**
 * Frame server-to-client output as a text packet.
 *
 * @api private
 */

WebSocket.prototype.frame = function (opcode, str) {
  var dataBuffer = new Buffer(str)
    , dataLength = dataBuffer.length
    , startOffset = 2
    , secondByte = dataLength;
  if (dataLength > 65536) {
    startOffset = 10;
    secondByte = 127;
  }
  else if (dataLength > 125) {
    startOffset = 4;
    secondByte = 126;
  }
  var outputBuffer = new Buffer(dataLength + startOffset);
  outputBuffer[0] = opcode;
  outputBuffer[1] = secondByte;
  dataBuffer.copy(outputBuffer, startOffset);
  switch (secondByte) {
  case 126:
    outputBuffer[2] = dataLength >>> 8;
    outputBuffer[3] = dataLength % 256;
    break;
  case 127:
    var l = dataLength;
    for (var i = 1; i <= 8; ++i) {
      outputBuffer[startOffset - i] = l & 0xff;
      l >>>= 8;
    }
  }
  return outputBuffer;
};

/**
 * Closes the connection.
 *
 * @api private
 */

WebSocket.prototype.end = function () {
  if (this.readyState !== Transport.DISCONNECTED) {
    this.socket.destroy();
    this.clearHeartbeatTimeout();
    this.clearHeartbeatInterval();
  }

  Transport.prototype.end.call(this);
};

/**
 * Sets the heartbeat timeout
 */

WebSocket.prototype.setHeartbeatTimeout = function() {
  if (!this.heartbeatTimeout && this.manager.enabled('heartbeats')) {
    var self = this;
    this.heartbeatTimeout = setTimeout(function() {
      self.log.debug('fired heartbeat timeout for client', self.id);
      self.heartbeatTimeout = undefined;
      self.end('heartbeat timeout');
    }, this.manager.get('heartbeat timeout') * 1000);

    this.log.debug('set heartbeat timeout for client', this.id);
  }
};

/**
 * Clears the heartbeat timeout
 */

WebSocket.prototype.clearHeartbeatTimeout = function() {
  if (this.heartbeatTimeout && this.manager.enabled('heartbeats')) {
    clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = undefined;
    this.log.debug('cleared heartbeat timeout for client', this.id);
  }
};

/**
 * Sets the heartbeat interval.
 */

WebSocket.prototype.setHeartbeatInterval = function() {
  if (!this.heartbeatInterval && this.manager.enabled('heartbeats')) {
    var self = this;

    this.heartbeatInterval = setTimeout(function() {
      self.heartbeat();
      self.heartbeatInterval = undefined;
    }, this.manager.get('heartbeat interval') * 1000);

    this.log.debug('set heartbeat interval for client', this.id);
  }
};

/**
 * Clears the heartbeat interval
 */

WebSocket.prototype.clearHeartbeatInterval = function() {
  if (this.heartbeatInterval && this.manager.enabled('hearbeats')) {
    clearTimeout(this.heartbeatInterval);
    this.heartbeatInterval = undefined;
    this.log.debug('cleared heartbeat interval for client');
  }
};

/**
 * Send heartbeat packet
 */

WebSocket.prototype.heartbeat = function() {
  if (this.readyState === Transport.CONNECTED) {
    this.packet({type: 'heartbeat'});
    this.setHeartbeatTimeout();
  }

  return this;
};

/**
 * WebSocket parser
 *
 * @api public
 */

function Parser (opts) {
  EventEmitter.call(this);

  this.state = {
    activeFragmentedOperation: null,
    lastFragment: false,
    masked: false,
    opcode: 0
  };
  this.overflow = null;
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  this.currentMessage = '';
  this._maxBuffer = (opts && opts.maxBuffer) || 10E7;
  this._dataLength = 0;

  var self = this;
  this.opcodeHandlers = {
    // text
    '1': function(data) {
      var finish = function(mask, data) {
        self.currentMessage += self.unmask(mask, data);
        if (self.state.lastFragment) {
          self.emit('data', self.currentMessage);
          self.currentMessage = '';
        }
        self.endPacket();
      };

      var expectData = function(length) {
        if (self.state.masked) {
          self.expect('Mask', 4, function(data) {
            var mask = data;
            self.expect('Data', length, function(data) {
              finish(mask, data);
            });
          });
        }
        else {
          self.expect('Data', length, function(data) {
            finish(null, data);
          });
        }
      };

      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        expectData(firstLength);
      }
      else if (firstLength === 126) {
        self.expect('Length', 2, function(data) {
          expectData(util.unpack(data));
        });
      }
      else if (firstLength === 127) {
        self.expect('Length', 8, function(data) {
          if (util.unpack(data.slice(0, 4)) !== 0) {
            self.error('packets with length spanning more than 32 bit is currently not supported');
            return;
          }
          expectData(util.unpack(data));
        });
      }
    },
    // binary
    '2': function(data) {
      var finish = function(mask, data) {
        if (typeof self.currentMessage === 'string') { self.currentMessage = []; } // build a buffer list
        self.currentMessage.push(self.unmask(mask, data, true));
        if (self.state.lastFragment) {
          self.emit('binary', self.concatBuffers(self.currentMessage));
          self.currentMessage = '';
        }
        self.endPacket();
      };

      var expectData = function(length) {
        if (self.state.masked) {
          self.expect('Mask', 4, function(data) {
            var mask = data;
            self.expect('Data', length, function(data) {
              finish(mask, data);
            });
          });
        }
        else {
          self.expect('Data', length, function(data) {
            finish(null, data);
          });
        }
      };

      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        expectData(firstLength);
      }
      else if (firstLength === 126) {
        self.expect('Length', 2, function(data) {
          expectData(util.unpack(data));
        });
      }
      else if (firstLength === 127) {
        self.expect('Length', 8, function(data) {
          if (util.unpack(data.slice(0, 4)) !== 0) {
            self.error('packets with length spanning more than 32 bit is currently not supported');
            return;
          }
          expectData(util.unpack(data));
        });
      }
    },
    // close
    '8': function() {
      self.emit('close');
      self.reset();
    },
    // ping
    '9': function(data) {
      if (!self.state.lastFragment) {
        self.error('fragmented ping is not supported');
        return;
      }

      var finish = function(mask, data) {
        self.emit('ping', self.unmask(mask, data));
        self.endPacket();
      };

      var expectData = function(length) {
        if (self.state.masked) {
          self.expect('Mask', 4, function(data) {
            var mask = data;
            self.expect('Data', length, function(data) {
              finish(mask, data);
            });
          });
        }
        else {
          self.expect('Data', length, function(data) {
            finish(null, data);
          });
        }
      };

      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength === 0) {
        finish(null, null);
      }
      else if (firstLength < 126) {
        expectData(firstLength);
      }
      else if (firstLength === 126) {
        self.expect('Length', 2, function(data) {
          expectData(util.unpack(data));
        });
      }
      else if (firstLength === 127) {
        self.expect('Length', 8, function(data) {
          expectData(util.unpack(data));
        });
      }
    }
  };

  this.expect('Opcode', 2, this.processPacket);
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(Parser, EventEmitter);

/**
 * Add new data to the parser.
 *
 * @api public
 */

Parser.prototype.add = function(data) {
  this._dataLength += data.length;
  if (this._dataLength > this._maxBuffer) {
    // Clear data
    this.overflow = null;
    this.expectBuffer = null;
    // Kick client
    this.emit('kick', 'max buffer size reached');
    return;
  }
  if (!this.expectBuffer) {
    this.addToOverflow(data);
    return;
  }
  var toRead = Math.min(data.length, this.expectBuffer.length - this.expectOffset);
  data.copy(this.expectBuffer, this.expectOffset, 0, toRead);
  this.expectOffset += toRead;
  if (toRead < data.length) {
    // at this point the overflow buffer shouldn't at all exist
    this.overflow = new Buffer(data.length - toRead);
    data.copy(this.overflow, 0, toRead, toRead + this.overflow.length);
  }
  if (this.expectOffset === this.expectBuffer.length) {
    var bufferForHandler = this.expectBuffer;
    this.expectBuffer = null;
    this.expectOffset = 0;
    this.expectHandler.call(this, bufferForHandler);
  }
};

/**
 * Adds a piece of data to the overflow.
 *
 * @api private
 */

Parser.prototype.addToOverflow = function(data) {
  if (!this.overflow) {
    this.overflow = data;
  } else {
    var prevOverflow = this.overflow;
    this.overflow = new Buffer(this.overflow.length + data.length);
    prevOverflow.copy(this.overflow, 0);
    data.copy(this.overflow, prevOverflow.length);
  }
};

/**
 * Waits for a certain amount of bytes to be available, then fires a callback.
 *
 * @api private
 */

Parser.prototype.expect = function(what, length, handler) {
  if (length > this._maxBuffer) {
    this.emit('kick', 'expected input larger than max buffer');
    return;
  }
  this.expectBuffer = new Buffer(length);
  this.expectOffset = 0;
  this.expectHandler = handler;
  if (this.overflow) {
    var toOverflow = this.overflow;
    this.overflow = null;
    this.add(toOverflow);
  }
};

/**
 * Start processing a new packet.
 *
 * @api private
 */

Parser.prototype.processPacket = function (data) {
  if ((data[0] & 0x70) !== 0) {
    this.error('reserved fields must be empty');
    return;
  }
  this.state.lastFragment = (data[0] & 0x80) === 0x80;
  this.state.masked = (data[1] & 0x80) === 0x80;
  var opcode = data[0] & 0xf;
  if (opcode === 0) {
    // continuation frame
    this.state.opcode = this.state.activeFragmentedOperation;
    if (!(this.state.opcode === 1 || this.state.opcode === 2)) {
      this.error('continuation frame cannot follow current opcode');
      return;
    }
  }
  else {
    this.state.opcode = opcode;
    if (this.state.lastFragment === false) {
        this.state.activeFragmentedOperation = opcode;
    }
  }
  var handler = this.opcodeHandlers[this.state.opcode];
  if (typeof handler === 'undefined') {
    this.error('no handler for opcode ' + this.state.opcode);
  } else {
    handler(data);
  }
};

/**
 * Endprocessing a packet.
 *
 * @api private
 */

Parser.prototype.endPacket = function() {
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  if (this.state.lastFragment && this.state.opcode === this.state.activeFragmentedOperation) {
    // end current fragmented operation
    this.state.activeFragmentedOperation = null;
  }
  this.state.lastFragment = false;
  this.state.opcode = this.state.activeFragmentedOperation ? this.state.activeFragmentedOperation : 0;
  this.state.masked = false;
  this.expect('Opcode', 2, this.processPacket);
};

/**
 * Reset the parser state.
 *
 * @api private
 */

Parser.prototype.reset = function() {
  this.state = {
    activeFragmentedOperation: null,
    lastFragment: false,
    masked: false,
    opcode: 0
  };
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  this.overflow = null;
  this.currentMessage = '';
};

/**
 * Unmask received data.
 *
 * @api private
 */

Parser.prototype.unmask = function (mask, buf, binary) {
  if (mask) {
    for (var i = 0, ll = buf.length; i < ll; i++) {
      buf[i] ^= mask[i % 4];
    }
  }
  if (binary) {
    return buf;
  }
  return buf ? buf.toString('utf8') : '';
};

/**
 * Concatenates a list of buffers.
 *
 * @api private
 */

Parser.prototype.concatBuffers = function(buffers) {
  var length = 0
    , i
    , l;

  for (i = 0, l = buffers.length; i < l; ++i) {
    length += buffers[i].length;
  }
  var mergedBuffer = new Buffer(length);
  var offset = 0;
  for (i = 0, l = buffers.length; i < l; ++i) {
    buffers[i].copy(mergedBuffer, offset);
    offset += buffers[i].length;
  }
  return mergedBuffer;
};

/**
 * Handles an error
 *
 * @api private
 */

Parser.prototype.error = function (reason) {
  this.reset();
  this.emit('error', reason);
  return this;
};

