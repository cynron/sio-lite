var io = require('socket.io-client')

var socket = io.connect("ws://127.0.0.1:12345", {
  reconnect: true, transports: ['websocket'] }
  );

socket.send('hello');

setTimeout(function() {
  socket.disconnect();
}, 10 * 1000);

socket.on('disconnect', function() {
  console.log('disconnect', arguments);
});

socket.on('message', function() {
  console.log('message', arguments);
});

socket.on('error', function() {
  console.log('error', arguments);
});

setInterval(function() {
  socket.emit('heell', 'aaa');
}, 2000);
