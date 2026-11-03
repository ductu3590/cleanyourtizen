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
test('an app moves up one place or straight to the front without changing the current list', () => {
  const apps = [{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  const ids = (list) => list.map((app) => app.id);
  assert.deepEqual(ids(core.moveItem(apps, 2, 1)), ['a','c','b','d']);
  assert.deepEqual(ids(core.moveItem(apps, 2, 0)), ['c','a','b','d']);
  assert.deepEqual(ids(core.moveItem(apps, 3, 2)), ['a','b','d','c']);
  assert.deepEqual(ids(core.moveItem(apps, 0, -1)), ['a','b','c','d']);
  assert.deepEqual(ids(core.moveItem(apps, 3, 99)), ['a','b','c','d']);
  assert.deepEqual(core.moveItem(null, 0, 0), []);
  assert.deepEqual(ids(apps), ['a','b','c','d']);
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
test('launcher and service never intercept Power/Home keys', () => {
  for (const file of ['launcher/app.js','launcher/service/service.js','launcher/service/watch.js']) {
    const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.ok(!source.includes('registerKey('), file);
    assert.ok(!source.includes('10252'), file); // Power key must remain Samsung-owned.
    if (file.includes('service')) assert.ok(!source.includes('setInterval('), file); // event-driven, no polling watchdog
  }
  const app=fs.readFileSync(path.join(__dirname,'../launcher/app.js'),'utf8');
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
  assert.ok(app.includes('core.inputChoices(value, inputsConfig)'));
  assert.ok(app.indexOf('if (videoOn) leaveVideo()') < app.indexOf('else returnHome()'));
  const cfg = fs.readFileSync(path.join(__dirname, '../launcher/config.js'), 'utf8');
  assert.match(cfg, /inputs: \[\{type: 'HDMI', number: 4, dock: true, label: 'PlayStation 4'\}\]/);
});

test('dock inputs keep only sources pinned with dock: true and carry the TV source object', () => {
  const ps4 = {type: 'HDMI', number: 4, editName: 'PlayStation 4'};
  const soundbar = {type: 'HDMI', number: 3, editName: 'HW-Q6R Series'};
  const allow = [{type: 'HDMI', number: 4, dock: true}, {type: 'HDMI', number: 3}];
  const tiles = core.dockInputs(allow, {connected: [ps4], disconnected: [soundbar]});
  assert.equal(tiles.length, 1);
  assert.deepEqual({id: tiles[0].id, kind: tiles[0].kind, title: tiles[0].title, name: tiles[0].name, connected: tiles[0].connected},
    {id: 'input:HDMI:4', kind: 'input', title: 'HDMI 4', name: 'PlayStation 4', connected: true});
  assert.equal(tiles[0].choice.source, ps4);
  assert.equal(core.dockInputs(allow, {disconnected: [ps4]})[0].connected, false);
  // Before the TV answers (or in the desktop preview) the tile still exists, with unknown state.
  const unknown = core.dockInputs(allow, null)[0];
  assert.equal(unknown.name, 'HDMI 4'); assert.equal(unknown.connected, null); assert.equal(unknown.choice, null);
});
test('an owner label wins over the TV name; names are trimmed and bounded', () => {
  const value = {connected: [{type: 'HDMI', number: 4, editName: '  PlayStation   4 '}]};
  assert.equal(core.dockInputs([{type: 'HDMI', number: 4, dock: true}], value)[0].name, 'PlayStation 4');
  assert.equal(core.dockInputs([{type: 'HDMI', number: 4, dock: true, label: 'PS4 của Bi'}], value)[0].name, 'PS4 của Bi');
  assert.equal(core.dockInputs([{type: 'HDMI', number: 4, dock: true, label: '   '}], value)[0].name, 'PlayStation 4');
  assert.equal(core.dockInputs([{type: 'HDMI', number: 4, dock: true, label: 'x'.repeat(80)}], null)[0].name.length, 32);
  assert.equal(core.dockInputs([{type: 'HDMI', number: 4, dock: true, label: 7}], null)[0].name, 'HDMI 4');
});
test('dock inputs ignore malformed, duplicate or non-pinned entries', () => {
  const bad = [null, 'HDMI', {type: 'HDMI', number: 4, dock: 'yes'}, {type: 'hdmi', number: 1, dock: true},
    {type: 'HDMI', number: 0, dock: true}, {type: 'HDMI', number: 1.5, dock: true}, {type: 'HDMI', number: '2', dock: true},
    {type: '<img>', number: 1, dock: true}, {type: 'HDMI', number: 100, dock: true}];
  assert.deepEqual(core.dockInputs(bad, null), []);
  assert.deepEqual(core.dockInputs(undefined, null), []);
  assert.deepEqual(core.dockInputs({}, null), []);
  const twice = core.dockInputs([{type: 'HDMI', number: 2, dock: true}, {type: 'HDMI', number: 2, dock: true, label: 'B'}], null);
  assert.deepEqual(twice.map((tile) => tile.name), ['HDMI 2']);
});
test('input tiles share the saved dock order with apps', () => {
  const tiles = [{id: 'a.App', name: 'A'}, {id: 'b.App', name: 'B'}].concat(core.dockInputs([{type: 'HDMI', number: 4, dock: true}], null));
  assert.deepEqual(core.orderApps(tiles, []).map((tile) => tile.id), ['a.App', 'b.App', 'input:HDMI:4']);
  assert.deepEqual(core.orderApps(tiles, ['input:HDMI:4', 'a.App']).map((tile) => tile.id), ['input:HDMI:4', 'a.App', 'b.App']);
});
test('consoles get the console glyph; other devices a plain input glyph', () => {
  assert.equal(core.deviceStyle('PlayStation 4'), 'console playstation');
  assert.equal(core.deviceStyle('PS4'), 'console playstation');
  assert.equal(core.deviceStyle('Xbox Series X'), 'console');
  assert.equal(core.deviceStyle('HW-Q6R Series'), 'device');
  assert.equal(core.deviceStyle('HDMI 4'), 'device');
  assert.equal(core.deviceStyle(undefined), 'device');
});
test('dock stays one row up to seven tiles, then wraps at seven', () => {
  assert.deepEqual([0, 3, 5, 6, 7, 9].map(core.dockColumns), [5, 5, 5, 6, 7, 7]);
  assert.equal(core.dockColumns('6'), 5);
  const css = fs.readFileSync(path.join(__dirname, '../launcher/style.css'), 'utf8');
  assert.ok(css.includes('.dock[data-cols="6"]') && css.includes('.dock[data-cols="7"]'));
});
test('input tiles read the TV sources again before switching and Back returns focus to the tile', () => {
  const app = fs.readFileSync(path.join(__dirname, '../launcher/app.js'), 'utf8');
  assert.ok(app.includes('core.dockInputs(inputsConfig, null)'));
  assert.match(app, /function openInputTile\(tile, button\) \{\s*readSources\(function \(value\) \{\s*refreshInputs\(value\);\s*if \(tile\.choice\) \{ selectSource\(tile\.choice, button\);/);
  // Back from video returns to the dock tile that started it, else to the control center button.
  assert.match(app, /var back = videoReturn && videoReturn\.parentNode \? videoReturn : \$\('btn-controls'\);/);
  assert.match(app, /function tick\(\) \{ clock\(\); readWifi\(\); wallpaper\(\); readInputs\(\);/);
  assert.ok(!app.includes('innerHTML'));
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
test('a chosen wallpaper wins over the daily one; unknown or unsafe choices fall back to daily', () => {
  const names = ['a.jpg', 'b.jpg', 'c.png'];
  const day = new Date(2026, 9, 26, 9);
  const daily = core.wallpaperFor(names, day);
  assert.equal(core.wallpaperFor(names, day, 'b.jpg'), 'wallpapers/b.jpg');
  assert.equal(core.wallpaperFor(names, new Date(2030, 1, 1), 'c.png'), 'wallpapers/c.png');
  for (const bad of ['auto', 'gone.jpg', '../a.jpg', '', null, undefined, 7, {}]) {
    assert.equal(core.wallpaperFor(names, day, bad), daily);
  }
});
test('wallpaper picker previews on focus, saves only on OK and restores on Back', () => {
  const app = fs.readFileSync(path.join(__dirname, '../launcher/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../launcher/index.html'), 'utf8');
  assert.ok(html.includes('id="picker"') && html.includes('id="picker-grid"'));
  assert.match(app, /addEventListener\('focus', function \(\) \{ applyWallpaper\(option\.url\); \}\)/);
  assert.match(app, /localStorage\.setItem\('cyt-wallpaper', preference\)/);
  assert.ok(app.indexOf('else if (picking) pickerBack()') > app.indexOf('if (videoOn) leaveVideo()'));
  assert.ok(app.indexOf('else if (picking) pickerBack()') < app.indexOf('else if (!panel.hidden) closePanel()'));
  assert.match(app, /function wallpaper\(\) \{\s*if \(picking\) return;/);
  assert.ok(!app.includes('innerHTML'));
});
test('device profile records that Home, Power and brand hotkeys cannot be taken over', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, '../profiles/qa55ls03b.json'), 'utf8'));
  assert.equal(profile.model, 'QA55LS03BAKXXV');
  assert.equal(profile.evidence.nativeHome, 'unsupported');
  assert.match(profile.evidence.homeKeyAndHotkeys, /^not-registrable/);
  assert.equal(profile.artModeRequired, true);
});
test('device profile records which apps are removable and that VieON cannot be replaced', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, '../profiles/qa55ls03b.json'), 'utf8'));
  assert.match(profile.evidence.debloat, /Hot IPTV removed and verified/);
  assert.match(profile.evidence.debloat, /VieON/);
  assert.match(profile.evidence.debloat, /can not uninstall app/);
});
test('device profile records that the vendor vd_appuninstall command is also refused', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, '../profiles/qa55ls03b.json'), 'utf8'));
  assert.match(profile.evidence.vdAppUninstall, /vd_appuninstall|numeric app id/);
  assert.match(profile.evidence.vdAppUninstall, /can not uninstall app/);
  assert.match(profile.evidence.vdAppUninstall, /no inventory change/);
});
test('documentation states the verified limits and the DUID signing requirement', () => {
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  const signing = fs.readFileSync(path.join(__dirname, '../docs/SIGNING.md'), 'utf8');
  assert.match(readme, /What was verified on a real TV/);
  assert.match(readme, /can not uninstall app/);
  assert.match(readme, /--wallpapers/);
  assert.match(signing, /lists only the TV's IP address is wrong/);
  assert.match(signing, /sdb shell 0 getduid/);
});
test('every relative link and image in the public documentation resolves to a file', () => {
  const root = path.join(__dirname, '..');
  const docs = ['README.md', 'README.vi.md', 'CONTRIBUTING.md', ...fs.readdirSync(path.join(root, 'docs')).filter((n) => n.endsWith('.md')).map((n) => 'docs/' + n)];
  const missing = [];
  for (const doc of docs) {
    const text = fs.readFileSync(path.join(root, doc), 'utf8');
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      if (!fs.existsSync(path.join(root, path.dirname(doc), target))) missing.push(doc + ' -> ' + target);
    }
  }
  assert.deepEqual(missing, []);
});
test('public docs ship no private device data and keep the safety warnings', () => {
  const root = path.join(__dirname, '..');
  const files = ['README.md', 'README.vi.md', 'docs/GETTING-STARTED.md', 'docs/HUONG-DAN.md', 'docs/SIGNING.md'];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/([0-9a-f]{2}:){5}[0-9a-f]{2}/i.test(text), file + ' has a MAC-like value');
    assert.ok(!/192\.168\.1\.(214|131)/.test(text), file + ' has a real LAN address');
    assert.ok(!/BDCOGBCPMNNQI/.test(text), file + ' has a DUID');
  }
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /Use at your own risk/);
  assert.match(fs.readFileSync(path.join(root, 'README.vi.md'), 'utf8'), /Tự chịu rủi ro/);
  assert.match(fs.readFileSync(path.join(root, 'docs/HUONG-DAN.md'), 'utf8'), /Invalid signature/);
});
test('screenshots are attributed as illustration-only wallpaper and the repo ships no wallpapers', () => {
  const root = path.join(__dirname, '..');
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /Apple TV aerial image, used for illustration only/);
  assert.match(fs.readFileSync(path.join(root, 'README.vi.md'), 'utf8'), /chỉ dùng để minh hoạ/);
  assert.ok(!fs.existsSync(path.join(root, 'launcher', 'wallpapers')));
  for (const name of ['home', 'input', 'settings']) assert.ok(fs.statSync(path.join(root, 'docs/images/launcher-' + name + '.png')).size < 1_500_000);
});

