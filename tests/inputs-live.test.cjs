const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const live = require('../launcher/inputs-live.js');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// ---- Pure functions ----
test('preview rect scales the tile box to 1920x1080 TV pixels as rounded px strings', () => {
  assert.deepEqual(live.previewRect({left: 1340.7, top: 753.6, width: 243.15, height: 226.8}, 1920), ['1341px', '754px', '243px', '226px']);
  // A 960-wide viewport doubles every value.
  assert.deepEqual(live.previewRect({left: 100, top: 50.25, width: 120, height: 90}, 960), ['200px', '101px', '240px', '180px']);
  // Clamped to the screen; a bad innerWidth falls back to 1:1.
  assert.deepEqual(live.previewRect({left: -10, top: 1000, width: 100, height: 200}, 1920), ['0px', '1000px', '90px', '80px']);
  assert.deepEqual(live.previewRect({left: 10, top: 10, width: 20, height: 20}, 0), ['10px', '10px', '20px', '20px']);
  for (const bad of [null, {}, {left: 0, top: 0, width: NaN, height: 10}, {left: 0, top: 0, width: 0, height: 10}, {left: 5000, top: 0, width: 10, height: 10}]) {
    assert.equal(live.previewRect(bad, 1920), null);
  }
});
test('rect box maps the TV rect back to CSS px', () => {
  assert.deepEqual(live.rectBox(['200px', '100px', '240px', '180px'], 960), {left: 100, top: 50, width: 120, height: 90});
  assert.equal(live.rectBox(['1px', '2px'], 1920), null);
  assert.equal(live.rectBox(['a', '2px', '3px', '4px'], 1920), null);
});
function polygonPoints(value) {
  const match = value.match(/^polygon\(evenodd, (.*)\)$/);
  assert.ok(match, value.slice(0, 40));
  return match[1].split(', ').map((pair) => pair.split(' ').map((n) => { assert.match(n, /^-?\d+(\.\d+)?px$/); return parseFloat(n); }));
}
function signedArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i += 1) sum += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  return sum / 2;
}
test('hole polygon: the viewport, then the tile wound the other way (a hole under evenodd and nonzero)', () => {
  const square = live.holePolygon({left: 10, top: 20, width: 100, height: 50}, {width: 1920, height: 1080});
  assert.equal(square, 'polygon(evenodd, 0px 0px, 1920px 0px, 1920px 1080px, 0px 1080px, 0px 0px, ' +
    '10px 20px, 10px 70px, 110px 70px, 110px 20px, 10px 20px)');
  const round = polygonPoints(live.holePolygon({left: 1341, top: 754, width: 243, height: 226, radius: 28}, {width: 1920, height: 1080}, 6));
  const outer = round.slice(0, 5), inner = round.slice(5);
  assert.equal(inner.length, 4 * 7 + 1);
  assert.deepEqual(inner[0], inner[inner.length - 1]);
  assert.ok(inner.every(([x, y]) => x >= 1341 - 0.01 && x <= 1584.01 && y >= 754 - 0.01 && y <= 980.01));
  assert.ok(Math.sign(signedArea(outer)) === -Math.sign(signedArea(inner)), 'inner contour is counter-wound');
  // A radius larger than the box is capped at half its size.
  const pill = polygonPoints(live.holePolygon({left: 0, top: 0, width: 40, height: 20, radius: 99}, {width: 100, height: 100}, 2));
  assert.ok(pill.slice(5).every(([x, y]) => x >= -0.01 && x <= 40.01 && y >= -0.01 && y <= 20.01));
});
test('preview is opt-in per input: only `preview: true` on the first dock entry for that source', () => {
  assert.equal(live.previewEnabled([{type: 'HDMI', number: 4, dock: true}], 'HDMI:4'), false);
  assert.equal(live.previewEnabled([{type: 'HDMI', number: 4, dock: true, preview: true}], 'HDMI:4'), true);
  assert.equal(live.previewEnabled([{type: 'HDMI', number: 4, dock: true, preview: 'yes'}], 'HDMI:4'), false);
  assert.equal(live.previewEnabled([{type: 'HDMI', number: 4, preview: true}], 'HDMI:4'), false); // not on the dock
  assert.equal(live.previewEnabled([{type: 'HDMI', number: 4, dock: true}, {type: 'HDMI', number: 4, dock: true, preview: true}], 'HDMI:4'), false);
  assert.equal(live.previewEnabled([{type: 'HDMI', number: 3, dock: true, preview: true}], 'HDMI:4'), false);
  assert.equal(live.previewEnabled(undefined, 'HDMI:4'), false);
  assert.equal(live.previewEnabled([null, 'x'], 'HDMI:4'), false);
});
test('a preview needs a connected opted-in input and nothing else on screen', () => {
  const tile = {id: 'input:HDMI:4', kind: 'input', key: 'HDMI:4', connected: true, choice: {source: {type: 'HDMI', number: 4}}};
  const calm = {enabled: true, menu: false, picking: false, library: false, panel: false, video: false, hidden: false};
  assert.equal(live.shouldPreview(tile, calm), true);
  for (const key of ['menu', 'picking', 'library', 'panel', 'video', 'hidden']) assert.equal(live.shouldPreview(tile, {...calm, [key]: true}), false, key);
  assert.equal(live.shouldPreview(tile, {...calm, enabled: false}), false);
  assert.equal(live.shouldPreview(tile, undefined), false);
  for (const connected of [false, null, 'true']) assert.equal(live.shouldPreview({...tile, connected}, calm), false);
  assert.equal(live.shouldPreview({...tile, choice: null}, calm), false);
  assert.equal(live.shouldPreview({...tile, kind: 'app'}, calm), false);
  assert.equal(live.shouldPreview(null, calm), false);
});
test('ready transitions: only false -> true, never on the first read, unknown keeps the last known state', () => {
  const tile = (id, connected) => ({id, kind: 'input', connected});
  assert.deepEqual(live.readyTransitions({a: false}, [tile('a', true)], true), []);
  assert.deepEqual(live.readyTransitions({a: false, b: true}, [tile('a', true), tile('b', true)], false).map((t) => t.id), ['a']);
  assert.deepEqual(live.readyTransitions({}, [tile('a', true)], false), []); // never seen before
  assert.deepEqual(live.readyTransitions({a: null}, [tile('a', true)], false), []);
  assert.deepEqual(live.readyTransitions({a: false}, [tile('a', null)], false), []);
  assert.deepEqual(live.readyTransitions({a: false}, [{id: 'a', kind: 'app', connected: true}], false), []);
  assert.deepEqual(live.readyTransitions(undefined, undefined, false), []);
  let states = live.nextStates(undefined, [tile('a', false), tile('b', null)]);
  assert.deepEqual({...states}, {a: false});
  states = live.nextStates(states, [tile('a', null)]); // a failed read in between
  assert.deepEqual({...states}, {a: false});
  assert.deepEqual(live.readyTransitions(states, [tile('a', true)], false).map((t) => t.id), ['a']);
  assert.deepEqual({...live.nextStates(states, [tile('a', true)])}, {a: true});
  assert.equal(live.nextStates({__proto__: null}, [tile('__proto__', false)])['__proto__'], false);
});

