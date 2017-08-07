var server = require('../');

var s = server.listen(12345);

s.on('connection', function(socket) {
  socket.on('message', function() {
    console.log('message', arguments);
  });

  socket.on('disconnect', function() {
    console.log('disconnect', arguments);
  });

  socket.on('error', function(er) {
    console.log('error', er);
  });

  setTimeout(function() {
    socket.disconnect();
  }, 5 * 1000);

  setInterval(function() {
    socket.send('wolfjdkf');
  }, 1000);

  socket.on('heell', function() {
    console.log('event heell', arguments);
  });

});

