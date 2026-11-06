// Asks the TV whether Art Mode is on, over the art channel of its local WebSocket API.
// Read-only: only get_artmode_status is ever sent. Local clients need no pairing on this channel.
// Node 12 on the TV has no WebSocket client, so this speaks the few frames it needs.
'use strict';
var crypto = require('crypto');
var net = require('net');
var watch = require('./watch.js');

var PATH = '/api/v2/channels/com.samsung.art-app?name=' + encodeURIComponent(Buffer.from('CleanYourTizen').toString('base64'));

function frame(text) {
  var body = Buffer.from(text), mask = crypto.randomBytes(4), masked = Buffer.alloc(body.length);
  for (var index = 0; index < body.length; index += 1) masked[index] = body[index] ^ mask[index % 4];
  var head = body.length < 126 ? Buffer.from([0x81, 0x80 | body.length]) : Buffer.from([0x81, 0xFE, body.length >> 8, body.length & 255]);
  return Buffer.concat([head, mask, masked]);
}

// Splits complete text frames off the buffer; what remains waits for more data.
function takeFrames(buffer, onText) {
  while (buffer.length >= 2) {
    var length = buffer[1] & 127, offset = 2;
    if (length === 126) { if (buffer.length < 4) break; length = buffer.readUInt16BE(2); offset = 4; }
    else if (length === 127) { if (buffer.length < 10) break; length = buffer.readUInt32BE(6); offset = 10; }
    if (buffer.length < offset + length) break;
    if ((buffer[0] & 15) === 1) onText(buffer.slice(offset, offset + length).toString());
    buffer = buffer.slice(offset + length);
  }
  return buffer;
}

function request() {
  // `to: broadcast`, not `host`: local clients count as hosts themselves and the Art host never sees the latter.
  return JSON.stringify({method: 'ms.channel.emit', params: {event: 'art_app_request', to: 'broadcast',
    data: JSON.stringify({request: 'get_artmode_status', id: crypto.randomBytes(4).toString('hex')})}});
}

// done('on' | 'off' | null); null means the TV gave no answer in time.
function read(done, options) {
  var settings = options || {}, port = settings.port || 8001, finished = false, upgraded = false, buffer = Buffer.alloc(0), socket, timer;
  function finish(value) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try { socket.destroy(); } catch (error) { /* already closed */ }
    done(value);
  }
  function onText(text) {
    if (text.indexOf('ms.channel.ready') >= 0) { socket.write(frame(request())); return; }
    var value = watch.parseArtStatus(text);
    if (value) finish(value);
  }
  timer = setTimeout(function () { finish(null); }, settings.timeoutMs || 1200);
  try {
    socket = net.connect({host: '127.0.0.1', port: port}, function () {
      socket.write('GET ' + PATH + ' HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    socket.on('data', function (chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        var end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        upgraded = true;
        buffer = buffer.slice(end + 4);
      }
      buffer = takeFrames(buffer, onText);
    });
    socket.on('error', function () { finish(null); });
    socket.on('close', function () { finish(null); });
  } catch (error) { finish(null); }
}

module.exports = {read: read};