const watch = require('../launcher/service/watch.js');
const HOME={powerState:'on',launcherVisible:false,contexts:['com.samsung.tv.csfs']};
function guard(extra, tv) {
  const state={time:1000,launched:[],timers:[],tv:tv||HOME};
  const watcher=watch.createWatcher(Object.assign({mode:'guard',launcherId:'CyTizen001.Home',delayMs:2500,
    pauseMs:60000,awayMs:15000,cooldownMs:4000,now:()=>state.time,launch:id=>state.launched.push(id),
    inspect:done=>done(state.tv),
    setTimer:(fn,ms)=>{state.timers.push(fn);return state.timers.length;},clearTimer:id=>{state.timers[id-1]=null;}},extra));
  // Fire the pending delayed check, as the real timer would.
  state.fire=()=>{const pending=state.timers.filter(Boolean);state.timers=[];pending.forEach(fn=>fn());};
  return {state,watcher};
}
test('Samsung Home covering the launcher brings it back after the delay', () => {
  const {state,watcher}=guard();
  assert.equal(watcher.command('ui-hidden'),'scheduled');
  assert.deepEqual(state.launched,[]); state.fire();
  assert.deepEqual(state.launched,['CyTizen001.Home']);
});
test('Art Mode, standby or an already visible launcher are left alone', () => {
  for (const tv of [{powerState:'on',launcherVisible:false,contexts:watch.ART_SIGNALS},
    {powerState:'standby',launcherVisible:false,contexts:[]},{powerState:'on',launcherVisible:true,contexts:[]},
    {powerState:'on',launcherVisible:false,contexts:[],otherVisible:'9Ur5IzDKqV.TizenYouTube'}]) {
    const {state,watcher}=guard({},tv); watcher.command('ui-hidden'); state.fire();
    assert.deepEqual(state.launched,[],JSON.stringify(tv));
  }
});
test('unknown TV state does not block the launcher', () => {
  assert.equal(watch.decide({powerState:null,launcherVisible:false,contexts:[]}),'launch');
});
test('observe mode never launches anything', () => {
  const {state,watcher}=guard({mode:'observe'}); watcher.command('ui-hidden'); state.fire();
  assert.deepEqual(state.launched,[]);
});
test('apps opened from the launcher are not interrupted', () => {
  const {state,watcher}=guard();
  watcher.command('opened-app'); state.time+=500;
  assert.equal(watcher.command('ui-hidden'),'away'); state.fire();
  assert.deepEqual(state.launched,[]);
  state.time+=15000; watcher.command('ui-visible'); assert.equal(watcher.command('ui-hidden'),'scheduled');
});
test('returning to the launcher before the delay cancels the check', () => {
  const {state,watcher}=guard();
  watcher.command('ui-hidden'); watcher.command('ui-visible'); state.fire();
  assert.deepEqual(state.launched,[]);
});
test('cooldown stops a relaunch loop', () => {
  const {state,watcher}=guard();
  watcher.command('ui-hidden'); state.fire(); state.time+=1000;
  watcher.command('ui-hidden'); state.fire();
  assert.equal(state.launched.length,1);
  state.time+=4000; watcher.command('ui-hidden'); state.fire();
  assert.equal(state.launched.length,2);
});
test('choosing Samsung Home pauses the guard until it expires or the launcher is visible again', () => {
  const {state,watcher}=guard();
  watcher.command('pause'); state.time+=59000;
  assert.equal(watcher.command('ui-hidden'),'paused');
  state.time+=2000; watcher.command('ui-hidden'); state.fire();
  assert.equal(state.launched.length,1);
  state.time+=5000; watcher.command('pause'); watcher.command('ui-visible');
  assert.equal(watcher.command('ui-hidden'),'scheduled');
});
test('service commands are read from app control data only', () => {
  assert.deepEqual(watch.readCommand({data:[{key:'other',value:['x']},{key:'cmd',value:['pause']}]}),['pause','']);
  assert.deepEqual(watch.readCommand({data:[{key:'cmd',value:['opened-app','ZTpEFWgfa9.FPTPlay']}]}),['opened-app','ZTpEFWgfa9.FPTPlay']);
  assert.deepEqual(watch.readCommand(null),['','']);
  assert.deepEqual(watch.readCommand({data:[{key:'cmd',value:[]}]}),['','']);
});
const APP='ZTpEFWgfa9.FPTPlay', IN_APP={home:false,app:'running'}, HOME_OVER_APP={home:true,app:'running'};
function following(fronts, tv) {
  const g=guard({front:(id,done)=>done(fronts.length ? fronts.shift() : IN_APP)},tv);
  assert.equal(g.watcher.command('opened-app',APP),'following');
  g.watcher.command('ui-hidden');
  return g;
}
test('Home pressed inside a followed app returns to the launcher', () => {
  const {state}=following([IN_APP,IN_APP,HOME_OVER_APP]);
  state.fire(); state.fire(); assert.deepEqual(state.launched,[]);
  state.fire(); // Samsung Home entered cpu/running -> delayed check scheduled
  state.fire(); assert.deepEqual(state.launched,['CyTizen001.Home']);
});
test('a followed app is followed while it runs, and dropped when it exits or the TV state is unreadable', () => {
  const g=following([]); for (let i=0;i<100;i+=1) { g.state.time+=60000; g.state.fire(); }
  assert.equal(g.state.timers.filter(Boolean).length,1); // still following after 100 minutes in the app
  const gone=following([{home:false,app:'gone'}]); gone.state.fire();
  assert.deepEqual(gone.state.timers.filter(Boolean),[]); assert.deepEqual(gone.state.launched,[]);
  const unknown=following([null,null]); unknown.state.fire(); unknown.state.time+=31000; unknown.state.fire();
  assert.deepEqual(unknown.state.timers.filter(Boolean),[]); assert.deepEqual(unknown.state.launched,[]);
});
test('Art Mode during a followed app keeps following without launching', () => {
  const fronts=[HOME_OVER_APP];
  const g=following(fronts,{powerState:'on',launcherVisible:false,contexts:watch.ART_SIGNALS});
  g.state.fire(); g.state.fire(); // Home seen, check -> art-mode
  assert.deepEqual(g.state.launched,[]);
  g.state.time+=3600000; g.state.fire(); // still following after an hour of Art Mode
  assert.deepEqual(g.state.launched,[]);
  g.state.tv=HOME; fronts.push(HOME_OVER_APP); g.state.fire(); g.state.fire();
  assert.deepEqual(g.state.launched,['CyTizen001.Home']);
});
test('returning to the launcher stops following', () => {
  const g=following([IN_APP]); g.watcher.command('ui-visible');
  assert.deepEqual(g.state.timers.filter(Boolean),[]);
});
// Recorded on QA55LS03B: Home over FPT Play puts Samsung Home (csfs) into cpu/running while FPT stays there.
const CTX=[{appId:'com.samsung.tv.csfs',id:407},{appId:'org.tizen.welcome-mode',id:1137},{appId:APP,id:17526},
  {appId:'CyTizen001.Home',id:17214},{appId:'com.samsung.tv.cobalt-yt',id:24674},{appId:'IkWsFHtOY9.StremioService',id:23787}];
