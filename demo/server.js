var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);
var os = require('os');
var pty = require('node-pty');

var terminals = {},
    logs = {};

app.use('/build', express.static(__dirname + '/../build'));

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.get('/style.css', function(req, res){
  res.sendFile(__dirname + '/style.css');
});

app.get('/dist/client-bundle.js', function(req, res){
  res.sendFile(__dirname + '/dist/client-bundle.js');
});

app.post('/terminals', function (req, res) {
  var cols = parseInt(req.query.cols),
      rows = parseInt(req.query.rows),
      term = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.PWD,
        env: process.env,
        encoding: null
      });

  console.log('Created terminal with PID: ' + term.pid);
  terminals[term.pid] = term;
  logs[term.pid] = '';
  term.on('data', function(data) {
    logs[term.pid] += data;
  });
  res.send(term.pid.toString());
  res.end();
});

app.post('/terminals/:pid/size', function (req, res) {
  var pid = parseInt(req.params.pid),
      cols = parseInt(req.query.cols),
      rows = parseInt(req.query.rows),
      term = terminals[pid];

  term.resize(cols, rows);
  console.log('Resized terminal ' + pid + ' to ' + cols + ' cols and ' + rows + ' rows.');
  res.end();
});

app.ws('/terminals/:pid', function (ws, req) {
  var term = terminals[parseInt(req.params.pid)];
  console.log('Connected to terminal ' + term.pid);
  ws.send(logs[term.pid]);

  /*
  function buffer(socket, timeout) {
    let buffer = new Buffer(500000);
    let pos = 0;
    let sender = null;
    return (data) => {
      //for (let i = 0; i < data.length; ++i) {
      //  buffer[pos + i] = data[i]; 
      //}
      data.copy(buffer, pos);
      pos += data.length;
      if (!sender) {
        sender = setTimeout(() => {
          socket.send(new Buffer.from(buffer.buffer, 0, pos));
          pos = 0;
          sender = null;
        }, timeout);
      }
    };
  }
  const send = buffer(ws, 5);
  */
  function buffer(socket, timeout) {
    let buffer = [];
    let sender = null;
    return (data) => {
      buffer.push(data);
      if (!sender) {
        sender = setTimeout(() => {
          socket.send(Buffer.concat(buffer));
          buffer = [];
          sender = null;
        }, timeout);
      }
    };
  }
  const send = buffer(ws, 10);

  term.on('data', function(data) {
    try {
      send(data, {binary: true});
      //ws.send(data, {binary: true});
    } catch (ex) {
      // The WebSocket is not open, ignore
    }
  });
  ws.on('message', function(msg) {
    term.write(msg);
  });
  ws.on('close', function () {
    term.kill();
    console.log('Closed terminal ' + term.pid);
    // Clean things up
    delete terminals[term.pid];
    delete logs[term.pid];
  });
});

var port = process.env.PORT || 3000,
    host = os.platform() === 'win32' ? '127.0.0.1' : '0.0.0.0';

console.log('App listening to http://' + host + ':' + port);
app.listen(port, host);
