const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const controls = require('../launcher/controls.js');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const FAILED = 'Không đọc được';
const PREVIEW = 'Bản xem trước';

function fakeTv({build, display, platform, fail = [], throwing = [], silent = [], twice = false} = {}) {
  const calls = [];
  return {
    calls,
    systeminfo: {
      getCapability(key) {
        calls.push(key);
        if (throwing.includes('capability')) throw new Error('not supported');
        return platform;
      },
      getPropertyValue(name, ok, error) {
        calls.push(name);
        if (throwing.includes(name)) throw new Error('denied');
        if (silent.includes(name)) return;
        if (fail.includes(name)) { error(new Error('UnknownError')); return; }
        const value = name === 'BUILD' ? build : name === 'DISPLAY' ? display : null;
        ok(value);
        if (twice) ok({model: 'second answer'});
      }
    }
  };
}
const rowsOf = (info) => Object.fromEntries(controls.aboutRows(info));

test('About rows list every fact with its value, in a fixed order', () => {
  const rows = controls.aboutRows({
    version: '0.1.0', build: {model: 'QA55LS03BAKXXV', buildVersion: 'T-PTMFDEUC-1010.5'}, platform: '6.5',
    display: {resolutionWidth: 1920, resolutionHeight: 1080}, dockApps: 5, dockInputs: 1, serviceMode: 'guard'
  });
  assert.deepEqual(rows, [
    ['Phiên bản launcher', '0.1.0'],
    ['Mẫu TV', 'QA55LS03BAKXXV'],
    ['Phần mềm', 'T-PTMFDEUC-1010.5'],
    ['Hệ điều hành', 'Tizen 6.5'],
    ['Độ phân giải', '1920 × 1080'],
    ['Ứng dụng trên dock', '5  ·  1 nguồn vào'],
    ['Dịch vụ nền', 'Giữ launcher khi Home che']
  ]);
  assert.equal(controls.NOTE, 'Không thu thập dữ liệu · Không kết nối mạng');
});
test('About rows fall back to "Không đọc được" on the TV and "Bản xem trước" in the preview', () => {
  for (const info of [undefined, null, 'x', {}, {build: 'x', display: [], platform: {}, dockApps: -1}]) {
    for (const [label, value] of controls.aboutRows(info)) assert.equal(value, FAILED, label);
  }
  const preview = rowsOf({preview: true, dockApps: 5, dockInputs: 0});
  for (const label of ['Phiên bản launcher', 'Mẫu TV', 'Phần mềm', 'Hệ điều hành', 'Độ phân giải', 'Dịch vụ nền']) {
    assert.equal(preview[label], PREVIEW, label);
  }
  // The dock count is the launcher's own, so it is shown in the preview too.
  assert.equal(preview['Ứng dụng trên dock'], '5');
});
test('TV strings are trimmed, collapsed and bounded; unexpected types are refused', () => {
  const rows = rowsOf({build: {model: '  QA55  LS03B \n', buildVersion: 'x'.repeat(90)}});
  assert.equal(rows['Mẫu TV'], 'QA55 LS03B');
  assert.equal(rows['Phần mềm'].length, 40);
  assert.ok(rows['Phần mềm'].endsWith('…'));
  assert.equal(rowsOf({build: {model: 42, buildVersion: {}}})['Mẫu TV'], FAILED);
});
test('version, platform, resolution, service mode and dock count are formatted safely', () => {
  assert.equal(controls.formatVersion('0.1.0'), '0.1.0');
  assert.equal(controls.formatVersion('1.2.3-beta.1'), '1.2.3-beta.1');
  for (const bad of [undefined, null, 1, '', 'v1', '1.2.3.4.5', '<b>1</b>', '1.0; x']) assert.equal(controls.formatVersion(bad), '', String(bad));
  assert.equal(controls.formatPlatform('6.5'), 'Tizen 6.5');
  assert.equal(controls.formatPlatform(6.5), 'Tizen 6.5');
  assert.equal(controls.formatPlatform(' 7.0.1 '), 'Tizen 7.0.1');
  for (const bad of [undefined, null, '', 'six', NaN, Infinity, '6.5 <x>']) assert.equal(controls.formatPlatform(bad), '', String(bad));
  assert.equal(controls.formatResolution({resolutionWidth: 3840, resolutionHeight: 2160}), '3840 × 2160');
  for (const bad of [null, {}, {resolutionWidth: 0, resolutionHeight: 1080}, {resolutionWidth: 1920.5, resolutionHeight: 1080},
    {resolutionWidth: '1920', resolutionHeight: 1080}, {resolutionWidth: 99999, resolutionHeight: 1080}]) {
    assert.equal(controls.formatResolution(bad), '', JSON.stringify(bad));
  }
  assert.equal(controls.formatServiceMode('guard'), 'Giữ launcher khi Home che');
  assert.equal(controls.formatServiceMode('observe'), 'Chỉ quan sát');
  for (const bad of [undefined, 'takeover', '__proto__', 'toString']) assert.equal(controls.formatServiceMode(bad), '', String(bad));
  assert.equal(controls.formatDock(0, 0), '0');
  assert.equal(controls.formatDock(4, 2), '4  ·  2 nguồn vào');
  assert.equal(controls.formatDock(4, undefined), '4');
  assert.equal(controls.formatDock('4', 0), '');
});

