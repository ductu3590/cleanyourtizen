const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ambient = require('../launcher/ambient.js');
const core = require('../launcher/core.js');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// ---- Screensaver: pure parts ----
test('screensaver delay: default 5 minutes, 0 turns it off, other values clamp to 1-60 minutes', () => {
  assert.equal(ambient.screensaverDelay({}), 5 * 60000);
  assert.equal(ambient.screensaverDelay(undefined), 5 * 60000);
  assert.equal(ambient.screensaverDelay({screensaverMinutes: 0}), 0);
  assert.equal(ambient.screensaverDelay({screensaverMinutes: 12}), 12 * 60000);
  assert.equal(ambient.screensaverDelay({screensaverMinutes: 0.2}), 60000);
  assert.equal(ambient.screensaverDelay({screensaverMinutes: -4}), 60000);
  assert.equal(ambient.screensaverDelay({screensaverMinutes: 600}), 60 * 60000);
  for (const bad of ['10', null, NaN, Infinity, {}, true]) {
    assert.equal(ambient.screensaverDelay({screensaverMinutes: bad}), 5 * 60000, String(bad));
  }
});
test('screensaver slides are the safe wallpaper names, with the same URLs as the home wallpaper', () => {
  const names = ['a.jpg', '../x.jpg', 'b.png', 'a.jpg', 7, 'x.svg'];
  const slides = ambient.slideList(names);
  assert.deepEqual(slides, ['wallpapers/a.jpg', 'wallpapers/b.png']);
  for (const name of ['a.jpg', 'b.png']) assert.ok(slides.includes(core.wallpaperFor(names, new Date(), name)));
  assert.deepEqual(ambient.slideList(undefined), []);
});
test('next slide wraps and tolerates bad indexes; an empty list has no slide', () => {
  assert.equal(ambient.nextSlide(['a', 'b', 'c'], 0), 1);
  assert.equal(ambient.nextSlide(['a', 'b', 'c'], 2), 0);
  assert.equal(ambient.nextSlide(['a'], 0), 0);
  assert.equal(ambient.nextSlide(['a', 'b'], 9), 0);
  assert.equal(ambient.nextSlide(['a', 'b'], -1), 0);
  assert.equal(ambient.nextSlide(['a', 'b'], 0.5), 0);
  assert.equal(ambient.nextSlide([], 0), -1);
  assert.equal(ambient.nextSlide(undefined, 0), -1);
});
test('Ken Burns moves alternate direction and run 40 s from scale(1) to scale(1.08) with a pan', () => {
  const classes = [0, 1, 2, 3, 4].map(ambient.kenBurnsClass);
  assert.equal(new Set(classes.slice(0, 4)).size, 4);
  assert.equal(classes[4], classes[0]);
  for (let n = 0; n < 4; n += 1) assert.notEqual(ambient.kenBurnsClass(n), ambient.kenBurnsClass(n + 1));
  assert.equal(ambient.kenBurnsClass(-1), 'kb-d');
  assert.equal(ambient.kenBurnsClass('x'), 'kb-a');
  const css = read('launcher/style.css');
  const pans = new Set();
  for (const name of new Set(classes)) {
    assert.ok(css.includes('.' + name + '{animation:' + name + ' 40s linear both}'), name);
    const frames = css.match(new RegExp('@keyframes ' + name + '\\{0%\\{transform:scale\\(1\\)\\}100%\\{transform:scale\\(1\\.08\\) (translate\\([^)]*\\))\\}\\}'));
    assert.ok(frames, name); pans.add(frames[1]);
  }
  assert.equal(pans.size, 4);
  assert.equal(ambient.SLIDE_MS, 40000);
});
test('the saver clock shows HH:MM and walks the four corners', () => {
  assert.equal(ambient.clockText(new Date(2026, 10, 3, 7, 5)), '07:05');
  assert.equal(ambient.clockText(new Date(2026, 10, 3, 23, 59)), '23:59');
  assert.deepEqual([0, 1, 2, 3].map(ambient.nextCorner), [1, 2, 3, 0]);
  assert.equal(ambient.nextCorner(undefined), 0);
  assert.equal(ambient.nextCorner(7), 0);
});

