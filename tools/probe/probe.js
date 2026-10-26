(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CytProbe = factory();
}(this, function () {
  'use strict';
  var TARGET_APPS = ['com.samsung.tv.coba.setting', 'org.tizen.SMSourceAPP',
    'com.samsung.tv.coba.setting.networksettings', 'org.tizen.hdmicec', 'org.tizen.homesetting'];
  var PROPERTIES = ['WIFI_NETWORK', 'ETHERNET_NETWORK', 'NETWORK', 'BUILD', 'DISPLAY'];

  function describe(error) { return String(error && (error.name || error.message) || error).slice(0, 120); }
  function names(object) {
    try { return Object.keys(object || {}).sort(); } catch (error) { return []; }
  }
  function safe(results, name, fn) {
    try { results.push({name: name, status: 'ok', detail: fn()}); }
    catch (error) { results.push({name: name, status: 'error', detail: describe(error)}); }
  }
  function methods(object) {
    var found = [], key;
    try {
      for (key in object) {
        try { if (typeof object[key] === 'function') found.push(key); } catch (error) { /* skip getter */ }
      }
    } catch (error) { return found; }
    return found.sort();
  }
  function nextIndex(count, index, key) {
    if (!count) return -1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(count - 1, index + 1);
    if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, index - 1);
    return index;
  }
  function sync(env) {
    var results = [], tizen = env.tizen, webapis = env.webapis;
    safe(results, 'tizen', function () { return tizen ? names(tizen).join(',') : 'missing'; });
    safe(results, 'webapis', function () { return webapis ? names(webapis).join(',') : 'missing'; });
    safe(results, 'b2bapis', function () { return env.b2bapis ? names(env.b2bapis).join(',') : 'missing'; });
    safe(results, 'tvinputdevice', function () { return tizen && tizen.tvinputdevice ? 'present' : 'missing'; });
    [['tizen.tvwindow', tizen && tizen.tvwindow], ['tizen.tvdisplaycontrol', tizen && tizen.tvdisplaycontrol],
      ['tizen.tvaudiocontrol', tizen && tizen.tvaudiocontrol], ['tizen.tvinfo', tizen && tizen.tvinfo],
      ['webapis.tvinfo', webapis && webapis.tvinfo], ['webapis.unipicture', webapis && webapis.unipicture],
      ['webapis.productinfo', webapis && webapis.productinfo]].forEach(function (pair) {
      safe(results, pair[0] + '()', function () { return pair[1] ? methods(pair[1]).join(',') : 'missing'; });
    });
    return results;
  }
  function run(env, done) {
    var results = sync(env), pending = 0, tizen = env.tizen, registering = true, reported = false;
    function finish() {
      if (registering || pending !== 0 || reported) return;
      reported = true;
      done(results);
    }
    function probeAsync(name, start) {
      var settled = false;
      pending += 1;
      function settle(status, detail) {
        if (settled) return;
        settled = true;
        results.push({name: name, status: status, detail: detail});
        pending -= 1;
        finish();
      }
      try { start(function (v) { settle('ok', v); }, function (e) { settle('error', describe(e)); }); }
      catch (error) { settle('error', describe(error)); }
    }
    if (tizen && tizen.systeminfo) {
      PROPERTIES.forEach(function (property) {
        probeAsync('systeminfo.' + property, function (ok, fail) {
          tizen.systeminfo.getPropertyValue(property, function (value) {
            ok(JSON.stringify(value).slice(0, 300));
          }, fail);
        });
      });
    }
    if (tizen && tizen.application && tizen.application.getAppsInfo) {
      probeAsync('appsInfo', function (ok, fail) {
        tizen.application.getAppsInfo(function (list) {
          var ids = {};
          list.forEach(function (info) { ids[info.id] = true; });
          ok(TARGET_APPS.map(function (id) { return id + '=' + (ids[id] ? 'yes' : 'no'); }).join(' '));
        }, fail);
      });
    }
    if (tizen && tizen.tvwindow && tizen.tvwindow.getSource) {
      probeAsync('tvwindow.getSource', function (ok, fail) {
        var value = tizen.tvwindow.getSource();
        ok(JSON.stringify(value));
      });
    }
    registering = false;
    finish();
  }
  return {run: run, sync: sync, nextIndex: nextIndex, methods: methods, TARGET_APPS: TARGET_APPS, PROPERTIES: PROPERTIES};
}));
