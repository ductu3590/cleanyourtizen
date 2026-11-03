const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const setup = require('../launcher/setup.js');
const core = require('../launcher/core.js');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const DEFAULTS = [{type: 'HDMI', number: 4, dock: true, label: 'PlayStation 4'}];

test('stored inputs replace the defaults only when every entry is valid', () => {
  assert.deepEqual(setup.storedInputs(DEFAULTS, [{type: 'HDMI', number: 1, dock: false}, {type: 'HDMI', number: 4, dock: true, label: '  PS  4 '}]),
    [{type: 'HDMI', number: 1, dock: false}, {type: 'HDMI', number: 4, dock: true, label: 'PS 4'}]);
  assert.deepEqual(setup.storedInputs(DEFAULTS, []), []); // the owner hid everything: still a valid choice
  assert.deepEqual(setup.storedInputs(DEFAULTS, [{type: 'HDMI', number: 2, dock: true, label: ''}]), [{type: 'HDMI', number: 2, dock: true}]);
});
test('stored inputs fall back to the defaults on anything unexpected', () => {
  const bad = [
    null, undefined, 'x', 7, {}, {length: 1, 0: {type: 'HDMI', number: 1, dock: true}},
    [null], [{type: 'HDMI', number: 1}], [{type: 'HDMI', number: 1, dock: 'yes'}], [{type: 'hdmi', number: 1, dock: true}],
    [{type: 'HDMI', number: 0, dock: true}], [{type: 'HDMI', number: 100, dock: true}], [{type: 'HDMI', number: 1.5, dock: true}],
    [{type: 'HDMI', number: '1', dock: true}], [{type: 'TV', number: 1, dock: true}], [{type: 'HDMI;x', number: 1, dock: true}],
    [{type: 'HDMI', number: 1, dock: true}, {type: 'HDMI', number: 1, dock: false}],
    [{type: 'HDMI', number: 1, dock: true, label: 5}], [{type: 'HDMI', number: 1, dock: true, extra: 1}],
    [{type: 'HDMI', number: 1, dock: true, __proto__: {x: 1}, source: {}}],
    Array.from({length: 17}, (_, n) => ({type: 'HDMI', number: n + 1, dock: false}))];
  for (const stored of bad) assert.equal(setup.storedInputs(DEFAULTS, stored), DEFAULTS, JSON.stringify(stored));
  assert.equal(setup.storedInputs(undefined, 'x'), undefined);
});
test('greeting names are trimmed, collapsed, free of control characters and capped at 24', () => {
  assert.equal(setup.cleanGreeting('  nhà   An\tBình \n'), 'nhà An Bình');
  assert.equal(setup.cleanGreeting('nhà\u0000An\u0007Bình\u202e\u200b'), 'nhà An Bình');
  assert.equal(setup.cleanGreeting('x'.repeat(40)).length, 24);
  assert.equal(setup.cleanGreeting('a'.repeat(23) + ' bcd'), 'a'.repeat(23)); // no trailing space after the cut
  assert.equal(setup.cleanGreeting('a'.repeat(23) + '😀'), 'a'.repeat(23)); // no half emoji
  assert.equal(setup.cleanGreeting('nhà An'), 'nhà An'); // TV keyboards may send decomposed accents
  for (const empty of ['', '   ', '\u0000\u001f', null, undefined, 5, {}]) assert.equal(setup.cleanGreeting(empty), '');
});
test('a greeting saved on the TV wins, even empty; without one the build name stays', () => {
  assert.equal(setup.greetingName(null, 'nhà An Bình'), 'nhà An Bình');
  assert.equal(setup.greetingName('', 'nhà An Bình'), '');
  assert.equal(setup.greetingName('  Bi  ', 'nhà An Bình'), 'Bi');
  assert.equal(setup.greetingName(undefined, undefined), undefined);
});

