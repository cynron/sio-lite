
/**
 * Export transports.
 */

module.exports = {
    websocket: require('./websocket')
  , 'xhr-polling': require('./xhr-polling')
  , 'jsonp-polling': require('./jsonp-polling')
};