test('Samsung Home in cpu/running is read as Home pressed over the followed app', () => {
  assert.deepEqual(watch.frontOf(CTX,['1137','17526',''],APP,'com.samsung.tv.csfs'),{home:false,app:'running'});
  assert.deepEqual(watch.frontOf(CTX,['407','1137','17526'],APP,'com.samsung.tv.csfs'),{home:true,app:'running'});
  assert.deepEqual(watch.frontOf(CTX,['1137','17214'],APP,'com.samsung.tv.csfs'),{home:false,app:'background'});
  assert.deepEqual(watch.frontOf(CTX,['1137'],'IkWsFHtOY9.Stremio','com.samsung.tv.csfs'),{home:false,app:'gone'});
  assert.equal(watch.frontOf(CTX,null,APP,'com.samsung.tv.csfs'),null);
});
test('a media app in front blocks the relaunch unless Samsung Home covers it', () => {
  const other=(running)=>watch.otherInFront(CTX,running,'com.samsung.tv.csfs','CyTizen001.Home');
  assert.equal(other(['1137','24674']),'com.samsung.tv.cobalt-yt'); // YouTube cast over the launcher
  assert.equal(other(['1137','17526']),APP);
  assert.equal(other(['407','1137','17526']),null); // Home pressed over the app
  assert.equal(other(['1137','17214']),null); // only the launcher
  assert.equal(other(['407','1137']),null);
  assert.equal(other(null),undefined);
});test('telling the service always continues, even when it fails or never answers', () => {
  function Control(op,uri,mime,cat,data){this.data=data;}
  function Data(key,value){this.key=key;this.value=value;}
  let sent; let calls=0;
  core.tellService({ApplicationControl:Control,ApplicationControlData:Data,application:{launchAppControl(c,id,ok){sent=[id,c.data[0].value[0]];ok();ok();}}},
    'CyTizen001.Service','pause',()=>calls++);
  assert.deepEqual(sent,['CyTizen001.Service','pause']); assert.equal(calls,1);
  for (const api of [null,{application:{}},{ApplicationControl:Control,ApplicationControlData:Data,application:{launchAppControl(){throw new Error('no service');}}}]) {
    let done=0; core.tellService(api,'CyTizen001.Service','pause',()=>done++); assert.equal(done,1);
  }
  let done=0; core.tellService({},'','pause',()=>done++); assert.equal(done,1);
});

