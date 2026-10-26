const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../launcher/core.js');

test('D-pad does not wrap at edges', () => {
  const rows = [[1,2,3],[4,5,6,7,8]];
  assert.deepEqual(core.nextFocus(rows,{row:1,col:4},'ArrowRight'),{row:1,col:4});
  assert.deepEqual(core.nextFocus(rows,{row:0,col:0},'ArrowLeft'),{row:0,col:0});
  assert.deepEqual(core.nextFocus(rows,{row:0,col:2},'ArrowUp'),{row:0,col:2});
});
test('unequal row lengths and last partial row stay focusable', () => {
  assert.deepEqual(core.nextFocus([[1,2],[3,4,5],[6]],{row:1,col:2},'ArrowUp'),{row:0,col:1});
  assert.deepEqual(core.nextFocus([[1,2],[3,4,5],[6]],{row:1,col:2},'ArrowDown'),{row:2,col:0});
});
test('saved order ignores removed apps and duplicate IDs', () => {
  assert.deepEqual(core.orderApps([{id:'a'},{id:'b'},{id:'c'}],['b','gone','b']).map(a=>a.id),['b','a','c']);
});
test('corrupt persisted state falls back without losing apps', () => {
  assert.deepEqual(core.orderApps([{id:'a'}],{}),[{id:'a'}]);
});
test('prototype-shaped IDs are treated as data', () => {
  assert.deepEqual(core.orderApps([{id:'__proto__'},{id:'constructor'}],['constructor']).map(a=>a.id),['constructor','__proto__']);
});
test('successful launch uses the public Tizen API', () => {
  let actual, success=false;
  core.launch({application:{launch(id, ok){actual=id;ok();}}},'test.App',()=>success=true,()=>assert.fail());
  assert.equal(actual,'test.App'); assert.ok(success);
});
test('missing or blocked apps remain recoverable', () => {
  for (const api of [null,{application:{launch(){throw new Error('denied');}}},
    {application:{launch(id,ok,fail){fail();}}}]) {
    let message; core.launch(api,'test.App',()=>assert.fail(),m=>message=m); assert.ok(message);
  }
});
test('invalid IDs never reach the API', () => {
  let message; core.launch({application:{launch(){assert.fail();}}},'bad;cmd',()=>assert.fail(),m=>message=m);
  assert.ok(message);
});
test('launcher does not intercept power/home or run a background watchdog', () => {
  const app=fs.readFileSync(path.join(__dirname,'../launcher/app.js'),'utf8');
  assert.ok(!app.includes('registerKey('));
  assert.ok(!app.includes('10252')); // Power key must remain Samsung-owned.
  assert.ok(!app.includes('setInterval(openApp'));
  assert.ok(!app.includes('innerHTML'));
});

test('input choices keep only allowed sources, with TV-provided names and connection state', () => {
  const ps4 = {type: 'HDMI', number: 4, editName: 'PlayStation 4'};
  const soundbar = {type: 'HDMI', number: 3, editName: 'HW-Q6R Series'};
  const value = {connected: [{type: 'TV', number: 1}], disconnected: [{type: 'HDMI', number: 1, editName: null}, soundbar, ps4]};
  const choices = core.inputChoices(value, [{type: 'HDMI', number: 4}]);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].source, ps4);
  assert.equal(choices[0].title, 'HDMI 4');
  assert.equal(choices[0].name, 'PlayStation 4');
  assert.equal(choices[0].connected, false);
  assert.equal(core.inputChoices({connected: [ps4], disconnected: [ps4]}, [{type: 'HDMI', number: 4}]).length, 1);
  assert.equal(core.inputChoices({connected: [ps4]}, [{type: 'HDMI', number: 4}])[0].connected, true);
});
test('input choices tolerate missing, malformed or unconfigured data', () => {
  assert.deepEqual(core.inputChoices(null, [{type: 'HDMI', number: 4}]), []);
  assert.deepEqual(core.inputChoices({connected: 'x', disconnected: [null, {type: 1}]}, [{type: 'HDMI', number: 4}]), []);
  assert.deepEqual(core.inputChoices({connected: [{type: 'HDMI', number: 4}]}, undefined), []);
  assert.equal(core.inputChoices({connected: [{type: 'HDMI', number: 4}]}, [{type: 'HDMI', number: 4}])[0].name, '');
});
test('wifi info maps status and strength to bars and percent', () => {
  assert.deepEqual(core.wifiInfo({status: 'ON', ssid: 'Home', signalStrength: 0.67}), {on: true, ssid: 'Home', percent: 67, bars: 3});
  assert.equal(core.wifiInfo({status: 'ON', ssid: 'Home', signalStrength: 0.2}).bars, 1);
  assert.equal(core.wifiInfo({status: 'ON', ssid: 'Home', signalStrength: 7}).percent, 100);
  assert.deepEqual(core.wifiInfo({status: 'OFF', ssid: 'Home', signalStrength: 0.9}), {on: false, ssid: '', percent: 0, bars: 0});
  assert.equal(core.wifiInfo(undefined).on, false);
});
test('menu focus steps stay inside the list; volume stays between 0 and 100', () => {
  assert.equal(core.step(0, 3, 'ArrowUp'), 0);
  assert.equal(core.step(2, 3, 'ArrowDown'), 2);
  assert.equal(core.step(1, 3, 'ArrowDown'), 2);
  assert.equal(core.step(0, 0, 'ArrowDown'), -1);
  assert.equal(core.adjustVolume(1, 'ArrowLeft'), 0);
  assert.equal(core.adjustVolume(99, 'ArrowRight'), 100);
  assert.equal(core.adjustVolume(10, 'ArrowRight', 5), 15);
  assert.equal(core.adjustVolume(undefined, 'ArrowRight'), 2);
  assert.equal(core.adjustVolume(10, 'Enter'), 10);
});