test('readAbout in the preview answers at once and marks it as a preview', () => {
  let result;
  controls.readAbout(undefined, (info) => { result = info; });
  assert.equal(result.preview, true);
  assert.equal(controls.aboutRows(result)[1][1], PREVIEW);
  controls.readAbout({}, (info) => { result = info; }); // a TV object without systeminfo
  assert.equal(result.preview, false);
  assert.equal(controls.aboutRows(result)[1][1], FAILED);
});
test('readAbout reads BUILD, DISPLAY and the platform version through the public systeminfo API', async () => {
  const tv = fakeTv({build: {model: 'QA55LS03BAKXXV', buildVersion: 'T-1'}, display: {resolutionWidth: 1920, resolutionHeight: 1080}, platform: '6.5'});
  const info = await new Promise((done) => controls.readAbout(tv, done, 1000));
  assert.deepEqual(tv.calls, ['http://tizen.org/feature/platform.version', 'BUILD', 'DISPLAY']);
  const rows = rowsOf(info);
  assert.equal(rows['Mẫu TV'], 'QA55LS03BAKXXV');
  assert.equal(rows['Hệ điều hành'], 'Tizen 6.5');
  assert.equal(rows['Độ phân giải'], '1920 × 1080');
});
test('readAbout survives error callbacks, thrown errors and a TV that never answers', async () => {
  const failing = fakeTv({fail: ['BUILD'], throwing: ['capability', 'DISPLAY']});
  const one = rowsOf(await new Promise((done) => controls.readAbout(failing, done, 1000)));
  assert.equal(one['Mẫu TV'], FAILED); assert.equal(one['Hệ điều hành'], FAILED); assert.equal(one['Độ phân giải'], FAILED);
  const started = Date.now();
  const silent = fakeTv({build: {model: 'M'}, silent: ['DISPLAY'], platform: '6.5'});
  const two = rowsOf(await new Promise((done) => controls.readAbout(silent, done, 30)));
  assert.ok(Date.now() - started < 1000);
  assert.equal(two['Mẫu TV'], 'M'); assert.equal(two['Độ phân giải'], FAILED);
});
test('readAbout calls back exactly once, even when the TV answers twice', async () => {
  let count = 0;
  const tv = fakeTv({build: {model: 'first'}, display: {resolutionWidth: 1, resolutionHeight: 1}, twice: true});
  await new Promise((done) => controls.readAbout(tv, (info) => { count += 1; assert.equal(info.build.model, 'first'); done(); }, 20));
  await new Promise((wait) => setTimeout(wait, 50));
  assert.equal(count, 1);
});