const calendar = require('../launcher/calendar.js');
test('lunar calendar matches known Vietnamese dates', () => {
  for (const [year, solar] of [[2024,[10,2,2024]],[2025,[29,1,2025]],[2026,[17,2,2026]],[2027,[6,2,2027]],[2033,[31,1,2033]]]) {
    assert.deepEqual(calendar.fromLunar(1,1,year),solar,'Tết '+year);
    assert.deepEqual(calendar.toLunar(...solar),{day:1,month:1,year,leap:false});
  }
  assert.deepEqual(calendar.fromLunar(15,8,2026),[25,9,2026]); // Trung thu
  assert.deepEqual(calendar.toLunar(27,10,2026),{day:18,month:9,year:2026,leap:false});
});
test('countdown lists the nearest events soonest first, today included, across the year end', () => {
  assert.deepEqual(calendar.countdowns(new Date(2026,9,27),[],3),['Halloween còn 4 ngày','Ngày Nhà giáo còn 24 ngày','Giáng sinh còn 59 ngày']);
  assert.deepEqual(calendar.countdowns(new Date(2026,11,31),[],2),['Năm mới 2027 vào ngày mai','Ông Công Ông Táo còn 30 ngày']);
  assert.equal(calendar.countdowns(new Date(2026,9,31),[],1)[0],'Hôm nay: Halloween');
  const own=[{name:'Sinh nhật Bi',month:10,day:29},{name:'x'.repeat(41),month:10,day:28},{name:'bad',month:13,day:1}];
  assert.deepEqual(calendar.countdowns(new Date(2026,9,27),own,2),['Sinh nhật Bi còn 2 ngày','Halloween còn 4 ngày']);
  const lunarOwn=[{name:'Giỗ ông',month:9,day:20,lunar:true}];
  assert.equal(calendar.countdowns(new Date(2026,9,27),lunarOwn,1)[0],'Giỗ ông còn 2 ngày');
});
test('greeting follows the time of day and the configured family name', () => {
  assert.deepEqual(calendar.greeting(new Date(2026,9,27,7),'nhà An Bình'),{text:'Chào buổi sáng, nhà An Bình',period:'morning'});
  assert.equal(calendar.greeting(new Date(2026,9,27,20,7)).text,'Chào buổi tối');
  assert.equal(calendar.greeting(new Date(2026,9,27,23)).period,'night');
});
test('library lists visible installed apps by Vietnamese name, without the launcher or Samsung Home', () => {
  const list = [
    {id: 'ZTpEFWgfa9.FPTPlay', name: 'FPT Play', show: true}, {id: 'b.Dan', name: 'Đàn'}, {id: 'a.An', name: 'an'},
    {id: 'sys.Hidden', name: 'Hidden', show: false}, {id: 'CyTizen001.Home', name: 'Launcher'},
    {id: 'CyTizen001.Service', name: 'Service'}, {id: 'com.samsung.tv.csfs', name: 'Samsung Home'},
    {id: 'a.An', name: 'Duplicate'}, {id: 'bad;id', name: 'Bad'}, {id: 7}, null, {name: 'No id'}];
  const apps = core.libraryApps(list, {package: 'CyTizen001', ids: ['com.samsung.tv.csfs', null]});
  assert.deepEqual(apps.map((app) => app.id), ['a.An', 'b.Dan', 'ZTpEFWgfa9.FPTPlay']);
  assert.deepEqual(core.libraryApps(undefined, null), []);
  assert.deepEqual(core.libraryApps([{id: 'x.App', name: '  '}], {}), [{id: 'x.App', name: 'x.App', icon: null}]);
  assert.equal(core.libraryApps([{id: 'x.App', name: 'n'.repeat(90)}], {})[0].name.length, 40);
});
test('library icons are local image paths only', () => {
  const icon = (iconPath) => core.libraryApps([{id: 'x.App', name: 'X', iconPath}], {})[0].icon;
  assert.equal(icon('/opt/usr/apps/x/shared/res/icon.png'), '/opt/usr/apps/x/shared/res/icon.png');
  assert.equal(icon('file:///opt/usr/globalapps/x/icon.PNG'), 'file:///opt/usr/globalapps/x/icon.PNG');
  for (const bad of ['http://evil/x.png', 'javascript:alert(1)//.png', '/opt/../etc/x.png', '/a b.png', '/x.png")', '/x.svg', 'icon.png', 5, null]) {
    assert.equal(icon(bad), null, String(bad));
  }
});
test('dock apps come from the TV-saved list when valid, else from the build defaults', () => {
  const defaults = [{id: 'a.App', name: 'A'}];
  assert.equal(core.dockApps(defaults, null), defaults);
  assert.equal(core.dockApps(defaults, {}), defaults);
  assert.deepEqual(core.dockApps(defaults, []), []);
  assert.deepEqual(core.dockApps(defaults, [{id: 'b.App', name: ' B '}, {id: 'b.App', name: 'again'}, {id: 'bad;x'}, null, {id: 'c.App'}]),
    [{id: 'b.App', name: 'B'}, {id: 'c.App', name: 'c.App'}]);
  const many = Array.from({length: 20}, (_, n) => ({id: 'p.App' + n, name: 'P' + n}));
  assert.equal(core.dockApps(defaults, many).length, core.DOCK_MAX);
});
test('pinning adds at the end, unpinning removes, and a full dock refuses', () => {
  let state = core.togglePin([{id: 'a.App', name: 'A'}], {id: 'b.App', name: 'B', icon: '/x.png'});
  assert.deepEqual(state, {list: [{id: 'a.App', name: 'A'}, {id: 'b.App', name: 'B'}], pinned: true, full: false});
  state = core.togglePin(state.list, {id: 'a.App', name: 'A'});
  assert.deepEqual(state.list, [{id: 'b.App', name: 'B'}]); assert.equal(state.pinned, false);
  const full = Array.from({length: core.DOCK_MAX}, (_, n) => ({id: 'p.App' + n, name: 'P' + n}));
  const refused = core.togglePin(full, {id: 'new.App', name: 'New'});
  assert.equal(refused.full, true); assert.equal(refused.list, full);
  assert.equal(core.togglePin(full, {id: 'p.App0', name: 'P0'}).list.length, core.DOCK_MAX - 1);
  assert.equal(core.togglePin(undefined, {id: 'a.App', name: 'A'}).list.length, 1);
});
test('library opens apps through the guard-aware path, falls back when the TV refuses, and Back leaves edit mode first', () => {
  const app = fs.readFileSync(path.join(__dirname, '../launcher/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../launcher/index.html'), 'utf8');
  assert.ok(html.includes('id="library"') && html.includes('id="library-grid"') && html.includes('id="library-edit"'));
  assert.match(app, /if \(!editing\) \{ closeLibrary\(\); openShortcut\(app\.id\); return; \}/);
  assert.match(app, /tv\.application\.getAppsInfo\(function \(list\) \{ done\(core\.libraryApps\(list, exclude\)\); \}, fallback\)/);
  assert.match(app, /ids: \[config\.samsungHome, config\.appId\]/);
  assert.match(app, /function libraryBack\(\) \{\s*if \(editing\) \{ editing = false;/);
  assert.ok(app.indexOf('else if (picking) pickerBack()') < app.indexOf('else if (libraryOpen) libraryBack()'));
  assert.ok(app.indexOf('else if (libraryOpen) libraryBack()') < app.indexOf('else if (!panel.hidden) closePanel()'));
  assert.match(app, /localStorage\.setItem\('cyt-dock-apps', JSON\.stringify\(dockList\)\)/);
  // A pin also saves the order, so the tile keeps its place after a restart.
  assert.match(app, /tiles = core\.orderApps\(dockList\.concat\(inputs\), order\);\s*\/\/[^\n]*\n\s*try \{ localStorage\.setItem\('cyt-order'/);
  assert.ok(!app.includes('innerHTML'));
  assert.ok(!/style\.backgroundImage = 'url\("' \+ app\.icon/.test(app)); // icons go through img.src, never CSS
});
test('the arrange panel offers one step up and straight to the front as separate buttons', () => {
  const app = fs.readFileSync(path.join(__dirname, '../launcher/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../launcher/index.html'), 'utf8');
  assert.match(html, /Lên 1 bậc/);
  assert.match(html, /Lên đầu/);
  assert.match(app, /arrangeTo\(index, Math\.max\(0, index - 1\), 'up'\)/);
  assert.match(app, /arrangeTo\(index, 0, 'top'\)/);
  assert.match(app, /tiles = core\.moveItem\(tiles, index, to\)/);
  assert.match(app, /function saveOrder\(\) \{\s*try \{ localStorage\.setItem\('cyt-order'/);
  // The panel is navigated as rows: Xong, then the two actions of each app side by side.
  assert.match(app, /panelRows\.push\(Array\.prototype\.slice\.call\(line\.querySelectorAll\('button'\)\)\)/);
  assert.ok(!app.includes("'  ↑'"));
});
test('the preview-only library list is not shipped: build writes its own config.js', () => {
  const cli = fs.readFileSync(path.join(__dirname, '../cyt/cli.py'), 'utf8');
  assert.match(cli, /\(destination \/ 'config\.js'\)\.write_text\('window\.CYT_CONFIG = '/);
});

test('focus motion lifts tiles without a ring and animates only transform and opacity', () => {
  const css = fs.readFileSync(path.join(__dirname, '../launcher/style.css'), 'utf8');
  const focus = css.match(/\.app-tile:focus,\.lib-tile:focus,\.thumb:focus\{([^}]*)\}/);
  assert.ok(focus, 'shared focus rule');
  assert.match(focus[1], /transform:translateY\(-12px\) scale\(1\.08\)/);
  assert.ok(!/0 0 0 [45]px rgba\(255,255,255,\.95\)/.test(css), 'the thick white focus ring is gone');
  for (const frames of css.matchAll(/@keyframes [a-z-]+\{(.*?)\}\}/g)) {
    const props = [...frames[1].matchAll(/([a-z-]+):/g)].map((m) => m[1]).filter((p) => p !== '-webkit-transform');
    assert.ok(props.every((p) => p === 'transform' || p === 'opacity'), frames[0].slice(0, 40));
  }
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\*,\*::after\{transition:none!important;-webkit-animation:none!important;animation:none!important\}\}/);
  // No CSS newer than the Tizen 6.5 browser: individual transform properties and `inset` are avoided.
  assert.ok(!/[;{](translate|scale|rotate|inset):/.test(css));
});
test('an edge press nudges toward the key; every D-pad branch goes through moveFocus', () => {
  assert.deepEqual(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].map(core.nudgeClass),
    ['nudge-left', 'nudge-right', 'nudge-up', 'nudge-down']);
  assert.equal(core.nudgeClass('Enter'), null); assert.equal(core.nudgeClass('__proto__'), null);
  const app = fs.readFileSync(path.join(__dirname, '../launcher/app.js'), 'utf8');
  // Five call sites: picker, library, menu, arrange panel and the home grid.
  assert.equal(app.split('moveFocus(').length - 1 - app.split('function moveFocus(').length + 1, 5);
  assert.ok(!/\]\[[a-z]+\.col\]\.focus\(\)/.test(app), 'no grid branch focuses directly');
  const css = fs.readFileSync(path.join(__dirname, '../launcher/style.css'), 'utf8');
  for (const dir of ['left', 'right', 'up', 'down']) {
    assert.ok(css.includes('.nudge-' + dir + '{animation:flat-' + dir) && css.includes('@keyframes lift-' + dir), dir);
  }
});
test('preview server serves only top-level launcher page files, never config dirs or traversal', () => {
  const src = fs.readFileSync(path.join(__dirname, '../tools/preview.cjs'), 'utf8');
  const allowed = new RegExp(src.match(/const allowedName = \/(.*)\/;/)[1]);
  for (const ok of ['index.html', 'app.js', 'style.css', 'icon.png', 'screen-saver.js']) assert.ok(allowed.test(ok), ok);
  for (const bad of ['../cyt/cli.py', '.local/launcher.json', 'service/config.json', 'wallpapers/a.jpg', '.env', 'a.json', 'App.js', '%2e%2e/x.js']) {
    assert.ok(!allowed.test(bad), bad);
  }
  assert.match(src, /listen\(port, '127\.0\.0\.1'/); // loopback only, whatever the port
});