// ---- Night mode: pure parts ----
const at = (h, m) => new Date(2026, 10, 3, h, m || 0);
test('night mode: the default 22-6 range wraps midnight', () => {
  const night = ambient.nightConfig(undefined);
  assert.deepEqual(night, {from: 22, to: 6});
  assert.deepEqual([[21, 59], [22, 0], [23, 30], [0, 0], [3, 0], [5, 59], [6, 0], [12, 0]].map(([h, m]) => ambient.isNight(at(h, m), night, 'auto')),
    [false, true, true, true, true, true, false, false]);
  assert.equal(ambient.isNight(at(23), undefined, 'auto'), true); // raw config values are accepted too
});
test('night mode: a range that does not wrap, and equal hours never match', () => {
  const night = {from: 1, to: 5};
  assert.deepEqual([0, 1, 4, 5, 23].map((h) => ambient.isNight(at(h), night, 'auto')), [false, true, true, false, false]);
  assert.equal(ambient.isNight(at(5), {from: 5, to: 5}, 'auto'), false);
  assert.equal(ambient.isNight(at(0), {from: 0, to: 23}, 'auto'), true);
  assert.equal(ambient.isNight(at(23), {from: 0, to: 23}, 'auto'), false);
});
test('night mode: invalid hours fall back to 22/6, false disables, the Tắt preference wins', () => {
  assert.deepEqual(ambient.nightConfig({from: 24, to: '7'}), {from: 22, to: 6});
  assert.deepEqual(ambient.nightConfig({from: 2.5, to: -1}), {from: 22, to: 6});
  assert.deepEqual(ambient.nightConfig({from: 21}), {from: 21, to: 6});
  assert.deepEqual(ambient.nightConfig('yes'), {from: 22, to: 6});
  assert.equal(ambient.nightConfig(false), null);
  assert.equal(ambient.isNight(at(23), false, 'auto'), false);
  assert.equal(ambient.isNight(at(23), {from: 22, to: 6}, 'off'), false);
  assert.equal(ambient.isNight('23:00', {from: 22, to: 6}, 'auto'), false);
  assert.equal(ambient.nightLabel('off'), 'Tắt');
  assert.equal(ambient.nightLabel('auto'), 'Tự động');
  assert.equal(ambient.nightLabel(undefined), 'Tự động');
});