// ---- Controller, with a minimal fake DOM and mocked timers ----
function fakeElement(doc, tag) {
  const classes = new Set();
  let text = '';
  const node = {
    tagName: tag, children: [], parentNode: null, hidden: false, offsetWidth: 225, attrs: {},
    classList: {add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c)},
    style: {setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; }},
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(child) { child.parentNode = node; node.children.push(child); return child; },
    insertBefore(child) { child.parentNode = node; node.children.unshift(child); return child; },
    get firstChild() { return node.children[0] || null; },
    get textContent() { return text + node.children.map((c) => c.textContent).join(''); },
    set textContent(value) { text = value; node.children = []; },
    get className() { return [...classes].join(' '); },
    set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    focus() { if (doc.activeElement === node) return; const old = doc.activeElement; doc.activeElement = node; if (old && old.onblur) old.onblur(); if (node.onfocus) node.onfocus(); },
    getBoundingClientRect() { return {left: 1340.7, top: 753.6, width: 243.15, height: 226.8}; }
  };
  return node;
}
function setup(t, options = {}) {
  t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: 1_000_000});
  const listeners = {keydown: [], resize: []};
  const doc = {hidden: false, activeElement: null, addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }};
  doc.createElement = (tag) => fakeElement(doc, tag);
  doc.body = fakeElement(doc, 'body'); doc.documentElement = fakeElement(doc, 'html');
  const host = fakeElement(doc, 'section'); doc.querySelector = () => host;
  const win = {innerWidth: 1920, innerHeight: 1080, addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    getComputedStyle: () => ({borderTopLeftRadius: '26px', backgroundImage: 'url("wallpapers/a.jpg")', backgroundSize: 'cover',
      backgroundPosition: '50% 50%', backgroundRepeat: 'repeat', backgroundColor: 'rgb(11, 16, 32)'})};
  const calls = [], pending = [];
  const tv = {
    systeminfo: {},
    tvwindow: {
      setSource(source, ok, fail) { calls.push('setSource'); pending.push({ok, fail}); },
      show(ok, fail, rect, type) { calls.push('show ' + rect.join(',') + ' ' + type); pending.push({ok, fail}); },
      hide(ok, fail, type) { calls.push('hide ' + type); }
    }
  };
  const tile = {id: 'input:HDMI:4', kind: 'input', key: 'HDMI:4', title: 'HDMI 4', name: 'PlayStation 4',
    connected: options.connected === undefined ? true : options.connected, choice: {source: {type: 'HDMI', number: 4}}};
  const button = fakeElement(doc, 'button'), other = fakeElement(doc, 'button');
  const dock = fakeElement(doc, 'section'); dock.appendChild(button); dock.appendChild(other);
  const state = {menu: false, picking: false, library: false, panel: false, video: false};
  const reads = [];
  let controller;
  controller = live.create({
    document: doc, window: win, tv, inputs: [{type: 'HDMI', number: 4, dock: true, preview: options.preview !== false}],
    tiles: () => [tile, {id: 'a.App', name: 'A'}], button: (id) => (id === tile.id ? button : null), state: () => state,
    readSources: (done) => reads.push(done), refreshInputs: () => controller.refreshed(),
    moveFocus: (target) => target.focus(), glyph: (kind) => { const g = fakeElement(doc, 'svg'); g.kind = kind; return g; },
    deviceStyle: (name) => (/playstation/i.test(name) ? 'console playstation' : 'device')
  });
  button.onfocus = () => controller.focus(tile, button); button.onblur = () => controller.blur(button);
  const key = (name) => listeners.keydown.forEach((fn) => fn({key: name, keyCode: name === 'Enter' ? 13 : 0}));
  const settle = () => { while (pending.length) pending.shift().ok(); };
  const banner = () => host.children.find((c) => c.className.includes('ready-banner'));
  return {doc, win, tv, tile, button, other, state, calls, pending, reads, controller, key, settle, banner, host,
    tick: (ms) => t.mock.timers.tick(ms)};
}
const isOpen = (env) => env.doc.body.classList.contains('previewing') && env.doc.documentElement.classList.contains('previewing');