test('controls.js stays ES5 and UMD, and is loaded before app.js', () => {
  const src = read('launcher/controls.js');
  assert.ok(!/=>|`|\blet\b|\bconst\b|\bclass\b|\.\.\./.test(src), 'no ES2015 syntax');
  assert.match(src, /module\.exports = factory\(\)/);
  assert.match(src, /root\.CytControls = factory\(\)/);
  assert.ok(!src.includes('innerHTML'));
  const html = read('launcher/index.html');
  assert.ok(html.indexOf('<script src="controls.js">') > 0);
  assert.ok(html.indexOf('<script src="controls.js">') < html.indexOf('<script src="app.js">'));
});
test('one control center button replaces the old pill; Wi-Fi is a non-focusable status', () => {
  const html = read('launcher/index.html');
  for (const old of ['id="btn-input"', 'id="btn-wifi"', 'id="btn-settings"']) assert.ok(!html.includes(old), old);
  assert.equal(html.split('<button').length - 1 - html.split('<button id="close-panel"').length + 1 - html.split('<button id="library-edit"').length + 1, 1);
  assert.match(html, /<button id="btn-controls"[^>]*aria-haspopup="true"/);
  assert.match(html, /<span id="wifi-status" class="wifi-status" data-bars="0" aria-hidden="true">/);
  assert.match(html, /<aside id="menu" class="menu glass" role="menu"[^>]* hidden>/);
  const app = read('launcher/app.js');
  for (const old of ["$('btn-input')", "$('btn-wifi')", "$('btn-settings')", 'nút Nguồn vào', 'pill']) assert.ok(!app.includes(old), old);
  assert.match(app, /\$\('wifi-status'\)\.setAttribute\('data-bars', String\(wifi\.bars\)\)/);
  // ArrowUp from the dock reaches the control center button: it is the whole top row.
  assert.match(app, /function focusRows\(\) \{\s*var rows = \[\[centerButton\]\]/);
});
test('buildControls lists the rows in order, with the input rows built from the configured sources', () => {
  const app = read('launcher/app.js');
  const body = app.slice(app.indexOf('function buildControls(value) {'), app.indexOf('function openAbout() {'));
  assert.ok(body.length > 100, 'buildControls exists');
  assert.ok(body.includes('buildInput(core.inputChoices(value, config.inputs));'));
  const order = ["heading('Nguồn vào')", 'buildInput(', "row('Âm lượng'", "row('Tắt tiếng'", "row('Wi-Fi'",
    "row('Hình nền'", "row('Sắp xếp ứng dụng'", "row('Giới thiệu'", "row('Samsung Home', '↗', returnHome)"];
  const at = order.map((text) => body.indexOf(text));
  at.forEach((index, n) => assert.ok(index >= 0, order[n]));
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.match(body, /if \(\(config\.wallpapers \|\| \[\]\)\.length\) \{\s*row\('Hình nền'/);
  assert.match(body, /row\('Wi-Fi', [^\n]*null, \{info: true\}\)/); // shown, never actionable
  assert.match(app, /function openControls\(\) \{\s*readSources\(function \(value\) \{\s*readWifi\(/);
});
test('Back leaves video first, then a sub-view, then closes the panel onto the control center button', () => {
  const app = read('launcher/app.js');
  const chain = ['if (videoOn) leaveVideo()', 'else if (picking) pickerBack()', 'else if (libraryOpen) libraryBack()',
    'else if (!panel.hidden) closePanel()', 'else if (openMenu) menuBack()', 'else returnHome()'];
  const at = chain.map((text) => app.indexOf(text));
  at.forEach((index, n) => assert.ok(index >= 0, chain[n]));
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.match(app, /function menuBack\(\) \{\s*if \(subBack\) \{ var back = subBack; subBack = null; back\(\); return; \}\s*closeMenu\(\);/);
  assert.match(app, /function closeMenu\(\) \{\s*var name = openMenu; setMenuOpen\(null\);\s*if \(name\) centerButton\.focus\(\);/);
  for (const fn of ['closePanel', 'closePicker']) {
    const body = app.slice(app.indexOf('function ' + fn + '('), app.indexOf('}', app.indexOf('centerButton.focus()', app.indexOf('function ' + fn + '('))));
    assert.ok(body.includes('centerButton.focus()'), fn);
  }
  assert.match(app, /\(dock\.firstChild \|\| centerButton\)\.focus\(\);/);
});
test('About is a read-only sub-view: it reads the TV through controls.readAbout and never the network', () => {
  const app = read('launcher/app.js');
  assert.match(app, /row\('Giới thiệu', '›', openAbout\)/);
  assert.match(app, /controls\.readAbout\(tv, function \(system\) \{/);
  assert.match(app, /openSubView\('Giới thiệu', function \(\) \{\s*controls\.aboutRows\(system\)\.forEach\(function \(line\) \{ row\(line\[0\], line\[1\], null, \{info: true\}\); \}\);\s*note\(controls\.NOTE\);/);
  assert.match(app, /system\.version = config\.version; system\.serviceMode = config\.serviceMode;/);
  const src = read('launcher/controls.js');
  // Every TV call sits inside a try with an error callback.
  assert.match(src, /try \{ result\.platform = info\.getCapability\(PLATFORM_VERSION\); \} catch \(error\)/);
  assert.match(src, /try \{ info\.getPropertyValue\(name, settle, function \(\) \{ settle\(null\); \}\); \}\s*catch \(error\) \{ settle\(null\); \}/);
  for (const source of [app, src]) {
    assert.ok(!/reportUrl|XMLHttpRequest|fetch\(|WebSocket|sendBeacon/.test(source));
    assert.ok(!source.includes('registerKey(') && !source.includes('10252'));
  }
});
test('control center CSS: one delimited block before the small-screen rule; the slide is transform-only', () => {
  const css = read('launcher/style.css');
  const start = css.indexOf('/* ---- Control center ----'), end = css.indexOf('@media(max-width:1500px)');
  assert.ok(start > 0 && start < end, 'block placed before the media rule');
  const block = css.slice(start, end);
  assert.ok(!/\.pill|#btn-wifi|#btn-settings|#btn-input/.test(css), 'old pill CSS is gone');
  const menu = block.match(/\n\.menu\{([^}]*)\}/)[1];
  assert.match(menu, /position:fixed;top:0;right:0;bottom:0;width:520px/);
  assert.match(menu, /transform:translateX\(112%\);transition:transform \.42s/);
  assert.match(block, /\.menu\.open\{-webkit-transform:none;transform:none\}/);
  for (const rule of block.matchAll(/transition:([^;}]*)/g)) {
    for (const part of rule[1].replace(/\([^)]*\)/g, '').split(',')) assert.ok(/^(transform|opacity) /.test(part.trim()), part);
  }
  assert.match(block, /body\.menu-open main::after\{opacity:1\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\*,\*::after\{transition:none!important/);
});