// ---- Adaptive contrast: pure parts ----
test('relative luminance uses sRGB linearisation and Rec. 709 weights', () => {
  assert.equal(ambient.relativeLuminance(0, 0, 0), 0);
  assert.ok(Math.abs(ambient.relativeLuminance(255, 255, 255) - 1) < 1e-9);
  assert.ok(Math.abs(ambient.relativeLuminance(255, 0, 0) - 0.2126) < 1e-9);
  assert.ok(Math.abs(ambient.relativeLuminance(0, 255, 0) - 0.7152) < 1e-9);
  assert.ok(Math.abs(ambient.relativeLuminance(0, 0, 255) - 0.0722) < 1e-9);
  assert.ok(Math.abs(ambient.relativeLuminance(128, 128, 128) - 0.2158605) < 1e-6); // not 0.5: sRGB is not linear
  assert.ok(Math.abs(ambient.relativeLuminance(10, 10, 10) - 10 / 255 / 12.92) < 1e-9); // the linear toe
});
function buffer(w, h, colour) {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const [r, g, b] = colour(x, y); const i = (y * w + x) * 4;
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255;
  }
  return pixels;
}
test('region luminance averages only the pixels inside the rectangle', () => {
  const w = 64, h = 36;
  const topWhite = buffer(w, h, (x, y) => (y < 18 ? [255, 255, 255] : [0, 0, 0]));
  assert.ok(Math.abs(ambient.regionLuminance(topWhite, w, h, {x0: 0, x1: 1, y0: 0, y1: 0.5}) - 1) < 1e-9);
  assert.equal(ambient.regionLuminance(topWhite, w, h, {x0: 0, x1: 1, y0: 0.5, y1: 1}), 0);
  assert.ok(Math.abs(ambient.regionLuminance(topWhite, w, h, {x0: 0, x1: 1, y0: 0, y1: 1}) - 0.5) < 1e-9);
  const leftWhite = buffer(w, h, (x) => (x < 32 ? [255, 255, 255] : [0, 0, 0]));
  assert.ok(Math.abs(ambient.regionLuminance(leftWhite, w, h, {x0: 0.25, x1: 0.75, y0: 0, y1: 1}) - 0.5) < 1e-9);
  assert.equal(ambient.regionLuminance(topWhite, w, h, {x0: 0.5, x1: 0.5, y0: 0, y1: 1}), null);
  assert.equal(ambient.regionLuminance(topWhite.slice(0, 10), w, h, {x0: 0, x1: 1, y0: 0, y1: 1}), null);
  assert.equal(ambient.regionLuminance(null, w, h, {x0: 0, x1: 1, y0: 0, y1: 1}), null);
  // The three measured regions sit where the clock, the greeting and the dock are.
  assert.deepEqual(ambient.REGIONS, {clock: {x0: 0, x1: 0.35, y0: 0, y1: 0.32}, greeting: {x0: 0.3, x1: 0.7, y0: 0, y1: 0.22},
    dock: {x0: 0, x1: 1, y0: 0.62, y1: 1}});
  const regions = ambient.measureRegions(topWhite, w, h);
  assert.ok(regions.clock === 1 && regions.greeting === 1 && regions.dock === 0);
});
test('contrast classes switch on above the threshold and off below it', () => {
  assert.deepEqual(ambient.contrastClasses({clock: 0.8, greeting: 0.1, dock: 0.2}, 0.5), {'bright-top': true, 'bright-bottom': false});
  assert.deepEqual(ambient.contrastClasses({clock: 0.1, greeting: 0.6, dock: 0.9}, 0.5), {'bright-top': true, 'bright-bottom': true});
  assert.deepEqual(ambient.contrastClasses({clock: 0.5, greeting: 0.5, dock: 0.5}, 0.5), {'bright-top': false, 'bright-bottom': false});
  assert.deepEqual(ambient.contrastClasses({clock: null, greeting: undefined, dock: 0.3}), {'bright-top': false, 'bright-bottom': false});
  assert.deepEqual(ambient.contrastClasses(null), {'bright-top': false, 'bright-bottom': false});
  assert.ok(ambient.CONTRAST_THRESHOLD >= 0.4 && ambient.CONTRAST_THRESHOLD <= 0.5);
  assert.equal(ambient.contrastClasses({clock: 0.48}).hasOwnProperty('bright-top'), true);
});
test('the measured crop matches background-size: cover', () => {
  assert.deepEqual(ambient.coverRect(1920, 1080, 1920, 1080), {sx: 0, sy: 0, sw: 1920, sh: 1080});
  assert.deepEqual(ambient.coverRect(1600, 1200, 1920, 1080), {sx: 0, sy: 150, sw: 1600, sh: 900});
  assert.deepEqual(ambient.coverRect(2520, 1080, 1920, 1080), {sx: 300, sy: 0, sw: 1920, sh: 1080});
  assert.deepEqual(ambient.coverRect(0, 1080, 1920, 1080), {sx: 0, sy: 0, sw: 0, sh: 0});
});

