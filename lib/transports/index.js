
/**
 * Export transports.
 */

module.exports = {
    websocket: require('./websocket'),
    'jsonp-polling': require('./jsonp-polling'),
    'xhr-polling': require('./xhr-polling')
};