test('launcher page stays inside the strict CSP: no inline script, style or handlers', () => {
  const html = fs.readFileSync(path.join(__dirname, '../launcher/index.html'), 'utf8');
  assert.ok(!/<script(?![^>]*src=)/.test(html));
  assert.ok(!/<style/.test(html));
  assert.ok(!/\sstyle=/.test(html));
  assert.ok(!/\son[a-z]+=/.test(html));
  assert.ok(html.includes("connect-src 'none'"));
});
test('launcher input list is limited to the configured sources and Back leaves video first', () => {
  const app = fs.readFileSync(path.join(__dirname, '../launcher/app.js'), 'utf8');
  assert.ok(app.includes('core.inputChoices(value, config.inputs)'));
  assert.ok(app.indexOf('if (videoOn) leaveVideo()') < app.indexOf('else returnHome()'));
  const cfg = fs.readFileSync(path.join(__dirname, '../launcher/config.js'), 'utf8');
  assert.match(cfg, /inputs: \[\{type: 'HDMI', number: 4\}\]/);
});

test('wallpaper changes once per local day, cycles through the list and is stable within a day', () => {
  const names = ['a.jpg', 'b.jpg', 'c.png'];
  const morning = core.wallpaperFor(names, new Date(2026, 9, 26, 0, 1));
  const night = core.wallpaperFor(names, new Date(2026, 9, 26, 23, 59));
  assert.equal(morning, night);
  const days = [0, 1, 2, 3].map((n) => core.wallpaperFor(names, new Date(2026, 9, 26 + n, 12)));
  assert.equal(new Set(days.slice(0, 3)).size, 3);
  assert.equal(days[0], days[3]);
  assert.ok(days.every((url) => url.startsWith('wallpapers/')));
});
test('wallpaper list ignores unsafe names and works with no list', () => {
  assert.equal(core.wallpaperFor(undefined, new Date()), null);
  assert.equal(core.wallpaperFor([], new Date()), null);
  assert.equal(core.wallpaperFor(['../x.jpg', 'a b.jpg', 'x.svg', 'x.jpg"); alert(1);//.jpg', 5, null], new Date()), null);
  assert.equal(core.wallpaperFor(['../x.jpg', 'ok.JPG'], new Date(2026, 0, 1)), 'wallpapers/ok.JPG');
  assert.match(core.wallpaperFor(['ok.jpg'], 'not a date'), /^wallpapers\/ok\.jpg$/);
});
test('launcher refreshes the date and wallpaper on launch, resume and every key press', () => {
  const app = fs.readFileSync(path.join(__dirname, '../launcher/app.js'), 'utf8');
  assert.match(app, /clock\(\); readWifi\(\); wallpaper\(\); clockTimer = setInterval\(tick/);
  assert.match(app, /else \{ tick\(\);/);
  assert.match(app, /addEventListener\('keydown', function \(event\) \{\s*var key = event\.key;\s*clock\(\); wallpaper\(\);/);
});
