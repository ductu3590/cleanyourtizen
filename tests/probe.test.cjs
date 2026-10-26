const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const probe = require('../tools/probe/probe.js');

const byName = (results) => Object.fromEntries(results.map((r) => [r.name, r]));

test('probe reports missing APIs without throwing', (t, done) => {
  probe.run({}, (results) => {
    const by = byName(results);
    assert.strictEqual(by.webapis.detail, 'missing');
    assert.strictEqual(by.tvinputdevice.detail, 'missing');
    done();
  });
});

test('probe collects async systeminfo values and per-property errors', (t, done) => {
  const tizen = {
    systeminfo: {
      getPropertyValue(property, ok, fail) {
        if (property === 'WIFI_NETWORK') ok({ssid: 'Home', signalStrength: 0.8});
        else fail({name: 'NotSupportedError'});
      },
    },
    application: { getAppsInfo(ok) { ok([{id: 'com.samsung.tv.coba.setting'}]); } },
  };
  probe.run({tizen}, (results) => {
    const by = byName(results);
    assert.match(by['systeminfo.WIFI_NETWORK'].detail, /Home/);
    assert.strictEqual(by['systeminfo.NETWORK'].status, 'error');
    assert.match(by.appsInfo.detail, /com\.samsung\.tv\.coba\.setting=yes/);
    assert.match(by.appsInfo.detail, /org\.tizen\.SMSourceAPP=no/);
    done();
  });
});

test('probe records a throwing API as an error instead of crashing', (t, done) => {
  const tizen = { systeminfo: { getPropertyValue() { throw new Error('SecurityError'); } } };
  probe.run({tizen}, (results) => {
    assert.strictEqual(byName(results)['systeminfo.WIFI_NETWORK'].status, 'error');
    done();
  });
});

test('probe has its own identity and only the launch privilege for opening apps', () => {
  const xml = fs.readFileSync(path.join(__dirname, '../tools/probe/config.xml'), 'utf8');
  assert.match(xml, /id="CyTprobe01\.Probe"/);
  assert.doesNotMatch(xml, /CyTizen001/);
  assert.match(xml, /privilege\/application\.launch/);
});

test('probe focus navigation clamps at both ends and ignores other keys', () => {
  assert.strictEqual(probe.nextIndex(5, 0, 'ArrowLeft'), 0);
  assert.strictEqual(probe.nextIndex(5, 0, 'ArrowRight'), 1);
  assert.strictEqual(probe.nextIndex(5, 4, 'ArrowRight'), 4);
  assert.strictEqual(probe.nextIndex(5, 2, 'Enter'), 2);
  assert.strictEqual(probe.nextIndex(0, 0, 'ArrowRight'), -1);
});

test('probe lists methods of TV APIs and reads the current window source', (t, done) => {
  function TVWindow() {}
  TVWindow.prototype.getSource = function () { return {type: 'HDMI', number: 1}; };
  TVWindow.prototype.setSource = function () {};
  const tvwindow = new TVWindow();
  tvwindow.size = 3;
  const tizen = {tvwindow};
  probe.run({tizen}, (results) => {
    const by = byName(results);
    assert.strictEqual(by['tizen.tvwindow()'].detail, 'getSource,setSource');
    assert.match(by['tvwindow.getSource'].detail, /HDMI/);
    assert.strictEqual(by['webapis.unipicture()'].detail, 'missing');
    done();
  });
});

test('probe finds source objects inside VIDEOSOURCE and labels them with names', () => {
  const hdmi = {type: 'HDMI', number: 1, editName: 'FPT Play'};
  const value = {connected: [hdmi, {type: 'AV', number: 1}], other: {nested: [{type: 'HDMI', number: 4}]}};
  const found = probe.findSources(value);
  assert.strictEqual(found.length, 3);
  assert.strictEqual(found[0], hdmi);
  const labels = probe.sourceActions(found).map((a) => a.label);
  assert.strictEqual(labels[0], 'Hiện HDMI 1 "FPT Play"');
  assert.strictEqual(labels[1], 'Hiện AV 1');
  assert.strictEqual(labels[labels.length - 1], 'Tắt video nguồn');
  assert.deepStrictEqual(probe.findSources(null), []);
});

test('probe VIDEOSOURCE read exposes the exact source instances for setSource', (t, done) => {
  const hdmi = {type: 'HDMI', number: 2};
  const tizen = {systeminfo: {getPropertyValue(property, ok) {
    if (property === 'VIDEOSOURCE') ok({connected: [hdmi]}); else ok({});
  }}};
  const env = {tizen};
  probe.run(env, () => {
    assert.strictEqual(env.sources[0], hdmi);
    done();
  });
});

test('probe actions launch the user apps and Samsung Home and use app control for settings', () => {
  const list = probe.actions();
  probe.USER_APPS.forEach((id) => assert.ok(list.some((a) => a.kind === 'launch' && a.id === id)));
  assert.ok(list.some((a) => a.kind === 'launch' && a.id === 'com.samsung.tv.csfs'));
  assert.ok(list.some((a) => a.kind === 'appcontrol' && a.id === 'com.samsung.tv.coba.setting'));
});

test('probe perform reports success, API errors and exceptions', () => {
  const said = [];
  const report = (text) => said.push(text);
  const tizen = {
    tvwindow: {setSource(source, ok) { ok(); }, show(ok) { ok(); }, getAvailableWindows(ok, fail) { fail({name: 'SecurityError', message: 'no'}); }},
    application: {launch() { throw new Error('boom'); }},
  };
  probe.perform({kind: 'source', source: {type: 'HDMI', number: 1}, label: 'S'}, tizen, report);
  probe.perform({kind: 'windows', label: 'W'}, tizen, report);
  probe.perform({kind: 'launch', id: 'x.y', label: 'L'}, tizen, report);
  assert.match(said[0], /^OK S/);
  assert.match(said[1], /^LỖI W: SecurityError/);
  assert.match(said[2], /^NGOẠI LỆ L: Error boom/);
});

test('probe shows the chosen source on the MAIN window then can hide it', () => {
  const calls = [];
  const tvwindow = {
    setSource(source, ok) { calls.push(['setSource', source.number]); ok(); },
    show(ok, fail, rect, type) { calls.push(['show', rect.join(','), type]); ok(); },
    hide(ok, fail, type) { calls.push(['hide', type]); ok(); },
  };
  const said = [];
  probe.perform({kind: 'source', source: {type: 'HDMI', number: 2}, label: 'S'}, {tvwindow}, (t) => said.push(t));
  probe.perform({kind: 'hide', label: 'H'}, {tvwindow}, (t) => said.push(t));
  assert.deepStrictEqual(calls, [['setSource', 2], ['show', '0px,0px,1920px,1080px', 'MAIN'], ['hide', 'MAIN']]);
  assert.match(said[0], /^OK S: setSource \+ show/);
  assert.match(said[1], /^OK H: hide/);
});

test('probe lists the supported keys read-only without registering any', () => {
  const calls = [];
  const tizen = {tvinputdevice: {
    getSupportedKeys() { calls.push('get'); return [{name: 'MediaPlay', code: 415}, {name: 'ColorF0Red', code: 403}]; },
    registerKey() { calls.push('register'); },
  }};
  const by = byName(probe.sync({tizen}));
  assert.strictEqual(by.supportedKeys.detail, 'MediaPlay,ColorF0Red');
  assert.deepStrictEqual(calls, ['get']);
  assert.strictEqual(byName(probe.sync({})).supportedKeys.detail, 'missing');
});