// ---- Browser controller with a tiny fake DOM and Node's mock timers ----
class FakeElement {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.style = {}; this.hidden = false; this.textContent = ''; this.names = new Set(); }
  get className() { return [...this.names].join(' '); }
  set className(value) { this.names = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get classList() {
    const names = this.names;
    return {add: (n) => names.add(n), remove: (n) => names.delete(n), contains: (n) => names.has(n),
      toggle: (n, on) => { const want = on === undefined ? !names.has(n) : !!on; if (want) names.add(n); else names.delete(n); return want; }};
  }
  get offsetWidth() { return 0; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { this.children.push(child); return child; }
  getContext() { return this.context; }
}
function setup({config = {}, storage = {}, failStorage = false, pixels = null, failPixels = false} = {}) {
  const listeners = {}, images = [], announced = [];
  const body = new FakeElement('body');
  const doc = {body, hidden: false, addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    createElement: (tag) => {
      const node = new FakeElement(tag);
      if (tag === 'canvas') node.context = {drawImage() {}, getImageData: () => { if (failPixels) throw new Error('tainted'); return {data: pixels}; }};
      return node;
    }};
  class FakeImage {
    constructor() { this.handlers = {}; this.naturalWidth = 1920; this.naturalHeight = 1080; images.push(this); }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    fire(type) { this.handlers[type](); }
  }
  global.document = doc; global.window = {innerWidth: 1920, innerHeight: 1080}; global.Image = FakeImage;
  global.localStorage = {getItem: (k) => { if (failStorage) throw new Error('blocked'); return k in storage ? storage[k] : null; },
    setItem: (k, v) => { if (failStorage) throw new Error('blocked'); storage[k] = v; }};
  const state = {video: false};
  const controller = ambient.init({config, isVideo: () => state.video, announce: (text) => announced.push(text)});
  const saver = body.children.find((node) => node.names.has('saver'));
  return {controller, body, doc, saver, state, images, storage, announced, keyup: () => listeners.keyup.forEach((fn) => fn())};
}
function withClock(t, time) {
  t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: time || new Date(2026, 10, 3, 12, 0, 0)});
  t.after(() => { delete global.document; delete global.window; delete global.Image; delete global.localStorage; });
}
const MIN = 60000;