const VIDEOSOURCE = {
  connected: [{type: 'TV', number: 1}, {type: 'HDMI', number: 4, editName: 'PlayStation 4'}],
  disconnected: [{type: 'HDMI', number: 2, editName: ''}, {type: 'HDMI', number: 1}, {type: 'HDMI', number: 3, editName: 'Loa  thanh'},
    {type: 'HDMI', number: 4, editName: 'again'}, {type: 'AV', number: 1}, null, {type: 7}, {type: 'HDMI', number: 0}]
};
test('HDMI sources list every non-tuner input once, HDMI first, with the TV name and connection state', () => {
  const sources = setup.hdmiSources(VIDEOSOURCE, DEFAULTS);
  assert.deepEqual(sources.map((s) => s.key), ['HDMI:1', 'HDMI:2', 'HDMI:3', 'HDMI:4', 'AV:1']);
  const ps4 = sources[3];
  assert.deepEqual(ps4, {type: 'HDMI', number: 4, key: 'HDMI:4', title: 'HDMI 4', name: 'PlayStation 4', connected: true, label: 'PlayStation 4', dock: true});
  assert.equal(sources[2].name, 'Loa thanh'); assert.equal(sources[2].connected, false); assert.equal(sources[2].dock, false);
  assert.ok(sources.every((s) => s.type !== 'TV'));
});
test('HDMI sources fall back to the configured inputs in the preview or when the TV refuses', () => {
  for (const value of [null, undefined, {}, {connected: 'x'}, {connected: [{type: 'TV', number: 1}]}]) {
    const sources = setup.hdmiSources(value, DEFAULTS.concat([{type: 'HDMI', number: 4, dock: false}, {type: 'bad'}]));
    assert.deepEqual(sources, [{type: 'HDMI', number: 4, key: 'HDMI:4', title: 'HDMI 4', name: '', connected: null, label: 'PlayStation 4', dock: true}]);
  }
  assert.deepEqual(setup.hdmiSources(null, undefined), []);
});
test('saved inputs keep every listed source for the input menu and dock only the toggled ones', () => {
  const sources = setup.hdmiSources(VIDEOSOURCE, DEFAULTS);
  sources[0].dock = true; sources[3].dock = false;
  const saved = setup.inputsFromSources(sources);
  assert.deepEqual(saved, [{type: 'HDMI', number: 1, dock: true}, {type: 'HDMI', number: 2, dock: false}, {type: 'HDMI', number: 3, dock: false},
    {type: 'HDMI', number: 4, dock: false, label: 'PlayStation 4'}, {type: 'AV', number: 1, dock: false}]);
  const inputs = setup.storedInputs(DEFAULTS, JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(inputs, saved);
  assert.equal(core.inputChoices(VIDEOSOURCE, inputs).length, 5);
  assert.deepEqual(core.dockInputs(inputs, VIDEOSOURCE).map((tile) => tile.id), ['input:HDMI:1']);
});
test('app selection toggles, refuses past the cap and saves in grid order', () => {
  let state = setup.toggleSelection([{id: 'a.App', name: 'A'}], {id: 'b.App', name: 'B', icon: '/x.png'}, 12);
  assert.deepEqual(state, {list: [{id: 'a.App', name: 'A'}, {id: 'b.App', name: 'B'}], selected: true, full: false});
  state = setup.toggleSelection(state.list, {id: 'a.App', name: 'A'}, 12);
  assert.deepEqual(state.list, [{id: 'b.App', name: 'B'}]); assert.equal(state.selected, false);
  const full = [{id: 'a.App', name: 'A'}, {id: 'b.App', name: 'B'}];
  const refused = setup.toggleSelection(full, {id: 'c.App', name: 'C'}, 2);
  assert.equal(refused.full, true); assert.equal(refused.list, full);
  assert.equal(setup.toggleSelection(undefined, {id: 'a.App', name: 'A'}).list.length, 1);
  const many = Array.from({length: core.DOCK_MAX}, (_, n) => ({id: 'p.App' + n, name: 'P' + n}));
  assert.equal(setup.toggleSelection(many, {id: 'new.App', name: 'N'}).full, true); // default cap is the dock cap
  const grid = [{id: 'a.App', name: 'A', icon: null}, {id: 'b.App', name: 'B', icon: null}, {id: 'c.App', name: 'C', icon: null}];
  const saved = setup.orderSelection(grid, [{id: 'c.App', name: 'C'}, {id: 'gone.App', name: 'Gone'}, {id: 'a.App', name: 'old'}]);
  assert.deepEqual(saved, [{id: 'a.App', name: 'A'}, {id: 'c.App', name: 'C'}, {id: 'gone.App', name: 'Gone'}]);
  assert.deepEqual(core.dockApps([], saved), saved); // exactly the format the dock reads back
});
test('setup shows once, only when storage works, and never when the build says setup: false', () => {
  const memory = (initial) => {
    const data = Object.assign({}, initial);
    return {getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, data};
  };
  const fresh = memory();
  assert.equal(setup.shouldShow({}, fresh), true);
  assert.deepEqual(fresh.data, {}); // the probe is removed again
  assert.equal(setup.shouldShow({}, memory({'cyt-setup': '1'})), false);
  assert.equal(setup.shouldShow({}, memory({'cyt-order': '["app1"]'})), false);
  assert.equal(setup.shouldShow({}, memory({'cyt-wallpaper': 'wallpapers/1.jpg'})), false);
  assert.equal(setup.shouldShow({setup: false}, memory()), false);
  assert.equal(setup.shouldShow(undefined, memory()), true);
  assert.equal(setup.shouldShow({}, null), false);
  assert.equal(setup.shouldShow({}, {getItem() { throw new Error('denied'); }}), false);
  assert.equal(setup.shouldShow({}, {getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {}}), false);
  assert.equal(setup.shouldShow({}), false); // node: no localStorage at all
  assert.equal(setup.readJson('cyt-inputs'), null);
  assert.equal(setup.storedGreeting('nhà An Bình'), 'nhà An Bình');
});

test('setup.js stays ES5, builds its DOM without innerHTML and never touches Home/Power keys', () => {
  const source = read('launcher/setup.js');
  const code = source.replace(/\/\/[^\n]*/g, ''); // comments may mention anything
  assert.ok(!/=>|`|\blet\s|\bconst\s|\bclass\s|\.\.\.[A-Za-z]/.test(code), 'ES5 only for the Tizen 6.5 browser');
  assert.ok(!source.includes('innerHTML'));
  assert.ok(!source.includes('registerKey(') && !source.includes('10252'));
  assert.ok(!/XMLHttpRequest|fetch\(|WebSocket|sendBeacon/.test(source), 'everything stays local');
  assert.match(source, /setAttribute\('maxlength', String\(GREETING_MAX\)\)/);
  assert.match(source, /if \(typing && \(key === 'ArrowLeft' \|\| key === 'ArrowRight'\)\) return;/); // the caret moves, Up/Down leave
  for (const key of ['cyt-setup', 'cyt-dock-apps', 'cyt-inputs', 'cyt-greeting']) assert.ok(source.includes("'" + key + "'"), key);
});
test('the page loads setup.js before app.js and app.js routes keys to setup before Back can go home', () => {
  const html = read('launcher/index.html');
  assert.ok(html.indexOf('<script src="setup.js"></script>') > 0);
  assert.ok(html.indexOf('src="setup.js"') < html.indexOf('src="app.js"'));
  const app = read('launcher/app.js');
  const hook = app.indexOf('if (setup.isOpen()) { setup.onKey(event); return; }');
  assert.ok(hook > 0 && hook < app.indexOf("if (event.keyCode === 10009 || key === 'Escape')"));
  assert.ok(app.includes("inputsConfig = setup.storedInputs(config.inputs, setup.readJson('cyt-inputs'))"));
  assert.ok(!/config\.inputs(?!, setup\.readJson)/.test(app), 'every input use goes through inputsConfig');
  assert.ok(app.includes('calendar.greeting(now, setup.storedGreeting(config.greetingName))'));
  assert.ok(app.indexOf("row('Thiết lập lại'") > 0 && app.indexOf("row('Thiết lập lại'") < app.indexOf("row('Samsung Home'"));
  assert.ok(app.includes('if (setup.shouldShow(config)) openSetup();'));
});
test('setup CSS sits before the 1500px rule and animates only transform and opacity', () => {
  const css = read('launcher/style.css');
  const start = css.indexOf('/* ---- First-run setup ---- */');
  assert.ok(start > 0 && start < css.indexOf('@media(max-width:1500px){main{'));
  const block = css.slice(start, css.indexOf('@media(max-width:1500px){main{'));
  for (const transition of block.matchAll(/transition:([^;}]*)/g)) {
    for (const part of transition[1].replace(/\([^)]*\)/g, '()').split(',')) assert.match(part.trim(), /^(transform|opacity)\s/, part);
  }
  assert.ok(block.includes('@keyframes setup-in{'));
});
test('the build-time preview opt-in survives setup and reaches the live preview', () => {
  const setupMod = require('../launcher/setup.js');
  const defaults = [{type: 'HDMI', number: 4, dock: true, preview: true}];
  assert.deepEqual(setupMod.storedInputs(defaults, [{type: 'HDMI', number: 4, dock: true, preview: true}, {type: 'HDMI', number: 1, dock: false}]),
    [{type: 'HDMI', number: 4, dock: true, preview: true}, {type: 'HDMI', number: 1, dock: false}]);
  assert.equal(setupMod.storedInputs(defaults, [{type: 'HDMI', number: 4, dock: true, preview: 'yes'}]), defaults);
  const sources = setupMod.hdmiSources({connected: [{type: 'HDMI', number: 4, editName: 'PlayStation 4'}]}, defaults);
  assert.deepEqual(setupMod.inputsFromSources(sources).filter((s) => s.number === 4), [{type: 'HDMI', number: 4, dock: true, preview: true}]);
  const app = read('launcher/app.js');
  assert.match(app, /CytInputsLive\.create\(\{tv: tv, inputs: function \(\) \{ return inputsConfig; \}/);
});