test('after a 900 ms dwell the preview switches the source and shows the TV window at the tile', (t) => {
  const env = setup(t);
  env.button.focus(); env.tick(899);
  assert.deepEqual(env.calls, []);
  env.tick(1);
  assert.deepEqual(env.calls, ['setSource']);
  assert.equal(isOpen(env), false, 'the page stays opaque until the window is shown');
  env.pending.shift().ok();
  assert.deepEqual(env.calls, ['setSource', 'show 1341px,754px,243px,226px MAIN']);
  assert.equal(isOpen(env), false);
  env.pending.shift().ok();
  assert.ok(isOpen(env) && env.button.classList.contains('live'));
  assert.match(env.doc.body.style['--cyt-hole'], /^polygon\(evenodd, 0px 0px, 1920px 0px/);
  const backdrop = env.doc.body.firstChild;
  assert.equal(backdrop.className, 'live-backdrop');
  assert.equal(backdrop.style.backgroundImage, 'url("wallpapers/a.jpg")');
  assert.equal(env.controller.previewing(), true);
});
test('focus leaving, any D-pad key, a menu or a hidden page restore the page at once and hide the window', (t) => {
  const env = setup(t);
  const startPreview = () => { env.button.focus(); env.tick(900); env.settle(); assert.ok(isOpen(env)); env.calls.length = 0; };
  startPreview();
  env.other.focus();
  assert.ok(!isOpen(env) && !env.button.classList.contains('live') && env.doc.body.style['--cyt-hole'] === undefined);
  assert.deepEqual(env.calls, ['hide MAIN']);
  startPreview();
  env.key('ArrowRight'); // an edge press: focus stays, the preview stops and re-arms
  assert.ok(!isOpen(env)); assert.deepEqual(env.calls, ['hide MAIN']);
  env.tick(1); env.tick(900); env.settle();
  assert.ok(isOpen(env), 'the dwell restarts while focus stays on the tile');
  env.calls.length = 0;
  env.controller.stop(); // setMenuOpen(name) calls this
  assert.ok(!isOpen(env)); assert.deepEqual(env.calls, ['hide MAIN']);
  env.other.focus(); env.button.focus(); env.tick(900); env.settle(); env.calls.length = 0;
  assert.ok(isOpen(env));
  env.doc.hidden = true; env.controller.visibility(false);
  assert.ok(!isOpen(env)); assert.deepEqual(env.calls, ['hide MAIN']);
});
test('a preview never starts while something else is open, the tile is not connected, or preview is off', (t) => {
  for (const flag of ['menu', 'picking', 'library', 'panel', 'video']) {
    const env = setup(t);
    env.state[flag] = true; env.button.focus(); env.tick(1000);
    assert.deepEqual(env.calls, [], flag);
    t.mock.timers.reset();
  }
  let env = setup(t, {connected: false}); env.button.focus(); env.tick(1000); assert.deepEqual(env.calls, []); t.mock.timers.reset();
  env = setup(t, {preview: false}); env.button.focus(); env.tick(1000); assert.deepEqual(env.calls, []); t.mock.timers.reset();
  env = setup(t); env.doc.hidden = true; env.button.focus(); env.tick(1000); assert.deepEqual(env.calls, []);
});
test('late TV callbacks after a stop never leave the page transparent', (t) => {
  const env = setup(t);
  env.button.focus(); env.tick(900);
  env.other.focus(); // stop while setSource is pending
  env.pending.shift().ok();
  assert.deepEqual(env.calls, ['setSource'], 'no show after a stop during the switch, and nothing to hide');
  env.button.focus(); env.tick(900); env.pending.shift().ok(); // show pending now
  env.other.focus();
  assert.deepEqual(env.calls.slice(-1), ['hide MAIN']);
  env.pending.shift().ok(); // the show lands late
  assert.ok(!isOpen(env));
  assert.deepEqual(env.calls.slice(-2), ['hide MAIN', 'hide MAIN']);
});
test('an error callback stops the preview and that input is not retried for a minute', (t) => {
  const env = setup(t);
  env.button.focus(); env.tick(900); env.pending.shift().ok(); env.pending.shift().fail();
  assert.ok(!isOpen(env));
  env.other.focus(); env.button.focus(); env.tick(900);
  assert.equal(env.calls.filter((c) => c === 'setSource').length, 1);
  env.tick(60_000); env.other.focus(); env.button.focus(); env.tick(900);
  assert.equal(env.calls.filter((c) => c === 'setSource').length, 2);
});
test('OK on a live tile hands the TV window to full screen without hiding it; Back re-arms the dwell', (t) => {
  const env = setup(t);
  env.button.focus(); env.tick(900); env.settle(); env.calls.length = 0;
  env.key('Enter');
  assert.ok(isOpen(env), 'OK alone does not stop the preview');
  env.controller.switching(); // selectSource
  assert.ok(!isOpen(env) && !env.button.classList.contains('live'));
  assert.deepEqual(env.calls, [], 'no hide that could land after the full-screen show');
  env.state.video = true; env.tick(5000);
  assert.deepEqual(env.calls, []);
  env.state.video = false; env.controller.videoClosed();
  env.tick(900); env.settle();
  assert.ok(isOpen(env), 'preview restarts after the dwell once video is closed');
});
test('a refresh keeps the live class that drawInput resets, and a lost signal stops the preview', (t) => {
  const env = setup(t);
  env.button.focus(); env.tick(900); env.settle();
  env.button.className = 'app-tile input-tile console playstation';
  env.controller.refreshed();
  assert.ok(env.button.classList.contains('live'));
  env.tile.connected = false; env.controller.refreshed();
  assert.ok(!isOpen(env) && env.calls.includes('hide MAIN'));
});
test('device ready: banner on false -> true, focus moves only after 10 s without a key, never on the first read', (t) => {
  const env = setup(t, {connected: true, preview: false});
  env.other.focus();
  env.controller.refreshed(); // first read: baseline
  assert.equal(env.banner(), undefined);
  env.tile.connected = false; env.controller.refreshed();
  env.tick(10_000);
  env.tile.connected = true; env.controller.refreshed();
  const banner = env.banner();
  assert.ok(banner && !banner.hidden && banner.classList.contains('show'));
  assert.equal(banner.textContent, 'PlayStation 4 đã sẵn sàng');
  assert.equal(banner.children[0].kind, 'console');
  assert.equal(banner.attrs.role, 'status');
  assert.equal(env.doc.activeElement, env.button, 'idle remote: focus jumps to the tile');
  env.tick(8000);
  assert.ok(!banner.classList.contains('show'));
  env.tick(400); assert.equal(banner.hidden, true);
});
test('device ready never steals focus from an active viewer and stays quiet around our own switches', (t) => {
  const env = setup(t, {connected: false, preview: false});
  env.other.focus(); env.controller.refreshed();
  env.tick(20_000); env.key('ArrowLeft');
  env.tile.connected = true; env.controller.refreshed();
  assert.ok(env.banner().classList.contains('show'));
  assert.equal(env.doc.activeElement, env.other);
  // Our own setSource: the next change is ignored, though states keep up.
  env.tile.connected = false; env.controller.refreshed(); env.tick(9000);
  env.controller.switching();
  env.tile.connected = true; env.tick(9000); env.controller.refreshed();
  env.tick(9000);
  assert.ok(!env.banner().classList.contains('show'));
  // During video too.
  env.tile.connected = false; env.controller.refreshed(); env.tick(11_000);
  env.state.video = true; env.tile.connected = true; env.controller.refreshed();
  assert.ok(!env.banner().classList.contains('show'));
  // And the first read after resume only sets the baseline.
  env.state.video = false; env.tile.connected = false; env.controller.refreshed();
  env.doc.hidden = true; env.controller.visibility(false); env.doc.hidden = false; env.controller.visibility(true);
  env.tile.connected = true; env.controller.refreshed();
  assert.ok(!env.banner().classList.contains('show'));
});
test('polling re-reads the sources every 5 s while visible, pauses during video and stops when hidden', (t) => {
  const env = setup(t);
  env.tick(4999); assert.equal(env.reads.length, 0);
  env.tick(1); assert.equal(env.reads.length, 1);
  env.tick(5000); assert.equal(env.reads.length, 2);
  env.state.video = true; env.tick(5000); assert.equal(env.reads.length, 2);
  env.state.video = false; env.tick(5000); assert.equal(env.reads.length, 3);
  env.doc.hidden = true; env.controller.visibility(false); env.tick(20_000); assert.equal(env.reads.length, 3);
  env.doc.hidden = false; env.controller.visibility(true); env.tick(5000); assert.equal(env.reads.length, 4);
});

// ---- Source rules ----
test('inputs-live.js is ES5, never touches Home/Power, audio or innerHTML, and is loaded before app.js', () => {
  const source = read('launcher/inputs-live.js');
  const code = source.replace(/\/\/[^\n]*/g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  for (const modern of [/=>/, /\blet\s/, /\bconst\s/, /`/, /\bclass\s/, /\.\.\./]) assert.ok(!modern.test(code), String(modern));
  for (const banned of ['registerKey(', '10252', 'innerHTML', 'setMute', 'setVolume', 'preventDefault', 'setInterval(']) {
    assert.ok(!source.includes(banned), banned);
  }
  const html = read('launcher/index.html');
  assert.ok(html.indexOf('<script src="inputs-live.js"></script>') > html.indexOf('<script src="core.js"></script>'));
  assert.ok(html.indexOf('<script src="inputs-live.js"></script>') < html.indexOf('<script src="app.js"></script>'));
  // The preview is opt-in: the shipped preview config does not enable it.
  assert.ok(!read('launcher/config.js').includes('preview: true'));
});
test('app.js hooks: tile focus/blur, refresh, menus, full-screen switch, Back and visibility', () => {
  const app = read('launcher/app.js');
  assert.match(app, /var live = window\.CytInputsLive\.create\(\{/);
  assert.match(app, /source\.addEventListener\('focus', function \(\) \{ live\.focus\(app, source\); \}\);/);
  assert.match(app, /source\.addEventListener\('blur', function \(\) \{ live\.blur\(source\); \}\);/);
  assert.match(app, /if \(button\) drawInput\(tile, button\);\s*\}\);\s*live\.refreshed\(\);/);
  assert.match(app, /function setMenuOpen\(name\) \{\s*if \(name\) live\.stop\(\);/);
  assert.match(app, /function selectSource\(choice, returnTo\) \{\s*live\.switching\(\);/);
  assert.match(app, /back\.focus\(\); live\.videoClosed\(\);/);
  // Other features' visibility hooks (e.g. ambient.visible) may come first; live.visibility must follow them directly.
  assert.match(app, /addEventListener\('visibilitychange', function \(\) \{(\s*[a-z]+\.visible\(!document\.hidden\);)*\s*live\.visibility\(!document\.hidden\);/);
  assert.match(app, /state: function \(\) \{ return \{menu: !!openMenu, picking: picking, library: libraryOpen, panel: !panel\.hidden, video: videoOn\}; \}/);
});
test('live inputs CSS: one block before the narrow-screen rule; transparency only while previewing', () => {
  const css = read('launcher/style.css');
  const block = css.indexOf('/* ---- Live inputs ----');
  assert.ok(block > 0 && block < css.indexOf('@media(max-width:1500px){main{'));
  assert.ok(css.includes('html.previewing,html.previewing body,body.previewing{background:transparent!important}'));
  assert.match(css, /\.live-backdrop\{display:none;[^}]*clip-path:var\(--cyt-hole\)\}/);
  assert.ok(css.includes('body.previewing .live-backdrop{display:block}'));
  assert.ok(css.includes('body.previewing::before{-webkit-clip-path:var(--cyt-hole);clip-path:var(--cyt-hole)}'));
  assert.match(css, /\.input-tile\.live\{background:transparent/);
});