test('the screensaver starts after the idle delay and a key only wakes it, Back included', (t) => {
  withClock(t);
  const {controller, saver} = setup({config: {screensaverMinutes: 2, wallpapers: ['a.jpg', 'b.jpg']}});
  assert.equal(saver.hidden, true);
  t.mock.timers.tick(2 * MIN - 1); assert.equal(controller.showing(), false);
  t.mock.timers.tick(1); assert.equal(controller.showing(), true);
  assert.equal(saver.hidden, false); assert.ok(saver.names.has('on'));
  assert.equal(controller.onKey({key: 'Escape', keyCode: 10009}), true); // swallowed: the launcher does not go Home
  assert.equal(controller.showing(), false); assert.ok(!saver.names.has('on'));
  t.mock.timers.tick(500); assert.equal(saver.hidden, true);
  assert.equal(controller.onKey({key: 'ArrowLeft'}), false); // the next key acts normally
});
test('keys reset the idle timer; a held wake key repeats are swallowed until it is released', (t) => {
  withClock(t);
  const {controller, keyup} = setup({config: {screensaverMinutes: 1}});
  t.mock.timers.tick(50000); controller.onKey({key: 'ArrowRight'});
  t.mock.timers.tick(50000); assert.equal(controller.showing(), false);
  t.mock.timers.tick(10000); assert.equal(controller.showing(), true);
  assert.equal(controller.onKey({key: 'Enter'}), true);
  assert.equal(controller.onKey({key: 'Enter', repeat: true}), true);
  keyup();
  assert.equal(controller.onKey({key: 'Enter', repeat: true}), false);
});
test('the screensaver never covers an HDMI picture and can be turned off', (t) => {
  withClock(t);
  const {controller, state} = setup({config: {screensaverMinutes: 1}});
  state.video = true; t.mock.timers.tick(3 * MIN); assert.equal(controller.showing(), false);
  state.video = false; t.mock.timers.tick(MIN); assert.equal(controller.showing(), true);
  const off = setup({config: {screensaverMinutes: 0}});
  t.mock.timers.tick(120 * MIN); assert.equal(off.controller.showing(), false);
});
test('a hidden page stops every timer; becoming visible restarts the full idle delay', (t) => {
  withClock(t);
  const {controller, saver} = setup({config: {screensaverMinutes: 5, wallpapers: ['a.jpg']}});
  t.mock.timers.tick(5 * MIN); assert.equal(controller.showing(), true);
  controller.visible(false);
  assert.equal(controller.showing(), false); assert.equal(saver.hidden, true);
  t.mock.timers.tick(60 * MIN); assert.equal(controller.showing(), false);
  controller.visible(true);
  t.mock.timers.tick(5 * MIN - 1); assert.equal(controller.showing(), false);
  t.mock.timers.tick(1); assert.equal(controller.showing(), true);
});
test('slides cross-fade between two layers every 40 s, starting with the wallpaper on screen', (t) => {
  withClock(t);
  const {controller, saver} = setup({config: {screensaverMinutes: 1, wallpapers: ['a.jpg', 'b.jpg', 'c.jpg']}});
  controller.wallpaperChanged('wallpapers/b.jpg');
  t.mock.timers.tick(MIN);
  const layers = saver.children[0].children;
  assert.equal(layers.length, 2);
  const shown = () => layers.filter((node) => node.names.has('show'));
  assert.equal(shown().length, 1); assert.equal(shown()[0].style.backgroundImage, 'url("wallpapers/b.jpg")');
  const firstMove = [...shown()[0].names].find((n) => n.startsWith('kb-'));
  t.mock.timers.tick(40000);
  assert.equal(shown().length, 1); assert.equal(shown()[0], layers[1]);
  assert.equal(shown()[0].style.backgroundImage, 'url("wallpapers/c.jpg")');
  assert.notEqual([...shown()[0].names].find((n) => n.startsWith('kb-')), firstMove);
  t.mock.timers.tick(40000); assert.equal(shown()[0], layers[0]); assert.equal(layers[0].style.backgroundImage, 'url("wallpapers/a.jpg")');
  // Only the clock is drawn on top: HH:MM in a corner that moves every few minutes.
  const face = saver.children[1];
  assert.equal(saver.children.length, 2); assert.match(face.textContent, /^\d\d:\d\d$/);
  assert.ok(face.names.has('corner-0'));
  // Step one second at a time: the mock Date jumps to the end of a tick() before callbacks run.
  for (let s = 0; s < 3 * 60 + 2; s += 1) t.mock.timers.tick(1000);
  assert.ok(face.names.has('corner-1'), face.className);
});
test('without wallpapers the saver drifts the default gradient', (t) => {
  withClock(t);
  const {saver} = setup({config: {screensaverMinutes: 1}});
  const stage = saver.children[0];
  assert.deepEqual(stage.children.map((node) => node.className), ['saver-drift']);
});
test('night mode follows the hours, the tick and the Tắt / Tự động row, saved in cyt-night', (t) => {
  withClock(t, new Date(2026, 10, 3, 21, 59));
  const {controller, body, storage} = setup({config: {night: {from: 22, to: 6}}});
  assert.equal(body.names.has('night-mode'), false);
  controller.tick(new Date(2026, 10, 3, 22, 0)); assert.equal(body.names.has('night-mode'), true);
  assert.equal(controller.nightAllowed(), true); assert.equal(controller.nightLabel(), 'Tự động');
  assert.equal(controller.toggleNight(), 'Tắt'); assert.equal(storage['cyt-night'], 'off');
  assert.equal(body.names.has('night-mode'), false); // evaluated at the faked 21:59 again, and off anyway
  controller.tick(new Date(2026, 10, 3, 23, 0)); assert.equal(body.names.has('night-mode'), false);
  assert.equal(controller.toggleNight(), 'Tự động'); assert.equal(storage['cyt-night'], 'auto');
  controller.tick(new Date(2026, 10, 3, 23, 0)); assert.equal(body.names.has('night-mode'), true);
  // Stored preference is read back; a key press evaluates the hour as well.
  const again = setup({storage: {'cyt-night': 'off'}});
  assert.equal(again.controller.nightLabel(), 'Tắt');
  const keyed = setup({});
  t.mock.timers.setTime(new Date(2026, 10, 3, 23, 30).getTime());
  keyed.controller.onKey({key: 'ArrowUp'}); assert.equal(keyed.body.names.has('night-mode'), true);
});
test('night mode can be disabled by config and survives blocked storage', (t) => {
  withClock(t, new Date(2026, 10, 3, 23, 0));
  const disabled = setup({config: {night: false}});
  assert.equal(disabled.controller.nightAllowed(), false); assert.equal(disabled.body.names.has('night-mode'), false);
  const blocked = setup({failStorage: true});
  assert.equal(blocked.body.names.has('night-mode'), true);
  assert.equal(blocked.controller.toggleNight(), 'Tắt'); assert.equal(blocked.announced.length, 1);
  assert.equal(blocked.body.names.has('night-mode'), false);
});
test('contrast is measured once per wallpaper URL and a failure changes nothing', (t) => {
  withClock(t);
  const w = 64, h = 36;
  const brightTop = buffer(w, h, (x, y) => (y < 12 ? [250, 250, 245] : [20, 24, 30]));
  const env = setup({pixels: brightTop});
  env.controller.wallpaperChanged('wallpapers/a.jpg');
  env.controller.wallpaperChanged('wallpapers/a.jpg'); // a second focus while loading does not load twice
  assert.equal(env.images.length, 1);
  env.images[0].fire('load');
  assert.equal(env.body.names.has('bright-top'), true); assert.equal(env.body.names.has('bright-bottom'), false);
  env.controller.wallpaperChanged('wallpapers/a.jpg'); assert.equal(env.images.length, 1); // cached
  // A dark wallpaper removes the class again (the picker preview goes through the same call).
  env.controller.wallpaperChanged('wallpapers/b.jpg');
  // Late results for an old URL do not overwrite the current wallpaper.
  env.controller.wallpaperChanged('wallpapers/c.jpg');
  env.images[1].fire('load'); assert.equal(env.body.names.has('bright-top'), true);
  const failed = setup({failPixels: true});
  failed.body.classList.add('bright-bottom');
  failed.controller.wallpaperChanged('wallpapers/x.jpg'); failed.images[0].fire('load');
  assert.equal(failed.body.names.has('bright-bottom'), true); assert.equal(failed.body.names.has('bright-top'), false);
  const dark = setup({pixels: buffer(w, h, () => [10, 10, 12])});
  dark.body.classList.add('bright-top');
  dark.controller.wallpaperChanged('wallpapers/d.jpg'); dark.images[0].fire('load');
  assert.equal(dark.body.names.has('bright-top'), false);
});

