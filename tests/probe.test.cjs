const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const probe = require('../tools/probe/probe.js');

const byName = (results) => Object.fromEntries(results.map((r) => [r.name, r]));

test('probe reports missing APIs without throwing', (t, done) => {
  probe.run({}, (results) => {
    const by = byName(results);
    assert.strictEqual(by.tizen.detail, 'missing');
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