// ---- Source checks ----
test('the page loads ambient.js before app.js and app.js hooks it in with small calls', () => {
  const html = read('launcher/index.html');
  assert.ok(html.indexOf('<script src="ambient.js"></script>') > 0);
  assert.ok(html.indexOf('<script src="ambient.js"></script>') < html.indexOf('<script src="app.js"></script>'));
  const app = read('launcher/app.js');
  assert.match(app, /var ambient = window\.CytAmbient\.init\(\{config: config, isVideo: function \(\) \{ return videoOn; \}/);
  assert.match(app, /var key = event\.key;\s*clock\(\); wallpaper\(\);[^\n]*\n\s*if \(ambient\.onKey\(event\)\) \{ event\.preventDefault\(\); return; \}/);
  assert.ok(app.indexOf('ambient.onKey(event)') < app.indexOf('if (event.keyCode === 10009'), 'a waking Back never leaves the launcher');
  assert.match(app, /function applyWallpaper\(url\) \{[^}]*ambient\.wallpaperChanged\(url\);\s*\}/);
  assert.match(app, /function tick\(\) \{[^}]*ambient\.tick\(new Date\(\)\); \}/);
  assert.match(app, /addEventListener\('visibilitychange', function \(\) \{\s*ambient\.visible\(!document\.hidden\);/);
  // One self-contained Settings row, just before the arrangement row.
  assert.match(app, /row\('Chế độ đêm', ambient\.nightLabel\(\), function \(\) \{ nightRow\.value\.textContent = ambient\.toggleNight\(\); \}\);\s*\}\s*row\('Sắp xếp ứng dụng'/);
  assert.ok(read('launcher/ambient.js').includes("localStorage.setItem('cyt-night', preference)"));
});
test('ambient never touches power, wake locks, Home/Power keys or innerHTML', () => {
  for (const file of ['launcher/ambient.js', 'launcher/app.js']) {
    const source = read(file);
    assert.ok(!source.includes('tizen.power') && !/\.power\b/.test(source), file);
    assert.ok(!source.includes('setScreenStateChangeListener'), file);
    assert.ok(!/\brequest\(/.test(source) && !/\brelease\(/.test(source), file);
    assert.ok(!/wakeLock|WakeLock|setScreenBrightness|screenState|keepScreenOn/.test(source), file);
    assert.ok(!source.includes('registerKey(') && !source.includes('10252'), file);
    assert.ok(!source.includes('innerHTML'), file);
  }
});
test('ambient.js stays ES5 for the Tizen 6.5 browser', () => {
  const source = read('launcher/ambient.js').replace(/\/\/[^\n]*/g, '');
  assert.ok(!source.includes('=>'), 'arrow function');
  assert.ok(!/\b(let|const|class)\s/.test(source), 'let/const/class');
  assert.ok(!source.includes('`'), 'template literal');
  assert.ok(!source.includes('...'), 'spread');
  assert.ok(!/\b(async|await)\b/.test(source), 'async');
});
test('ambient CSS sits in one block before the narrow-screen rule and keeps reduced motion still', () => {
  const css = read('launcher/style.css');
  const start = css.indexOf('/* ---- Ambient: screensaver, night, contrast ---- */');
  assert.ok(start > 0 && start < css.indexOf('@media(max-width:1500px)'));
  const block = css.slice(start, css.indexOf('@media(max-width:1500px)'));
  // Night: a fixed, non-interactive veil, never a page-wide filter, and never over an HDMI picture.
  assert.match(block, /\.night-veil\{position:fixed;left:0;top:0;right:0;bottom:0;z-index:\d+;pointer-events:none;background:rgba\(20,10,0,\.28\)/);
  assert.ok(!/filter:/.test(block));
  assert.match(block, /body\.video \.night-veil,body\.video \.saver\{display:none\}/);
  assert.match(block, /body\.night-mode \.saver-stage\{opacity:\.5\}/);
  assert.match(block, /\.saver\{[^}]*transition:opacity 1\.2s/);
  for (const name of ['bright-top', 'bright-bottom']) assert.ok(block.includes('body.has-wallpaper.' + name + '::before'), name);
  // Under reduced motion only the opacity fades come back; Ken Burns and the drift stay stopped by the global rule.
  const reduced = block.match(/@media\(prefers-reduced-motion:reduce\)\{(.*)\}\s*$/);
  assert.ok(reduced);
  for (const rule of reduced[1].matchAll(/\{([^}]*)\}/g)) assert.match(rule[1], /^transition:opacity [^;]*!important$/);
  assert.ok(!/animation/.test(reduced[1]));
  const transitions = [...block.matchAll(/transition:([^;}]*)/g)].map((m) => m[1]);
  assert.ok(transitions.every((value) => value.startsWith('opacity ')), transitions.join(' | '));
});
